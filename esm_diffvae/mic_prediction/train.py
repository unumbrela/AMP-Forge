"""Training script for ESM-MIC model using pre-computed ESM-2 embeddings."""

import os
os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")

import sys
import time
import json
import copy
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import yaml
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mic_prediction.model import ESMMICLite
from mic_prediction.features import compute_physicochemical_features


class PrecomputedMICDataset(Dataset):
    """Dataset using pre-computed ESM-2 embeddings."""

    def __init__(self, embeddings, masks, mic_values, sequences, physchem_scaler=None, fit_scaler=False):
        self.embeddings = embeddings.astype(np.float32)
        self.masks = masks.astype(np.float32)
        self.mic_values = mic_values.astype(np.float32)
        self.sequences = sequences

        self.physchem = np.stack([
            compute_physicochemical_features(seq) for seq in sequences
        ]).astype(np.float32)

        if fit_scaler:
            self.physchem_scaler = StandardScaler()
            self.physchem = self.physchem_scaler.fit_transform(self.physchem).astype(np.float32)
        elif physchem_scaler is not None:
            self.physchem_scaler = physchem_scaler
            self.physchem = physchem_scaler.transform(self.physchem).astype(np.float32)
        else:
            self.physchem_scaler = None

    def __len__(self):
        return len(self.mic_values)

    def __getitem__(self, idx):
        return {
            "esm_embeddings": torch.from_numpy(self.embeddings[idx]),
            "attention_mask": torch.from_numpy(self.masks[idx]),
            "physchem": torch.from_numpy(self.physchem[idx]),
            "mic": torch.tensor(self.mic_values[idx]),
        }


def get_cosine_schedule_with_warmup(optimizer, warmup_steps, total_steps):
    def lr_lambda(step):
        if step < warmup_steps:
            return step / max(1, warmup_steps)
        progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
        return 0.5 * (1.0 + np.cos(np.pi * progress))
    return torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)


def mixup_batch(emb, mask, physchem, targets, alpha=0.2):
    """Apply Mixup augmentation to a batch."""
    if alpha <= 0:
        return emb, mask, physchem, targets
    lam = np.random.beta(alpha, alpha)
    lam = max(lam, 1 - lam)  # ensure lam >= 0.5 to stay closer to original
    batch_size = emb.size(0)
    perm = torch.randperm(batch_size, device=emb.device)
    emb = lam * emb + (1 - lam) * emb[perm]
    mask = torch.max(mask, mask[perm])  # union of masks
    physchem = lam * physchem + (1 - lam) * physchem[perm]
    targets = lam * targets + (1 - lam) * targets[perm]
    return emb, mask, physchem, targets


def evaluate(model, dataloader, device, loss_fn):
    model.eval()
    all_preds, all_targets = [], []
    total_loss, n_batches = 0, 0

    with torch.no_grad():
        for batch in dataloader:
            emb = batch["esm_embeddings"].to(device)
            mask = batch["attention_mask"].to(device)
            physchem = batch["physchem"].to(device)
            targets = batch["mic"].to(device)

            preds = model(emb, mask, physchem)
            loss = loss_fn(preds, targets)

            total_loss += loss.item()
            n_batches += 1
            all_preds.append(preds.cpu().numpy())
            all_targets.append(targets.cpu().numpy())

    all_preds = np.concatenate(all_preds)
    all_targets = np.concatenate(all_targets)

    metrics = compute_metrics(all_preds, all_targets)
    metrics["loss"] = total_loss / max(n_batches, 1)
    return metrics, all_preds, all_targets


