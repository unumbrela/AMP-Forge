"""ESM-MIC: Gated Multi-branch Model for Antimicrobial Peptide MIC Prediction.

Architecture overview:

    ESM-2 residue embeddings [B, L, 480]
        │
        ├─ MultiPoolAggregator ── multi-head attention + mean/max/std pooling
        │       └─ two-stage bottleneck → 128-dim global representation
        │
        ├─ MultiScaleCNN ── parallel conv(3,5,7) with residual → max-pool
        │       └─ 64-dim local motif representation
        │
        └─ PhyschemEncoder ── 11 descriptors → 32-dim
                │
        ┌───────┴───────┐
        GatedFusion(pool, cnn)  ── learned gate weights two branches
                │
        ResidualFusionMLP(fused ⊕ physchem) → log-MIC scalar

Designed for pre-computed ESM-2 embeddings (no PLM fine-tuning).
"""

import os
import math
import torch
import torch.nn as nn
import torch.nn.functional as F

os.environ.setdefault("TRANSFORMERS_NO_FLASH_ATTENTION", "1")


# ---------------------------------------------------------------------------
# Building blocks
# ---------------------------------------------------------------------------

class MultiHeadAttentionPool(nn.Module):
    """Parameter-efficient multi-head additive attention pooling.

    Projects input to a small shared key space (head_dim per head), then
    computes per-head attention scores.  Each head produces a weighted
    sum over residue positions, and results are concatenated and projected
    back to *dim*.

    Uses only Linear (addmm) — no bmm/4-D matmul — safe on Blackwell GPUs.
    """

    def __init__(self, dim: int, n_heads: int = 4, head_dim: int = 32,
                 dropout: float = 0.1):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = head_dim
        inner = int(n_heads * head_dim)
        self.key_proj = nn.Linear(dim, inner)               # 480 -> 128
        self.score_proj = nn.Linear(head_dim, 1, bias=False) # shared scorer
        self.out_proj = nn.Linear(inner, dim)               # 128 -> 480
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(dim)

    def forward(self, x: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """x: [B, L, D], mask: [B, L] -> [B, D]"""
        B, L, D = x.shape
        H, Dh = self.n_heads, self.head_dim

        keys = self.key_proj(x).view(B, L, H, Dh)          # [B, L, H, Dh]
        scores = self.score_proj(torch.tanh(keys))          # [B, L, H, 1]
        scores = scores.squeeze(-1)                         # [B, L, H]

        mask_3d = mask.unsqueeze(-1)                        # [B, L, 1]
        scores = scores.masked_fill(mask_3d == 0, float("-inf"))
        attn = torch.softmax(scores, dim=1)                 # [B, L, H]
        attn = self.dropout(attn)

        # Weighted sum over projected keys: [B, L, H, Dh] * [B, L, H, 1] -> [B, H, Dh]
        weighted = (attn.unsqueeze(-1) * keys).sum(dim=1)   # [B, H, Dh]
        out = self.out_proj(weighted.reshape(B, H * Dh))    # [B, D]
        return self.norm(out)


class MultiPoolAggregator(nn.Module):
    """Statistical pooling (mean / max / std) plus multi-head attention pool.

    Output dimension = 4 * esm_dim  (3 stat pools + 1 attention pool
    projected back to esm_dim).
    """

    def __init__(self, esm_dim: int = 480, n_heads: int = 4,
                 head_dim: int = 32, dropout: float = 0.1):
        super().__init__()
        self.attn_pool = MultiHeadAttentionPool(esm_dim, n_heads, head_dim, dropout)
        self.output_dim = esm_dim * 4  # mean, max, std, attn

    def forward(self, x: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        mask_3d = mask.unsqueeze(-1)
        x_masked = x * mask_3d
        lengths = mask.sum(dim=1, keepdim=True).clamp(min=1)

        mean_pool = x_masked.sum(dim=1) / lengths
        x_for_max = x_masked + (1 - mask_3d) * (-1e9)
        max_pool = x_for_max.max(dim=1).values
        diff_sq = (x - mean_pool.unsqueeze(1)) ** 2 * mask_3d
        std_pool = (diff_sq.sum(dim=1) / lengths.clamp(min=2) + 1e-8).sqrt()
        attn_pool = self.attn_pool(x, mask)

        return torch.cat([mean_pool, max_pool, std_pool, attn_pool], dim=-1)


class MultiScaleCNN(nn.Module):
    """Parallel multi-kernel 1-D CNN with residual projection.

    Each kernel branch: Conv1d → BN → GELU → Dropout.
    Branches are concatenated, fused via 1×1 conv, and the result is
    added to a linear projection of the input (residual path) when
    dimensions match, then global-max-pooled over the sequence axis.
    """

    def __init__(self, in_dim: int, out_channels: int = 64,
                 kernel_sizes: list[int] = (3, 5, 7), dropout: float = 0.3):
        super().__init__()
        self.branches = nn.ModuleList()
        for k in kernel_sizes:
            self.branches.append(nn.Sequential(
                nn.Conv1d(in_dim, out_channels, kernel_size=k, padding=k // 2),
                nn.BatchNorm1d(out_channels),
                nn.GELU(),
                nn.Dropout(dropout),
            ))
        total_ch = out_channels * len(kernel_sizes)
        self.fusion = nn.Sequential(
            nn.Conv1d(total_ch, out_channels, kernel_size=1),
            nn.BatchNorm1d(out_channels),
            nn.GELU(),
        )
        # Residual shortcut: project input dim → out_channels
        self.residual_proj = nn.Conv1d(in_dim, out_channels, kernel_size=1)
        self.output_dim = out_channels

    def forward(self, x: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """x: [B, L, D], mask: [B, L] -> [B, out_channels]"""
        x_t = x.transpose(1, 2)                          # [B, D, L]
        branch_out = [b(x_t) for b in self.branches]
        fused = self.fusion(torch.cat(branch_out, dim=1)) # [B, C, L]
        residual = self.residual_proj(x_t)                # [B, C, L]
        fused = fused + residual                          # residual connection

        # Masked global max-pool
        mask_1d = mask.unsqueeze(1)                       # [B, 1, L]
        fused = fused.masked_fill(mask_1d == 0, -1e9)
        return fused.max(dim=2).values                    # [B, C]


class GatedFusion(nn.Module):
    """Gated fusion of two feature vectors.

    Instead of naively concatenating pool and CNN features, learn a
    per-sample gate that softly weights their relative contribution:

        gate = σ(W_g [f_pool; f_cnn] + b_g)
        out  = gate ⊙ f_pool + (1 - gate) ⊙ f_cnn

    Output dimension = max(dim_a, dim_b)  (the larger branch is projected
    down, the smaller up, so both match).
    """

    def __init__(self, dim_a: int, dim_b: int, out_dim: int):
        super().__init__()
        self.proj_a = nn.Linear(dim_a, out_dim) if dim_a != out_dim else nn.Identity()
        self.proj_b = nn.Linear(dim_b, out_dim) if dim_b != out_dim else nn.Identity()
        self.gate = nn.Sequential(
            nn.Linear(dim_a + dim_b, out_dim),
            nn.Sigmoid(),
        )
        self.norm = nn.LayerNorm(out_dim)
        self.output_dim = out_dim

    def forward(self, a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
        g = self.gate(torch.cat([a, b], dim=-1))
        out = g * self.proj_a(a) + (1 - g) * self.proj_b(b)
        return self.norm(out)


class ResidualBlock(nn.Module):
    """Pre-norm residual MLP block: LN → Linear → GELU → Drop → Linear → Drop + skip."""

    def __init__(self, dim: int, expand: int = 2, dropout: float = 0.4):
        super().__init__()
        self.net = nn.Sequential(
            nn.LayerNorm(dim),
            nn.Linear(dim, dim * expand),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(dim * expand, dim),
            nn.Dropout(dropout),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x + self.net(x)


class PhyschemEncoder(nn.Module):
    """Encode 11 physicochemical descriptors to a dense vector."""

    def __init__(self, in_dim: int = 11, hidden: int = 32, dropout: float = 0.2):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden, hidden),
            nn.LayerNorm(hidden),
        )
        self.output_dim = hidden

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


# ---------------------------------------------------------------------------
# Main model
# ---------------------------------------------------------------------------

class ESMMICLite(nn.Module):
    """Gated Multi-branch MIC predictor on pre-computed ESM-2 embeddings.

    Improvements over the baseline concat model:
    - Multi-head attention pooling (4 heads) captures diverse residue importance
    - Two-stage bottleneck (1920 → 384 → 128) avoids aggressive compression
    - Gated fusion replaces naive concatenation of pool / CNN branches
    - Residual blocks in the fusion MLP for better gradient flow
    - Residual connection in the CNN branch
    - Kaiming + Xavier weight initialisation throughout
    """

    def __init__(
        self,
        esm_dim: int = 480,
        # Multi-pool
        pool_n_heads: int = 4,
        pool_dropout: float = 0.1,
        pool_bottleneck_dims: list[int] = (384, 128),
        # CNN
        cnn_channels: int = 64,
        cnn_kernels: list[int] = (3, 5, 7),
        cnn_dropout: float = 0.3,
        # Physchem
        physchem_dim: int = 11,
        physchem_hidden: int = 32,
        # Fusion
        gate_dim: int = 128,
        fusion_hidden_dims: list[int] = (256, 128),
        fusion_dropout: float = 0.4,
        # Legacy (ignored, kept for config compatibility)
        attention_dim: int = 128,
        attention_heads: int = 8,
        attention_layers: int = 1,
        attention_dropout: float = 0.2,
    ):
        super().__init__()

        # --- Branch 1: global multi-pool ---
        self.pool = MultiPoolAggregator(esm_dim, n_heads=pool_n_heads,
                                        dropout=pool_dropout)
        # Two-stage bottleneck: 4*esm_dim → ... → final
        bneck_layers = []
        in_d = self.pool.output_dim
        for d in pool_bottleneck_dims:
            bneck_layers.extend([
                nn.Linear(in_d, d),
                nn.LayerNorm(d),
                nn.GELU(),
                nn.Dropout(fusion_dropout),
            ])
            in_d = d
        self.pool_bottleneck = nn.Sequential(*bneck_layers)
        pool_out_dim = pool_bottleneck_dims[-1]

        # --- Branch 2: local CNN ---
        self.cnn = MultiScaleCNN(esm_dim, cnn_channels, list(cnn_kernels),
                                 cnn_dropout)

        # --- Gated fusion of pool + CNN ---
        self.gate = GatedFusion(pool_out_dim, self.cnn.output_dim, gate_dim)

        # --- Physchem encoder ---
        self.physchem = PhyschemEncoder(physchem_dim, physchem_hidden)

        # --- Residual Fusion MLP ---
        fusion_in = self.gate.output_dim + self.physchem.output_dim
        self.fusion_proj = nn.Linear(fusion_in, fusion_hidden_dims[0])
        self.fusion_blocks = nn.ModuleList()
        prev_dim = fusion_hidden_dims[0]
        for h_dim in fusion_hidden_dims:
            if h_dim != prev_dim:
                self.fusion_blocks.append(nn.Linear(prev_dim, h_dim))
                prev_dim = h_dim
            self.fusion_blocks.append(ResidualBlock(h_dim, expand=2,
                                                    dropout=fusion_dropout))
        self.head = nn.Sequential(
            nn.LayerNorm(prev_dim),
            nn.Linear(prev_dim, 1),
        )

        self._init_weights()

    # ------------------------------------------------------------------
    def _init_weights(self):
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Conv1d):
                nn.init.kaiming_normal_(m.weight, nonlinearity="relu")
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, (nn.LayerNorm, nn.BatchNorm1d)):
                nn.init.ones_(m.weight)
                nn.init.zeros_(m.bias)
        # Gate bias → 0.5 (start with equal weighting)
        if hasattr(self.gate.gate, '0') and isinstance(self.gate.gate[0], nn.Linear):
            nn.init.zeros_(self.gate.gate[0].weight)
            nn.init.zeros_(self.gate.gate[0].bias)

    # ------------------------------------------------------------------
    def forward(self, esm_embeddings: torch.Tensor,
                attention_mask: torch.Tensor,
                physchem: torch.Tensor) -> torch.Tensor:
        """
        Args:
            esm_embeddings: [B, L, esm_dim]  pre-computed ESM-2 last hidden state
            attention_mask:  [B, L]           1 = real token, 0 = padding
            physchem:        [B, physchem_dim] physicochemical descriptors
        Returns:
            [B] predicted log-MIC values
        """
        # Global branch
        pool_feat = self.pool_bottleneck(self.pool(esm_embeddings, attention_mask))

        # Local branch
        cnn_feat = self.cnn(esm_embeddings, attention_mask)

        # Gated fusion
        fused = self.gate(pool_feat, cnn_feat)

        # Physchem
        physchem_feat = self.physchem(physchem)

        # Residual fusion MLP
        x = self.fusion_proj(torch.cat([fused, physchem_feat], dim=-1))
        for block in self.fusion_blocks:
            x = block(x)
        return self.head(x).squeeze(-1)
