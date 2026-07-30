import type { ActionKey } from "../player/PlayerInput";
import { hideLoadingScreen } from "../ui/LoadingScreen";
import { buildSnapshot, createDebugApi } from "./DebugApi";
import type { MenuChoice } from "../ui/GameMenus";
import { bindGameInput } from "./GameInput";
import { runBalanceAction } from "./BalanceActions";
import { bindDemolition } from "./DemolishPrompt";
import { routeMenuChoice } from "./MenuRouter";
import { beginRun, leaveRun } from "./GameFlow";
import { renderFrame, runFrame } from "./GameLoop";
import { GameSystems } from "./GameSystems";
import { SupportSystems } from "./SupportSystems";
import { PointerRouter } from "../input/PointerRouter";
import { InputDebugOverlay } from "../ui/InputDebugOverlay";
import { updateHaltedDeathLifecycle } from "../combat/HaltedDeathLifecycle";

/** Owns the engine loop and the glue between input, rules and presentation. */
export class Game {
  private readonly s: GameSystems;
  private paused = false;
  private inMenu = true;
  private inCodex = false;
  private disposed = false;
  private readonly support = new SupportSystems();
  private readonly pointerRouter: PointerRouter;
  private readonly inputDebug: InputDebugOverlay | null;

  constructor(canvas: HTMLCanvasElement) {
    this.s = new GameSystems(canvas);
    bindGameInput(this.s, canvas, {
      action: (a) => this.handleAction(a),
      menu: (c) => this.handleMenuChoice(c),
      balance: (a) => runBalanceAction(this.s, a, (m, id) => this.startRun(m, id)),
      resize: this.onResize,
      result: (result) => {
        this.s.events.emit("actionResult", {
          ok: result.ok,
          title: result.title,
          detail: result.message,
        });
        this.s.hud.notifications.show({
          title: result.title,
          message: result.message,
          iconId: result.iconId,
          type: result.ok ? "success" : "failure",
          durationMs: result.ok ? 2600 : 3400,
        });
        this.s.audio.play(result.ok ? "uiConfirm" : "buildFail", 0.8);
      },
    });
    this.bindEvents();
    bindDemolition(this.s);

    this.pointerRouter = new PointerRouter(canvas, this.s.scene, this.s.slotPicker, {
      canActOnWorld: () => !this.inMenu && !this.paused && !this.s.confirm.isOpen && !this.s.mapView.isOpen,
      onSlotClick: (slotId) => this.handleSlotClick(slotId),
    });
    this.inputDebug =
      new URLSearchParams(window.location.search).get("inputDebug") === "1" ? new InputDebugOverlay(this.pointerRouter) : null;
  }

  /** A click landed on a build slot's (oversized, invisible) pick region —
   * the world-object counterpart to pressing `E`/`B` near it. Only slots the
   * hero has already walked up to actually open, so clicking never becomes a
   * way to build from across the map. */
  private handleSlotClick(slotId: string): void {
    const s = this.s;
    if (s.panels.nearbySlot?.id === slotId) {
      s.panels.openBuild();
      s.tutorial.report("openedBuildMenu");
    } else {
      s.hud.toast("靠近建築槽位才能建造");
    }
  }

  /** Game-event reactions: audio, VFX, boss tracking and run transitions. */
  private bindEvents(): void {
    const s = this.s;
    s.squads.onSquadWiped = (squad) => {
      s.squadHud.reportWipe(squad.def.id);
      s.hud.toast(`${squad.def.name}小隊全滅`, "failure");
    };
    s.events.on("squadRecruited", () => s.squadHud.markDirty());
    s.events.on("wavePreview", (p) => {
      s.laneMarkers.clearWarnings();
      for (const lane of p.lanes) s.laneMarkers.warn(lane.laneIndex);
      s.audio.play(p.boss ? "bossSpawn" : "waveStart", p.boss ? 0.8 : 0.45);
    });
    s.events.on("buildingPlaced", () => s.gates.refresh());
    s.events.on("buildingDemolished", () => s.gates.refresh());
    s.events.on("buildingDestroyed", () => s.gates.refresh());
    s.events.on("waveStarted", (p) => {
      s.audio.play(p.boss ? "bossSpawn" : "waveStart", 1);
      if (p.boss) s.camera.shake(0.2);
      // Nothing may carry a previous wave's target or stuck state forward.
      s.squads.onWaveBoundary();
      s.buildings.onWaveBoundary();
      s.gates.setLiveLaneCount(s.waves.activeLaneCount);
      s.laneMarkers.setLiveLaneCount(s.waves.activeLaneCount);
    });
    s.events.on("waveCleared", (p) => {
      s.squads.scrubInvalidTargets();
      s.tutorial.report("waveCleared");
      const offer = s.run.onWaveCleared(p.wave);
      if (offer) {
        this.inMenu = true;
        s.menus.showUpgradeChoice(offer);
      }
    });
    s.events.on("allWavesCleared", () => s.run.onAllWavesCleared());
    s.events.on("bossSlamWarning", () => {
      s.bossTelemetry.warned++;
      s.hud.toast("Boss 正在蓄力震地，離開紅色範圍");
    });
    s.events.on("bossSlamLanded", () => {
      s.bossTelemetry.landed++;
      s.camera.shake(0.18);
    });
    s.events.on("buildingDestroyed", () => s.audio.play("buildingDestroyed", 0.8));
    s.events.on("buildStage", (p) => {
      s.audio.play("buildStage", 0.45, 0.9 + Math.random() * 0.2);
      s.feedback.burstAt("buildDust", p.position.x, p.position.z, 14);
    });
    s.events.on("buildingCompleted", (p) => {
      s.audio.play("buildComplete", 0.7);
      const slot = s.buildings.slot(p.slotId);
      if (slot) s.feedback.burstAt("complete", slot.x, slot.z, 22);
    });
    s.events.on("furnaceUpgraded", (p) => {
      s.audio.play("furnaceUpgrade", 1);
      s.vfx.setFurnaceLevel(p.level);
      s.audio.setFurnaceLevel(p.level);
      s.feedback.burstAt("shock", 0, 0, 32);
      s.camera.shake(0.28);
    });
    s.events.on("gameOver", (p) => {
      s.audio.play(p.victory ? "victory" : "defeat", 1);
      this.inMenu = true;
      s.menus.showResult(p.victory, p.mode, p.wave, p.kills, p.seconds, s.monitor.isStressTagged);
    });
  }

