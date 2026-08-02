# Architecture

## Runtime layers

1. src/game/ owns game flow, input, modes and system orchestration.
2. src/combat/, src/ai/, src/enemies/ and src/hero/ own combat state, targeting, navigation and skills.
3. src/buildings/, src/construction/, src/economy/ and src/heat/ own the furnace, facilities and resources.
4. src/assets/ validates and loads GLB assets; src/character/ and src/buildings/BuildingMeshFactory.ts provide procedural fallback visuals.
5. src/ui/ and src/styles.css render HUD, menus, codex and diagnostics.

## Asset flow

Blender Python builders in scripts/blender/ write source blends under assets-source/blender/ and GLBs under public/assets/models/. The asset registry checks paths, nodes, animation names and bounds before instantiation. A failed authored asset never removes the playable fallback path.

## Verification

- npm run typecheck runs TypeScript without emitting files.
- npm run build runs typecheck and Vite production bundling.
- npm run art:validate writes reports/art-validation.json.
- npm run ai:sync refreshes this directory and the lightweight reports.
