# Hero-R3 D — UV atlas and material authoring

This stage changes only Hero surface authoring. Geometry, sockets, skeleton,
animation names, and the Babylon runtime contract are preserved from R3-C.
The old per-material 64×64 brush images were replaced with one embedded
`HERO_ATLAS_1024` image. Eight shared PBR material slots now point at stable
atlas cells for cloth, leather, metal, skin, dark cloth, snow, glow, and
accent.

## Checks

- Blender 5.2.0 LTS generated `public/assets/models/characters/hero.glb`.
- The GLB contains one embedded 1024×1024 PNG, no external image/buffer URI,
  and eight materials.
- LOD0 remains 12 authored objects / 31 render primitives / 1,396 triangles;
  LOD1 and LOD2 remain runtime-visible and are unchanged until R3-F.
- `npm run art:validate:hero` passes the UV/COLOR, texture, skeleton, socket,
  animation, orientation, collision, and review-contract checks.

## Runtime evidence

The twelve PNG/JSON pairs in this directory were captured from the formal
Babylon `?heroReview=1` scene after the atlas export. Each sidecar records
`modelSource: GLB`, `proceduralVisibleMeshCount: 0`, camera/animation/LOD,
screen-space bounds, and live counters. The review panel remains in the upper
right and does not occlude the Hero.

This is a technical UV/material deliverable, not a human declaration of
commercial visual quality. Close-up and material readability still require
human review.
