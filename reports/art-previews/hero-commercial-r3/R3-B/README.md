# Hero-R3 B — Commercial body proportions

This stage changes only the Hero Blender source and its Hero GLB export. It
keeps the existing `HeroRoot`, `HeroSkeleton`, sockets, seven animation names,
grounding contract, and Review Mode runtime path.

## First pass and critical correction

- Rebuilt the continuous LOD0 body loft with a distinct pelvis, pinched waist,
  expanding chest, shoulder break, and longer lower-body read.
- Pulled the arms away from the torso with a tapered, slightly angled sleeve
  profile; widened the forward foot depth and separated the two feet.
- Reduced the helmet/head width so the torso no longer reads as one egg-shaped
  volume; the existing visor marker and equipment remain in place for later
  identity work.
- Applied the same torso proportion correction to the LOD proxy bodies without
  changing their runtime contract.

## Runtime evidence

The twelve PNG/JSON pairs in this directory are Babylon runtime captures from
`?heroReview=1`. Review them front, left-side, back, three-quarter, and close-up
to assess silhouette and contact with the ground. The JSON sidecars also record
the live mesh/vertex/triangle counters and prove GLB source with zero procedural
visible meshes.

This stage intentionally does not claim commercial clothing, UV/material, or
weighted-animation quality; those are separate R3 stages.
