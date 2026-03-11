"""Inference script for ESM-MIC model."""

import os
os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")

import sys
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import torch

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mic_prediction.model import ESMMIC
from mic_prediction.features import compute_physicochemical_features
from mic_prediction.dataset import clean_sequence


def load_model(checkpoint_path: str, device: torch.device = None):
    """Load trained ESM-MIC model from checkpoint."""
    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    cfg = checkpoint["config"]

    model_cfg = cfg["model"]
    esm_cfg = cfg["esm"]

    model = ESMMIC(
        esm_model_name=esm_cfg["model_name"],
        esm_dim=esm_cfg["embedding_dim"],
        freeze_layers=esm_cfg["freeze_layers"],
        cnn_channels=model_cfg["cnn_channels"],
        cnn_kernels=model_cfg["cnn_kernels"],
        cnn_dropout=model_cfg["cnn_dropout"],
        attention_dim=model_cfg["attention_dim"],
        attention_heads=model_cfg["attention_heads"],
        attention_layers=model_cfg["attention_layers"],
        attention_dropout=model_cfg["attention_dropout"],
        physchem_dim=cfg["physchem"]["dim"],
        fusion_hidden_dims=model_cfg["fusion_hidden_dims"],
        fusion_dropout=model_cfg["fusion_dropout"],
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model = model.to(device)
    model.eval()

    return model, cfg


def predict_sequences(
    model: ESMMIC,
    sequences: list[str],
    device: torch.device = None,
    batch_size: int = 32,
    max_seq_len: int = 50,
) -> np.ndarray:
    """Predict MIC values for a list of peptide sequences."""
    if device is None:
        device = next(model.parameters()).device

    tokenizer = model.esm_tokenizer
    all_preds = []

    for i in range(0, len(sequences), batch_size):
        batch_seqs = sequences[i:i + batch_size]

        # Tokenize with HuggingFace tokenizer
        encodings = tokenizer(
            batch_seqs,
            padding="max_length",
            truncation=True,
            max_length=max_seq_len + 2,
            return_tensors="pt",
        )

        input_ids = encodings["input_ids"].to(device)
        attention_mask = encodings["attention_mask"].to(device).float()

        physchem = torch.tensor(
            np.stack([compute_physicochemical_features(seq) for seq in batch_seqs]),
            dtype=torch.float32, device=device,
        )

        with torch.no_grad():
            preds = model(input_ids, attention_mask, physchem)
        all_preds.append(preds.cpu().numpy())

    return np.concatenate(all_preds)


def mic_to_ugml(log_mic: float) -> float:
    """Convert log2(MIC) back to linear scale."""
    return 2.0 ** log_mic


def main():
    parser = argparse.ArgumentParser(description="Predict MIC for peptide sequences")
    parser.add_argument("--checkpoint", type=str, required=True, help="Path to model checkpoint")
    parser.add_argument("--sequences", type=str, nargs="+", help="Peptide sequences to predict")
    parser.add_argument("--input-csv", type=str, help="CSV file with 'sequence' column")
    parser.add_argument("--output-csv", type=str, default="mic_predictions.csv", help="Output CSV path")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Loading model from {args.checkpoint}...")
    model, cfg = load_model(args.checkpoint, device)

    sequences = []
    if args.sequences:
        sequences = [s.upper().strip() for s in args.sequences]
    elif args.input_csv:
        df = pd.read_csv(args.input_csv)
        sequences = df["sequence"].tolist()
    else:
        print("Error: provide --sequences or --input-csv")
        return

    valid_seqs = []
    for seq in sequences:
        cleaned = clean_sequence(seq)
        if cleaned:
            valid_seqs.append(cleaned)
        else:
            print(f"  Skipping invalid sequence: {seq}")

    if not valid_seqs:
        print("No valid sequences to predict.")
        return

    print(f"Predicting MIC for {len(valid_seqs)} sequences...")
    log_mics = predict_sequences(model, valid_seqs, device, max_seq_len=cfg["data"]["max_seq_len"])

    results = pd.DataFrame({
        "sequence": valid_seqs,
        "predicted_log_mic": log_mics,
        "predicted_mic_linear": [mic_to_ugml(m) for m in log_mics],
    })

    results.to_csv(args.output_csv, index=False)
    print(f"\nPredictions saved to {args.output_csv}")
    print("\nTop predictions (lowest MIC = most potent):")
    print(results.sort_values("predicted_log_mic").head(10).to_string(index=False))


if __name__ == "__main__":
    main()
