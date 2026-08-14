# 寒霜火爐 · Frostbound Furnace

A browser-based 3D **tower-defense / survival** game built with **Vite + TypeScript + Babylon.js**. Defend the central furnace, gather finite resources, build a four-side perimeter, recruit autonomous squads, and survive escalating stage or endless waves.

> Project status: active development. Runtime systems are playable; character/environment art and production polish are still being upgraded. A technical pass is not a claim of commercial-ready art.

## Why this repository is open

Frostbound Furnace is both a playable game project and a practical reference for an open browser-3D production workflow:

- Babylon.js gameplay with runtime asset contracts and procedural fallbacks;
- reproducible Blender/MPFB → GLB authoring rather than untracked manual asset edits;
- automated model-contract, interaction, audio, Hero, Warrior, and scene regression checks;
- Playwright-driven runtime evidence for claims that cannot be proven by static validation alone;
- GitHub Actions / Pages deployment and a scoped multi-workstream contribution model.

Contributions are welcome. The project keeps gameplay, art, audio, UI, and tooling changes reviewable as separate responsibilities so external work can be evaluated without silently changing unrelated balance or runtime behavior.

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

## License and asset provenance

This is a **mixed-license repository**:

- project source code is licensed under **Apache-2.0** — see [`LICENSE`](LICENSE);
- original non-code game assets are not automatically licensed under Apache-2.0 — see [`ASSET_LICENSE.md`](ASSET_LICENSE.md);
- third-party and generated-asset provenance is recorded in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

The character pipeline uses MakeHuman/MPFB-derived material. Upstream MakeHuman/MPFB core graphical assets and exports are documented as CC0; any separately downloaded community asset must be reviewed under its own license.

The committed BGM was generated with Google Gemini/Lyria according to the project owner. It is documented separately from the Apache-2.0 code license and is not presented as an Apache-licensed software asset.

## Public-repo hygiene

- Never commit `.env`, credentials, local MCP configuration, editor state, or private paths.
- Keep generated CI output, deformation dumps, temporary screenshots, and WIP captures out of Git unless intentionally curated as acceptance evidence.
- Do not force-push `main`.
- Public contributions should go through reviewed pull requests.

## Known limitations

- Art quality is still being upgraded toward a commercial target.
- Hosted Pages can lag `main` when GitHub Actions is unavailable.
- Real-GPU performance should be measured with the in-game performance monitor; CI/browser automation does not substitute for hardware validation.
- Enemy navigation uses project-specific perimeter/steering logic rather than a general navmesh.

For current public-readiness/security status, see [`docs/PUBLIC_READINESS.md`](docs/PUBLIC_READINESS.md). For design history and implementation details, see `docs/`, `CHANGELOG.md`, and the curated reports retained in `reports/`.