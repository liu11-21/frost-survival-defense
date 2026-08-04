# Recent changes

## Warrior-W1 production template (2026-08-04)

- Scope is limited to `warrior`; Hero and every other role/asset remain untouched.
- Replaced the high-count Warrior assembly with a weighted 18-bone GLB using one merged body mesh and one merged axe mesh per LOD.
- Final static contract: LOD0/LOD1/LOD2 = 6632/2680/1016 triangles, 5/4/2 primitives, 3 materials, 1 embedded texture, 6 authored animations.
- Added the reusable `?unitReview=warrior` review mode, deterministic 36-sample animation evidence, three-squad runtime verification, and the 9-Warrior/12-Grunt development pressure smoke test.
- Local gates currently pass: TypeScript, Warrior static validation, all-authored-asset validation, production build, and all three Warrior Playwright tests. GitHub Actions remains the final remote gate.

Git log unavailable in this managed Node session (spawnSync EPERM).

## Working-tree diff at sync time

Git diff unavailable in this managed Node session (spawnSync EPERM).
