import { Color3, Matrix, Vector3 } from "@babylonjs/core";
import type { GameSystems } from "../game/GameSystems";
import type { CombatUnit } from "../combat/CombatUnit";

export type HeroGameplayReviewCamera = "gameplay" | "tactical" | "three-quarter" | "back";
export type HeroGameplayReviewLighting = "snow-daylight" | "furnace-warm";
export type HeroGameplayReviewAnimation = "Idle" | "Walk" | "Run" | "MeleeAttack" | "RangedAttack" | "Hit" | "Death";
export type HeroGameplayReviewContext = "alone" | "friends" | "battle";
export type HeroGameplayReviewLod = 0 | 1 | 2;

export interface HeroGameplayReviewCaptureMetadata {
  captureMode: "heroGameplayReview=1";
  cameraMode: HeroGameplayReviewCamera;
  lighting: HeroGameplayReviewLighting;
  animation: HeroGameplayReviewAnimation;
  context: HeroGameplayReviewContext;
  lod: HeroGameplayReviewLod;
  lodMode: "auto" | "forced";
  modelSource: "GLB" | "procedural";
  heroWorldPosition: { x: number; y: number; z: number };
  screenSpaceBoundingBox: { x: number; y: number; width: number; height: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  authoredVisibleMeshCount: number;
  proceduralVisibleMeshCount: number;
  allyCount: number;
  enemyCount: number;
  visible: boolean;
  uiOccluded: boolean;
  animationNormalized: number;
  boneTransforms: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;
  fps: number;
  drawCalls: number;
  activeMeshes: number;
  animationGroups: string[];
}

interface SavedLightState {
  sunIntensity: number;
  furnaceIntensity: number;
  furnaceRange: number;
  furnaceDiffuse: Color3;
}

/**
 * Development-only art review that reuses the formal game arena, furnace,
 * lighting, Hero instance, and real ally/enemy spawn paths. It freezes the
 * simulation so the evidence frames are stable; normal gameplay is untouched.
 */
export class HeroGameplayReviewMode {
  private readonly panel: HTMLDivElement;
  private cameraMode: HeroGameplayReviewCamera = "gameplay";
  private lighting: HeroGameplayReviewLighting = "snow-daylight";
  private animation: HeroGameplayReviewAnimation = "Idle";
  private context: HeroGameplayReviewContext = "battle";
  private lod: HeroGameplayReviewLod = 0;
  private lodMode: "auto" | "forced" = "forced";
  private readonly savedLight: SavedLightState;
  private reviewUnits: CombatUnit[] = [];
  private readonly originalPositions = new Map<number, { x: number; z: number }>();

  constructor(private readonly s: GameSystems) {
    const furnaceLight = s.lighting.furnaceLight;
    this.savedLight = {
      sunIntensity: s.lighting.sun.intensity,
      furnaceIntensity: furnaceLight.intensity,
      furnaceRange: furnaceLight.range,
      furnaceDiffuse: furnaceLight.diffuse.clone(),
    };
    this.panel = document.createElement("div");
    this.panel.id = "heroGameplayReviewPanel";
    this.panel.className = "hero-gameplay-review-panel";
    this.panel.innerHTML = `
      <div class="hero-gameplay-review-title">HERO GAMEPLAY REVIEW</div>
      <div data-review-source>Hero Model Source: --</div>
      <div data-review-camera>Camera: --</div>
      <div data-review-lighting>Lighting: --</div>
      <div data-review-context>Context: --</div>
      <div data-review-animation>Animation: --</div>
      <div data-review-lod>LOD: --</div>
      <div data-review-roster>Allies / enemies: --</div>
      <div data-review-geometry>Authored / procedural: --</div>
      <div data-review-performance>FPS / draw calls / active meshes: --</div>
      <div data-review-bounds>Hero bounds: --</div>`;
    s.refs.root.appendChild(this.panel);
    document.body.classList.add("hero-gameplay-review");
  }

