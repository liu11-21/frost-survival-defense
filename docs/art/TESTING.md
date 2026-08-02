# Art-pipeline verification

Run these commands from the project root:

```bash
npm run typecheck
npm run build
npm run art:validate
node tools/playtest.mjs --suite v9
node tools/playtest.mjs --suite v10
git diff --check
```

`art:validate` is intentionally non-failing while Blender is absent: each
missing GLB is reported as `blocked` in `reports/art-validation.json`. Once
exports exist, missing required nodes/animations or external URIs fail the
validator. The gameplay suites verify that optional asset loading does not
change the existing sky-platform, air-enemy, HUD, combat, skill and death
lifecycle rules.
