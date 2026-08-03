# Hero-R4 A — Mid-Poly Body Foundation

This checkpoint rebuilds only the Hero LOD0 body foundation. The body, head,
arms and legs now use authored anatomical ring loops with separate pelvis,
waist, ribcage, shoulder, elbow, knee and boot profiles. The generation uses
direct vertex/face mesh authoring and no subdivision modifier; the existing
18-bone skeleton, smooth armature binding, sockets and seven animation names
remain intact.

## Measured result

- LOD0: 8,126 vertices, 16,124 triangles, 12 render mesh objects, 31 glTF
  primitives.
- GLB: 2,793,212 bytes, 7 exported materials, one embedded `HERO_ATLAS_1024`
  texture, one skeleton, seven animation clips.
- Existing LOD1/LOD2 are preserved for this stage at 652 / 360 triangles; they
  are rebuilt in R4-D after the new LOD0 is accepted.
- `npm run art:validate:hero` passed the existing runtime contract checks.

## Evidence

The four `clay-*.png` files are neutral Blender source renders for human
topology review. `textured-front.png`, `textured-close-up.png` and
`gameplay.png` are orientation/identity reference renders from the same source
blend. These images are visual evidence only; no automated check claims that
the model is commercial-quality.

The R4-A second pass sharpened the pelvis flare and waist pinch after reviewing
the first clay render. Remaining visible issues are intentionally deferred to
R4-B (clothing/backpack forms), R4-C (joint deformation), and R4-D (production
LODs/runtime regression).
