# Hero-R3 A — Review lighting and frame metrics

This evidence is captured from the Babylon runtime `?heroReview=1` scene. It is
not a Blender render and it does not make a commercial-art quality claim.

## First pass and critical correction

- Disabled review-mode bloom, fog, vignette and tone-mapping exposure inherited
  from the gameplay scene.
- Added a neutral, non-lit ground reference plus balanced key/fill/rim lights.
- Moved the metrics panel to the upper-right corner so it does not cover Hero.
- Reset Babylon's draw-call counter before each review render; the panel now
  reports this-frame calls, a rolling 120-frame average, measured FPS averages,
  frame-time p50/p95, and Hero-only visible mesh/vertex/triangle counts.
- The critical correction lowered the neutral ground and review light energy
  after the first capture showed a clipped white floor.

## Evidence

The twelve PNG/JSON pairs in this directory are the formal runtime captures for
gameplay, six fixed cameras, three combat animations, and LOD0/LOD1/LOD2. The
JSON sidecars record `heroReview=1`, GLB source, Hero screen bounds, UI overlap,
and the live metrics.

Commercial body proportions, clothing, UV/material authoring, skinning, and LOD
identity remain later R3 stages; this stage intentionally does not change Hero
geometry.
