# Blender source workspace

This folder is the source-of-truth for the three baseline authored assets:

- `blender/characters/hero.blend`
- `blender/buildings/turret_basic.blend`
- `blender/buildings/wall_gate.blend`

Run `npm run art:template` before hand-authoring. The scripted builders are
repeatable examples and export to `public/assets/models/`. Blender is optional
at runtime: if a GLB is missing or fails its node/animation contract, Babylon
uses the existing procedural factory.

Current machine status: Blender 5.2.0 LTS is installed from the official
Blender Foundation Windows ZIP under the user profile. `BLENDER_PATH` points to
its executable; the runtime also searches common Blender installation roots.
