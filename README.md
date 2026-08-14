# 寒霜火爐 · Frostbound Furnace

A browser-based 3D **tower-defense / survival** game built with **Vite + TypeScript + Babylon.js**. Defend the central furnace, gather finite resources, build a four-side perimeter, recruit autonomous squads, and survive escalating stage or endless waves.

> Project status: active development. Runtime systems are playable; character/environment art and production polish are still being upgraded. A technical pass is not a claim of commercial-ready art.

## Play

GitHub Pages deployment target:

`https://liu11-21.github.io/frost-survival-defense/`

If the hosted build is behind `main`, check GitHub Actions/Pages status; local development remains the source of truth.

## Quick start

Requires **Node.js 20+** and a desktop browser with WebGL2.

```bash
npm ci
npm run dev
```

Production checks:

```bash
npm run typecheck
npm run build
npm run preview
```

## Core game loop

- Gather finite wood and stone by hand, then transition into production buildings.
- Build economy/support structures and attack buildings on universal plots.
- Seal the central base with four independently destructible wall sides and ally-only gates.
- Recruit autonomous squads with distinct melee, ranged, support, repair, and control roles.
- Upgrade the furnace to scale the hero, allied squads, facilities, and endless squad capacity.
- Read incoming pressure through named approach lanes, wave previews, health bars, squad status, and tactical-map feedback.
- Play three stage levels or an endless mode with recurring elite/boss pressure and run upgrades.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrows | Move |
| `Shift` | Sprint |
| `E` | Interact / build / recruit / collect |
| `B` | Build menu |
| `G` | Recruit menu |
| `U` | Furnace |
| `N` | Call next wave |
| `M` | Tactical map |
| `1` / `2` / `3` | Hero active skills |
| `Esc` | Close/back/pause |
| `F3` / `F7` / `F8` / `F9` | Developer diagnostics and balance tools |

Developer/test tools mark a run as untracked.

## Project layout

```text
src/
├─ ai/            friendly AI, targeting, formations, stuck recovery
├─ assets/        runtime asset contracts / loading
├─ audio/         BGM/SFX runtime
├─ buildings/     construction, walls, combat, demolition, rebuild
├─ combat/        units, squads, attacks, death/recycling
├─ data/          gameplay definitions and balance constants
├─ enemies/       waves, navigation, boss/lane systems
├─ game/          orchestration, loop, input, flow
├─ hero/          hero runtime
├─ performance/   FPS/frame/draw-call monitoring and stress tools
├─ resources/     finite harvest nodes and regrowth
├─ scene/         Babylon scene/environment presentation
└─ ui/            HUD, menus, prompts, codex, maps and diagnostics

assets-source/blender/   editable Blender character/environment sources
public/assets/models/    runtime GLBs
public/assets/audio/     runtime audio
scripts/blender/         reproducible Blender authoring/export pipeline
tests/                   Playwright runtime verification
reports/                 curated QA/validation evidence only
```

## Blender → GLB art pipeline

Authored models are produced through reproducible Blender scripts and validated before runtime consumption. Manual `.blend` edits that cannot be reproduced by the pipeline are not considered a finished production change.

Common commands:

```bash
npm run art:hero
npm run art:warrior
npm run art:units
npm run art:buildings
npm run art:resources
npm run art:export
npm run art:validate
```

Editable `.blend`, `.fbx`, `.wav`, `.mp4`, `.psd`, `.kra`, and TIFF source media follow the repository Git LFS rules.

## Testing

At minimum, code changes should pass:

```bash
npm run typecheck
npm run build
```

Focused runtime/art commands are available in `package.json`, including Hero, Warrior, audio, model-contract, and Playwright verification. Runtime/visual claims require the relevant runtime evidence; structural validation alone is not a visual acceptance result.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request. Keep changes scoped and include provenance for any third-party code or asset.

Security issues and exposed credentials must **not** be posted in public issues; see [`SECURITY.md`](SECURITY.md).

## Licensing and asset provenance

The repository is in a public-readiness transition. A repository-wide code/assets license split is being finalized; **public visibility by itself does not grant permission to reuse project material** unless a file or upstream dependency explicitly provides such rights.

See:

- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
- [`docs/PUBLIC_READINESS.md`](docs/PUBLIC_READINESS.md)

The character pipeline uses MakeHuman/MPFB-derived assets; upstream core assets/exports are documented by MakeHuman Community as CC0, while MPFB program source has its own software license. The committed BGM tracks are project-generated with Google Gemini/Lyria and are being documented separately for redistribution/commercial provenance.

## Public-repo hygiene

- Never commit `.env`, credentials, local MCP configuration, editor state, or private paths.
- Keep generated CI output, deformation dumps, temporary screenshots, and WIP captures out of Git unless intentionally curated as acceptance evidence.
- Do not force-push `main`.
- `main` is intended to require reviewed pull requests once repository protection settings are enabled.

## Known limitations

- Art quality is still being upgraded toward a commercial target.
- Hosted Pages can lag `main` when GitHub Actions is unavailable.
- Real-GPU performance should be measured with the in-game performance monitor; CI/browser automation does not substitute for hardware validation.
- Enemy navigation uses project-specific perimeter/steering logic rather than a general navmesh.

For design history and implementation details, see `docs/`, `CHANGELOG.md`, and the curated reports retained in `reports/`.
