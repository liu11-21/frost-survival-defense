# Blender source workspace

This folder contains editable source assets used by the reproducible Blender → GLB pipeline.

Representative source assets include character, building, facility, and environment `.blend` files under `assets-source/blender/`. Runtime exports are written to `public/assets/models/`.

Run the relevant `npm run art:*` command or the corresponding script under `scripts/blender/` when rebuilding an asset. Blender is optional at runtime: if a GLB is missing or fails its node/animation contract, Babylon can use the project's supported fallback path where one exists.

## Local Blender configuration

A local `BLENDER_PATH` may be set through `.env` when Blender is not discoverable from standard installation locations. Do not commit machine-specific absolute paths, Blender user preferences, MPFB caches, MCP configuration, or downloaded extension directories.

Editable source media follows the repository's Git LFS rules. Production changes should be reproducible from committed scripts/source rather than relying on unrecorded manual edits.