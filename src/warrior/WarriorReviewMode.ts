import { AbstractMesh, Color3, Color4, Matrix, MeshBuilder, Node, Scene, Vector3 } from "@babylonjs/core";
import type { GameSystems } from "../game/GameSystems";
import { CharacterAvatar, PALETTES } from "../character/CharacterFactory";

/** Everything the review temporarily overrides, so gameplay is untouched. */
interface SavedReviewRenderState {
  ambientColor: Color3;
  fogMode: number;
  toneMappingEnabled: boolean;
  exposure: number;
  contrast: number;
  vignetteEnabled: boolean;
  bloomEnabled: boolean;
  imageProcessingEnabled: boolean;
  sunIntensity: number;
  sunDiffuse: Color3;
  sunSpecular: Color3;
  skyIntensity: number;
  furnaceIntensity: number;
}

export type WarriorReviewCamera = "gameplay" | "front" | "side" | "back" | "three-quarter" | "close-up";
export type WarriorReviewAnimation = "Idle" | "Walk" | "Run" | "MeleeAttack" | "Hit" | "Death";

export interface WarriorReviewCapture {
  captureMode: "unitReview=warrior";
  unit: "warrior";
  cameraMode: WarriorReviewCamera;
  animation: WarriorReviewAnimation;
  lod: 0 | 1 | 2;
  lodMode: "auto" | "forced";
  modelSource: "GLB" | "procedural";
  worldPosition: { x: number; y: number; z: number };
  screenSpaceBoundingBox: { x: number; y: number; width: number; height: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  authoredVisibleMeshCount: number;
  proceduralVisibleMeshCount: number;
  animationNormalized: number;
  animationGroups: string[];
  boneTransforms: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }>;
  weaponTransform: {
    socket: { position: [number, number, number]; rotation: [number, number, number, number] } | null;
    upperGrip: [number, number, number] | null;
    lowerGrip: [number, number, number] | null;
    axeTip: [number, number, number] | null;
    axeWorldCenter: [number, number, number] | null;
    axeWorldExtents: [number, number, number] | null;
    handContactL: number | null;
    handContactR: number | null;
  };
  visible: boolean;
  uiOccluded: boolean;
  fps: number;
  drawCalls: number;
  activeMeshes: number;
}

/** Minimal reusable unit review surface; it deliberately reuses CharacterAvatar. */
export class WarriorReviewMode {
  private readonly panel: HTMLDivElement;
  private readonly avatar: CharacterAvatar;
  private readonly hiddenSceneRoots: Array<{ node: Node; enabled: boolean }> = [];
  private reviewGround: AbstractMesh | null = null;
  private savedRender: SavedReviewRenderState | null = null;
  private previousClearColor: Color4 | undefined;
  private previousRootDisplay = "";
  private cameraMode: WarriorReviewCamera = "gameplay";
  private animation: WarriorReviewAnimation = "Idle";
  private lod: 0 | 1 | 2 = 0;
  private lodMode: "auto" | "forced" = "forced";

  constructor(private readonly s: GameSystems) {
    this.avatar = new CharacterAvatar(s.scene, s.materials, PALETTES.workerA, "warriorReview");
    this.avatar.position.set(0, 0, 0);
    this.avatar.setYawImmediate(0);
    const instance = s.assets.instantiate("warrior", "warrior.review");
    if (instance) this.avatar.attachAuthored(instance);
    this.panel = document.createElement("div");
    this.panel.id = "warriorReviewPanel";
    this.panel.style.cssText = "position:fixed;top:12px;right:12px;z-index:20;padding:10px 12px;background:rgba(7,15,24,.82);color:#e9f5ff;font:12px/1.45 monospace;border:1px solid rgba(150,210,240,.4);pointer-events:none;min-width:250px";
    this.panel.innerHTML = `<strong>WARRIOR REVIEW</strong><br><span data-warrior-state>Loading...</span>`;
    // Keep the review panel outside the gameplay overlay so the review mode
    // can hide the full HUD without hiding its own diagnostics.
    document.body.appendChild(this.panel);
    document.body.classList.add("warrior-review");
  }