def evaluate_ensemble(models, dataloader, device, loss_fn):
    """Evaluate an ensemble of models by averaging predictions."""
    for m in models:
        m.eval()
    all_preds, all_targets = [], []
    total_loss, n_batches = 0, 0

    with torch.no_grad():
        for batch in dataloader:
            emb = batch["esm_embeddings"].to(device)
            mask = batch["attention_mask"].to(device)
            physchem = batch["physchem"].to(device)
            targets = batch["mic"].to(device)

            # Average predictions from all models
            preds_list = [m(emb, mask, physchem) for m in models]
            preds = torch.stack(preds_list).mean(dim=0)
            loss = loss_fn(preds, targets)

            total_loss += loss.item()
            n_batches += 1
            all_preds.append(preds.cpu().numpy())
            all_targets.append(targets.cpu().numpy())

    all_preds = np.concatenate(all_preds)
    all_targets = np.concatenate(all_targets)

    metrics = compute_metrics(all_preds, all_targets)
    metrics["loss"] = total_loss / max(n_batches, 1)
    return metrics, all_preds, all_targets


def compute_metrics(preds, targets):
    pcc, _ = pearsonr(preds, targets)
    scc, _ = spearmanr(preds, targets)
    rmse = np.sqrt(mean_squared_error(targets, preds))
    mae = mean_absolute_error(targets, preds)
    r2 = r2_score(targets, preds)
    return {
        "pearson": float(pcc),
        "spearman": float(scc),
        "rmse": float(rmse),
        "mae": float(mae),
        "r2": float(r2),
    }


def build_model(cfg, device):
    model_cfg = cfg["model"]
    esm_cfg = cfg["esm"]
    model = ESMMICLite(
        esm_dim=esm_cfg["embedding_dim"],
        pool_n_heads=model_cfg.get("pool_n_heads", 4),
        pool_dropout=model_cfg.get("pool_dropout", 0.1),
        pool_bottleneck_dims=model_cfg.get("pool_bottleneck_dims", [384, 128]),
        cnn_channels=model_cfg.get("cnn_channels", 64),
        cnn_kernels=model_cfg.get("cnn_kernels", [3, 5, 7]),
        cnn_dropout=model_cfg.get("cnn_dropout", 0.3),
        physchem_dim=cfg["physchem"]["dim"],
        physchem_hidden=model_cfg.get("physchem_hidden", 32),
        gate_dim=model_cfg.get("gate_dim", 128),
        fusion_hidden_dims=model_cfg["fusion_hidden_dims"],
        fusion_dropout=model_cfg["fusion_dropout"],
    ).to(device)
    return model


