# Contributing

Thanks for your interest in AMP Forge.

## Workflow

1. Open an issue first for non-trivial changes.
2. Create a feature branch from `main`.
3. Keep PRs focused and small.
4. Include context, motivation, and validation notes in your PR.

## Pull Request Checklist

- [ ] I read the related docs and updated docs when needed.
- [ ] I did not add checkpoints, embeddings, or other large binary artifacts.
- [ ] I ran relevant scripts/tests for the changed area.
- [ ] I kept commands and paths in docs consistent with current code.

## Commit Guidelines

Use clear commit messages, for example:

- `feat: add multilingual README switch`
- `docs: update training pipeline instructions`
- `fix: align evaluation command with current args`

## Development Notes

- Core model package: `esm_diffvae/`
- Frontend package: `frontend/`
- Data sources and references: `references/`

If your change affects generation/training behavior, include before/after metrics where possible.