  enter(): void {
    // Use the real run reset and combat spawn paths, but leave the simulation
    // halted so the review captures are comparable frame to frame.
    this.s.hero.setPosition(0, -4.5);
    this.s.hero.avatar.setYawImmediate(0);
    this.s.squads.recruit("warrior", -2.5, -1.0, this.s.furnace.currentLevel);
    this.s.squads.recruit("shield", 2.4, -0.6, this.s.furnace.currentLevel);
    this.s.squads.recruit("archer", -3.8, 1.8, this.s.furnace.currentLevel);
    this.s.squads.recruit("flagbearer", 0.3, 2.6, this.s.furnace.currentLevel);
    this.s.squads.spawnEnemy("juggernaut", 0.0, 9.0, 0);
    this.s.squads.spawnEnemy("commander", -5.4, 10.5, 1);
    this.s.squads.spawnEnemy("flyingColossus", 5.2, 10.0, 2);
    this.reviewUnits = [...this.s.world.allies, ...this.s.world.enemies];
    this.originalPositions.clear();
    for (const unit of this.reviewUnits) {
      this.originalPositions.set(unit.damageId, { x: unit.position.x, z: unit.position.z });
    }
    this.setContext(this.context);
    this.setLighting(this.lighting);
    if (this.lodMode === "auto") this.s.hero.setReviewLodAuto();
    else this.s.hero.setReviewLod(this.lod);
    this.s.hero.setReviewAnimation(this.animation);
    this.setCamera(this.cameraMode);
    this.updatePanel(this.capture());
  }

  update(dt = 0.016): void {
    this.s.hero.updateReview(dt);
    const metadata = this.capture();
    this.updatePanel(metadata);
    this.publishTestState(metadata);
  }

  /** Render one paused frame after a deterministic animation seek. */
  renderFrame(): void {
    this.s.scene.render();
    const metadata = this.capture();
    this.updatePanel(metadata);
    this.publishTestState(metadata);
  }

  setCamera(mode: HeroGameplayReviewCamera): void {
    this.cameraMode = mode;
    const camera = this.s.camera.camera;
    const presets: Record<HeroGameplayReviewCamera, { position: Vector3; target: Vector3; fov: number }> = {
      gameplay: { position: new Vector3(0, 10.5, -14.5), target: new Vector3(0, 0.7, 2.0), fov: 0.72 },
      tactical: { position: new Vector3(0, 12.5, -16.0), target: new Vector3(0, 0.8, 1.8), fov: 0.58 },
      "three-quarter": { position: new Vector3(10.0, 9.2, -13.0), target: new Vector3(0, 0.8, 1.8), fov: 0.76 },
      back: { position: new Vector3(0, 8.2, 9.0), target: new Vector3(0, 0.8, -2.2), fov: 0.72 },
    };
    const preset = presets[mode];
    camera.position.copyFrom(preset.position);
    camera.setTarget(preset.target);
    camera.fov = preset.fov;
  }

  setLighting(lighting: HeroGameplayReviewLighting): void {
    this.lighting = lighting;
    const furnaceLight = this.s.lighting.furnaceLight;
    if (lighting === "furnace-warm") {
      this.s.lighting.sun.intensity = 0.62;
      furnaceLight.intensity = 270;
      furnaceLight.range = 30;
      furnaceLight.diffuse = new Color3(1.0, 0.40, 0.10);
    } else {
      this.s.lighting.sun.intensity = 1.32;
      furnaceLight.intensity = 92;
      furnaceLight.range = 22;
      furnaceLight.diffuse = new Color3(0.72, 0.82, 1.0);
    }
  }

  setAnimation(animation: HeroGameplayReviewAnimation): void {
    this.animation = animation;
    this.s.hero.setReviewAnimation(animation);
  }

  seekAnimation(normalized: number): void {
    this.s.hero.seekReviewAnimation(normalized);
    const metadata = this.capture();
    this.updatePanel(metadata);
    this.publishTestState(metadata);
  }

  setLod(lod: HeroGameplayReviewLod): void {
    this.lodMode = "forced";
    this.lod = lod;
    this.s.hero.setReviewLod(lod);
  }

