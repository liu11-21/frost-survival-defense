import type { GameSystems } from "./GameSystems";

/**
 * Starts a run from a clean slate.
 *
 * Every per-run system is reset here in one place, which is what guarantees the
 * "nothing carries between stages" rule: resources, buildings, squads, nodes,
 * the furnace, the watchdog and the boss all go back to their opening state.
 */
export function beginRun(s: GameSystems, mode: "stage" | "endless", levelId?: string): void {
  s.run.start(mode, levelId);
  s.world.enemies.length = 0;
  s.world.allies.length = 0;
  s.projectiles.clear();
  for (const slot of s.buildings.slots) s.arena.setOccupied(slot.id, false);
  s.arena.setFurnaceLevel(1);
  s.panels.closeAll();
  s.menus.hide();
  s.nodes.resetAll();
  s.nodes.setRespawnEnabled(mode === "endless");
  s.watchdog.reset();
  s.residueGuard.reset();
  s.boss.detach();
  s.healthBars.releaseAll();
  s.quality.restartSampling();
  s.squadHud.reset();
  s.squadHud.setVisible(true);
  s.laneHud.setVisible(true);
  s.edges.setVisible(true);
  s.confirm.close();
  s.gates.setLiveLaneCount(s.waves.activeLaneCount);
  s.gates.refresh();
  s.laneMarkers.clearWarnings();
  s.laneMarkers.setLiveLaneCount(s.waves.activeLaneCount);
  // A fresh run must not inherit the previous one's bodies.
  s.templates.clearPools();
  s.hud.showBanner(s.run.levelName, "建造、招募、守住火爐", 4);
  s.audio.unlock();
}

/** Hides the in-run overlays when the player goes back to a menu. */
export function leaveRun(s: GameSystems): void {
  s.squadHud.setVisible(false);
  s.laneHud.setVisible(false);
  s.edges.setVisible(false);
  s.confirm.close();
  s.markers.setHighlight(null);
}
