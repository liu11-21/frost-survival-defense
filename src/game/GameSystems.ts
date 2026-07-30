import { Engine, Scene, Vector3 } from "@babylonjs/core";
import type { DefaultRenderingPipeline } from "@babylonjs/core";
import { BuildingManager } from "../buildings/BuildingManager";
import { GameCamera } from "../camera/GameCamera";
import { createCombatContext } from "../combat/CombatDirector";
import { neutralScaling, type CombatContext, type CombatScaling } from "../combat/CombatContext";
import { CombatWorld } from "../combat/CombatWorld";
import { HumanoidTemplateCache } from "../combat/LiteHumanoid";
import { ProjectilePool } from "../combat/ProjectilePool";
import { SquadManager } from "../combat/SquadManager";
import { AudioManager } from "../effects/AudioManager";
import { CombatFeedback } from "../effects/CombatFeedback";
import { EffectSettingsState } from "../effects/EffectSettingsState";
import { VFXManager } from "../effects/VFXManager";
import { PickupPool } from "../economy/PickupPool";
import { ResourceStore } from "../economy/ResourceStore";
import { EnemyNavigator } from "../enemies/EnemyNavigator";
import { LaneGateManager } from "../enemies/LaneGates";
import { WaveManager } from "../enemies/WaveManager";
import { FactionMarkers, type MarkerStrength } from "../effects/FactionMarkers";
import {
  loadDamageNumbersSetting,
  loadFlashIntensitySetting,
  loadFpsHudSetting,
  loadMarkerStrength,
  loadScreenShakeSetting,
  saveDamageNumbersSetting,
  saveFlashIntensitySetting,
  saveFpsHudSetting,
  saveMarkerStrength,
  saveScreenShakeSetting,
  type FlashIntensity,
} from "./UiSettings";
import { LaneMarkers } from "../scene/LaneMarkers";
import { SquadStatusHud } from "../ui/SquadStatusHud";
import { LaneHud } from "../ui/LaneHud";
import { EdgeIndicators } from "../ui/EdgeIndicators";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CodexScreen } from "../ui/CodexScreen";
import { HoverPicker } from "../ui/HoverPicker";
import { Furnace } from "../heat/Furnace";
import { HeatSystem } from "../heat/HeatSystem";
import { HeroController } from "../hero/HeroController";
import { HeroSkills } from "../hero/HeroSkills";
import { HeroStats } from "../hero/HeroStats";
import { Leaderboard } from "../modes/Leaderboard";
import { RunController } from "../modes/RunController";
import { ArenaBuilder } from "../scene/ArenaBuilder";
import { LightingSetup } from "../scene/LightingSetup";
import { MaterialFactory } from "../scene/MaterialFactory";
import { createEngine, createScene } from "../scene/SceneFactory";
import { ActionPanels } from "../ui/ActionPanels";
import { GameHud } from "../ui/GameHud";
import { GameMenus } from "../ui/GameMenus";
import { buildUI, type UIRefs } from "../ui/UIRoot";
import { MapView } from "../ui/MapView";
import { SlotPicker } from "../ui/SlotPicker";
import { AttackRangeVisual } from "../buildings/AttackRangeVisual";
import type { BuildingType } from "../data/BuildingDefinitions";
import { UpgradeState } from "../data/UpgradeDefinitions";
import { CollisionWorld } from "../util/Collision";
import { PlayerInput } from "../player/PlayerInput";
import { AIWatchdog } from "../ai/AIWatchdog";
import { DeathResidueGuard } from "../ai/DeathResidueGuard";
import { BossController } from "../enemies/BossController";
import { AdaptiveQualityManager } from "../performance/AdaptiveQualityManager";
import { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { StressTestController } from "../performance/StressTestController";
import { ResourceNodeManager } from "../resources/ResourceNodeManager";
import { FloatingCombatTextManager } from "../ui/FloatingCombatTextManager";
import { HealthBarManager } from "../ui/HealthBarManager";
import { ContextPrompt } from "../ui/ContextPrompt";
import { DebugPanels, defaultBalanceKnobs, type BalanceKnobs } from "../ui/DebugPanels";
import { HeroSkillHud } from "../ui/HeroSkillHud";
import { TutorialController } from "../ui/TutorialController";
import { GameEvents } from "./GameEvents";

/**
 * Constructs every subsystem exactly once and holds them. `Game` owns the frame
 * loop and the rules glue; this file owns the wiring.
 */
export class GameSystems {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly pipeline: DefaultRenderingPipeline;
  readonly events = new GameEvents();
  readonly materials: MaterialFactory;
  readonly collision = new CollisionWorld();
  readonly lighting: LightingSetup;
  readonly heat: HeatSystem;
  readonly camera: GameCamera;
  readonly world = new CombatWorld();
  readonly scaling: CombatScaling = neutralScaling();
  readonly projectiles: ProjectilePool;
  readonly vfx: VFXManager;
  readonly audio = new AudioManager();
  readonly feedback: CombatFeedback;
  readonly ctx: CombatContext;
  readonly templates: HumanoidTemplateCache;
  readonly squads: SquadManager;
  readonly store: ResourceStore;
  readonly pickups: PickupPool;
  readonly furnace: Furnace;
  readonly buildings: BuildingManager;
  readonly arena: ArenaBuilder;
  readonly nodes: ResourceNodeManager;
  readonly heroStats: HeroStats;
  readonly hero: HeroController;
  readonly heroSkills: HeroSkills;
  readonly heroSkillHud: HeroSkillHud;
  readonly waves: WaveManager;
  readonly gates: LaneGateManager;
  readonly navigator: EnemyNavigator;
  readonly markers: FactionMarkers;
  readonly laneMarkers: LaneMarkers;
  readonly squadHud: SquadStatusHud;
  readonly laneHud: LaneHud;
  readonly edges: EdgeIndicators;
  readonly confirm: ConfirmDialog;
  readonly codex: CodexScreen;
  readonly hover: HoverPicker;
  readonly run: RunController;
  readonly input: PlayerInput;
  readonly refs: UIRefs;
  readonly hud: GameHud;
  readonly panels: ActionPanels;
  readonly menus: GameMenus;
  readonly leaderboard = new Leaderboard();
  readonly upgrades = new UpgradeState();
  readonly cameraFocus = new Vector3();
  readonly healthBars: HealthBarManager;
  readonly combatText: FloatingCombatTextManager;
  readonly monitor: PerformanceMonitor;
  readonly quality: AdaptiveQualityManager;
  readonly stress: StressTestController;
  readonly boss: BossController;
  readonly watchdog: AIWatchdog;
  readonly residueGuard: DeathResidueGuard;
  readonly prompt: ContextPrompt;
  readonly tutorial: TutorialController;
  readonly debug: DebugPanels;
  readonly mapView: MapView;
  readonly slotPicker: SlotPicker;
  readonly attackRangeVisual: AttackRangeVisual;
  /** Set by hovering a not-yet-built attack building's build-menu card;
   * cleared on mouse-leave. The range display reads the exact same
   * definition data real combat does, never a separate hardcoded preview. */
  rangePreview: { x: number; z: number; type: BuildingType } | null = null;
  readonly balance: BalanceKnobs = defaultBalanceKnobs();
  /** Set by the balance / stress tools; blocks leaderboard writes. */
  onBalanceAction: ((action: string) => void) | null = null;
  /** Boss slam telemetry, read only by the automated test harness. */
  readonly bossTelemetry = { warned: 0, landed: 0, maxFractionDealt: 0 };
  private markerSetting: MarkerStrength = loadMarkerStrength();
  private fpsHudSetting: boolean = loadFpsHudSetting();
  private damageNumbersSetting: boolean = loadDamageNumbersSetting();
  private screenShakeSetting: boolean = loadScreenShakeSetting();
  private flashIntensitySetting: FlashIntensity = loadFlashIntensitySetting();

  constructor(canvas: HTMLCanvasElement) {
    this.engine = createEngine(canvas);
    const bundle = createScene(this.engine);
    this.scene = bundle.scene;
    this.pipeline = bundle.pipeline;

    this.materials = new MaterialFactory(this.scene);
    this.lighting = new LightingSetup(this.scene);
    this.camera = new GameCamera(this.scene);
    this.pipeline.addCamera(this.camera.camera);

    this.heat = new HeatSystem(this.scene);
    this.heat.setSunDirection(this.lighting.sunDirection);

    this.furnace = new Furnace(this.scene, this.materials, this.lighting, this.collision);
    this.heat.addSource(this.furnace.heat);
    this.world.furnace = this.furnace;

    this.projectiles = new ProjectilePool(this.scene, this.materials, 44);
    this.vfx = new VFXManager(this.scene, this.furnace.emitter);
    this.vfx.setFurnaceLevel(1);
    this.healthBars = new HealthBarManager(this.scene, this.camera);
    this.combatText = new FloatingCombatTextManager(this.scene);
    this.feedback = new CombatFeedback(
      this.scene,
      this.materials,
      this.vfx,
      this.audio,
      this.camera,
      this.healthBars,
      this.combatText,
    );
    this.store = new ResourceStore(this.events);
    this.pickups = new PickupPool(this.scene, this.materials, 90);

    this.ctx = createCombatContext(this.world, this.collision, this.projectiles, this.feedback, this.scaling, {
      onKill: (unit) => this.run.reportKill(unit),
      onStructureHit: (target, x, z) => {
        this.feedback.buildingHit(x, z);
        this.audio.play(target.kind === "wall" ? "wallHit" : "wallHit", 0.4, 0.9 + Math.random() * 0.2);
      },
      onFurnaceHit: () => {
        this.audio.play("furnaceDamaged", 0.5, 0.9 + Math.random() * 0.2);
        this.camera.shake(0.05);
      },
    });

    this.templates = new HumanoidTemplateCache(this.scene, this.materials);
    this.squads = new SquadManager(this.templates, this.ctx);
    this.buildings = new BuildingManager(
      this.scene,
      this.materials,
      this.events,
      this.store,
      this.world,
      this.pickups,
      this.collision,
    );
    this.buildings.onStructureDamaged = (building) => this.healthBars.reveal(building);
    // SquadManager is built first so its constructor never depends on a
    // BuildingManager that does not exist yet; the engineer's repair search
    // is the only thing that needs the reference, so it is wired here instead.
    this.squads.buildings = this.buildings;
    this.arena = new ArenaBuilder(this.scene, this.materials, this.buildings.slots);

    this.nodes = new ResourceNodeManager(this.scene, this.materials, this.collision);

    this.heroStats = new HeroStats(this.upgrades);
    this.hero = new HeroController(this.scene, this.materials, this.heroStats, this.ctx, this.collision);
    this.world.hero = this.hero;
    this.heroSkills = new HeroSkills(this.hero, this.ctx, this.buildings, this.squads);

    this.waves = new WaveManager(this.squads, this.events);
    this.gates = new LaneGateManager(this.buildings);
    this.navigator = new EnemyNavigator(this.world, this.gates);
    this.markers = new FactionMarkers(this.scene, this.world);
    this.laneMarkers = new LaneMarkers(this.scene, this.materials);
    this.boss = new BossController(this.scene, this.events);
    this.watchdog = new AIWatchdog(this.squads, this.world);
    this.residueGuard = new DeathResidueGuard(this.world);
    this.monitor = new PerformanceMonitor(this.engine, this.scene);
    this.quality = new AdaptiveQualityManager(this.engine, this.scene, this.pipeline);
    // `particleScale` was defined on every quality profile but never actually
    // read anywhere; wiring it here is what makes "effect quality" real.
    this.vfx.particleScale = this.quality.profile.particleScale;
    this.quality.onChanged = (_level, profile) => {
      this.vfx.particleScale = profile.particleScale;
    };
    this.stress = new StressTestController(this.squads, this.monitor);

    this.run = new RunController({
      upgrades: this.upgrades,
      events: this.events,
      store: this.store,
      squads: this.squads,
      waves: this.waves,
      buildings: this.buildings,
      furnace: this.furnace,
      hero: this.hero,
      heroStats: this.heroStats,
      heroSkills: this.heroSkills,
      pickups: this.pickups,
      scaling: this.scaling,
    });

    this.input = new PlayerInput(canvas);
    this.refs = buildUI();
    this.menus = new GameMenus(this.refs, this.leaderboard);
    this.hud = new GameHud({
      refs: this.refs,
      events: this.events,
      store: this.store,
      hero: this.hero,
      heroStats: this.heroStats,
      furnace: this.furnace,
      waves: this.waves,
      squads: this.squads,
      buildings: this.buildings,
      run: this.run,
      monitor: this.monitor,
    });
    this.hud.setFpsVisible(this.fpsHudSetting);
    EffectSettingsState.damageNumbersEnabled = this.damageNumbersSetting;
    EffectSettingsState.screenShakeEnabled = this.screenShakeSetting;
    EffectSettingsState.flashIntensity = this.flashIntensitySetting === "low" ? 0.6 : this.flashIntensitySetting === "high" ? 1.5 : 1;
    this.panels = new ActionPanels({
      refs: this.refs,
      buildings: this.buildings,
      store: this.store,
      squads: this.squads,
      run: this.run,
      furnace: this.furnace,
      heroStats: this.heroStats,
      world: this.world,
      waves: this.waves,
      onRangePreview: (preview) => {
        this.rangePreview = preview;
      },
    });
    this.panels.onToast = (text) => this.hud.toast(text);

    this.squadHud = new SquadStatusHud(
      this.refs.squadHud,
      this.refs.squadHudHeader,
      this.refs.squadHudList,
      this.refs.engineerHud,
      this.refs.engineerHudHeader,
      this.refs.engineerHudList,
      this.squads,
      this.run,
    );
    this.squadHud.onHighlight = (defId) => this.markers.setHighlight(defId);
    this.laneHud = new LaneHud(this.refs.laneHud, this.refs.laneHudList, this.world, this.waves, this.gates);
    this.heroSkillHud = new HeroSkillHud(this.refs.heroSkillBar, this.heroSkills);
    this.edges = new EdgeIndicators(this.refs.edgeLayer, this.world, this.camera);
    this.confirm = new ConfirmDialog(this.refs.confirm, this.refs.confirmBody);
    this.codex = new CodexScreen(this.refs.screenBody);
    this.hover = new HoverPicker(this.world, this.camera);

    this.prompt = new ContextPrompt(this.buildings, this.furnace, this.nodes, this.run);
    this.tutorial = new TutorialController(this.events);
    this.debug = new DebugPanels(this.refs.root, {
      monitor: this.monitor,
      quality: this.quality,
      stress: this.stress,
      watchdog: this.watchdog,
      residueGuard: this.residueGuard,
      squads: this.squads,
      balance: this.balance,
      onBalanceAction: (action) => this.onBalanceAction?.(action),
      world: this.world,
      buildings: this.buildings,
      healthBars: this.healthBars,
      markers: this.markers,
      onVerifyOpened: () => this.monitor.tagStressTest(),
      waves: this.waves,
      run: this.run,
    });

    this.mapView = new MapView(this.refs);
    this.slotPicker = new SlotPicker(this.scene);
    this.attackRangeVisual = new AttackRangeVisual(this.scene);

    this.registerShadowCasters();
    this.camera.bindFollowTarget(this.cameraFocus, this.hero.velocity);
  }

  /** Faction-badge strength. Stored per browser, like the quality setting. */
  get markerStrength(): MarkerStrength {
    return this.markerSetting;
  }

  setMarkerStrength(strength: MarkerStrength): void {
    this.markerSetting = strength;
    this.markers.setStrength(strength);
    saveMarkerStrength(strength);
  }

  /** Whether the general HUD's FPS readout is shown. Defaults to on. */
  get fpsHudVisible(): boolean {
    return this.fpsHudSetting;
  }

  setFpsHudVisible(visible: boolean): void {
    this.fpsHudSetting = visible;
    this.hud.setFpsVisible(visible);
    saveFpsHudSetting(visible);
  }

  get damageNumbersEnabled(): boolean {
    return this.damageNumbersSetting;
  }
  setDamageNumbersEnabled(enabled: boolean): void {
    this.damageNumbersSetting = enabled;
    EffectSettingsState.damageNumbersEnabled = enabled;
    saveDamageNumbersSetting(enabled);
  }

  get screenShakeEnabled(): boolean {
    return this.screenShakeSetting;
  }
  setScreenShakeEnabled(enabled: boolean): void {
    this.screenShakeSetting = enabled;
    EffectSettingsState.screenShakeEnabled = enabled;
    saveScreenShakeSetting(enabled);
  }

  get flashIntensity(): FlashIntensity {
    return this.flashIntensitySetting;
  }
  setFlashIntensity(level: FlashIntensity): void {
    this.flashIntensitySetting = level;
    EffectSettingsState.flashIntensity = level === "low" ? 0.6 : level === "high" ? 1.5 : 1;
    saveFlashIntensitySetting(level);
  }

  private registerShadowCasters(): void {
    this.lighting.addCasters(this.furnace.castMeshes);
    this.lighting.addCasters(this.hero.avatar.rig.meshes);
    for (const node of this.nodes.nodes) this.lighting.addCasters(node.viewMeshes);
  }

  dispose(): void {
    this.mapView.dispose();
    this.slotPicker.dispose();
    this.attackRangeVisual.dispose();
    this.markers.dispose();
    this.edges.dispose();
    this.templates.clearPools();
    this.healthBars.dispose();
    this.combatText.dispose();
    this.boss.dispose();
    this.nodes.dispose();
    this.input.dispose();
    this.hud.dispose();
    this.projectiles.dispose();
    this.pickups.dispose();
    this.vfx.dispose();
    this.audio.dispose();
    this.heat.dispose();
    this.materials.dispose();
    this.events.dispose();
    this.scene.dispose();
    this.engine.dispose();
  }
}
