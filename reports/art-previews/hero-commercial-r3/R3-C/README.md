# Hero-R3 C — Clothing, survival gear, and identity

This stage keeps the body topology and adds a deliberately consolidated
clothing/gear pass. It does not add a roster, rebuild other assets, or claim
commercial material or animation quality.

## First pass and critical correction

- Added one chest-bound `pack.heroSurvival` mesh containing a structured pack
  shell, collar/shoulder yoke, harness straps, buckle, and side utility pouches.
- Added one head-bound `head.goggles` mesh for the goggle lenses/band; no
  collection of tiny floating primitives was introduced.
- The first pass made the gear panel too broad and visually read as a flat
  rectangle. The critical correction tapered and reduced the panel, added a
  top flap, and consolidated all gear/goggle materials to one slot each so the
  Hero stays under the 32 visible LOD0 render-mesh ceiling.
- Front/back placement was verified in Babylon after the correction; the
  backpack and harness remain part of the same runtime GLB instance.

## Runtime evidence

The twelve PNG/JSON pairs in this directory are captured from
`?heroReview=1`. The JSON sidecars record GLB source, procedural-visible count,
screen bounds, and live performance/geometry counters. The LOD proxy tiers are
unchanged in this stage and will be rebuilt in R3-F.
