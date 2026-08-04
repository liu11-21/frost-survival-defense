import { AbstractMesh, Color4, Matrix, MeshBuilder, Node, Vector3 } from "@babylonjs/core";
import type { GameSystems } from "../game/GameSystems";
import { CharacterAvatar, PALETTES } from "../character/CharacterFactory";

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
    this.reviewGround.material = this.s.materials.pbr("warriorReviewGround", {
      color: [0.16, 0.2, 0.23],
      roughness: 0.92,
      metallic: 0.02,
    });
    this.reviewGround.receiveShadows = false;
    this.avatar.setReviewLod(this.lod);
    this.avatar.setReviewAnimation(this.animation);
    this.setCamera(this.cameraMode);
    this.renderFrame();
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
      gameplay: { position: new Vector3(0, 4.8, -7.5), target: new Vector3(0, 1.15, 0), fov: 0.72 },
      // Authored units use local +Z as their forward direction.  Keep the
      // review labels aligned with that contract so "front" shows the
      // authored face/weapon side and "back" shows the pack side.
      front: { position: new Vector3(0, 3.15, 6.2), target: new Vector3(0, 1.15, 0), fov: 0.62 },
      side: { position: new Vector3(6.2, 3.15, 0), target: new Vector3(0, 1.15, 0), fov: 0.62 },
      back: { position: new Vector3(0, 3.15, -6.2), target: new Vector3(0, 1.15, 0), fov: 0.62 },
      "three-quarter": { position: new Vector3(5.2, 3.8, 5.8), target: new Vector3(0, 1.15, 0), fov: 0.68 },
      "close-up": { position: new Vector3(3.8, 3.4, 5.4), target: new Vector3(0, 1.25, 0), fov: 0.64 },
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
