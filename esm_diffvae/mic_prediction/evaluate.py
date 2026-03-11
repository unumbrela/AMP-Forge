"""Evaluation and visualization for MIC prediction results."""

import sys
import json
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def plot_predictions(
    true_values: np.ndarray,
    pred_values: np.ndarray,
    output_path: str,
    title: str = "ESM-MIC: Predicted vs True MIC",
):
    """Scatter plot of predicted vs true MIC values."""
    pcc, _ = pearsonr(pred_values, true_values)
    scc, _ = spearmanr(pred_values, true_values)
    rmse = np.sqrt(mean_squared_error(true_values, pred_values))
    r2 = r2_score(true_values, pred_values)

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Scatter plot
    ax = axes[0]
    ax.scatter(true_values, pred_values, alpha=0.4, s=20, c="#2196F3", edgecolors="none")
    lims = [
        min(true_values.min(), pred_values.min()) - 0.5,
        max(true_values.max(), pred_values.max()) + 0.5,
    ]
    ax.plot(lims, lims, "r--", alpha=0.8, linewidth=1.5, label="y = x")
    ax.set_xlim(lims)
    ax.set_ylim(lims)
    ax.set_xlabel("True log2(MIC)", fontsize=12)
    ax.set_ylabel("Predicted log2(MIC)", fontsize=12)
    ax.set_title(title, fontsize=13)
    ax.legend(fontsize=10)

    # Metrics text box
    textstr = (
        f"PCC = {pcc:.4f}\n"
        f"SCC = {scc:.4f}\n"
        f"RMSE = {rmse:.4f}\n"
        f"R$^2$ = {r2:.4f}\n"
        f"n = {len(true_values)}"
    )
    props = dict(boxstyle="round", facecolor="wheat", alpha=0.8)
    ax.text(0.05, 0.95, textstr, transform=ax.transAxes, fontsize=10,
            verticalalignment="top", bbox=props)

    # Residual distribution
    ax = axes[1]
    residuals = pred_values - true_values
    ax.hist(residuals, bins=40, color="#4CAF50", alpha=0.7, edgecolor="white")
    ax.axvline(0, color="red", linestyle="--", linewidth=1.5)
    ax.set_xlabel("Residual (Predicted - True)", fontsize=12)
    ax.set_ylabel("Count", fontsize=12)
    ax.set_title("Residual Distribution", fontsize=13)
    ax.text(0.95, 0.95, f"Mean: {residuals.mean():.3f}\nStd: {residuals.std():.3f}",
            transform=ax.transAxes, fontsize=10, verticalalignment="top",
            horizontalalignment="right",
            bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.8))

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Plot saved to {output_path}")


def plot_training_history(history_path: str, output_path: str):
    """Plot training and validation loss curves."""
    with open(history_path) as f:
        history = json.load(f)

    train_epochs = [h["epoch"] for h in history["train"]]
    train_loss = [h["loss"] for h in history["train"]]
    val_epochs = [h["epoch"] for h in history["val"]]
    val_loss = [h["loss"] for h in history["val"]]
    val_pcc = [h["pearson"] for h in history["val"]]

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # Loss curves
    axes[0].plot(train_epochs, train_loss, label="Train Loss", color="#2196F3")
    axes[0].plot(val_epochs, val_loss, label="Val Loss", color="#F44336")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("Loss")
    axes[0].set_title("Training & Validation Loss")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # PCC curve
    axes[1].plot(val_epochs, val_pcc, label="Val PCC", color="#4CAF50")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("Pearson Correlation")
    axes[1].set_title("Validation Pearson Correlation")
    axes[1].legend()
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"Training history plot saved to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Evaluate MIC prediction results")
    parser.add_argument("--results-dir", type=str,
                        default=str(PROJECT_ROOT / "mic_prediction" / "results"))
    args = parser.parse_args()

    results_dir = Path(args.results_dir)

    # Plot predictions
    pred_path = results_dir / "test_predictions.csv"
    if pred_path.exists():
        df = pd.read_csv(pred_path)
        plot_predictions(
            df["true_mic"].values,
            df["pred_mic"].values,
            str(results_dir / "prediction_scatter.png"),
        )

    # Plot training history
    hist_path = results_dir / "training_history.json"
    if hist_path.exists():
        plot_training_history(str(hist_path), str(results_dir / "training_curves.png"))

    # Print summary
    results_path = results_dir / "training_results.json"
    if results_path.exists():
        with open(results_path) as f:
            results = json.load(f)
        print("\n" + "=" * 50)
        print("ESM-MIC Test Set Results")
        print("=" * 50)
        for k, v in results["test_metrics"].items():
            print(f"  {k:>20s}: {v:.4f}")


if __name__ == "__main__":
    main()
