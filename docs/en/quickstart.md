# Quickstart (EN)

## Prerequisites

- Python 3.10+
- (Optional) CUDA-enabled PyTorch runtime
- Node.js 20+ and pnpm 10+ for frontend

## Core setup

```bash
cd esm_diffvae
pip install -r requirements.txt
```

## Minimal generation run

```bash
cd esm_diffvae
python generation/unconditional.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt \
  --n-samples 10
```

## Frontend run

```bash
cd frontend
pnpm install
pnpm dev
```

## Related pages

- [Training](./training.md)
- [Generation](./generation.md)
- [Evaluation](./evaluation.md)
- [Data Pipeline](./data-pipeline.md)
