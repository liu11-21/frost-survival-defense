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
import { tryDeployRecruit } from "./SquadDeploymentPolicy";
import { PointerRouter } from "../input/PointerRouter";
import { InputDebugOverlay } from "../ui/InputDebugOverlay";
import { updateHaltedDeathLifecycle } from "../combat/HaltedDeathLifecycle";
import { HeroReviewMode } from "../hero/HeroReviewMode";
import { HeroGameplayReviewMode } from "../hero/HeroGameplayReviewMode";
import { WarriorReviewMode } from "../warrior/WarriorReviewMode";

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
  private heroReview: HeroReviewMode | null = null;
  private heroGameplayReview: HeroGameplayReviewMode | null = null;
  private warriorReview: WarriorReviewMode | null = null;

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
      onRecruitDrop: (defId, x, z) => this.handleRecruitDrop(defId, x, z),
    });
    this.inputDebug =
      new URLSearchParams(window.location.search).get("inputDebug") === "1" ? new InputDebugOverlay(this.pointerRouter) : null;
  }

  /**
   * Mouse construction is deliberately a second way to select the SAME slot,
   * not a remote-build bypass. BuildingManager still performs affordability,
   * unlock, occupancy and placement legality. The old proximity interaction
   * remains available through E/B.
   */
  private handleSlotClick(slotId: string): void {
    const s = this.s;
    const slot = s.buildings.slot(slotId);
    if (!slot) return;
    s.panels.setNearbySlot(slot);
    s.arena.setSelected(slot.id);
    s.panels.openBuild();
    s.tutorial.report("openedBuildMenu");
  }

  /**
   * Recruitment spending stays inside RunController. The deployment policy
   * validates the full road from the furnace circle outward, the two-squad
   * central reserve and Engineer-only furnace deployment before any cost is
   * paid, then records the squad's lane/home metadata for AI.
   */
  private handleRecruitDrop(defId: string, x: number, z: number): void {
    const result = tryDeployRecruit(this.s, defId, x, z);
    this.s.hud.toast(result.message, result.ok ? undefined : "failure");
    if (result.ok) this.s.audio.play("uiConfirm", 0.65);
  }

  /** Game-event reactions: audio, VFX, boss tracking and run transitions. */
  private bindEvents(): void {
    const s = this.s;
    s.squads.onSquadWiped = (squad) => {
      s.squadHud.reportWipe(squad.def.id);
      s.hud.toast(`${squad.def.name}小隊全滅`, "failure");
    };
    s.events.on("squadRecruited", () => s.squadHud.markDirty());
    s.events.on("squadUpgraded", () => s.squadHud.markDirty());
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
      s.arena.setFurnaceLevel(p.level);
      s.squadHud.markDirty();
      s.feedback.burstAt("shock", 0, 0, 32);
      s.camera.shake(0.28);
    });
    s.events.on("gameOver", (p) => {
      s.audio.play(p.victory ? "victory" : "defeat", 1);
      this.inMenu = true;
      s.menus.showResult(p.victory, p.mode, p.wave, p.kills, p.seconds, s.monitor.isStressTagged);
    });
  }

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
      leaveMenu: () => { this.inMenu = false; },
    });
  }

  private handleAction(action: ActionKey): void {
    const s = this.s;
    if (this.heroReview || this.heroGameplayReview) return;
    if (action === "pause") {
      if (s.confirm.isOpen) { s.confirm.cancel(); return; }
      if (this.inCodex) { this.closeCodex(); return; }
      if (s.mapView.isOpen) { s.mapView.close(); return; }
      if (s.run.isOver) return;
      if (!this.inMenu && s.squadHud.highlight !== null) { s.squadHud.clearHighlight(); return; }
      if (!this.inMenu && s.panels.anyOpen) { s.panels.closeAll(); return; }
      if (this.paused) this.setPaused(false);
      else if (!this.inMenu) this.setPaused(true);
      return;
    }
    if (this.inMenu || this.paused || s.confirm.isOpen) return;
    if (s.mapView.isOpen && action !== "map") return;

    switch (action) {
      case "map": s.mapView.toggle(); break;
      case "interact": this.handleInteract(); break;
      case "confirm": s.panels.confirmFocused(); break;
      case "perfPanel": s.debug.togglePerf(); break;
      case "aiPanel": s.debug.toggleAi(); break;
      case "stressPanel": s.debug.openStress(); break;
      case "balancePanel": s.debug.toggleBalance(); break;
      case "verifyPanel": s.debug.toggleVerify(); break;
      case "build": s.panels.toggleBuild(); break;
      case "recruit":
        s.panels.toggleRecruit();
        if (s.panels.isRecruitOpen) s.tutorial.report("openedRecruit");
        break;
      case "upgrade": {
        const failure = s.run.tryUpgradeFurnace();
        if (failure) s.hud.toast(failure);
        break;
      }
      case "callWave": s.run.callNextWaveEarly(); break;
      case "toggleRebuild":
        if (!s.buildings.hasAutoRebuilder) { s.hud.toast("尚未建造自動重建站"); break; }
        s.buildings.autoRebuildEnabled = !s.buildings.autoRebuildEnabled;
        s.hud.toast(s.buildings.autoRebuildEnabled ? "自動重建已啟用" : "自動重建已停用");
        break;
      case "skill1": {
        const failure = s.heroSkills.tryUse("airSupport");
        if (failure) s.hud.toast(failure);
        break;
      }
      case "skill2": {
        const failure = s.heroSkills.tryUse("infiniteFirepower");
        if (failure) s.hud.toast(failure);
        break;
      }
      case "skill3": {
        const failure = s.heroSkills.tryUse("groundSupport");
        if (failure) s.hud.toast(failure);
        break;
      }
    }
  }

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
    } else s.hud.toast("已達資源上限，建造倉庫可解除");
  }

  async start(): Promise<void> {
    await Promise.race([
      this.s.scene.whenReadyAsync(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
    ]);
    const authoredPreload = this.s.assets.preload();
    await Promise.race([
      authoredPreload,
      new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
    ]);
    this.s.nodes.attachAuthoredAssets(this.s.assets);
    const heroApplied = this.s.hero.applyAuthoredAsset(this.s.assets);
    if (!heroApplied) {
      void authoredPreload.then(() => {
        if (this.s.hero.modelSource !== "GLB") {
          this.s.hero.applyAuthoredAsset(this.s.assets);
          this.heroReview?.refreshAuthored();
        }
      });
    }
    this.s.furnace.applyAuthoredAsset(this.s.assets);
    hideLoadingScreen();
    this.refitCamera();
    this.s.codex.onClose = () => this.closeCodex();
    this.s.markers.setStrength(this.s.markerStrength);
    const params = new URLSearchParams(window.location.search);
    if (params.get("heroGameplayReview") === "1") {
      this.startRun("stage", "stage-1");
      this.heroGameplayReview = new HeroGameplayReviewMode(this.s);
      this.heroGameplayReview.enter();
      this.inMenu = false;
      this.paused = false;
      this.s.engine.runRenderLoop(this.frame);
      return;
    }
    if (params.get("unitReview") === "warrior") {
      this.startRun("stage", "stage-1");
      this.warriorReview = new WarriorReviewMode(this.s);
      this.warriorReview.enter();
      this.inMenu = false;
      this.paused = false;
      this.s.engine.runRenderLoop(this.frame);
      return;
    }
    if (params.get("heroReview") === "1") {
      this.heroReview = new HeroReviewMode(this.s);
      this.heroReview.enter();
      this.inMenu = false;
      this.paused = false;
      this.s.engine.runRenderLoop(this.frame);
      return;
    }
    this.openMainMenu();
    if (new URLSearchParams(window.location.search).get("uiVerification") === "1") this.s.debug.toggleVerify();
    this.s.engine.runRenderLoop(this.frame);
  }

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
    if (this.heroReview) {
      this.heroReview.update(0.016);
      this.heroReview.beforeRender();
      this.s.scene.render();
      this.heroReview.afterRender();
      return;
    }
    if (this.heroGameplayReview) {
      this.heroGameplayReview.update(0.016);
      this.s.scene.render();
      return;
    }
    if (this.warriorReview) {
      this.warriorReview.update();
      this.s.scene.render();
      return;
    }
    renderFrame(this.s, this.paused || this.inMenu, (dt) => this.update(dt));
  };

  private update(dt: number): void {
    this.s.mapView.update(dt, this.s);
    runFrame(this.s, dt * this.s.mapView.timeScale, this.support);
    this.inputDebug?.update();
  }

  private readonly onResize = (): void => {
    this.s.engine.resize();
    this.refitCamera();
  };

  private refitCamera(): void {
    const width = this.s.engine.getRenderWidth();
    const height = Math.max(1, this.s.engine.getRenderHeight());
    this.s.camera.refit(width / height);
  }

  // ------------------------------------------------------------ test hooks --

  stopLoop(): void { this.s.engine.stopRenderLoop(); }

  renderReviewFrame(): void {
    this.heroGameplayReview?.renderFrame();
    this.warriorReview?.renderFrame();
  }

  stepManually(dt: number, render = true): void {
    if (this.disposed) return;
    const frameDt = Math.min(0.05, dt);
    if (this.heroReview) {
      this.heroReview.update(0.016);
      if (render) { this.heroReview.beforeRender(); this.s.scene.render(); }
      this.heroReview.afterRender();
      return;
    }
    if (this.heroGameplayReview) {
      this.heroGameplayReview.update(0.016);
      if (render) this.s.scene.render();
      return;
    }
    if (this.warriorReview) {
      if (render) this.warriorReview.renderFrame();
      else this.warriorReview.update();
      return;
    }
    if (!this.paused && !this.inMenu) this.update(frameDt);
    else updateHaltedDeathLifecycle(this.s.squads, this.s.world, frameDt);
    if (render) this.s.scene.render();
  }

  debugSnapshot(): Record<string, number | string | boolean> { return buildSnapshot(this.s, this.inMenu); }

  debugApi(): Record<string, unknown> {
    return {
      ...createDebugApi(this.s, {
        startRun: (mode, levelId) => this.startRun(mode, levelId),
        startTutorial: () => this.startTutorial(),
      }),
      heroReview: this.heroReview
        ? {
            setCamera: (mode: Parameters<HeroReviewMode["setCamera"]>[0]) => this.heroReview?.setCamera(mode),
            setAnimation: (animation: Parameters<HeroReviewMode["setAnimation"]>[0]) => this.heroReview?.setAnimation(animation),
            setLod: (lod: Parameters<HeroReviewMode["setLod"]>[0]) => this.heroReview?.setLod(lod),
            resetPerformance: () => this.heroReview?.resetPerformance(),
            capture: () => this.heroReview?.capture() ?? null,
            state: () => this.heroReview?.panelState() ?? null,
          }
        : null,
      heroGameplayReview: this.heroGameplayReview
        ? {
            setCamera: (mode: Parameters<HeroGameplayReviewMode["setCamera"]>[0]) => this.heroGameplayReview?.setCamera(mode),
            setLighting: (lighting: Parameters<HeroGameplayReviewMode["setLighting"]>[0]) => this.heroGameplayReview?.setLighting(lighting),
            setContext: (context: Parameters<HeroGameplayReviewMode["setContext"]>[0]) => this.heroGameplayReview?.setContext(context),
            setAnimation: (animation: Parameters<HeroGameplayReviewMode["setAnimation"]>[0]) => this.heroGameplayReview?.setAnimation(animation),
            seekAnimation: (normalized: number) => this.heroGameplayReview?.seekAnimation(normalized),
            setLod: (lod: Parameters<HeroGameplayReviewMode["setLod"]>[0]) => this.heroGameplayReview?.setLod(lod),
            setAutoLod: (enabled = true) => this.heroGameplayReview?.setAutoLod(enabled),
            renderFrame: () => this.heroGameplayReview?.renderFrame(),
            capture: () => this.heroGameplayReview?.capture() ?? null,
            state: () => this.heroGameplayReview?.state() ?? null,
          }
        : null,
      warriorReview: this.warriorReview
        ? {
            setCamera: (mode: Parameters<WarriorReviewMode["setCamera"]>[0]) => this.warriorReview?.setCamera(mode),
            setAnimation: (animation: Parameters<WarriorReviewMode["setAnimation"]>[0]) => this.warriorReview?.setAnimation(animation),
            seekAnimation: (normalized: number) => this.warriorReview?.seekAnimation(normalized),
            setLod: (lod: Parameters<WarriorReviewMode["setLod"]>[0]) => this.warriorReview?.setLod(lod),
            setAutoLod: (enabled = true) => this.warriorReview?.setAutoLod(enabled),
            renderFrame: () => this.warriorReview?.renderFrame(),
            capture: () => this.warriorReview?.capture() ?? null,
            state: () => this.warriorReview?.state() ?? null,
          }
        : null,
      pointerDebug: () => ({ ...this.pointerRouter.debug }),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pointerRouter.dispose();
    this.inputDebug?.dispose();
    this.s.engine.stopRenderLoop();
    this.heroReview?.dispose();
    this.heroReview = null;
    this.heroGameplayReview?.dispose();
    this.heroGameplayReview = null;
    this.warriorReview?.dispose();
    this.warriorReview = null;
    window.removeEventListener("resize", this.onResize);
    this.s.dispose();
  }
}
