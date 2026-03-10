# AMP 数据集构建报告

## 一、最终数据集概览

| 指标 | 数值 |
|------|------|
| 总序列数 | 25,622 |
| AMP 正样本 | 15,404 (60.1%) |
| 非 AMP 负样本 | 10,218 (39.9%) |
| 序列长度范围 | 5-50 AA (平均 22.5) |
| 训练集 | 20,497 |
| 验证集 | 2,562 |
| 测试集 | 2,563 |

### 属性覆盖率

| 属性 | 有标注数量 | 覆盖率 |
|------|-----------|--------|
| mic_value (MIC 值, log10 ug/ml) | 5,296 | 20.7% |
| is_hemolytic (溶血性) | 4,621 | 18.0% |
| is_toxic (细胞毒性) | 2,285 | 8.9% |

---

## 二、数据来源明细

### 已自动获取的数据源

| 数据源 | 获取方式 | 原始条数 | 去重后贡献 | 属性 |
|--------|---------|---------|-----------|------|
| **DRAMP general_amps** | HTTP 下载 | 8,782 | ~6,000+ | MIC (2,996), 溶血 (4,885), 毒性 (2,476) |
| **DRAMP synthetic_amps** | HTTP 下载 | 6,320 | ~4,000+ | 仅序列 + AMP 标签 |
| **UniProt AMP** (KW-0929) | REST API | 1,823 | ~1,500+ | 仅序列 + AMP 标签 |
| **UniProt non-AMP** | REST API | 3,750 | ~3,700 | 仅序列 (负样本) |
| **Diff-AMP** (本地) | 本地 CSV | 12,310 | ~4,000+ (大量与 DRAMP 重叠) | AMP 标签 |
| **AMPainter** (本地) | 本地 TXT | 6,524 | ~2,500+ | MIC-like scores (3,259) |

### MIC 值提取说明

DRAMP `Target_Organism` 字段包含自由文本描述，使用正则表达式提取 MIC/IC50/EC50 值：
- 支持单位: ug/ml, uM, mM, mg/ml
- uM 转 ug/ml: MW = 序列长度 * 110 Da
- 多个 MIC 值取几何平均
- 最终存储为 log10(ug/ml)

### 溶血性/毒性标签提取说明

从 DRAMP 的 `Hemolytic_activity` 和 `Cytotoxicity` 自由文本字段中，使用规则匹配分类：
- **非溶血**: "no hemolytic", "< 5% hemolysis", "HC50 > 200" 等
- **溶血**: "hemolytic at", "HC50 < 50", "> 20% hemolysis" 等
- **非毒性**: "no cytotoxic", "IC50 > 200" 等
- **毒性**: "cytotoxic", "IC50 < 50" 等

---

## 三、数据整合说明

手动下载的数据放入 `esm_diffvae/data/raw/` 后，需要：

1. **编写对应解析器** (如 `parse_dbaasp.py`)，将原始格式转为统一 CSV:
   - 列: `sequence, is_amp, source, mic_value, is_toxic, is_hemolytic`
2. **重新运行合并脚本**:
   ```bash
   python esm_diffvae/data/crawl/merge_and_clean.py
   ```
3. **重新计算 PLM 嵌入**:
   ```bash
   python esm_diffvae/data/compute_embeddings.py --backend prot_t5 --model prot_t5_xl_half
   ```

---

## 四、文件清单

```
esm_diffvae/data/
├── raw/                          # 原始数据 (各来源)
│   ├── dramp_general.csv         # DRAMP 天然 AMP (8,782 条)
│   ├── dramp_synthetic.csv       # DRAMP 合成 AMP (6,320 条)
│   ├── uniprot_amp.csv           # UniProt AMP (1,823 条)
│   ├── uniprot_nonamp.csv        # UniProt 非 AMP (3,750 条)
│   ├── diffamp.csv               # Diff-AMP 本地数据 (12,310 条)
│   ├── ampainter.csv             # AMPainter 本地数据 (6,524 条)
│   ├── dramp_general_raw.txt     # DRAMP 原始文件 (备份)
│   └── dramp_synthetic_raw.txt   # DRAMP 原始文件 (备份)
├── processed/                    # 处理后数据 (最终输出)
│   ├── train.csv                 # 训练集 (20,497 条)
│   ├── val.csv                   # 验证集 (2,562 条)
│   ├── test.csv                  # 测试集 (2,563 条)
│   ├── all.csv                   # 全部数据 (25,622 条)
│   └── stats.json                # 数据集统计信息
└── crawl/                        # 爬取/解析脚本
    ├── crawl_dramp.py            # DRAMP 爬取
    ├── crawl_uniprot.py          # UniProt 爬取
    ├── parse_local_sources.py    # 本地数据解析
    └── merge_and_clean.py        # 合并去重主脚本
```