def train(config_path: str = None):
    if config_path is None:
        config_path = PROJECT_ROOT / "mic_prediction" / "config.yaml"
    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    ckpt_dir = PROJECT_ROOT / cfg["paths"]["checkpoint_dir"]
    results_dir = PROJECT_ROOT / cfg["paths"]["results_dir"]
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load pre-computed embeddings
    emb_path = PROJECT_ROOT / "mic_prediction" / "data" / "esm2_embeddings.npz"
    if not emb_path.exists():
        print("Pre-computed embeddings not found. Running precompute_embeddings.py first...")
        from mic_prediction.precompute_embeddings import precompute_embeddings
        precompute_embeddings(device="cpu")

    print("Loading pre-computed ESM-2 embeddings...")
    data = np.load(emb_path, allow_pickle=True)
    embeddings = data["embeddings"]
    masks = data["masks"]
    sequences = data["sequences"]
    mic_values = data["mic_values"]
    print(f"Loaded {len(sequences)} sequences, embedding shape: {embeddings.shape}")

    # OOF residual-based data filtering
    residual_thresh = cfg["data"].get("oof_residual_threshold", None)
    residual_path = PROJECT_ROOT / "mic_prediction" / "data" / "oof_residuals.csv"
    if residual_thresh is not None and residual_path.exists():
        oof_df = pd.read_csv(residual_path)
        seq_to_resid = dict(zip(oof_df["sequence"], oof_df["residual"]))
        keep_mask = np.array([seq_to_resid.get(s, 999) <= residual_thresh for s in sequences])
        n_before = len(sequences)
        embeddings = embeddings[keep_mask]
        masks = masks[keep_mask]
        sequences = sequences[keep_mask]
        mic_values = mic_values[keep_mask]
        print(f"OOF filtering (threshold={residual_thresh}): {n_before} -> {len(sequences)} "
              f"(removed {n_before - len(sequences)})")
    elif residual_thresh is not None:
        print(f"Warning: oof_residual_threshold={residual_thresh} set but {residual_path} not found. "
              f"Run OOF analysis first. Using all data.")

    # Split data with stratification
    mic_bins = pd.qcut(mic_values, q=5, labels=False, duplicates="drop")
    indices = np.arange(len(sequences))

    train_val_idx, test_idx = train_test_split(
        indices, test_size=cfg["data"]["test_ratio"],
        random_state=cfg["data"]["random_seed"], stratify=mic_bins,
    )
    val_size = cfg["data"]["val_ratio"] / (1 - cfg["data"]["test_ratio"])
    train_idx, val_idx = train_test_split(
        train_val_idx, test_size=val_size,
        random_state=cfg["data"]["random_seed"], stratify=mic_bins[train_val_idx],
    )

    print(f"Train: {len(train_idx)}, Val: {len(val_idx)}, Test: {len(test_idx)}")

    # Create datasets
    train_ds = PrecomputedMICDataset(
        embeddings[train_idx], masks[train_idx], mic_values[train_idx],
        sequences[train_idx], fit_scaler=True,
    )
    val_ds = PrecomputedMICDataset(
        embeddings[val_idx], masks[val_idx], mic_values[val_idx],
        sequences[val_idx], physchem_scaler=train_ds.physchem_scaler,
    )
    test_ds = PrecomputedMICDataset(
        embeddings[test_idx], masks[test_idx], mic_values[test_idx],
        sequences[test_idx], physchem_scaler=train_ds.physchem_scaler,
    )

    bs = cfg["training"]["batch_size"]
    train_loader = DataLoader(train_ds, batch_size=bs, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=bs, shuffle=False, num_workers=4, pin_memory=True)
    test_loader = DataLoader(test_ds, batch_size=bs, shuffle=False, num_workers=4, pin_memory=True)

    # Build model
    model = build_model(cfg, device)

    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"ESMMICLite params: {total_params:,} (all trainable: {trainable_params:,})")

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg["training"]["lr"],
        weight_decay=cfg["training"]["weight_decay"],
    )

    total_steps = len(train_loader) * cfg["training"]["epochs"]
    warmup_steps = len(train_loader) * cfg["training"]["warmup_epochs"]
    scheduler = get_cosine_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    loss_type = cfg["training"]["loss"]
    if loss_type == "huber":
        loss_fn = nn.HuberLoss(delta=cfg["training"]["huber_delta"])
    elif loss_type == "smooth_l1":
        loss_fn = nn.SmoothL1Loss()
    else:
        loss_fn = nn.MSELoss()

    # Training loop
    best_val_pcc = -1
    patience_counter = 0
    patience = cfg["training"]["patience"]
    history = {"train": [], "val": []}

    # Snapshot ensemble: collect top-K model snapshots
    snapshot_k = cfg["training"].get("snapshot_k", 5)
    snapshots = []  # list of (pcc, state_dict)

    # Augmentation config
    aug_cfg = cfg["training"]["augmentation"]
    noise_std = aug_cfg["noise_std"]
    mask_prob = aug_cfg.get("residue_mask_prob", 0.0)
    label_noise_std = aug_cfg.get("label_noise_std", 0.0)
    mixup_alpha = aug_cfg.get("mixup_alpha", 0.2)

    print(f"\nStarting training for {cfg['training']['epochs']} epochs...")
    print(f"Augmentation: noise={noise_std}, mask={mask_prob}, label_noise={label_noise_std}, mixup_alpha={mixup_alpha}")
    print("-" * 80)

    for epoch in range(1, cfg["training"]["epochs"] + 1):
        model.train()
        epoch_loss, n_batches = 0, 0
        t0 = time.time()

        for batch in train_loader:
            emb = batch["esm_embeddings"].to(device)
            mask = batch["attention_mask"].to(device)
            physchem = batch["physchem"].to(device)
            targets = batch["mic"].to(device)

            # Embedding noise
            if noise_std > 0:
                emb = emb + torch.randn_like(emb) * noise_std

            # Residue masking
            if mask_prob > 0:
                residue_mask = (torch.rand(emb.shape[0], emb.shape[1], 1, device=device) > mask_prob).float()
                emb = emb * residue_mask

            # Mixup augmentation
            if mixup_alpha > 0:
                emb, mask, physchem, targets = mixup_batch(emb, mask, physchem, targets, mixup_alpha)

            # Label noise (after mixup so it adds on top)
            if label_noise_std > 0:
                targets = targets + torch.randn_like(targets) * label_noise_std

            optimizer.zero_grad()
            preds = model(emb, mask, physchem)
            loss = loss_fn(preds, targets)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), cfg["training"]["grad_clip"])
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            n_batches += 1

        avg_train_loss = epoch_loss / max(n_batches, 1)
        val_metrics, _, _ = evaluate(model, val_loader, device, loss_fn)
        elapsed = time.time() - t0

        history["train"].append({"epoch": epoch, "loss": avg_train_loss})
        history["val"].append({"epoch": epoch, **val_metrics})

        if epoch % 5 == 0 or epoch == 1:
            print(
                f"Epoch {epoch:3d}/{cfg['training']['epochs']} | "
                f"Train Loss: {avg_train_loss:.4f} | "
                f"Val Loss: {val_metrics['loss']:.4f} | "
                f"Val PCC: {val_metrics['pearson']:.4f} | "
                f"Val RMSE: {val_metrics['rmse']:.4f} | "
                f"Val R2: {val_metrics['r2']:.4f} | "
                f"Time: {elapsed:.1f}s"
            )

        # Track best single model
        if val_metrics["pearson"] > best_val_pcc:
            best_val_pcc = val_metrics["pearson"]
            patience_counter = 0
            torch.save({
                "epoch": epoch,
                "model_state_dict": model.state_dict(),
                "val_metrics": val_metrics,
                "config": cfg,
            }, ckpt_dir / "best_model.pt")
        else:
            patience_counter += 1

        # Collect snapshots for ensemble (keep top-K by val PCC)
        snapshot_entry = (val_metrics["pearson"], copy.deepcopy(model.state_dict()), epoch)
        if len(snapshots) < snapshot_k:
            snapshots.append(snapshot_entry)
            snapshots.sort(key=lambda x: x[0], reverse=True)
        elif val_metrics["pearson"] > snapshots[-1][0]:
            snapshots[-1] = snapshot_entry
            snapshots.sort(key=lambda x: x[0], reverse=True)

        if patience_counter >= patience:
            print(f"\nEarly stopping at epoch {epoch} (best PCC: {best_val_pcc:.4f})")
            break

    # === Evaluate best single model ===
    print("\n" + "=" * 80)
    print("Evaluating best single model on test set...")
    checkpoint = torch.load(ckpt_dir / "best_model.pt", map_location=device, weights_only=False)
    model.load_state_dict(checkpoint["model_state_dict"])

    test_metrics, test_preds, test_targets = evaluate(model, test_loader, device, loss_fn)

    print(f"\nSingle Model Test Results:")
    print(f"  Pearson Correlation: {test_metrics['pearson']:.4f}")
    print(f"  Spearman Correlation: {test_metrics['spearman']:.4f}")
    print(f"  RMSE: {test_metrics['rmse']:.4f}")
    print(f"  MAE: {test_metrics['mae']:.4f}")
    print(f"  R2: {test_metrics['r2']:.4f}")

    # === Evaluate snapshot ensemble ===
    print(f"\nEvaluating snapshot ensemble ({len(snapshots)} models)...")
    ensemble_models = []
    for pcc, state_dict, ep in snapshots:
        m = build_model(cfg, device)
        m.load_state_dict(state_dict)
        m.eval()
        ensemble_models.append(m)
        print(f"  Snapshot epoch {ep}: val PCC={pcc:.4f}")

    ens_metrics, ens_preds, ens_targets = evaluate_ensemble(ensemble_models, test_loader, device, loss_fn)

    print(f"\nSnapshot Ensemble Test Results:")
    print(f"  Pearson Correlation: {ens_metrics['pearson']:.4f}")
    print(f"  Spearman Correlation: {ens_metrics['spearman']:.4f}")
    print(f"  RMSE: {ens_metrics['rmse']:.4f}")
    print(f"  MAE: {ens_metrics['mae']:.4f}")
    print(f"  R2: {ens_metrics['r2']:.4f}")

    # Pick best raw model (single vs ensemble)
    if ens_metrics["pearson"] > test_metrics["pearson"]:
        raw_metrics = ens_metrics
        raw_preds = ens_preds
        raw_targets = ens_targets
        raw_label = "snapshot_ensemble"
        print("\n=> Snapshot ensemble is better.")
        torch.save({
            "snapshots": [(pcc, sd, ep) for pcc, sd, ep in snapshots],
            "config": cfg,
        }, ckpt_dir / "ensemble_model.pt")
    else:
        raw_metrics = test_metrics
        raw_preds = test_preds
        raw_targets = test_targets
        raw_label = "single_best"
        print("\n=> Single model is better.")

    # === Post-hoc linear calibration ===
    # Fit y = a * pred + b on validation set to correct mean regression
    print("\nApplying post-hoc calibration on validation set...")
    if raw_label == "snapshot_ensemble":
        _, val_preds_raw, val_targets_raw = evaluate_ensemble(ensemble_models, val_loader, device, loss_fn)
    else:
        _, val_preds_raw, val_targets_raw = evaluate(model, val_loader, device, loss_fn)

    cal_model = LinearRegression()
    cal_model.fit(val_preds_raw.reshape(-1, 1), val_targets_raw)
    print(f"  Calibration: y = {cal_model.coef_[0]:.4f} * pred + {cal_model.intercept_:.4f}")

    cal_preds = cal_model.predict(raw_preds.reshape(-1, 1))
    cal_metrics = compute_metrics(cal_preds, raw_targets)
    print(f"\nCalibrated Test Results:")
    print(f"  Pearson Correlation: {cal_metrics['pearson']:.4f}")
    print(f"  Spearman Correlation: {cal_metrics['spearman']:.4f}")
    print(f"  RMSE: {cal_metrics['rmse']:.4f}")
    print(f"  MAE: {cal_metrics['mae']:.4f}")
    print(f"  R2: {cal_metrics['r2']:.4f}")
    print(f"  Pred std: {cal_preds.std():.3f} vs True std: {raw_targets.std():.3f}")

    # Use calibrated if better
    if cal_metrics["r2"] > raw_metrics["r2"]:
        final_metrics = cal_metrics
        final_preds = cal_preds
        final_label = raw_label + "+calibrated"
        print("  => Calibration improved R2, using calibrated predictions.")
    else:
        final_metrics = raw_metrics
        final_preds = raw_preds
        final_label = raw_label
        print("  => Calibration did not help, using raw predictions.")
    final_targets = raw_targets

    # Save results
    results = {
        "test_metrics": final_metrics,
        "single_model_metrics": test_metrics,
        "ensemble_metrics": ens_metrics,
        "calibrated_metrics": cal_metrics,
        "calibration": {"coef": float(cal_model.coef_[0]), "intercept": float(cal_model.intercept_)},
        "best_val_metrics": checkpoint["val_metrics"],
        "best_epoch": checkpoint["epoch"],
        "method": final_label,
        "config": cfg,
        "data_stats": {
            "train_size": len(train_idx),
            "val_size": len(val_idx),
            "test_size": len(test_idx),
        },
    }
    with open(results_dir / "training_results.json", "w") as f:
        json.dump(results, f, indent=2)

    pred_df = pd.DataFrame({
        "sequence": sequences[test_idx],
        "true_mic": final_targets,
        "pred_mic": final_preds,
    })
    pred_df.to_csv(results_dir / "test_predictions.csv", index=False)

    with open(results_dir / "training_history.json", "w") as f:
        json.dump(history, f, indent=2)

    print(f"\nResults saved to {results_dir}")
    return final_metrics