  setAutoLod(enabled = true): void {
    this.lodMode = enabled ? "auto" : "forced";
    if (enabled) this.s.hero.setReviewLodAuto();
    else this.s.hero.setReviewLod(this.lod);
  }

  /** Chooses which real combat actors are framed for a human review capture. */
  setContext(context: HeroGameplayReviewContext): void {
    this.context = context;
    for (const unit of this.reviewUnits) {
      const original = this.originalPositions.get(unit.damageId);
      if (!original) continue;
      const isAlly = unit.faction === "ally";
      const visibleInContext = context === "battle" || (context === "friends" ? isAlly : false);
      unit.setPosition(visibleInContext ? original.x : 70, visibleInContext ? original.z : 70);
    }
  }

  capture(): HeroGameplayReviewCaptureMetadata {
    const canvas = this.s.engine.getRenderingCanvas();
    const renderWidth = Math.max(1, this.s.engine.getRenderWidth());
    const renderHeight = Math.max(1, this.s.engine.getRenderHeight());
    const cssWidth = canvas?.clientWidth || renderWidth;
    const cssHeight = canvas?.clientHeight || renderHeight;
    const viewport = this.s.camera.camera.viewport.toGlobal(renderWidth, renderHeight);
    const scaleX = cssWidth / renderWidth;
    const scaleY = cssHeight / renderHeight;
    const projected: Vector3[] = [];
    for (const mesh of this.s.hero.authoredMeshes) {
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      // Without this a skinned mesh's bounding box stays frozen at its rest
      // pose, so these bounds described the Idle silhouette no matter which
      // animation was selected -- the same defect already fixed in
      // WarriorReviewMode. Every bounds assertion in the Hero gameplay suite
      // was checking a static box.
      if (mesh.skeleton) mesh.refreshBoundingInfo({ applySkeleton: true });
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        projected.push(Vector3.Project(corner, Matrix.Identity(), this.s.scene.getTransformMatrix(), viewport));
      }
    }
    const minX = projected.length > 0 ? Math.min(...projected.map((p) => p.x)) * scaleX : 0;
    const maxX = projected.length > 0 ? Math.max(...projected.map((p) => p.x)) * scaleX : 0;
    const minY = projected.length > 0 ? Math.min(...projected.map((p) => p.y)) * scaleY : 0;
    const maxY = projected.length > 0 ? Math.max(...projected.map((p) => p.y)) * scaleY : 0;
    const screenSpaceBoundingBox = {
      x: round(minX),
      y: round(minY),
      width: round(maxX - minX),
      height: round(maxY - minY),
      right: round(maxX),
      bottom: round(maxY),
    };
    const visible = screenSpaceBoundingBox.width > 0 && screenSpaceBoundingBox.height > 0 && screenSpaceBoundingBox.x >= 0 && screenSpaceBoundingBox.y >= 0 && screenSpaceBoundingBox.right <= cssWidth && screenSpaceBoundingBox.bottom <= cssHeight;
    const panelRect = this.panel.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const uiPanel = canvasRect
      ? { x: panelRect.left - canvasRect.left, y: panelRect.top - canvasRect.top, width: panelRect.width, height: panelRect.height }
      : null;
    const uiOccluded = uiPanel ? overlaps(screenSpaceBoundingBox, uiPanel) : false;
    const drawCalls = Math.max(0, Math.round((this.s.engine as unknown as { _drawCalls?: { current?: number } })._drawCalls?.current ?? 0));
    return {
      captureMode: "heroGameplayReview=1",
      cameraMode: this.cameraMode,
      lighting: this.lighting,
      animation: this.animation,
      context: this.context,
      lod: this.s.hero.reviewLod,
      lodMode: this.lodMode,
      modelSource: this.s.hero.modelSource,
      heroWorldPosition: vector(this.s.hero.position),
      screenSpaceBoundingBox,
      viewport: { width: cssWidth, height: cssHeight },
      authoredVisibleMeshCount: this.s.hero.authoredVisibleMeshCount,
      proceduralVisibleMeshCount: this.s.hero.proceduralVisibleMeshCount,
      allyCount: this.s.world.allies.filter((unit) => unit.alive).length,
      enemyCount: this.s.world.enemies.filter((unit) => unit.alive).length,
      visible,
      uiOccluded,
      animationNormalized: this.s.hero.reviewAnimationNormalized,
      boneTransforms: this.s.hero.reviewBoneSnapshot,
      fps: round(this.s.engine.getFps()),
      drawCalls,
      activeMeshes: this.s.scene.getActiveMeshes().length,
      animationGroups: [...this.s.hero.authoredAnimationNames],
    };
  }

