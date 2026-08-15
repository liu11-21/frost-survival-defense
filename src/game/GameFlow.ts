import { audioDirector } from "../audio/AudioDirector";
import { audioGameplayAdapter } from "../audio/AudioGameplayAdapter";
import { bindStaticUiLocalization, t } from "../localization";
import type { GameSystems } from "./GameSystems";

/** Starts a run from a clean slate. */
export function beginRun(s: GameSystems, mode: "stage" | "endless", levelId?: string): void {
  audioGameplayAdapter.reset();
  audioDirector.attachGameplayEvents(s.events);
  audioDirector.setState("PREPARATION");
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
  s.templates.clearPools();
  bindStaticUiLocalization(s.refs.root);
  s.hud.showBanner(t("notification.runStart"), t("notification.runStartBody"), 4);
  s.audio.unlock();
}

/** Hides the in-run overlays when the player goes back to a menu. */
export function leaveRun(s: GameSystems): void {
  audioGameplayAdapter.reset();
  audioDirector.setState("MENU");
  s.squadHud.setVisible(false);
  s.laneHud.setVisible(false);
  s.edges.setVisible(false);
  s.confirm.close();
  s.markers.setHighlight(null);
}
