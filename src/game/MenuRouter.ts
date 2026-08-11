import { audioDirector } from "../audio/AudioDirector";
import type { UpgradeId } from "../data/UpgradeDefinitions";
import type { MenuChoice } from "../ui/GameMenus";
import type { GameSystems } from "./GameSystems";

export interface MenuActions {
  startRun(mode: "stage" | "endless", levelId?: string): void;
  startTutorial(): void;
  openMainMenu(): void;
  resume(): void;
  openCodex(): void;
  /** Called when a choice puts the player back into the running game. */
  leaveMenu(): void;
}

/**
 * Turns a menu selection into the thing it does. Split out of `Game` so the
 * frame loop and the input glue stay readable; nothing here decides rules.
 */
export function routeMenuChoice(s: GameSystems, choice: MenuChoice, actions: MenuActions): void {
  switch (choice.kind) {
    case "stage":
      actions.startRun("stage", choice.levelId);
      break;
    case "endless":
      actions.startRun("endless");
      break;
    case "resume":
      actions.resume();
      break;
    case "menu":
      actions.openMainMenu();
      break;
    case "tutorial":
      actions.startTutorial();
      break;
    case "help":
      s.menus.showHelp();
      break;
    case "codex":
      actions.openCodex();
      break;
    case "settings":
      showSettings(s, choice.from);
      break;
    case "quality":
      s.quality.setSetting(choice.level as never);
      showSettings(s);
      break;
    case "markerStrength":
      s.setMarkerStrength(choice.level as never);
      showSettings(s);
      break;
    case "fpsHud":
      s.setFpsHudVisible(choice.level === "on");
      showSettings(s);
      break;
    case "damageNumbers":
      s.setDamageNumbersEnabled(choice.level === "on");
      showSettings(s);
      break;
    case "screenShake":
      s.setScreenShakeEnabled(choice.level === "on");
      showSettings(s);
      break;
    case "flashIntensity":
      s.setFlashIntensity(choice.level as never);
      showSettings(s);
      break;
    case "upgrade":
      s.run.upgrades.take(choice.id as UpgradeId);
      s.events.emit("runUpgradeTaken", { id: choice.id, name: choice.id });
      s.menus.hide();
      actions.leaveMenu();
      s.audio.play("uiConfirm", 1);
      break;
  }
}

function showSettings(s: GameSystems, from?: "pause"): void {
  s.menus.showSettings(
    s.quality.currentSetting,
    s.markerStrength,
    s.fpsHudVisible,
    s.damageNumbersEnabled,
    s.screenShakeEnabled,
    s.flashIntensity,
    from,
  );
  audioDirector.mountSettingsControls(s.refs.screenBody);
}