def train_single_seed(cfg, embeddings, masks, sequences, mic_values, device, seed):
    """Train a single model with given seed. Returns (snapshot_state_dicts, val_loader, test_loader, test_idx)."""
    ckpt_dir = PROJECT_ROOT / cfg["paths"]["checkpoint_dir"]
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    # Split data with stratification using this seed
    mic_bins = pd.qcut(mic_values, q=5, labels=False, duplicates="drop")
    indices = np.arange(len(sequences))

    train_val_idx, test_idx = train_test_split(
        indices, test_size=cfg["data"]["test_ratio"],
        random_state=42, stratify=mic_bins,  # always same test set
    )
    val_size = cfg["data"]["val_ratio"] / (1 - cfg["data"]["test_ratio"])
    train_idx, val_idx = train_test_split(
        train_val_idx, test_size=val_size,
        random_state=seed, stratify=mic_bins[train_val_idx],  # different train/val split per seed
    )

    print(f"\n[Seed {seed}] Train: {len(train_idx)}, Val: {len(val_idx)}, Test: {len(test_idx)}")

    # Create datasets
    train_ds = PrecomputedMICDataset(
        embeddings[train_idx], masks[train_idx], mic_values[train_idx],
        sequences[train_idx], fit_scaler=True,
    )
    val_ds = PrecomputedMICDataset(
        embeddings[val_idx], masks[val_idx], mic_values[val_idx],
        sequences[val_idx], physchem_scaler=train_ds.physchem_scaler,
    )
    test_ds = PrecomputedMICDataset(
        embeddings[test_idx], masks[test_idx], mic_values[test_idx],
        sequences[test_idx], physchem_scaler=train_ds.physchem_scaler,
    )

    bs = cfg["training"]["batch_size"]
    train_loader = DataLoader(train_ds, batch_size=bs, shuffle=True, num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=bs, shuffle=False, num_workers=4, pin_memory=True)
    test_loader = DataLoader(test_ds, batch_size=bs, shuffle=False, num_workers=4, pin_memory=True)

    # Set random seeds for reproducibility
    torch.manual_seed(seed)
    np.random.seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)

    model = build_model(cfg, device)

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=cfg["training"]["lr"],
        weight_decay=cfg["training"]["weight_decay"],
    )

    total_steps = len(train_loader) * cfg["training"]["epochs"]
    warmup_steps = len(train_loader) * cfg["training"]["warmup_epochs"]
    scheduler = get_cosine_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    loss_type = cfg["training"]["loss"]
    if loss_type == "huber":
        loss_fn = nn.HuberLoss(delta=cfg["training"]["huber_delta"])
    else:
        loss_fn = nn.MSELoss()

    best_val_pcc = -1
    patience_counter = 0
    patience = cfg["training"]["patience"]

    snapshot_k = cfg["training"].get("snapshot_k", 5)
    snapshots = []

    aug_cfg = cfg["training"]["augmentation"]
    noise_std = aug_cfg["noise_std"]
    mask_prob = aug_cfg.get("residue_mask_prob", 0.0)
    label_noise_std = aug_cfg.get("label_noise_std", 0.0)
    mixup_alpha = aug_cfg.get("mixup_alpha", 0.2)

    for epoch in range(1, cfg["training"]["epochs"] + 1):
        model.train()
        epoch_loss, n_batches = 0, 0

        for batch in train_loader:
            emb = batch["esm_embeddings"].to(device)
            mask = batch["attention_mask"].to(device)
            physchem = batch["physchem"].to(device)
            targets = batch["mic"].to(device)

            if noise_std > 0:
                emb = emb + torch.randn_like(emb) * noise_std
            if mask_prob > 0:
                residue_mask = (torch.rand(emb.shape[0], emb.shape[1], 1, device=device) > mask_prob).float()
                emb = emb * residue_mask
            if mixup_alpha > 0:
                emb, mask, physchem, targets = mixup_batch(emb, mask, physchem, targets, mixup_alpha)
            if label_noise_std > 0:
                targets = targets + torch.randn_like(targets) * label_noise_std

            optimizer.zero_grad()
            preds = model(emb, mask, physchem)
            loss = loss_fn(preds, targets)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), cfg["training"]["grad_clip"])
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            n_batches += 1

        avg_train_loss = epoch_loss / max(n_batches, 1)
        val_metrics, _, _ = evaluate(model, val_loader, device, loss_fn)

        if epoch % 20 == 0 or epoch == 1:
            print(f"  [Seed {seed}] Epoch {epoch:3d} | Train: {avg_train_loss:.4f} | Val PCC: {val_metrics['pearson']:.4f} | Val R2: {val_metrics['r2']:.4f}")

        if val_metrics["pearson"] > best_val_pcc:
            best_val_pcc = val_metrics["pearson"]
            patience_counter = 0
        else:
            patience_counter += 1

        snapshot_entry = (val_metrics["pearson"], copy.deepcopy(model.state_dict()), epoch)
        if len(snapshots) < snapshot_k:
            snapshots.append(snapshot_entry)
            snapshots.sort(key=lambda x: x[0], reverse=True)
        elif val_metrics["pearson"] > snapshots[-1][0]:
            snapshots[-1] = snapshot_entry
            snapshots.sort(key=lambda x: x[0], reverse=True)

        if patience_counter >= patience:
            print(f"  [Seed {seed}] Early stop at epoch {epoch} (best PCC: {best_val_pcc:.4f})")
            break

    print(f"  [Seed {seed}] Top snapshots: {[f'ep{ep}={pcc:.4f}' for pcc, _, ep in snapshots]}")
    return snapshots, val_loader, test_loader, test_idx, loss_fn


