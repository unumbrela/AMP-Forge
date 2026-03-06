# AMP Forge Project Packaging Plan

## 1. Goal

Build a polished GitHub-facing presentation for this repository with:

- English as the default public-facing language.
- A clear, clickable switch to the Chinese version.
- Cleaner project positioning, structure, and onboarding experience.
- No accidental upload of model weights, embeddings, or other large artifacts.

This document is a planning proposal only. Implementation will start after your confirmation.

## 2. Current Gaps (Based on Repository State)

- `README.md` is currently Chinese-first, while target is English-first.
- Language switching is not standardized (no dedicated bilingual navigation pattern).
- Some command examples in README still reference removed scripts (`esm_diffvae/scripts/*.sh`).
- Project messaging is strong technically, but GitHub presentation is not yet “productized” for first-time visitors.
- Documentation hierarchy can be clearer (quick start vs architecture vs training/evaluation vs data pipeline).

## 3. Bilingual Documentation Strategy

### 3.1 Language Routing Design (GitHub Markdown Compatible)

Use static link-based switching (works natively on GitHub):

- `README.md` -> English default.
- `README.zh-CN.md` -> Chinese version.
- Add a top switch block in both files:

```markdown
[English](./README.md) | [简体中文](./README.zh-CN.md)
```

No JavaScript dependency, no GitHub plugin dependency, fully compatible with GitHub rendering.

### 3.2 Synchronization Rule

Both language files must keep mirrored section order:

1. Project Overview
2. Key Features
3. Architecture
4. Repository Structure
5. Quick Start
6. Training Pipeline
7. Generation
8. Evaluation
9. Data and Large File Policy
10. Citation / License / Contact

This prevents English/Chinese docs drift over time.

## 4. Repository Presentation Upgrade Plan

### Phase A: README and Core Docs Refactor

- Rewrite `README.md` in high-quality English (concise, professional, reproducible commands).
- Create `README.zh-CN.md` with equivalent Chinese content.
- Fix command examples to match current codebase (direct Python entrypoints instead of removed shell scripts).
- Add “Quick Links” section pointing to:
  - project summary,
  - data report,
  - front-end demo page,
  - generation/evaluation scripts.

Deliverables:

- `README.md` (English primary)
- `README.zh-CN.md` (Chinese mirror)
- Updated internal links (all valid)

### Phase B: Visual Packaging (GitHub Friendly)

- Add a project banner and lightweight architecture diagram.
- Add one “results snapshot” section (sample generated sequences + key metrics).
- Standardize badges:
  - Python version,
  - Node/pnpm (for frontend),
  - License,
  - GitHub Pages.

Suggested asset layout:

- `docs/assets/banner.png`
- `docs/assets/architecture.png`
- `docs/assets/results-preview.png`

Deliverables:

- Cleaner first-screen impact on GitHub homepage.
- Visual trust signals without bloating repository size.

### Phase C: GitHub Metadata and Community Files

- Optimize repository About text and Topics.
- Add/refresh:
  - `LICENSE` (if missing or needs update),
  - `CONTRIBUTING.md`,
  - `CODE_OF_CONDUCT.md`,
  - `SECURITY.md`,
  - `CITATION.cff` (for paper-style citation).
- Add issue/PR templates under `.github/`.

Deliverables:

- Better discoverability.
- Better contribution and maintenance experience.

### Phase D: Documentation Information Architecture

Create a lightweight `docs/` tree for scalable growth:

- `docs/en/quickstart.md`
- `docs/en/training.md`
- `docs/en/generation.md`
- `docs/en/evaluation.md`
- `docs/en/data-pipeline.md`
- `docs/zh/quickstart.md`
- `docs/zh/training.md`
- `docs/zh/generation.md`
- `docs/zh/evaluation.md`
- `docs/zh/data-pipeline.md`

README keeps concise overview; deep details move to docs pages.

Deliverables:

- Maintainable documentation system.
- Clear separation between onboarding and deep technical details.

## 5. Large File and Weight Safety Plan

Keep current policy and strengthen it:

- Verify `.gitignore` coverage for:
  - `esm_diffvae/checkpoints/`
  - `esm_diffvae/data/embeddings/`
  - `esm_diffvae/data/processed/`
  - `esm_diffvae/results/`
  - `references/` large artifacts
  - `*.pt`, `*.pth`
- Add README section “Model Weights and Artifacts”:
  - recommend GitHub Releases / external object storage for large files.
- Add a pre-push check script (optional) to warn if files > 50 MB are staged.

Deliverables:

- Lower risk of failed pushes and bloated history.

## 6. Implementation Sequence (After Your Approval)

1. Refactor bilingual README and fix all run commands.
2. Add visual assets and polish repository home presentation.
3. Add GitHub community/metadata files.
4. Build `docs/en` + `docs/zh` mirrored structure and move long-form content.
5. Add large-file safeguard checks and final link validation.
6. Final QA pass (English/Chinese consistency + command validity + Markdown rendering).

## 7. Acceptance Criteria

The optimization is considered complete when:

- GitHub homepage defaults to English and has one-click Chinese switch.
- Chinese page has one-click return to English.
- All README commands match current project structure and are executable.
- No model weights / large binary artifacts are included in commit history.
- Core docs are clean, scannable, and bilingual consistency is maintained.

## 8. Optional Enhancements (If You Want)

- Add a short demo GIF for generation flow.
- Add benchmark table comparing this project with reference AMP generators.
- Add “Reproducibility” section (seeds, hardware, training duration).
- Add changelog discipline via `CHANGELOG.md`.

