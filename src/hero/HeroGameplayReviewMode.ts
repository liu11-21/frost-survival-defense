import { Color3, DirectionalLight, HemisphericLight, Matrix, Vector3 } from "@babylonjs/core";
import type { GameSystems } from "../game/GameSystems";
import type { CombatUnit } from "../combat/CombatUnit";

export type HeroGameplayReviewCamera = "gameplay" | "tactical" | "three-quarter" | "back" | "portrait" | "portrait-side" | "portrait-three-quarter" | "head" | "pair";
export type HeroGameplayReviewLighting = "snow-daylight" | "furnace-warm" | "studio-neutral";
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
  gestureReach: Record<string, { right: number; up: number; forward: number }>;
  fps: number;
  drawCalls: number;
  activeMeshes: number;
  animationGroups: string[];
}

interface SavedLightState {
  sunIntensity: number;
  sunDiffuse: Color3;
  sunSpecular: Color3;
  skyIntensity: number;
  skyDiffuse: Color3;
  skyGround: Color3;
  skySpecular: Color3;
  environmentIntensity: number;
  exposure: number;
  contrast: number;
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
  private studioLights: Array<DirectionalLight | HemisphericLight> = [];
  private reviewUnits: CombatUnit[] = [];
  private readonly originalPositions = new Map<number, { x: number; z: number }>();

  constructor(private readonly s: GameSystems) {
    const furnaceLight = s.lighting.furnaceLight;
    const ip = s.scene.imageProcessingConfiguration;
    this.savedLight = {
      sunIntensity: s.lighting.sun.intensity,
      sunDiffuse: s.lighting.sun.diffuse.clone(),
      sunSpecular: s.lighting.sun.specular.clone(),
      skyIntensity: s.lighting.sky.intensity,
      skyDiffuse: s.lighting.sky.diffuse.clone(),
      skyGround: s.lighting.sky.groundColor.clone(),
      skySpecular: s.lighting.sky.specular.clone(),
      environmentIntensity: s.scene.environmentIntensity,
      exposure: ip.exposure,
      contrast: ip.contrast,
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
      // Close range, in the real snow lighting rather than on a turntable.
      // Every preset above sits ten or more units back, at which point the
      // Hero is roughly a hundred pixels tall and no claim about its face,
      // its armour or its rank markers can be checked at all. The Hero
      // stands at z = -2.2 in this scene, so these are offsets from there.
      portrait: { position: new Vector3(0, 1.30, -1.40), target: new Vector3(0, 1.10, -4.5), fov: 0.70 },
      "portrait-side": { position: new Vector3(3.10, 1.30, -4.42), target: new Vector3(0, 1.10, -4.5), fov: 0.70 },
      // Aimed at y=1.60, not at the authored crown height. The Hero is
      // scaled down at runtime, so a camera pointed at model-space head
      // height looks straight over the helmet -- which is exactly what the
      // first version of this preset did.
      head: { position: new Vector3(0.46, 1.72, -3.52), target: new Vector3(0, 1.60, -4.5), fov: 0.55 },
      "portrait-three-quarter": { position: new Vector3(2.25, 1.38, -2.35), target: new Vector3(0, 1.10, -4.5), fov: 0.70 },
      // Hero and the nearest recruits in one frame under one light. A material
      // comparison shot taken in two different sessions proves nothing about
      // either model, because the lighting is the variable being tested.
      pair: { position: new Vector3(0.6, 4.30, -12.2), target: new Vector3(-1.15, 1.05, -3.1), fov: 0.60 },
    };
    const preset = presets[mode];
    camera.position.copyFrom(preset.position);
    camera.setTarget(preset.target);
    camera.fov = preset.fov;
  }

