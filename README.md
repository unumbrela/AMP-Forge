[English](./README.md) | [简体中文](./README.zh-CN.md)

<p align="center">
  <img src="./docs/assets/banner.svg" alt="AMP Forge banner" width="100%" />
</p>

# AMP Forge

[![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](./esm_diffvae/requirements.txt)
[![Node](https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white)](./frontend/package.json)
[![pnpm](https://img.shields.io/badge/pnpm-10-F69220?logo=pnpm&logoColor=white)](./frontend/package.json)
[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-222222?logo=github&logoColor=white)](https://unumbrela.github.io/AMP-Forge/)

AMP Forge is a de novo antimicrobial peptide (AMP) design platform built on a joint **Transformer-based VAE + Latent Diffusion Model** architecture. The system leverages pre-trained protein language models (ESM-2 / ProtT5 / Ankh) to extract deep sequence-level representations, compresses them into a low-dimensional latent space via a BiGRU encoder, and employs a latent diffusion process coupled with a non-autoregressive Transformer decoder for parallel sequence generation. Six conditional generation modes — `mixed`, `c_sub`, `c_ext`, `c_trunc`, `tag`, and `latent` — enable precise and controllable AMP variant design.

## Live Demo

| | |
|---|---|
| **Repository** | [github.com/unumbrela/AMP-Forge](https://github.com/unumbrela/AMP-Forge) |
| **Project Page** | [unumbrela.github.io/AMP-Forge](https://unumbrela.github.io/AMP-Forge/) |
| **Docs** | [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) · [DATA_COLLECTION_REPORT.md](./DATA_COLLECTION_REPORT.md) |

## Key Features

- **Multi-PLM backbone** — unified interface over ESM-2, ProtT5, and Ankh; pre-computed embeddings avoid training-time bottleneck.
- **Latent diffusion generation** — 50-step Gaussian diffusion in a 64-dim latent space with classifier-free guidance (CFG), balancing sample diversity and quality.
- **Non-autoregressive decoding** — parallel prediction of all residue positions eliminates exposure bias and error accumulation.
- **6 conditional variant modes** — C-terminal substitution / extension / truncation-rebuild, tag appending, latent perturbation, and mixed stochastic sampling.
- **3-phase training pipeline** — VAE MLE pre-training → RL adversarial fine-tuning → latent diffusion training, with cyclical KL annealing + free-bits to prevent posterior collapse.
- **End-to-end reproducibility** — data crawling, embedding computation, training, generation, and evaluation all scripted with a single YAML config and fixed random seeds.

## Architecture

<p align="center">
  <img src="./frontend/client/public/images/model_structure.png" alt="AMP Forge architecture design" width="100%" />
</p>

<p align="center">
  <em>Joint architecture: PLM representation -> VAE latent compression -> latent diffusion -> non-autoregressive Transformer decoding.</em>
</p>

## Repository Structure

```text
.
├── esm_diffvae/               # Core model — data, training, generation, evaluation
│   ├── models/                #   Neural network components
│   ├── training/              #   3-phase training scripts
│   ├── generation/            #   Unconditional, variant, interpolation
│   ├── evaluation/            #   Metrics, physicochemical, visualization
│   ├── data/                  #   Crawling, cleaning, embedding computation
│   └── configs/default.yaml   #   Global configuration
├── frontend/                  # Interactive web UI (React + Three.js)
├── docs/                      # Bilingual documentation (EN + ZH)
├── PROJECT_SUMMARY.md         # Detailed technical summary
└── DATA_COLLECTION_REPORT.md  # Data sources & pipeline report
```

## Getting Started

### 1) Core Environment

```bash
cd esm_diffvae
pip install -r requirements.txt
```

### 2) Data Pipeline (Optional if processed data already exists)

```bash
cd esm_diffvae
python data/crawl/parse_local_sources.py
python data/crawl/crawl_dramp.py
python data/crawl/crawl_uniprot.py
python data/crawl/merge_and_clean.py
python data/compute_embeddings.py --backend prot_t5 --model prot_t5_xl_half
```

### 3) Training Pipeline

```bash
cd esm_diffvae
python training/train_vae.py --config configs/default.yaml
python training/train_vae_rl.py --config configs/default.yaml --vae-checkpoint checkpoints/vae_best.pt
python training/train_diffusion.py --config configs/default.yaml --vae-checkpoint checkpoints/vae_best_recon.pt
```

### 4) Generation

Unconditional generation:

```bash
cd esm_diffvae
python generation/unconditional.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt \
  --n-samples 100 \
  --top-p 0.9
```

Variant generation:

```bash
cd esm_diffvae
python generation/variant.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt \
  --input-sequence "GIGKFLHSAKKFGKAFVGEIMNS" \
  --mode mixed \
  --n-variants 50
```

Latent interpolation:

```bash
cd esm_diffvae
python generation/interpolation.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt \
  --seq-a "GIGKFLHSAKKFGKAFVGEIMNS" \
  --seq-b "ILPWKWPWWPWRR" \
  --n-steps 10
```

### 5) Evaluation

```bash
cd esm_diffvae
python evaluation/run_evaluation.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt
```

### 6) Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

## Extended Docs

- EN: [docs/en/quickstart.md](./docs/en/quickstart.md)
- EN: [docs/en/training.md](./docs/en/training.md)
- EN: [docs/en/generation.md](./docs/en/generation.md)
- EN: [docs/en/evaluation.md](./docs/en/evaluation.md)
- EN: [docs/en/data-pipeline.md](./docs/en/data-pipeline.md)