  /** Routes a main-menu / pause-menu selection. */
  private handleMenuChoice(choice: MenuChoice): void {
    routeMenuChoice(this.s, choice, {
      startRun: (mode, levelId) => this.startRun(mode, levelId),
      startTutorial: () => this.startTutorial(),
      openMainMenu: () => this.openMainMenu(),
      resume: () => this.setPaused(false),
      openCodex: () => {
        this.inCodex = true;
        this.s.menus.markOpen();
        this.s.codex.open();
      },
      leaveMenu: () => {
        this.inMenu = false;
      },
    });
  }

  private handleAction(action: ActionKey): void {
    const s = this.s;
    if (action === "pause") {
      // Esc unwinds one layer at a time: dialog, then codex, then highlight,
      // then panels, and only then does it pause the run.
      if (s.confirm.isOpen) {
        s.confirm.cancel();
        return;
      }
      if (this.inCodex) {
        this.closeCodex();
        return;
      }
      if (s.mapView.isOpen) {
        s.mapView.close();
        return;
      }
      if (s.run.isOver) return;
      if (!this.inMenu && s.squadHud.highlight !== null) {
        s.squadHud.clearHighlight();
        return;
      }
      if (!this.inMenu && s.panels.anyOpen) {
        s.panels.closeAll();
        return;
      }
      if (this.paused) this.setPaused(false);
      else if (!this.inMenu) this.setPaused(true);
      return;
    }
    if (this.inMenu || this.paused || s.confirm.isOpen) return;
    // The tactical map is a look-only overlay: while it covers the screen, the
    // only legal action is toggling it shut (Esc is already handled above).
    // No building, recruiting, or wave-calling happens through it, and no
    // build/recruit panel would even be reachable — it renders under the map.
    if (s.mapView.isOpen && action !== "map") return;

    switch (action) {
      case "map":
        s.mapView.toggle();
        break;
      case "interact":
        this.handleInteract();
        break;
      case "confirm":
        s.panels.confirmFocused();
        break;
      case "perfPanel":
        s.debug.togglePerf();
        break;
      case "aiPanel":
        s.debug.toggleAi();
        break;
      case "stressPanel":
        s.debug.openStress();
        break;
      case "balancePanel":
        s.debug.toggleBalance();
        break;
      case "verifyPanel":
        s.debug.toggleVerify();
        break;
      case "build":
        s.panels.toggleBuild();
        break;
      case "recruit":
        s.panels.toggleRecruit();
        if (s.panels.isRecruitOpen) s.tutorial.report("openedRecruit");
        break;
      case "upgrade": {
        const failure = s.run.tryUpgradeFurnace();
        if (failure) s.hud.toast(failure);
        break;
      }
      case "callWave":
        s.run.callNextWaveEarly();
        break;
      case "toggleRebuild":
        if (!s.buildings.hasAutoRebuilder) {
          s.hud.toast("尚未建造自動重建站");
          break;
        }
        s.buildings.autoRebuildEnabled = !s.buildings.autoRebuildEnabled;
        s.hud.toast(s.buildings.autoRebuildEnabled ? "自動重建已啟用" : "自動重建已停用");
        break;
      case "skillQ": {
        const failure = s.heroSkills.tryUse("frostNova");
        if (failure) s.hud.toast(failure);
        break;
      }
      case "skillR": {
        const failure = s.heroSkills.tryUse("barrage");
        if (failure) s.hud.toast(failure);
        break;
      }
      case "skillF": {
        const failure = s.heroSkills.tryUse("rally");
        if (failure) s.hud.toast(failure);
        break;
      }
    }
  }

