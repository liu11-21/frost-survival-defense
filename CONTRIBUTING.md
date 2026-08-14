# Contributing to Frostbound Furnace

Thanks for helping improve the project. Keep pull requests small, reviewable, and scoped to one responsibility.

## Local setup

```bash
npm ci
npm run typecheck
npm run build
```

Run `npm run dev` for local playtesting. Blender is only required for art-pipeline work.

## Branch and PR rules

- Branch from the latest `main`; never force-push `main`.
- One feature/fix per pull request. Do not mix gameplay, art, audio, and unrelated cleanup.
- Explain what changed, why, how it was tested, and any known limitations.
- Runtime claims require runtime evidence; green structural validation alone is not a visual sign-off.
- Do not commit `.env`, tokens, credentials, local MCP configuration, caches, temporary captures, or generated debug dumps.
- Large editable media must use the repository's Git LFS rules.

## Tests

At minimum for code changes:

```bash
npm run typecheck
npm run build
```

Run the relevant focused Playwright/art validator for the area you changed. Art changes should also run the relevant model-contract validation and provide only curated evidence.

## Art pipeline

Authored source lives under `assets-source/blender/`; runtime GLBs live under `public/assets/models/`. Production art changes must remain reproducible from scripts rather than depending on unrecorded manual `.blend` edits.

## Licensing and provenance

Only contribute code, art, audio, fonts, models, textures, or other content that you created or are legally permitted to redistribute in this repository. Include the source and license/provenance when adding third-party material.

The repository-wide public license split is still being finalized during the public-readiness transition. Do not assume that public visibility grants reuse rights to project assets unless a file explicitly says so.

## Security

Do not report vulnerabilities or leaked credentials in a public issue. Follow `SECURITY.md`.
