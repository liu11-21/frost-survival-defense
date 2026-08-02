# Art-pipeline verification

Run these commands from the project root:

```bash
npm run typecheck
npm run build
npm run art:export
npm run art:validate
node tools/playtest.mjs --suite v6
node tools/playtest.mjs --suite v9
node tools/playtest.mjs --suite v10
git diff --check
```

`art:validate` is intentionally non-failing while Blender is absent: each
missing GLB is reported as `blocked` in `reports/art-validation.json`. Once
exports exist, missing required nodes/animations or external URIs fail the
validator. The v6 suite covers engineer repair, unit lifecycle and pooled
combat; v9 covers HUD, skills and facility behaviour; v10 covers ground/sky
slot unlocks and flying enemies. The complete default playtest also includes
the longer v8 build/rebuild endurance simulation.

The validator also checks the authored LOD marker nodes (`LOD1`/`LOD2`) and
their exported `LOD1_PROXY`/`LOD2_PROXY` mesh geometry. Babylon's
`ModelLoader` hides those proxies near the camera and switches the complete
authored mesh set at the 18/34 world-unit distance tiers. It also checks unit
skeleton presence, non-empty animation channels, root unit scale, collision
mesh exclusion, triangle budget, and absence of external or absolute paths.
The resource-node GLBs (`resource_tree` and `resource_rock`) are included in
the same report; when available, `ResourceNodeView` swaps them in after the
preload barrier and keeps the original MeshBuilder implementation as fallback.
For a visual review, run the two Blender preview scripts documented in the
README and inspect the generated PNGs before calling an asset commercial-ready.
