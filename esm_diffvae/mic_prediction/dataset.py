"""Dataset for MIC prediction with HuggingFace ESM-2 tokenization and physicochemical features."""

import os
import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")

from .features import compute_physicochemical_features


STANDARD_AAS = set("ACDEFGHIKLMNPQRSTVWY")


def clean_sequence(seq: str) -> str | None:
    if not isinstance(seq, str):
        return None
    seq = seq.upper().strip()
    if not seq or not all(c in STANDARD_AAS for c in seq):
        return None
    return seq


def load_mic_data(
    processed_csv: str,
    grampa_csv: str | None = None,
    min_len: int = 5,
    max_len: int = 50,
    outlier_sigma: float = 3.0,
) -> pd.DataFrame:
    """Load MIC data from project CSV only (GRAMPA dropped due to low correlation).

    GRAMPA and project MIC values use incompatible scales (r=0.47 for overlapping
    sequences). Calibration is unreliable, so we use project data exclusively.
    """
    df = pd.read_csv(processed_csv)
    mic_df = df[df["mic_value"].notna()].copy()
    mic_df = mic_df[["sequence", "mic_value"]].rename(columns={"mic_value": "log_mic"})
    mic_df["source"] = "project"

    mic_df["sequence"] = mic_df["sequence"].apply(clean_sequence)
    mic_df = mic_df.dropna(subset=["sequence", "log_mic"])

    mic_df["length"] = mic_df["sequence"].str.len()
    mic_df = mic_df[(mic_df["length"] >= min_len) & (mic_df["length"] <= max_len)]

    # Deduplicate: keep first occurrence per sequence
    mic_df = mic_df.drop_duplicates(subset="sequence", keep="first")

    # Outlier removal: drop sequences with |log_mic| > outlier_sigma * std from mean
    mean_mic = mic_df["log_mic"].mean()
    std_mic = mic_df["log_mic"].std()
    n_before = len(mic_df)
    mic_df = mic_df[np.abs(mic_df["log_mic"] - mean_mic) <= outlier_sigma * std_mic]
    n_removed = n_before - len(mic_df)
    if n_removed > 0:
        print(f"Outlier removal: dropped {n_removed} sequences (>{outlier_sigma}σ from mean)")

    print(f"Data: {len(mic_df)} sequences, MIC range [{mic_df['log_mic'].min():.3f}, {mic_df['log_mic'].max():.3f}]")

    return mic_df.reset_index(drop=True)


def prepare_splits(
    df: pd.DataFrame,
    test_ratio: float = 0.1,
    val_ratio: float = 0.1,
    seed: int = 42,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    df = df.copy()
    df["mic_bin"] = pd.qcut(df["log_mic"], q=5, labels=False, duplicates="drop")

    train_val, test = train_test_split(df, test_size=test_ratio, random_state=seed, stratify=df["mic_bin"])
    val_size = val_ratio / (1 - test_ratio)
    train, val = train_test_split(train_val, test_size=val_size, random_state=seed, stratify=train_val["mic_bin"])

    for split in [train, val, test]:
        split.drop(columns=["mic_bin"], inplace=True)

    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


class MICDataset(Dataset):
    """PyTorch Dataset for MIC prediction using HuggingFace ESM-2 tokenizer."""

    def __init__(
        self,
        df: pd.DataFrame,
        tokenizer,
        max_seq_len: int = 50,
        physchem_scaler: StandardScaler | None = None,
        fit_scaler: bool = False,
    ):
        self.sequences = df["sequence"].tolist()
        self.mic_values = df["log_mic"].values.astype(np.float32)
        self.tokenizer = tokenizer
        self.max_seq_len = max_seq_len

        # Pre-tokenize all sequences
        # ESM-2 tokenizer adds special tokens (BOS=0, EOS=2)
        self.encodings = tokenizer(
            self.sequences,
            padding="max_length",
            truncation=True,
            max_length=max_seq_len + 2,  # +2 for BOS/EOS
            return_tensors="np",
        )

        # Compute physicochemical features
        self.physchem = np.stack([
            compute_physicochemical_features(seq) for seq in self.sequences
        ])

        if fit_scaler:
            self.physchem_scaler = StandardScaler()
            self.physchem = self.physchem_scaler.fit_transform(self.physchem)
        elif physchem_scaler is not None:
            self.physchem_scaler = physchem_scaler
            self.physchem = physchem_scaler.transform(self.physchem)
        else:
            self.physchem_scaler = None

        self.physchem = self.physchem.astype(np.float32)

    def __len__(self):
        return len(self.sequences)

    def __getitem__(self, idx):
        return {
            "input_ids": torch.tensor(self.encodings["input_ids"][idx], dtype=torch.long),
            "attention_mask": torch.tensor(self.encodings["attention_mask"][idx], dtype=torch.float32),
            "physchem": torch.tensor(self.physchem[idx], dtype=torch.float32),
            "mic": torch.tensor(self.mic_values[idx], dtype=torch.float32),
        }
