"""Pre-compute ESM-2 embeddings for all MIC sequences.

This separates the ESM-2 forward pass (CPU-safe) from the downstream
training (GPU), avoiding cuBLAS compatibility issues on newer GPUs.
"""

import os
os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")

import sys
from pathlib import Path

import numpy as np
import torch
import transformers
transformers.utils.is_flash_attn_2_available = lambda: False
from transformers import AutoTokenizer, AutoModel

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from mic_prediction.dataset import load_mic_data
import yaml


def precompute_embeddings(
    model_name: str = "facebook/esm2_t12_35M_UR50D",
    max_seq_len: int = 50,
    batch_size: int = 64,
    device: str = "cpu",
):
    """Pre-compute ESM-2 embeddings for all MIC data."""
    config_path = PROJECT_ROOT / "mic_prediction" / "config.yaml"
    with open(config_path) as f:
        cfg = yaml.safe_load(f)

    output_dir = PROJECT_ROOT / "mic_prediction" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "esm2_embeddings.npz"

    if output_path.exists():
        print(f"Embeddings already exist at {output_path}. Delete to recompute.")
        data = np.load(output_path, allow_pickle=True)
        print(f"  Sequences: {len(data['sequences'])}, Shape: {data['embeddings'].shape}")
        return

    # Load data (project data only, GRAMPA dropped due to scale incompatibility)
    processed_csv = PROJECT_ROOT / cfg["data"]["processed_csv"]

    df = load_mic_data(
        str(processed_csv),
        grampa_csv=None,
        min_len=cfg["data"]["min_seq_len"],
        max_len=cfg["data"]["max_seq_len"],
    )
    sequences = df["sequence"].tolist()
    mic_values = df["log_mic"].values
    print(f"Total sequences: {len(sequences)}")

    # Load model
    print(f"Loading {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name, attn_implementation="eager")
    model = model.to(device)
    model.eval()

    max_tok_len = max_seq_len + 2
    all_embeddings = []
    all_masks = []

    print(f"Computing embeddings on {device}...")
    for i in range(0, len(sequences), batch_size):
        batch_seqs = sequences[i:i + batch_size]
        encodings = tokenizer(
            batch_seqs,
            padding="max_length",
            truncation=True,
            max_length=max_tok_len,
            return_tensors="pt",
        )

        input_ids = encodings["input_ids"].to(device)
        attention_mask = encodings["attention_mask"].to(device)

        with torch.no_grad():
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            emb = outputs.last_hidden_state.cpu().numpy()

        all_embeddings.append(emb)
        all_masks.append(attention_mask.cpu().numpy())

        if (i // batch_size) % 10 == 0:
            print(f"  Processed {min(i + batch_size, len(sequences))}/{len(sequences)}")

    embeddings = np.concatenate(all_embeddings, axis=0)  # [N, L, D]
    masks = np.concatenate(all_masks, axis=0)             # [N, L]

    print(f"Embeddings shape: {embeddings.shape}")
    print(f"Saving to {output_path}...")

    np.savez_compressed(
        output_path,
        embeddings=embeddings,
        masks=masks,
        sequences=np.array(sequences),
        mic_values=mic_values,
    )
    print("Done!")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", default="cpu", help="Device for ESM-2 (cpu recommended)")
    parser.add_argument("--batch-size", type=int, default=64)
    args = parser.parse_args()
    precompute_embeddings(device=args.device, batch_size=args.batch_size)
