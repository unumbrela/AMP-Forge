# 训练说明（中文）

AMP Forge 的训练分为 3 个阶段。

## Phase 1A：VAE 预训练

```bash
cd esm_diffvae
python training/train_vae.py --config configs/default.yaml
```

## Phase 1B：RL 微调

```bash
cd esm_diffvae
python training/train_vae_rl.py \
  --config configs/default.yaml \
  --vae-checkpoint checkpoints/vae_best.pt
```

## Phase 2：潜在扩散训练

```bash
cd esm_diffvae
python training/train_diffusion.py \
  --config configs/default.yaml \
  --vae-checkpoint checkpoints/vae_best_recon.pt
```

## 说明

- Checkpoint 默认写入 `esm_diffvae/checkpoints/`。
- 训练日志默认写入 `esm_diffvae/checkpoints/logs/`。
- 请避免把大体积 checkpoint 提交到 Git。