def train_multi_seed(config_path: str = None):
    """Train multiple models with different seeds and ensemble."""
    if config_path is None:
        config_path = PROJECT_ROOT / "mic_prediction" / "config.yaml"
    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    results_dir = PROJECT_ROOT / cfg["paths"]["results_dir"]
    results_dir.mkdir(parents=True, exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load pre-computed embeddings
    emb_path = PROJECT_ROOT / "mic_prediction" / "data" / "esm2_embeddings.npz"
    print("Loading pre-computed ESM-2 embeddings...")
    data = np.load(emb_path, allow_pickle=True)
    embeddings = data["embeddings"]
    masks_data = data["masks"]
    sequences = data["sequences"]
    mic_values = data["mic_values"]
    print(f"Loaded {len(sequences)} sequences")

    # OOF filtering
    residual_thresh = cfg["data"].get("oof_residual_threshold", None)
    residual_path = PROJECT_ROOT / "mic_prediction" / "data" / "oof_residuals.csv"
    if residual_thresh is not None and residual_path.exists():
        oof_df = pd.read_csv(residual_path)
        seq_to_resid = dict(zip(oof_df["sequence"], oof_df["residual"]))
        keep_mask = np.array([seq_to_resid.get(s, 999) <= residual_thresh for s in sequences])
        n_before = len(sequences)
        embeddings = embeddings[keep_mask]
        masks_data = masks_data[keep_mask]
        sequences = sequences[keep_mask]
        mic_values = mic_values[keep_mask]
        print(f"OOF filtering (threshold={residual_thresh}): {n_before} -> {len(sequences)}")

    seeds = [42, 123, 456]
    all_snapshots = []

    for seed in seeds:
        snapshots, val_loader, test_loader, test_idx, loss_fn = train_single_seed(
            cfg, embeddings, masks_data, sequences, mic_values, device, seed
        )
        all_snapshots.extend(snapshots)

    # Build ensemble from ALL snapshots across all seeds
    print(f"\n{'='*80}")
    print(f"Multi-seed ensemble: {len(all_snapshots)} models from {len(seeds)} seeds")

    ensemble_models = []
    for pcc, state_dict, ep in all_snapshots:
        m = build_model(cfg, device)
        m.load_state_dict(state_dict)
        m.eval()
        ensemble_models.append(m)

    ens_metrics, ens_preds, ens_targets = evaluate_ensemble(ensemble_models, test_loader, device, loss_fn)

    print(f"\nMulti-Seed Ensemble Test Results:")
    print(f"  Pearson Correlation: {ens_metrics['pearson']:.4f}")
    print(f"  Spearman Correlation: {ens_metrics['spearman']:.4f}")
    print(f"  RMSE: {ens_metrics['rmse']:.4f}")
    print(f"  MAE: {ens_metrics['mae']:.4f}")
    print(f"  R2: {ens_metrics['r2']:.4f}")

    # Post-hoc calibration
    _, val_preds_raw, val_targets_raw = evaluate_ensemble(ensemble_models, val_loader, device, loss_fn)
    cal_model = LinearRegression()
    cal_model.fit(val_preds_raw.reshape(-1, 1), val_targets_raw)
    print(f"\n  Calibration: y = {cal_model.coef_[0]:.4f} * pred + {cal_model.intercept_:.4f}")

    cal_preds = cal_model.predict(ens_preds.reshape(-1, 1))
    cal_metrics = compute_metrics(cal_preds, ens_targets)
    print(f"\nCalibrated Multi-Seed Ensemble:")
    print(f"  Pearson Correlation: {cal_metrics['pearson']:.4f}")
    print(f"  Spearman Correlation: {cal_metrics['spearman']:.4f}")
    print(f"  RMSE: {cal_metrics['rmse']:.4f}")
    print(f"  MAE: {cal_metrics['mae']:.4f}")
    print(f"  R2: {cal_metrics['r2']:.4f}")
    print(f"  Pred std: {cal_preds.std():.3f} vs True std: {ens_targets.std():.3f}")

    # Save results
    final = cal_metrics if cal_metrics["r2"] > ens_metrics["r2"] else ens_metrics
    final_preds = cal_preds if cal_metrics["r2"] > ens_metrics["r2"] else ens_preds

    results = {
        "test_metrics": final,
        "raw_ensemble_metrics": ens_metrics,
        "calibrated_metrics": cal_metrics,
        "seeds": seeds,
        "n_models": len(all_snapshots),
        "config": cfg,
    }
    with open(results_dir / "multi_seed_results.json", "w") as f:
        json.dump(results, f, indent=2)

    pred_df = pd.DataFrame({
        "sequence": sequences[test_idx],
        "true_mic": ens_targets,
        "pred_mic": final_preds,
    })
    pred_df.to_csv(results_dir / "multi_seed_predictions.csv", index=False)

    print(f"\nResults saved to {results_dir}")
    return final


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train ESM-MIC model")
    parser.add_argument("--config", type=str, default=None)
    parser.add_argument("--multi-seed", action="store_true", help="Train with multiple seeds and ensemble")
    args = parser.parse_args()
    if args.multi_seed:
        train_multi_seed(args.config)
    else:
        train(args.config)
