# Training (EN)

AMP Forge training is organized in 3 phases.

## Phase 1A: VAE pretraining

```bash
cd esm_diffvae
python training/train_vae.py --config configs/default.yaml
```

## Phase 1B: RL fine-tuning

```bash
cd esm_diffvae
python training/train_vae_rl.py \
  --config configs/default.yaml \
  --vae-checkpoint checkpoints/vae_best.pt
```

## Phase 2: Latent diffusion training

```bash
cd esm_diffvae
python training/train_diffusion.py \
  --config configs/default.yaml \
  --vae-checkpoint checkpoints/vae_best_recon.pt
```

## Notes

- Checkpoints are written under `esm_diffvae/checkpoints/`.
- Logs are written under `esm_diffvae/checkpoints/logs/`.
- Keep large checkpoints out of Git history.