  enter(): void {
    // Isolate the authored Warrior from the formal gameplay scene. The review
    // still uses the same GLB instance, but furnace/world/Hero meshes and HUD
    // overlays cannot obscure the shape or contaminate screen-space evidence.
    this.s.hero.setPosition(70, 70);
    this.previousRootDisplay = this.s.refs.root.style.display;
    this.s.refs.root.style.display = "none";
    this.previousClearColor = this.s.scene.clearColor?.clone();
    this.s.scene.clearColor = new Color4(0.045, 0.07, 0.105, 1);
    this.configureReviewLighting();
    const avatarChain = new Set<Node>();
    let avatarNode: Node | null = this.avatar.root;
    while (avatarNode) {
      avatarChain.add(avatarNode);
      avatarNode = avatarNode.parent;
    }
    const hidden = new Set<Node>();
    for (const mesh of this.s.scene.meshes) {
      let root: Node = mesh;
      while (root.parent) root = root.parent;
      if (avatarChain.has(root) || hidden.has(root)) continue;
      hidden.add(root);
      this.hiddenSceneRoots.push({ node: root, enabled: root.isEnabled() });
      // Disable the top-level instance/root, not only the leaf mesh. Babylon's
      // LOD observer may re-enable leaf visibility before each render, while a
      // disabled parent keeps every non-review asset out of the frame.
      root.setEnabled(false);
    }
    this.reviewGround = MeshBuilder.CreateGround("WarriorReviewGround", { width: 12, height: 12 }, this.s.scene);
    // A deliberately dark, matte floor. The review key light is bright enough
    // that a mid-grey ground bounced back into the camera and flattened the
    // silhouette; this keeps the contrast on the character.
    this.reviewGround.material = this.s.materials.pbr("warriorReviewGround", {
      color: [0.055, 0.07, 0.085],
      roughness: 0.98,
      metallic: 0.0,
    });
    this.reviewGround.receiveShadows = false;
    this.avatar.setReviewLod(this.lod);
    this.avatar.setReviewAnimation(this.animation);
    this.setCamera(this.cameraMode);
    this.renderFrame();
  }

  /**
   * Neutral, unclipped review lighting.
   *
   * The formal arena lights the settlement with a 130-intensity warm point
   * light sitting 2.6m above the origin (the furnace). The review parks the
   * Warrior at exactly that origin, so W1's evidence frames were lit from
   * directly overhead at close range: the cap, fur collar and shoulders blew
   * out to pure white while the coat crushed to near-black, and nothing about
   * the silhouette could actually be judged. Bloom then smeared the clipped
   * highlights further.
   *
   * This swaps in a restrained key/fill pair for the duration of the review
   * only; every value is restored in dispose(), so gameplay lighting and the
   * Hero review are unaffected.
   */
  private configureReviewLighting(): void {
    const { scene, pipeline, lighting } = this.s;
    const image = scene.imageProcessingConfiguration;
    this.savedRender = {
      ambientColor: scene.ambientColor.clone(),
      fogMode: scene.fogMode,
      toneMappingEnabled: image.toneMappingEnabled,
      exposure: image.exposure,
      contrast: image.contrast,
      vignetteEnabled: image.vignetteEnabled,
      bloomEnabled: pipeline.bloomEnabled,
      imageProcessingEnabled: pipeline.imageProcessingEnabled,
      sunIntensity: lighting.sun.intensity,
      sunDiffuse: lighting.sun.diffuse.clone(),
      sunSpecular: lighting.sun.specular.clone(),
      skyIntensity: lighting.sky.intensity,
      furnaceIntensity: lighting.furnaceLight.intensity,
    };
    // The furnace is the direct cause of the blow-out; it has no business
    // lighting an isolated character turntable.
    lighting.furnaceLight.intensity = 0;
    // Key light: slightly cool, well under the clipping point.
    lighting.sun.intensity = 1.45;
    lighting.sun.diffuse = new Color3(0.94, 0.96, 1.0);
    lighting.sun.specular = new Color3(0.22, 0.25, 0.32);
    // Fill: enough ambient that dark cloth keeps readable detail.
    lighting.sky.intensity = 0.62;
    scene.ambientColor = new Color3(0.17, 0.19, 0.24);
    scene.fogMode = Scene.FOGMODE_NONE;
    image.toneMappingEnabled = false;
    image.exposure = 0.92;
    image.contrast = 1.06;
    image.vignetteEnabled = false;
    pipeline.bloomEnabled = false;
    pipeline.imageProcessingEnabled = true;
  }

