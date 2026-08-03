# Hero-R4 B — Commercial Clothing and Equipment Forms

R4-B replaces the old flat survival-gear profile with four authored mesh
groups: a rounded jacket shell, joined shoulder/chest armor, a shaped rear
backpack with flap, and a helmet shell. The forms are looped volumes rather
than a collection of floating box/cylinder parts. The backpack was corrected in
the second pass so it sits on the rear side of the Hero, and the chest plate
was reduced to keep the waist and pelvis silhouette readable.

## Measured result

- LOD0: 10,486 vertices, 20,852 triangles, 15 render mesh objects, 15 glTF
  primitives.
- GLB: 3,199,820 bytes, 4 exported materials, one embedded `HERO_ATLAS_1024`
  texture, one 18-bone skeleton, seven animation clips.
- All 15 LOD0 render meshes receive the existing Armature modifier and smooth
  weight binding. Existing LOD1/LOD2 remain unchanged until R4-D.
- `npm run art:validate:hero` passes the existing GLB/runtime contract gate;
  this is not a commercial-quality claim.

## Evidence and critique

The clay and textured renders in this directory are Blender source review
evidence. The first pass exposed an oversized/incorrectly oriented pack and a
chest plate that hid the body break. The second pass corrected those three
highest-impact issues (rear placement, pack depth, chest-plate footprint).
Remaining deformation and production-LOD validation are deferred to R4-C and
R4-D.
