# Evaluation (EN)

Run full evaluation:

```bash
cd esm_diffvae
python evaluation/run_evaluation.py \
  --config configs/default.yaml \
  --checkpoint checkpoints/esm_diffvae_full.pt
```

Default output location:

- `esm_diffvae/results/evaluation/`

Typical outputs:

- `evaluation_results.json`
- `unconditional_sequences.fasta`
- `variants_*.fasta`
- distribution and identity plots
