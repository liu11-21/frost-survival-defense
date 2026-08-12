import { CAMERA } from "./GameConfig";
import type { GameSystems } from "./GameSystems";
import type { SupportSystems } from "./SupportSystems";
import { updateFrameUi } from "./GameLoopUi";
import { computeLaneCoverage } from "../buildings/AttackRangeGeometry";
import { LANES } from "../data/BuildSlotDefinitions";
import { BUILDING_BY_ID } from "../data/BuildingDefinitions";
import { updateHaltedDeathLifecycle } from "../combat/HaltedDeathLifecycle";
import { audioGameplayAdapter } from "../audio/AudioGameplayAdapter";

/**
 * One simulation frame, in dependency order.
 *
 * The spatial index is rebuilt first so every query this frame sees the same
 * world; combat, navigation and construction follow; presentation last.
 */
export function runFrame(s: GameSystems, dt: number, support: SupportSystems): void {
  s.world.rebuildIndex();
  s.hero.update(dt, s.input, s.camera, false);
  // Positional SFX follows the player/listener; this is read-only presentation
  // state and never feeds back into combat targeting or movement.
  s.audio.setListenerPosition(s.hero.position.x, s.hero.position.z);
  s.heroSkills.update(dt);
  s.squads.update(dt, s.hero.alive ? s.hero.position : null);
  s.navigator.update(dt);
  s.buildings.update(dt, s.ctx, s.hero.position, s.run.productionRate, s.furnace.currentLevel);
  s.projectiles.update(dt);
  s.world.removeDead();

  support.update(dt, s);
  s.pickups.update(dt, s.hero.position.x, s.hero.position.z, (kind, amount) => {
    const stored = s.store.add(kind, amount);
    if (stored > 0 && kind === "gold") s.audio.play("coinPickup", 0.3, 1 + Math.random() * 0.2);
  }, s.buildings.hasAutoCollector);
  updateFrameUi(s, support.workingNode);

  s.waves.update(dt);
  // Audio reads the canonical phase and live combat field after WaveManager has
  // advanced. It never writes gameplay state or combat balance.
  audioGameplayAdapter.update(s, dt);
  s.run.update(dt);

  s.nodes.update(dt);
  s.boss.update(dt, s.ctx);
  s.watchdog.update(dt);
  s.residueGuard.update(dt);
  s.stress.update(dt);

  // Every living combatant and attackable structure keeps a bar for as long as
  // it is alive — this is what actually keeps the bound set correct every
  // frame, not an opportunistic reveal.
  s.healthBars.syncAll(s.world);
  const hovered = s.hover.find(
    s.input.pointer,
    s.engine.getRenderWidth(),
    s.engine.getRenderHeight(),
  );
  s.healthBars.update(dt);
  s.combatText.update(dt);
  s.markers.update(dt, hovered ?? s.hero.currentTarget);
  s.debug.update(dt);
  for (const slot of s.buildings.slots) s.arena.setOccupied(slot.id, slot.occupied);

  const wheel = s.input.consumeWheel();
  if (wheel !== 0) s.camera.adjustUserZoom(wheel * CAMERA.zoomStep);
  // Bias the framing back toward the furnace so the core is always on screen.
  s.cameraFocus.set(
    s.hero.position.x * (1 - CAMERA.centreBias),
    0.6,
    s.hero.position.z * (1 - CAMERA.centreBias),
  );
  s.camera.update(dt);
  s.heat.update(dt, s.camera.camera.position);
  s.arena.update(dt);
  s.laneMarkers.update(dt);
  s.feedback.update(dt);
  s.panels.update(dt);
  s.squadHud.update(dt);
  s.laneHud.update(dt);
  s.heroSkillHud.update();
  s.edges.update(dt, s.engine.getRenderWidth(), s.engine.getRenderHeight());
  s.hud.update(dt);
  if (s.input.hasMoveInput) s.hud.hideHint();
  updateAttackRangeDisplay(s);
}

/**
 * Exactly one attack-range overlay is ever shown: whichever built attack
 * building the hero is currently near/selecting, or — if none — whichever
 * not-yet-built attack building's build-menu card is currently hovered. Both
 * paths read the same `BuildingDefinition` fields real combat fires against.
 */
function updateAttackRangeDisplay(s: GameSystems): void {
  const liveLanes = LANES.filter((l) => l.index < s.waves.activeLaneCount);
  const nearbyBuilding = s.panels.nearbySlot?.building;

  if (nearbyBuilding && nearbyBuilding.isComplete && nearbyBuilding.def.attackKind) {
    const def = nearbyBuilding.def;
    const attackRange = (def.attackRange ?? 0) * (nearbyBuilding.isSky && (def.attackKind === "snipe" || def.attackKind === "areaShell") ? 1.5 : 1);
    const coverage = computeLaneCoverage(
      nearbyBuilding.position.x,
      nearbyBuilding.position.z,
      attackRange,
      liveLanes,
      def.requiresLineOfSight === true,
      s.world,
    );
    s.attackRangeVisual.show(nearbyBuilding.position.x, nearbyBuilding.position.z, attackRange, def.minAttackRange ?? 0, coverage);
    return;
  }

  const preview = s.rangePreview;
  const previewDef = preview ? BUILDING_BY_ID.get(preview.type) : undefined;
  if (preview && previewDef?.attackKind) {
    const attackRange = (previewDef.attackRange ?? 0) * (preview.surface === "sky" && (previewDef.attackKind === "snipe" || previewDef.attackKind === "areaShell") ? 1.5 : 1);
    const coverage = computeLaneCoverage(
      preview.x,
      preview.z,
      attackRange,
      liveLanes,
      previewDef.requiresLineOfSight === true,
      s.world,
    );
    s.attackRangeVisual.show(preview.x, preview.z, attackRange, previewDef.minAttackRange ?? 0, coverage);
    return;
  }

  s.attackRangeVisual.hide();
}

/**
 * The engine-facing half of a frame: simulation and render are timed apart so
 * the performance panel can say which half a millisecond belongs to.
 */
export function renderFrame(s: GameSystems, halted: boolean, simulate: (dt: number) => void): void {
  const dt = Math.min(0.05, s.engine.getDeltaTime() / 1000);

  s.monitor.beginSimulation();
  if (!halted && dt > 0) simulate(dt);
  else if (dt > 0) updateHaltedDeathLifecycle(s.squads, s.world, dt);
  s.monitor.endSimulation();

  s.monitor.beginRender();
  s.scene.render();
  s.monitor.endRender();

  s.monitor.sample(
    {
      allies: s.world.allies.length,
      enemies: s.world.enemies.length,
      projectiles: s.projectiles.activeCount,
      pickups: s.pickups.activeCount,
    },
    s.quality.current,
  );
  s.quality.update(dt, s.monitor.snapshot.fps);
}