  private restoreReviewLighting(): void {
    const state = this.savedRender;
    if (!state) return;
    const { scene, pipeline, lighting } = this.s;
    const image = scene.imageProcessingConfiguration;
    scene.ambientColor = state.ambientColor;
    scene.fogMode = state.fogMode;
    image.toneMappingEnabled = state.toneMappingEnabled;
    image.exposure = state.exposure;
    image.contrast = state.contrast;
    image.vignetteEnabled = state.vignetteEnabled;
    pipeline.bloomEnabled = state.bloomEnabled;
    pipeline.imageProcessingEnabled = state.imageProcessingEnabled;
    lighting.sun.intensity = state.sunIntensity;
    lighting.sun.diffuse = state.sunDiffuse;
    lighting.sun.specular = state.sunSpecular;
    lighting.sky.intensity = state.skyIntensity;
    lighting.furnaceLight.intensity = state.furnaceIntensity;
    this.savedRender = null;
  }

  update(): void {
    const metadata = this.capture();
    this.updatePanel(metadata);
    this.publish(metadata);
  }

  renderFrame(): void {
    this.s.scene.render();
    this.update();
  }

  setCamera(mode: WarriorReviewCamera): void {
    this.cameraMode = mode;
    const presets: Record<WarriorReviewCamera, { position: Vector3; target: Vector3; fov: number }> = {
      // Orthographic-feeling turntable framing: the character should fill the
      // frame so the silhouette can actually be judged. W1's presets sat far
      // enough back that the Warrior occupied a small fraction of the image.
      gameplay: { position: new Vector3(0, 4.8, -7.5), target: new Vector3(0, 1.15, 0), fov: 0.72 },
      // Authored units use local +Z as their forward direction.  Keep the
      // review labels aligned with that contract so "front" shows the
      // authored face/weapon side and "back" shows the pack side.
      // Distances are set from the actual authored height (crown at y≈2.47)
      // and the review fov: below ~3.7 units the model overflows the frame,
      // which would break the "fully on screen" evidence contract.
      front: { position: new Vector3(0, 1.55, 4.75), target: new Vector3(0, 1.20, 0), fov: 0.72 },
      side: { position: new Vector3(4.75, 1.55, 0), target: new Vector3(0, 1.20, 0), fov: 0.72 },
      back: { position: new Vector3(0, 1.55, -4.75), target: new Vector3(0, 1.20, 0), fov: 0.72 },
      // three-quarter is the camera the animation sweep samples from, so it
      // has to contain the *widest* authored pose, not just Idle. Measured
      // worst case is Death @0.6, which sprawls to a 1.31 horizontal radius
      // and spans y -0.41..2.47; the target is lowered to centre that span.
      "three-quarter": { position: new Vector3(3.62, 2.32, 4.64), target: new Vector3(0, 1.05, 0), fov: 0.72 },
      // The tightest framing that still keeps the whole silhouette on screen.
      "close-up": { position: new Vector3(2.55, 1.95, 2.95), target: new Vector3(0, 1.24, 0), fov: 0.72 },
    };
    const preset = presets[mode];
    this.s.camera.camera.position.copyFrom(preset.position);
    this.s.camera.camera.setTarget(preset.target);
    this.s.camera.camera.fov = preset.fov;
  }

  setAnimation(animation: WarriorReviewAnimation): void {
    this.animation = animation;
    this.avatar.setReviewAnimation(animation);
    this.update();
  }

  seekAnimation(normalized: number): void {
    this.avatar.seekReviewAnimation(normalized);
    this.update();
  }

  setLod(lod: 0 | 1 | 2): void {
    this.lodMode = "forced";
    this.lod = lod;
    this.avatar.setReviewLod(lod);
    this.update();
  }

  setAutoLod(enabled = true): void {
    this.lodMode = enabled ? "auto" : "forced";
    if (enabled) this.avatar.setReviewLodAuto();
    else this.avatar.setReviewLod(this.lod);
    this.update();
  }

