# Hero-R3 E — weighted deformation and combat animation

This stage binds only Hero LOD0 meshes through `HeroSkeleton` Armature
modifiers with smooth envelope weights. The continuous body blends pelvis /
spine / chest, sleeves blend upper-arm → lower-arm → hand, boots blend thigh →
shin → foot, and the consolidated pack/cape follow the torso chain. Weapons
remain attached to the existing hand/socket contract. No shared unit builder or
other asset was changed.

The melee, ranged, hit, and death clips retain their required names and now
include follow-through, recovery, hand, torso, and recoil keys. The review
capture runner advances clips with a fixed dt while the render loop is paused;
sequence frames no longer reset the animation between adjacent captures.

## Checks

- `hero.glb`: 808,636 bytes, 20 meshes, 8 materials, one embedded
  1024×1024 atlas, one skeleton, seven required clips.
- LOD0 remains 12 authored objects / 31 render primitives / 1,396 triangles;
  all 31 LOD0 primitives carry `JOINTS_0` and `WEIGHTS_0`.
- `npm run art:validate:hero` passes the weighted-skinning and runtime review
  contracts; `npm run art:validate` remains 42/42 `ok`.
- `sequence/manifest.json` contains 21 runtime frames in the required order:
  Idle → Walk → Run → MeleeAttack → RangedAttack → Hit → Death.

This evidence demonstrates runtime skinning and clip playback only. It does
not declare commercial animation quality; human review of deformation,
contacts, weapon handling, and timing remains required.
