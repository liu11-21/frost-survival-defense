# Hero-R4 D — Production LOD rebuild

R4-D replaces the previous low-density proxy tiers with authored reductions
of the R4-B mid-poly loop volumes. LOD0 is unchanged. The new production
meshes keep the Hero's helmet/visor, shoulders, arms, legs, survival gear and
weapons while reducing loop density for distance rendering. LOD1 and LOD2
remain under the existing `LOD1`/`LOD2` marker nodes and are selected at
runtime through `LOD*_PROD` names.

## Measured result

- LOD0: 10,486 vertices, 20,852 triangles, 15 render meshes.
- LOD1: 4,032 vertices, 7,980 triangles, 8 render meshes (9 glTF
  primitives because the integrated visor uses a second material).
- LOD2: 1,178 vertices, 2,304 triangles, 5 render meshes (6 glTF primitives
  for the same visor material split).
- GLB: 4,446,252 bytes, 54 nodes, 28 mesh resources, 4 materials, one
  embedded atlas, one skeleton, 30 skinned primitives and seven animation
  clips.
- `npm run art:validate:hero`, `npm run art:validate`, and TypeScript
  checking pass the static/GLB contract gates.

## Evidence and runtime boundary

`lod0-front.png`, `lod1-front.png`, `lod2-front.png` and
`lod1-three-quarter.png` are Blender clay source-review frames. They show
that both production tiers retain the Hero's head/visor and complete body
silhouette; visual quality remains a human review decision.

Babylon runtime capture is not marked as passed in this stage. The local
Vite/Babylon server could not start because the managed Windows environment
denied esbuild's child process (`spawn EPERM`). The exact boundary is recorded
in `runtime-blocked.md`; no synthetic runtime screenshot is included.
