# Hero R7 production handoff

This directory is the compact production handoff for the final R7 Hero asset.
It contains only eight representative runtime captures plus the manifest and
static contract report. The complete Babylon runtime output, all 42 normalized
animation samples, Playwright video, JSON metadata and browser logs remain in
the successful GitHub Actions artifact.

Run the static contract check with:

```text
npm run art:validate:hero
```

The Linux GitHub Actions run is authoritative for Babylon runtime visibility,
gameplay context, deterministic animation sampling and browser-error checks.
Automation does not decide commercial art quality; the remaining decision is
for a human art reviewer.
