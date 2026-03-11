"""Download and process GRAMPA dataset for additional MIC training data."""

import sys
from pathlib import Path
import pandas as pd
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def download_grampa():
    """Download GRAMPA CSV from GitHub and process it."""
    data_dir = PROJECT_ROOT / "mic_prediction" / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    output_path = data_dir / "grampa_clean.csv"
    if output_path.exists():
        print(f"GRAMPA data already exists at {output_path}")
        df = pd.read_csv(output_path)
        print(f"  {len(df)} sequences")
        return

    # Download from GitHub
    url = "https://raw.githubusercontent.com/zswitten/Antimicrobial-Peptides/master/data/grampa.csv"
    print(f"Downloading GRAMPA from {url}...")

    try:
        df = pd.read_csv(url)
    except Exception as e:
        print(f"Download failed: {e}")
        print("Trying alternative method...")
        import urllib.request
        import io
        response = urllib.request.urlopen(url)
        content = response.read().decode("utf-8")
        df = pd.read_csv(io.StringIO(content))

    print(f"Raw GRAMPA: {len(df)} rows, columns: {list(df.columns)}")

    # GRAMPA columns: sequence, value, bacterium, strain, unit, etc.
    seq_col = "sequence"
    mic_col = "value"

    if seq_col not in df.columns or mic_col not in df.columns:
        print(f"ERROR: Expected columns 'sequence' and 'value', got: {list(df.columns)}")
        return

    print(f"Using sequence column: {seq_col}, MIC column: {mic_col}")
    print(f"Units: {df['unit'].value_counts().to_dict()}")
    print(f"Bacteria: {df['bacterium'].nunique()} species")

    # All GRAMPA values are in uM - keep them all (uM is a valid MIC unit)
    clean = df[[seq_col, mic_col]].copy()
    clean.columns = ["sequence", "mic_raw"]

    # Remove non-standard amino acids
    standard_aa = set("ACDEFGHIKLMNPQRSTVWY")
    clean["sequence"] = clean["sequence"].astype(str).str.upper().str.strip()
    clean = clean[clean["sequence"].apply(lambda s: all(c in standard_aa for c in s))]

    # Convert MIC to numeric
    clean["mic_raw"] = pd.to_numeric(clean["mic_raw"], errors="coerce")
    clean = clean.dropna(subset=["mic_raw"])

    # Remove zero/negative MIC
    clean = clean[clean["mic_raw"] > 0]

    # Convert to log2 scale (uM values)
    clean["log_mic"] = np.log2(clean["mic_raw"])

    # Length filter
    clean["length"] = clean["sequence"].str.len()
    clean = clean[(clean["length"] >= 5) & (clean["length"] <= 50)]

    # Deduplicate: keep median MIC for same sequence
    clean = clean.groupby("sequence").agg(
        log_mic=("log_mic", "median"),
        length=("length", "first"),
    ).reset_index()

    # Save
    clean[["sequence", "log_mic"]].to_csv(output_path, index=False)
    print(f"Saved {len(clean)} cleaned GRAMPA sequences to {output_path}")
    print(f"  MIC range: [{clean['log_mic'].min():.2f}, {clean['log_mic'].max():.2f}] (log2)")
    print(f"  Length range: [{clean['length'].min()}, {clean['length'].max()}]")


if __name__ == "__main__":
    download_grampa()
