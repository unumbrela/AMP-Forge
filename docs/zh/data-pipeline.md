# 数据流程（中文）

## 构建原始数据

```bash
cd esm_diffvae
python data/crawl/parse_local_sources.py
python data/crawl/crawl_dramp.py
python data/crawl/crawl_uniprot.py
```

## 合并清洗

```bash
cd esm_diffvae
python data/crawl/merge_and_clean.py
```

## 计算 PLM 嵌入

```bash
cd esm_diffvae
python data/compute_embeddings.py --backend prot_t5 --model prot_t5_xl_half
```

## 说明

- 原始数据目录：`esm_diffvae/data/raw/`
- 处理后数据目录：`esm_diffvae/data/processed/`
- 嵌入目录：`esm_diffvae/data/embeddings/`
