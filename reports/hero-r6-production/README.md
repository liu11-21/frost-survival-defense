# Hero R6 production handoff

This directory is the compact handoff for the frozen Hero-R6 production asset.
It intentionally contains only the final static contract report and the
runtime review evidence needed by a human reviewer. The experimental H1-R5
iterations and archival PR #1 history remain out of this production branch.

The validator proves the GLB/LFS contract, authored runtime visibility, LOD
budgets and review metadata. It does not make a commercial-art quality
decision; that remains with the human reviewer.

Run locally with:

```text
npm run art:validate:hero
```

The Linux GitHub Actions job is the authoritative production build and
Babylon runtime check for this branch.
