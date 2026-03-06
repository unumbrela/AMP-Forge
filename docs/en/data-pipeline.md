# Data Pipeline (EN)

## Build raw sources

```bash
cd esm_diffvae
python data/crawl/parse_local_sources.py
python data/crawl/crawl_dramp.py
python data/crawl/crawl_uniprot.py
```

## Merge and clean

```bash
cd esm_diffvae
python data/crawl/merge_and_clean.py
```

## Compute PLM embeddings

```bash
cd esm_diffvae
python data/compute_embeddings.py --backend prot_t5 --model prot_t5_xl_half
```

## Notes

- Raw files are stored in `esm_diffvae/data/raw/`.
- Processed files are stored in `esm_diffvae/data/processed/`.
- Embeddings are stored in `esm_diffvae/data/embeddings/`.