  setLighting(lighting: HeroGameplayReviewLighting): void {
    this.lighting = lighting;
    const ip = this.s.scene.imageProcessingConfiguration;
    const sun = this.s.lighting.sun;
    const sky = this.s.lighting.sky;
    const furnaceLight = this.s.lighting.furnaceLight;
    const saved = this.savedLight;

    // Every mode restarts from the saved scene values, so switching is not
    // order-dependent. Without this the studio rig's reductions leaked into
    // the next snow-daylight frame and the two could not be compared.
    sun.diffuse = saved.sunDiffuse.clone();
    sun.specular = saved.sunSpecular.clone();
    sky.intensity = saved.skyIntensity;
    sky.diffuse = saved.skyDiffuse.clone();
    sky.groundColor = saved.skyGround.clone();
    sky.specular = saved.skySpecular.clone();
    this.s.scene.environmentIntensity = saved.environmentIntensity;
    this.studioRig(false);

    if (lighting === "furnace-warm") {
      ip.exposure = 0.94;
      ip.contrast = 1.10;
      sun.intensity = 0.58;
      furnaceLight.intensity = 250;
      furnaceLight.range = 30;
      furnaceLight.diffuse = new Color3(1.0, 0.42, 0.12);
      return;
    }

    if (lighting === "studio-neutral") {
      // The art-review baseline, and deliberately not "snow-daylight turned
      // down". The arena rig is one raking directional plus a strong snow
      // bounce plus an IBL built from the sky: a *mood* rig. Under it the
      // helmet and cuirass clipped to white, skin washed out, and a beard
      // authored at 0.32 rendered as mid grey -- so no judgement about cloth,
      // leather, metal or hair was actually being made from those frames.
      //
      // Three-point instead: a key at three-quarter front-left, a broad low
      // fill so the face never falls into dead black, and a cool rim from
      // behind to hold the silhouette off the background. Specular is pulled
      // right down on every source and the IBL roughly halved, because the
      // clipping was specular rather than diffuse -- dropping exposure alone
      // would have crushed the darks and kept the blown highlights.
      ip.exposure = 1.06;
      ip.contrast = 1.0;
      sun.intensity = 0.0;
      sky.intensity = 0.0;
      furnaceLight.intensity = 0;
      furnaceLight.range = 1;
      // The IBL cannot be cut the way the directionals can. These are PBR
      // metals, and a metal has no diffuse response at all -- everything it
      // shows is reflected environment. Halving this to kill the clipping
      // turned the helmet and the cuirass near-black instead, which is the
      // same failure with the sign flipped. It stays near its scene value and
      // the *specular* on the directionals does the clipping control.
      this.s.scene.environmentIntensity = 0.88;
      this.studioRig(true);
      return;
    }

    // snow-daylight, corrected. A 1.32 sun on top of an arena already graded
    // for mood, with contrast at 1.18 on top of that, is what blew the snow
    // to white and took the Hero with it.
    ip.exposure = 0.96;
    ip.contrast = 1.04;
    sun.intensity = 1.02;
    sun.specular = new Color3(0.30, 0.34, 0.44);
    sky.specular = new Color3(0.06, 0.07, 0.10);
    this.s.scene.environmentIntensity = 0.62;
    furnaceLight.intensity = 78;
    furnaceLight.range = 22;
    furnaceLight.diffuse = new Color3(0.72, 0.82, 1.0);
  }

  /** Create or tear down the three review-owned studio lights. */
  private studioRig(enabled: boolean): void {
    if (!enabled) {
      for (const light of this.studioLights) light.dispose();
      this.studioLights = [];
      return;
    }
    if (this.studioLights.length) return;
    const scene = this.s.scene;
    // The Hero faces +Z and the review cameras sit on the +Z side, so a light
    // travelling in -Z is coming from in front of the character.
    const key = new DirectionalLight("review.key", new Vector3(0.38, -0.62, -0.68), scene);
    key.intensity = 1.52;
    key.diffuse = new Color3(1.0, 0.98, 0.94);
    key.specular = new Color3(0.22, 0.23, 0.26);

    const fill = new HemisphericLight("review.fill", new Vector3(-0.25, 0.55, 0.80), scene);
    fill.intensity = 0.92;
    fill.diffuse = new Color3(0.74, 0.79, 0.90);
    fill.groundColor = new Color3(0.40, 0.41, 0.45);
    fill.specular = new Color3(0.03, 0.03, 0.04);

    const rim = new DirectionalLight("review.rim", new Vector3(-0.55, -0.24, 0.80), scene);
    rim.intensity = 1.02;
    rim.diffuse = new Color3(0.62, 0.74, 0.98);
    rim.specular = new Color3(0.18, 0.21, 0.28);

    this.studioLights = [key, fill, rim];
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
      gestureReach: this.s.hero.reviewGestureReach,
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
    const ip = this.s.scene.imageProcessingConfiguration;
    this.studioRig(false);
    ip.exposure = this.savedLight.exposure;
    ip.contrast = this.savedLight.contrast;
    this.s.lighting.sun.intensity = this.savedLight.sunIntensity;
    this.s.lighting.sun.diffuse = this.savedLight.sunDiffuse;
    this.s.lighting.sun.specular = this.savedLight.sunSpecular;
    this.s.lighting.sky.intensity = this.savedLight.skyIntensity;
    this.s.lighting.sky.diffuse = this.savedLight.skyDiffuse;
    this.s.lighting.sky.groundColor = this.savedLight.skyGround;
    this.s.lighting.sky.specular = this.savedLight.skySpecular;
    this.s.scene.environmentIntensity = this.savedLight.environmentIntensity;
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