  capture(): WarriorReviewCapture {
    const canvas = this.s.engine.getRenderingCanvas();
    const renderWidth = Math.max(1, this.s.engine.getRenderWidth());
    const renderHeight = Math.max(1, this.s.engine.getRenderHeight());
    const cssWidth = canvas?.clientWidth || renderWidth;
    const cssHeight = canvas?.clientHeight || renderHeight;
    const viewport = this.s.camera.camera.viewport.toGlobal(renderWidth, renderHeight);
    const scaleX = cssWidth / renderWidth;
    const scaleY = cssHeight / renderHeight;
    const projected: Vector3[] = [];
    for (const mesh of this.avatar.authoredMeshes) {
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      // Without this, a skinned mesh's bounding box stays frozen at its rest
      // pose -- screenSpaceBoundingBox/visible would silently describe the
      // Idle silhouette no matter which animation is actually selected.
      if (mesh.skeleton) mesh.refreshBoundingInfo({ applySkeleton: true });
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        projected.push(Vector3.Project(corner, Matrix.Identity(), this.s.scene.getTransformMatrix(), viewport));
      }
    }
    const minX = projected.length ? Math.min(...projected.map((p) => p.x)) * scaleX : 0;
    const maxX = projected.length ? Math.max(...projected.map((p) => p.x)) * scaleX : 0;
    const minY = projected.length ? Math.min(...projected.map((p) => p.y)) * scaleY : 0;
    const maxY = projected.length ? Math.max(...projected.map((p) => p.y)) * scaleY : 0;
    const box = { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY), right: round(maxX), bottom: round(maxY) };
    const visible = box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.right <= cssWidth && box.bottom <= cssHeight;
    const panelRect = this.panel.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const ui = canvasRect ? { x: panelRect.left - canvasRect.left, y: panelRect.top - canvasRect.top, width: panelRect.width, height: panelRect.height } : null;
    const uiOccluded = ui ? overlaps(box, ui) : false;
    const drawCalls = Math.max(0, Math.round((this.s.engine as unknown as { _drawCalls?: { current?: number } })._drawCalls?.current ?? 0));
    return {
      captureMode: "unitReview=warrior",
      unit: "warrior",
      cameraMode: this.cameraMode,
      animation: this.animation,
      lod: this.lodMode === "auto" ? this.avatar.currentReviewLod : this.lod,
      lodMode: this.lodMode,
      modelSource: this.avatar.modelSource,
      worldPosition: { x: round(this.avatar.position.x), y: round(this.avatar.position.y), z: round(this.avatar.position.z) },
      screenSpaceBoundingBox: box,
      viewport: { width: cssWidth, height: cssHeight },
      authoredVisibleMeshCount: this.avatar.authoredVisibleMeshCount,
      proceduralVisibleMeshCount: this.avatar.proceduralVisibleMeshCount,
      animationNormalized: this.avatar.currentReviewAnimationNormalized,
      animationGroups: [...this.avatar.authoredAnimationNames],
      boneTransforms: this.avatar.reviewBoneSnapshot,
      weaponTransform: this.avatar.reviewWeaponEvidence,
      visible,
      uiOccluded,
      fps: round(this.s.engine.getFps()),
      drawCalls,
      activeMeshes: this.s.scene.getActiveMeshes().length,
    };
  }

  state(): WarriorReviewCapture & { ready: boolean } {
    const metadata = this.capture();
    return { ...metadata, ready: metadata.modelSource === "GLB" && metadata.authoredVisibleMeshCount > 0 && metadata.proceduralVisibleMeshCount === 0 && metadata.visible && !metadata.uiOccluded };
  }

  dispose(): void {
    this.restoreReviewLighting();
    this.avatar.dispose();
    this.reviewGround?.dispose();
    this.reviewGround = null;
    for (const item of this.hiddenSceneRoots) item.node.setEnabled(item.enabled);
    this.hiddenSceneRoots.length = 0;
    if (this.previousClearColor) this.s.scene.clearColor = this.previousClearColor;
    this.s.refs.root.style.display = this.previousRootDisplay;
    this.panel.remove();
    document.body.classList.remove("warrior-review");
    delete window.__warriorReviewState;
  }

  private updatePanel(metadata: WarriorReviewCapture): void {
    const state = this.panel.querySelector<HTMLElement>("[data-warrior-state]");
    if (!state) return;
    state.textContent = `GLB=${metadata.modelSource} | ${metadata.cameraMode} | ${metadata.animation} ${metadata.animationNormalized.toFixed(2)} | LOD${metadata.lod}\nmeshes ${metadata.authoredVisibleMeshCount}/proc ${metadata.proceduralVisibleMeshCount}\nFPS ${metadata.fps} | draw ${metadata.drawCalls} | active ${metadata.activeMeshes}`;
    state.style.whiteSpace = "pre-line";
  }

  private publish(metadata: WarriorReviewCapture): void {
    window.__warriorReviewState = { ...metadata, ready: this.state().ready, currentCamera: metadata.cameraMode, currentAnimation: metadata.animation, currentLod: `LOD${metadata.lod}` as "LOD0" | "LOD1" | "LOD2", authoredVisibleMeshes: metadata.authoredVisibleMeshCount, proceduralVisibleMeshes: metadata.proceduralVisibleMeshCount, heroScreenBounds: { ...metadata.screenSpaceBoundingBox, visible: metadata.visible }, consoleErrors: [] };
  }
}

function round(value: number): number { return Number(value.toFixed(2)); }
function overlaps(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
