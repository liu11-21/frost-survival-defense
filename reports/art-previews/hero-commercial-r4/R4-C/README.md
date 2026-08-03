# Hero-R4 C — Weighted mid-poly deformation

R4-C validates the existing 18-bone HeroSkeleton against the R4-B mid-poly
LOD0 mesh. The stage adds no geometry: it checks that every LOD0 render mesh
has an Armature modifier, every vertex has normalized weights, and the body
uses multi-influence skinning at anatomical transitions.

## Measured result

- LOD0: 10,486 vertices, 20,852 triangles, 15 render mesh objects and 15
  glTF primitives.
- Skinning: 18 required bones, 15 Armature modifiers, 4,660 vertices with
  more than one influence, and normalized vertex weights.
- GLB reference: 3,199,820 bytes, 4 exported materials, one embedded
  `HERO_ATLAS_1024` texture, and seven existing animation clips.
- `validate_hero_r4_deformation.py` and `npm run art:validate:hero` pass the
  structural/runtime contract checks.

## Pose evidence

The nine `pose-*.png` files are Blender clay deformation review frames:
reference T pose, arm reach/raise/elbow, knee bend, walk stride, melee,
ranged, and death. The renderer disables NLA evaluation and preserves the
root bind quarter-turn so these are explicit joint stress poses rather than
uncontrolled clip frames. The manifest records the rotated bones for each
frame.

Structural weighting is a machine-checked pass. Pose silhouette, clipping,
weapon contact, and deformation quality remain human review decisions; this
stage does not claim commercial animation quality. Production LOD work is
deferred to R4-D.
