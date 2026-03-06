# 评估说明（中文）

运行完整评估：

```bash
cd esm_diffvae
python evaluation/run_evaluation.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt
```

默认输出目录：

- `esm_diffvae/results/evaluation/`

典型输出：

- `evaluation_results.json`
- `unconditional_sequences.fasta`
- `variants_*.fasta`
- 各类分布图与同一性直方图
