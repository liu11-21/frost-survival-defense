# System map

Game -> GameSystems -> combat / AI / buildings / economy / heat / UI

- Input: src/game/GameInput.ts, src/player/PlayerInput.ts, src/input/PointerRouter.ts
- World: src/scene/SceneFactory.ts, src/scene/ArenaBuilder.ts, src/camera/GameCamera.ts
- Combat: CombatDirector -> units, squads, projectiles, facilities and damageable targets
- AI: state machines + threat tracking + target validation + navigation + watchdog
- Assets: manifest -> registry -> Babylon loader -> authored GLB or procedural fallback
- UI: HUD -> menus / codex / panels / diagnostics
- Persistence: local leaderboard and run settings under src/modes/ and src/game/
