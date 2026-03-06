# 快速开始（中文）

## 环境要求

- Python 3.10+
- （可选）支持 CUDA 的 PyTorch 环境
- Node.js 20+ 与 pnpm 10+（前端）

## 核心环境安装

```bash
cd esm_diffvae
pip install -r requirements.txt
```

## 最小生成示例

```bash
cd esm_diffvae
python generation/unconditional.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt \
  --n-samples 10
```

## 前端运行

```bash
cd frontend
pnpm install
pnpm dev
```

## 相关页面

- [训练](./training.md)
- [生成](./generation.md)
- [评估](./evaluation.md)
- [数据流程](./data-pipeline.md)
