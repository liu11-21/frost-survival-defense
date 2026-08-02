# Frostbound Expanse 3D asset style guide

## Direction

Stylized low-poly winter fortress: readable silhouettes, chunky bevels, cold
blue ambient light, warm furnace/ember accents, restrained PBR materials and
snow caught on upward-facing edges. Geometry must still read at the game's
top-down camera distance.

## Coordinate and scale contract

- Blender metric units, Y-up, forward `+Z`; object origin is on the ground at
  the gameplay pivot.
- Hero height: 1.9 m. Soldier: 1.7 m. Basic turret: 3.0 m including muzzle.
- Wall segment: at least 3 m tall; gate opening: 4.2 m wide.
- Keep the root node at the gameplay pivot and never bake world placement into
  an export.

## Budgets and materials

Hero 8k triangles for LOD0 / 4k LOD1 / 1.5k LOD2; turret 6k / 3k / 1k;
wall-gate 12k / 6k / 2k. Use one 2k texture set per asset at most, with
`MAT_`-prefixed PBR materials. Avoid transparent foliage and hidden detail that
cannot be seen from the camera.

## Naming and integration

Required roots and sockets are documented in `src/assets/AssetManifest.ts`.
Animation names are canonical (`Idle`, `Walk`, `Run`, `Fire`, `Recoil`,
`GateOpen`, etc.). Prefix collision-only meshes with `COL_`; keep them in the
`COLLISION` collection, hidden from render and excluded from visual stages.
Authoring collections are `LOD0`, `LOD1`, `LOD2`, `COLLISION`, `EXPORT`, `RIG`.

Every exported mesh should have applied transforms, weighted/smooth normals,
reasonable bevels and a clear fallback material. Babylon instantiates a GLB
through `AssetRegistry`; failed validation automatically returns to the
procedural model.
