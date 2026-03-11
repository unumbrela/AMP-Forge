"""Predict MIC values for sequences in FASTA files using trained ESM-MIC ensemble."""

import os
os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")

import sys
import json
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import yaml
import transformers
transformers.utils.is_flash_attn_2_available = lambda: False
from transformers import AutoTokenizer, AutoModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mic_prediction.model import ESMMICLite
from mic_prediction.features import compute_physicochemical_features
from mic_prediction.train import build_model
from sklearn.preprocessing import StandardScaler


def parse_fasta(fasta_path):
    """Parse a FASTA file, return list of (header, sequence)."""
    records = []
    header, seq_lines = None, []
    with open(fasta_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(">"):
                if header is not None:
                    records.append((header, "".join(seq_lines)))
                header = line[1:]
                seq_lines = []
            else:
                seq_lines.append(line)
    if header is not None:
        records.append((header, "".join(seq_lines)))
    return records


def embed_sequences(sequences, tokenizer, esm_model, max_seq_len=50, device="cpu", batch_size=32):
    """Compute ESM-2 embeddings for a list of sequences."""
    max_tok_len = max_seq_len + 2
    all_embeddings, all_masks = [], []

    for i in range(0, len(sequences), batch_size):
        batch_seqs = sequences[i:i + batch_size]
        encodings = tokenizer(
            batch_seqs, padding="max_length", truncation=True,
            max_length=max_tok_len, return_tensors="pt",
        )
        input_ids = encodings["input_ids"].to(device)
        attention_mask = encodings["attention_mask"].to(device)

        with torch.no_grad():
            outputs = esm_model(input_ids=input_ids, attention_mask=attention_mask)
            emb = outputs.last_hidden_state.cpu().numpy()

        all_embeddings.append(emb)
        all_masks.append(attention_mask.cpu().numpy())

    return np.concatenate(all_embeddings), np.concatenate(all_masks)


def predict(fasta_path, config_path=None, device_esm="cpu", device_model="cuda"):
    """Run ESM-MIC prediction on a FASTA file."""
    if config_path is None:
        config_path = PROJECT_ROOT / "mic_prediction" / "config.yaml"
    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    # Parse FASTA
    records = parse_fasta(fasta_path)
    headers = [r[0] for r in records]
    sequences = [r[1] for r in records]
    # Filter to valid length
    min_len, max_len = cfg["data"]["min_seq_len"], cfg["data"]["max_seq_len"]
    valid = [(h, s) for h, s in zip(headers, sequences) if min_len <= len(s) <= max_len]
    if len(valid) < len(headers):
        print(f"Filtered {len(headers) - len(valid)} sequences outside length range [{min_len}, {max_len}]")
    headers, sequences = zip(*valid) if valid else ([], [])
    headers, sequences = list(headers), list(sequences)
    print(f"Predicting MIC for {len(sequences)} sequences from {fasta_path}")

    # Compute ESM-2 embeddings
    esm_name = cfg["esm"]["model_name"]
    print(f"Loading ESM-2 ({esm_name}) on {device_esm}...")
    tokenizer = AutoTokenizer.from_pretrained(esm_name)
    esm_model = AutoModel.from_pretrained(esm_name, attn_implementation="eager").to(device_esm)
    esm_model.eval()

    embeddings, masks = embed_sequences(
        sequences, tokenizer, esm_model,
        max_seq_len=cfg["data"]["max_seq_len"], device=device_esm,
    )
    del esm_model, tokenizer
    print(f"Embeddings shape: {embeddings.shape}")

    # Compute physicochemical features
    physchem = np.stack([compute_physicochemical_features(s) for s in sequences]).astype(np.float32)
    # Load scaler from training data to normalize
    train_emb_path = PROJECT_ROOT / "mic_prediction" / "data" / "esm2_embeddings.npz"
    if train_emb_path.exists():
        train_data = np.load(train_emb_path, allow_pickle=True)
        train_seqs = train_data["sequences"]
        train_physchem = np.stack([compute_physicochemical_features(s) for s in train_seqs]).astype(np.float32)
        scaler = StandardScaler().fit(train_physchem)
        physchem = scaler.transform(physchem).astype(np.float32)
    else:
        scaler = StandardScaler().fit(physchem)
        physchem = scaler.transform(physchem).astype(np.float32)

    # Load ensemble checkpoint
    device = torch.device(device_model if torch.cuda.is_available() else "cpu")
    ckpt_dir = PROJECT_ROOT / cfg["paths"]["checkpoint_dir"]

    # Try multi-seed ensemble first, fallback to single ensemble
    multi_seed_results = PROJECT_ROOT / cfg["paths"]["results_dir"] / "multi_seed_results.json"
    ensemble_path = ckpt_dir / "ensemble_model.pt"
    best_path = ckpt_dir / "best_model.pt"

    models = []
    if ensemble_path.exists():
        print("Loading snapshot ensemble...")
        ckpt = torch.load(ensemble_path, map_location=device, weights_only=False)
        for pcc, sd, ep in ckpt["snapshots"]:
            m = build_model(ckpt.get("config", cfg), device)
            m.load_state_dict(sd)
            m.eval()
            models.append(m)
        print(f"Loaded {len(models)} snapshot models")
    elif best_path.exists():
        print("Loading single best model...")
        ckpt = torch.load(best_path, map_location=device, weights_only=False)
        m = build_model(ckpt.get("config", cfg), device)
        m.load_state_dict(ckpt["model_state_dict"])
        m.eval()
        models.append(m)
    else:
        raise FileNotFoundError(f"No checkpoint found in {ckpt_dir}")

    # Run prediction
    emb_t = torch.from_numpy(embeddings.astype(np.float32)).to(device)
    mask_t = torch.from_numpy(masks.astype(np.float32)).to(device)
    physchem_t = torch.from_numpy(physchem).to(device)

    all_preds = []
    with torch.no_grad():
        for m in models:
            preds = m(emb_t, mask_t, physchem_t).cpu().numpy()
            all_preds.append(preds)

    ensemble_preds = np.mean(all_preds, axis=0)

    # Load calibration if available
    results_path = PROJECT_ROOT / cfg["paths"]["results_dir"] / "training_results.json"
    if results_path.exists():
        with open(results_path) as f:
            train_results = json.load(f)
        cal = train_results.get("calibration", {})
        if cal:
            coef, intercept = cal["coef"], cal["intercept"]
            ensemble_preds = ensemble_preds * coef + intercept
            print(f"Applied calibration: y = {coef:.4f} * pred + {intercept:.4f}")

    # Build results dataframe
    df = pd.DataFrame({
        "header": headers,
        "sequence": sequences,
        "length": [len(s) for s in sequences],
        "pred_log_mic": ensemble_preds,
        "pred_mic_uM": np.power(10, ensemble_preds),
    })
    df = df.sort_values("pred_log_mic", ascending=True)

    return df


def main():
    parser = argparse.ArgumentParser(description="Predict MIC for FASTA sequences using ESM-MIC")
    parser.add_argument("fasta", type=str, help="Path to input FASTA file")
    parser.add_argument("--config", type=str, default=None)
    parser.add_argument("--device-esm", type=str, default="cpu")
    parser.add_argument("--device-model", type=str, default="cuda")
    parser.add_argument("--output", type=str, default=None, help="Output CSV path")
    args = parser.parse_args()

    df = predict(args.fasta, args.config, args.device_esm, args.device_model)

    # Print summary
    print(f"\n{'='*60}")
    print(f"Prediction Summary ({len(df)} sequences)")
    print(f"{'='*60}")
    print(f"  Mean log-MIC:   {df['pred_log_mic'].mean():.3f}")
    print(f"  Median log-MIC: {df['pred_log_mic'].median():.3f}")
    print(f"  Std log-MIC:    {df['pred_log_mic'].std():.3f}")
    print(f"  Min log-MIC:    {df['pred_log_mic'].min():.3f} ({df['pred_mic_uM'].min():.2f} uM)")
    print(f"  Max log-MIC:    {df['pred_log_mic'].max():.3f} ({df['pred_mic_uM'].max():.2f} uM)")
    print(f"\n  Top-5 most potent (lowest MIC):")
    for _, row in df.head(5).iterrows():
        print(f"    {row['sequence'][:30]+'...' if len(row['sequence'])>30 else row['sequence']:<35s} "
              f"log-MIC={row['pred_log_mic']:.3f}  ({row['pred_mic_uM']:.2f} uM)")

    # Save
    out_path = args.output or str(Path(args.fasta).with_suffix(".mic_predictions.csv"))
    df.to_csv(out_path, index=False)
    print(f"\nPredictions saved to {out_path}")


if __name__ == "__main__":
    main()
