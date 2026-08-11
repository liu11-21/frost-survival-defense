# Audio runtime fix scope

Base: `main@469339fcd6f16d2b3e257afa1b8a723b6d07fa07`

This branch is limited to Audio runtime lifecycle, state transition verification, the intermission-to-preparation bridge, and read-only combat-pressure BGM intensity.

It does not change WaveManager, enemy stats, combat balance, AI, pathfinding, scene layout, GLB assets, or the shared `withBase()` helper.