  /**
   * One key for everything. What it opens depends on the nearest valid target,
   * which is exactly what the on-screen prompt already told the player.
   */
  private handleInteract(): void {
    const s = this.s;
    const it = s.prompt.interaction;
    switch (it.kind) {
      case "buildSlot":
        s.panels.openBuild();
        s.tutorial.report("openedBuildMenu");
        break;
      case "furnace":
        s.panels.openFurnace();
        s.tutorial.report("openedFurnace");
        break;
      case "collect":
        if (it.slot) this.collectFrom(it.slot.id);
        break;
      default:
        s.hud.toast("附近沒有可互動的目標");
        break;
    }
  }

  /** Manual pickup from a production building the hero is standing next to. */
  private collectFrom(slotId: string): void {
    const s = this.s;
    const building = s.buildings.slot(slotId)?.building;
    if (!building?.produces) return;
    const amount = building.takeBuffer();
    if (amount <= 0) return;
    const stored = s.store.add(building.produces, amount);
    if (stored > 0) {
      s.feedback.resourceGain(building.position.x, building.position.z, building.produces, stored);
      s.audio.play("coinPickup", 0.4);
    } else {
      s.hud.toast("已達資源上限，建造倉庫可解除");
    }
  }

  async start(): Promise<void> {
    await Promise.race([
      this.s.scene.whenReadyAsync(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
    ]);
    hideLoadingScreen();
    this.refitCamera();
    this.s.codex.onClose = () => this.closeCodex();
    this.s.markers.setStrength(this.s.markerStrength);
    this.openMainMenu();
    if (new URLSearchParams(window.location.search).get("uiVerification") === "1") {
      this.s.debug.toggleVerify();
    }
    this.s.engine.runRenderLoop(this.frame);
  }

  /** The tutorial runs on stage 1 with a practice flag so it is never ranked. */
  private startTutorial(): void {
    this.startRun("stage", "stage-1");
    this.s.tutorial.start();
    this.s.monitor.tagStressTest();
    this.s.hud.showBanner("教學關卡", "依照畫面提示操作，可隨時跳過", 3.5);
  }

  private openMainMenu(): void {
    this.inMenu = true;
    this.inCodex = false;
    this.paused = false;
    this.s.tutorial.stop();
    this.s.panels.closeAll();
    leaveRun(this.s);
    this.s.menus.showMainMenu(false);
  }

  private closeCodex(): void { this.inCodex = false; this.openMainMenu(); }

  private startRun(mode: "stage" | "endless", levelId?: string): void {
    beginRun(this.s, mode, levelId);
    this.support.reset(this.s.furnace.health);
    this.inMenu = false;
    this.paused = false;
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.s.input.clear();
    this.s.audio.setMuted(paused);
    this.s.events.emit("paused", { paused });
    this.inMenu = paused;
    if (paused) this.s.menus.showPause();
    else this.s.menus.hide();
  }

  private readonly frame = (): void => {
    if (this.disposed) return;
    renderFrame(this.s, this.paused || this.inMenu, (dt) => this.update(dt));
  };

  private update(dt: number): void {
    // The map's own redraw/animation runs on real wall-clock time even while
    // it slows the simulation below — otherwise the map itself would look
    // laggy the moment it is the thing causing the slowdown.
    this.s.mapView.update(dt, this.s);
    runFrame(this.s, dt * this.s.mapView.timeScale, this.support);
    this.inputDebug?.update();
  }

  private readonly onResize = (): void => {
    this.s.engine.resize();
    this.refitCamera();
  };

  /** Reframes so the whole wall ring stays on screen at the new aspect ratio. */
  private refitCamera(): void {
    const width = this.s.engine.getRenderWidth();
    const height = Math.max(1, this.s.engine.getRenderHeight());
    this.s.camera.refit(width / height);
  }

  // ------------------------------------------------------------ test hooks --

  stopLoop(): void { this.s.engine.stopRenderLoop(); }

  stepManually(dt: number, render = true): void {
    if (this.disposed) return;
    const frameDt = Math.min(0.05, dt);
    if (!this.paused && !this.inMenu) this.update(frameDt);
    else updateHaltedDeathLifecycle(this.s.squads, this.s.world, frameDt);
    if (render) this.s.scene.render();
  }

  debugSnapshot(): Record<string, number | string | boolean> {
    return buildSnapshot(this.s, this.inMenu);
  }

  debugApi(): Record<string, unknown> {
    return {
      ...createDebugApi(this.s, {
        startRun: (mode, levelId) => this.startRun(mode, levelId),
        startTutorial: () => this.startTutorial(),
      }),
      pointerDebug: () => ({ ...this.pointerRouter.debug }),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pointerRouter.dispose();
    this.inputDebug?.dispose();
    this.s.engine.stopRenderLoop();
    window.removeEventListener("resize", this.onResize);
    this.s.dispose();
  }
}
