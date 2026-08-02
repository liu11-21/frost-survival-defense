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
