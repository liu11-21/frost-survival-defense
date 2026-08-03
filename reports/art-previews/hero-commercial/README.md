# Hero commercial H1-H6 evidence

## 2026-08-03 mesh reconstruction checkpoint

This is a focused Hero topology pass after the H1-H6 evidence work, not a new
H1-H6 modeling stage. The old primitive assembly was replaced in
`scripts/blender/build_hero.py` with nine LOD0 authored objects: continuous
lofted body/head/limbs, a curved coat panel, and consolidated melee/ranged
equipment. A small `head.nose` mesh marker preserves the runtime facing
calibration contract. The exported GLB reports 10 LOD0 authored objects and 32
material-split LOD0 render primitives, down from the previous 184 runtime
authored meshes. LOD1 and LOD2 each contain body, hood/visor, cape and weapon
silhouette meshes so the Hero remains identifiable at distance.

The review captures under `review/` were regenerated from the real
`?heroReview=1` Babylon scene after this export. They are evidence for mesh
count, silhouette visibility, LOD identity and runtime loading only. They do
not constitute a commercial material or animation-quality claim.

This folder records the staged Blender source -> GLB -> Babylon formal-scene
workflow for the authored Hero. Each stage has two modeling iterations,
`metrics-iteration-1.json`, `metrics-iteration-2.json`, a before/after
`comparison.json`, and two historical screenshots captured after a browser
reload of the formal `uiVerification=1` scene.

The old H1-H6 screenshots are deliberately preserved, but they are not visual
acceptance evidence: the main menu and verification overlay obscure the Hero.
The only runtime visual evidence used by the validator is the dedicated
`review/` set captured from `?heroReview=1`.

The runtime contract is checked on every iteration:

- `Hero Model Source: GLB` after reload (no permanent procedural fallback)
- `HeroRoot`, `HeroSkeleton`, `weapon_socket.R`, `ranged_socket`, `LOD1`, `LOD2`
- `Idle`, `Walk`, `Run`, `MeleeAttack`, `RangedAttack`, `Hit`, `Death`
- embedded UV/color surface attributes, one skeleton, no external URIs, and
  real LOD1/LOD2 proxy geometry

Stage scope is intentionally limited to Hero geometry, materials, animation,
the minimal deterministic authored-loader gate, and this evidence folder.
Other roster assets and gameplay systems are not part of H1-H6.

`final-contract.json` is a repeatable static contract audit for the final
Hero GLB. It records the embedded PNG dimensions (64x64 for each of the nine
packed paint images), skeleton and animation key statistics, LOD triangle and
primitive counts, source `.blend` size, and the formal Babylon evidence files.
`review/` contains the twelve required visible runtime screenshots and a
continuous-frame sequence for Idle -> Walk -> Run -> MeleeAttack ->
RangedAttack -> Hit -> Death. Every capture has a sidecar JSON record with the
camera, animation, LOD, GLB source, authored/procedural mesh counts, world
position, screen-space bounding box, UI occlusion, draw calls, active meshes,
and FPS. The validator checks those runtime contracts only; commercial visual
quality remains a human review decision. `runtime-perf.json` is retained as
supplemental historical performance evidence.