  state(): HeroGameplayReviewCaptureMetadata & { ready: boolean } {
    const metadata = this.capture();
    return {
      ...metadata,
      ready: metadata.modelSource === "GLB" && metadata.authoredVisibleMeshCount > 0 && metadata.proceduralVisibleMeshCount === 0 && metadata.allyCount >= 4 && metadata.enemyCount >= 4 && metadata.visible && !metadata.uiOccluded,
    };
  }

  dispose(): void {
    this.s.lighting.sun.intensity = this.savedLight.sunIntensity;
    const furnaceLight = this.s.lighting.furnaceLight;
    furnaceLight.intensity = this.savedLight.furnaceIntensity;
    furnaceLight.range = this.savedLight.furnaceRange;
    furnaceLight.diffuse = this.savedLight.furnaceDiffuse;
    this.panel.remove();
    document.body.classList.remove("hero-gameplay-review");
    delete window.__heroGameplayReviewState;
  }

  private updatePanel(metadata: HeroGameplayReviewCaptureMetadata): void {
    const text = (selector: string): HTMLElement | null => this.panel.querySelector<HTMLElement>(selector);
    text("[data-review-source]")!.textContent = `Hero Model Source: ${metadata.modelSource}`;
    text("[data-review-camera]")!.textContent = `Camera: ${metadata.cameraMode}`;
    text("[data-review-lighting]")!.textContent = `Lighting: ${metadata.lighting}`;
    text("[data-review-context]")!.textContent = `Context: ${metadata.context}`;
    text("[data-review-animation]")!.textContent = `Animation: ${metadata.animation} (${metadata.animationNormalized.toFixed(2)})`;
    text("[data-review-lod]")!.textContent = `LOD: LOD${metadata.lod}`;
    text("[data-review-roster]")!.textContent = `Allies / enemies: ${metadata.allyCount} / ${metadata.enemyCount}`;
    text("[data-review-geometry]")!.textContent = `Authored / procedural: ${metadata.authoredVisibleMeshCount} / ${metadata.proceduralVisibleMeshCount}`;
    text("[data-review-performance]")!.textContent = `FPS / draw calls / active meshes: ${metadata.fps} / ${metadata.drawCalls} / ${metadata.activeMeshes}`;
    text("[data-review-bounds]")!.textContent = `Hero bounds: ${metadata.screenSpaceBoundingBox.width}×${metadata.screenSpaceBoundingBox.height}`;
  }

  private publishTestState(metadata: HeroGameplayReviewCaptureMetadata): void {
    const state = this.state();
    window.__heroGameplayReviewState = {
      ...state,
      currentCamera: metadata.cameraMode,
      currentAnimation: metadata.animation,
      currentLod: `LOD${metadata.lod}` as "LOD0" | "LOD1" | "LOD2",
      lighting: metadata.lighting,
      context: metadata.context,
      lod: metadata.lod,
      authoredVisibleMeshes: metadata.authoredVisibleMeshCount,
      proceduralVisibleMeshes: metadata.proceduralVisibleMeshCount,
      heroScreenBounds: { ...metadata.screenSpaceBoundingBox, visible: metadata.visible },
      animationGroups: metadata.animationGroups,
      consoleErrors: [],
    };
  }
}

function vector(value: Vector3): { x: number; y: number; z: number } {
  return { x: round(value.x), y: round(value.y), z: round(value.z) };
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
