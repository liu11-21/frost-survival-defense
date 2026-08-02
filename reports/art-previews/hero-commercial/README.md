# Hero commercial H1-H6 evidence

This folder records the staged Blender source -> GLB -> Babylon formal-scene
workflow for the authored Hero. Each stage has two modeling iterations,
`metrics-iteration-1.json`, `metrics-iteration-2.json`, a before/after
`comparison.json`, and two screenshots captured after a browser reload of the
formal `uiVerification=1` scene.

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
`runtime-perf.json` stores a short formal-scene capture (`drawCalls=131`,
`activeMeshes=59`, `renderMs=12`), while `renderPrimitiveCount` remains the
portable GLB-side draw-call proxy.
