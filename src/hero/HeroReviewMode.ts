import {
  Color3,
  Color4,
  DirectionalLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type HemisphericLight,
  type LinesMesh,
  type Node,
  HemisphericLight as BabylonHemisphericLight,
} from "@babylonjs/core";
import type { GameSystems } from "../game/GameSystems";
import {
  HeroReviewPanel,
  type HeroReviewAnimation,
  type HeroReviewCamera,
  type HeroReviewLod,
  type HeroReviewPanelState,
} from "../ui/HeroReviewPanel";

export interface HeroReviewCaptureMetadata {
  captureMode: "heroReview=1";
  cameraMode: HeroReviewCamera;
  animation: HeroReviewAnimation;
  lod: HeroReviewLod;
  modelSource: "GLB" | "procedural";
  heroWorldPosition: { x: number; y: number; z: number };
  screenSpaceBoundingBox: { x: number; y: number; width: number; height: number; right: number; bottom: number };
  viewport: { width: number; height: number };
  uiOccluded: boolean;
  uiPanel: { x: number; y: number; width: number; height: number } | null;
  authoredVisibleMeshCount: number;
  proceduralVisibleMeshCount: number;
  drawCalls: number;
  drawCallsThisFrame: number;
  drawCallsAvg120: number;
  activeMeshes: number;
  fps: number;
  fpsAvg5s: number;
  frameTimeP50: number;
  frameTimeP95: number;
  visibleMeshes: number;
  visibleVertices: number;
  visibleTriangles: number;
}

interface ReviewPerformance {
  drawCallsThisFrame: number;
  drawCallsAvg120: number;
  fps: number;
  fpsAvg5s: number;
  frameTimeP50: number;
  frameTimeP95: number;
  visibleMeshes: number;
  visibleVertices: number;
  visibleTriangles: number;
}

interface SavedRenderState {
  clearColor: Color4;
  ambientColor: Color3;
  fogMode: number;
  fogColor: Color3;
  fogDensity: number;
  toneMappingEnabled: boolean;
  exposure: number;
  contrast: number;
  vignetteEnabled: boolean;
  bloomEnabled: boolean;
  bloomWeight: number;
  imageProcessingEnabled: boolean;
}

interface SavedMeshState {
  mesh: AbstractMesh;
  enabled: boolean;
  visible: boolean;
}

interface SavedNodeState {
  node: Node;
  enabled: boolean;
}

const CAMERA_TARGET = new Vector3(0, 1.2, 0);

/** Isolates the real authored Hero instance for human-readable visual review. */
export class HeroReviewMode {
  private readonly savedMeshes: SavedMeshState[] = [];
  private readonly savedNodes: SavedNodeState[] = [];
  private readonly reviewMeshes: Mesh[] = [];
  private readonly reviewLights: Array<HemisphericLight | DirectionalLight> = [];
  private readonly reviewMaterials: StandardMaterial[] = [];
  private readonly savedRenderState: SavedRenderState;
  private readonly panel: HeroReviewPanel;
  private readonly grid: LinesMesh;
  private readonly ground: Mesh;
  private cameraMode: HeroReviewCamera = "gameplay";
  private animation: HeroReviewAnimation = "Idle";
  private lod: HeroReviewLod = 0;
  private readonly frameSamples: Array<{ at: number; ms: number }> = [];
  private readonly drawCallSamples: number[] = [];
  private lastFrameAt = 0;
  private performance: ReviewPerformance = {
    drawCallsThisFrame: 0,
    drawCallsAvg120: 0,
    fps: 0,
    fpsAvg5s: 0,
    frameTimeP50: 0,
    frameTimeP95: 0,
    visibleMeshes: 0,
    visibleVertices: 0,
    visibleTriangles: 0,
  };

  constructor(private readonly s: GameSystems) {
    this.savedRenderState = saveRenderState(s);
    configureReviewPresentation(s);
    const groundMaterial = new StandardMaterial("heroReviewGroundMaterial", s.scene);
    groundMaterial.diffuseColor = new Color3(0.12, 0.16, 0.22);
    groundMaterial.emissiveColor = new Color3(0.12, 0.16, 0.22);
    groundMaterial.disableLighting = true;
    groundMaterial.specularColor = new Color3(0.04, 0.05, 0.07);
    groundMaterial.roughness = 0.92;
    this.reviewMaterials.push(groundMaterial);
    this.ground = MeshBuilder.CreateGround("heroReviewGround", { width: 12, height: 12, subdivisions: 1 }, s.scene);
    this.ground.receiveShadows = false;
    this.ground.material = groundMaterial;
    this.reviewMeshes.push(this.ground);

    const gridMaterial = new StandardMaterial("heroReviewGridMaterial", s.scene);
    gridMaterial.emissiveColor = new Color3(0.24, 0.38, 0.5);
    gridMaterial.diffuseColor = new Color3(0.24, 0.38, 0.5);
    gridMaterial.alpha = 0.55;
    gridMaterial.transparencyMode = 2;
    this.reviewMaterials.push(gridMaterial);
    const lines: Vector3[][] = [];
    for (let i = -6; i <= 6; i += 1) {
      lines.push([new Vector3(i, 0.012, -6), new Vector3(i, 0.012, 6)]);
      lines.push([new Vector3(-6, 0.013, i), new Vector3(6, 0.013, i)]);
    }
    this.grid = MeshBuilder.CreateLineSystem("heroReviewGroundGrid", { lines }, s.scene);
    this.grid.color = new Color3(0.3, 0.5, 0.64);
    this.grid.alpha = 0.58;
    this.grid.material = gridMaterial;
    this.reviewMeshes.push(this.grid);

    const fill = new BabylonHemisphericLight("heroReviewFill", new Vector3(0, 1, 0), s.scene);
    fill.intensity = 0.55;
    fill.diffuse = new Color3(0.78, 0.88, 1.0);
    fill.groundColor = new Color3(0.13, 0.16, 0.22);
    const key = new DirectionalLight("heroReviewKey", new Vector3(-0.45, -1, 0.6), s.scene);
    key.position = new Vector3(4, 8, -5);
    key.intensity = 0.7;
    key.diffuse = new Color3(1.0, 0.86, 0.7);
    const rim = new DirectionalLight("heroReviewRim", new Vector3(0.35, -0.5, -0.7), s.scene);
    rim.position = new Vector3(-4, 5, 5);
    rim.intensity = 0.3;
    rim.diffuse = new Color3(0.48, 0.65, 1.0);
    this.reviewLights.push(fill, key, rim);

    this.panel = new HeroReviewPanel(s.refs.root, {
      setCamera: (mode) => this.setCamera(mode),
      setAnimation: (animation) => this.setAnimation(animation),
      setLod: (lod) => this.setLod(lod),
    });
  }

  enter(): void {
    this.frameSamples.length = 0;
    this.drawCallSamples.length = 0;
    this.lastFrameAt = 0;
    this.s.hero.setPosition(0, 0);
    this.s.hero.avatar.setYawImmediate(0);
    this.s.hero.setReviewLod(this.lod);
    this.s.hero.setReviewAnimation(this.animation);
    const authored = new Set(this.s.hero.authoredMeshes);
    const review = new Set<AbstractMesh>(this.reviewMeshes);
    const heroRoot = this.s.hero.avatar.root;
    for (const mesh of this.s.scene.meshes) {
      if (authored.has(mesh) || review.has(mesh)) continue;
      this.savedMeshes.push({ mesh, enabled: mesh.isEnabled(), visible: mesh.isVisible });
      mesh.isVisible = false;
      mesh.setEnabled(false);
      const top = topNode(mesh);
      if (top !== heroRoot && !this.savedNodes.some((entry) => entry.node === top)) {
        this.savedNodes.push({ node: top, enabled: top.isEnabled() });
        top.setEnabled(false);
      }
    }
    this.setCamera(this.cameraMode);
    // The ground itself is the neutral contact reference. Disable the line
    // overlay here because the existing post-process pipeline can turn thin
    // line geometry into distracting high-contrast bands at this scale.
    this.grid.isVisible = false;
    this.grid.setEnabled(false);
    this.panel.update(this.panelState());
  }

  update(): void {
    this.s.hero.updateReview();
  }

  /** Resets Babylon's per-frame draw-call counter before the isolated render. */
  beforeRender(): void {
    const counter = (this.s.engine as unknown as { _drawCalls?: { fetchNewFrame?: () => void } })._drawCalls;
    counter?.fetchNewFrame?.();
  }

  /** Starts a clean measurement window for a deterministic review capture. */
  resetPerformance(): void {
    this.frameSamples.length = 0;
    this.drawCallSamples.length = 0;
    this.lastFrameAt = 0;
  }

  afterRender(): void {
    this.samplePerformance();
    this.panel.update(this.panelState());
  }

  refreshAuthored(): void {
    if (this.s.hero.modelSource !== "GLB") return;
    this.s.hero.setReviewLod(this.lod);
    this.s.hero.setReviewAnimation(this.animation);
    const authored = new Set(this.s.hero.authoredMeshes);
    const review = new Set<AbstractMesh>(this.reviewMeshes);
    const saved = new Set(this.savedMeshes.map((entry) => entry.mesh));
    const heroRoot = this.s.hero.avatar.root;
    for (const mesh of this.s.scene.meshes) {
      if (authored.has(mesh) || review.has(mesh) || saved.has(mesh)) continue;
      this.savedMeshes.push({ mesh, enabled: mesh.isEnabled(), visible: mesh.isVisible });
      mesh.isVisible = false;
      mesh.setEnabled(false);
      const top = topNode(mesh);
      if (top !== heroRoot && !this.savedNodes.some((entry) => entry.node === top)) {
        this.savedNodes.push({ node: top, enabled: top.isEnabled() });
        top.setEnabled(false);
      }
    }
  }

  setCamera(mode: HeroReviewCamera): void {
    this.cameraMode = mode;
    const camera = this.s.camera.camera;
    const presets: Record<HeroReviewCamera, Vector3> = {
      gameplay: new Vector3(0, 3.9, -7.2),
      front: new Vector3(0, 2.35, -6.4),
      "left-side": new Vector3(-6.4, 2.4, 0),
      back: new Vector3(0, 2.35, 6.4),
      "three-quarter": new Vector3(5.5, 3.0, -5.7),
      "close-up": new Vector3(0, 2.05, -4.15),
    };
    camera.position.copyFrom(presets[mode]);
    camera.setTarget(CAMERA_TARGET);
    camera.fov = mode === "close-up" ? 0.62 : 0.72;
  }

  setAnimation(animation: HeroReviewAnimation): void {
    this.animation = animation;
    this.s.hero.setReviewAnimation(animation);
  }

  setLod(lod: HeroReviewLod): void {
    this.lod = lod;
    this.s.hero.setReviewLod(lod);
  }

  capture(): HeroReviewCaptureMetadata {
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
      const corners = mesh.getBoundingInfo().boundingBox.vectorsWorld;
      for (const corner of corners) {
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
    const panelRect = this.panel.element.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const uiPanel = canvasRect
      ? {
          x: round(panelRect.left - canvasRect.left),
          y: round(panelRect.top - canvasRect.top),
          width: round(panelRect.width),
          height: round(panelRect.height),
        }
      : null;
    const uiOccluded = uiPanel ? overlaps(screenSpaceBoundingBox, uiPanel) : false;
    const perf = this.performance;
    return {
      captureMode: "heroReview=1",
      cameraMode: this.cameraMode,
      animation: this.animation,
      lod: this.lod,
      modelSource: this.s.hero.modelSource,
      heroWorldPosition: vector(this.s.hero.position),
      screenSpaceBoundingBox,
      viewport: { width: cssWidth, height: cssHeight },
      uiOccluded,
      uiPanel,
      authoredVisibleMeshCount: this.s.hero.authoredVisibleMeshCount,
      proceduralVisibleMeshCount: this.s.hero.proceduralVisibleMeshCount,
      drawCalls: perf.drawCallsThisFrame,
      drawCallsThisFrame: perf.drawCallsThisFrame,
      drawCallsAvg120: round(perf.drawCallsAvg120),
      activeMeshes: this.s.scene.getActiveMeshes().length,
      fps: round(perf.fps),
      fpsAvg5s: round(perf.fpsAvg5s),
      frameTimeP50: round(perf.frameTimeP50),
      frameTimeP95: round(perf.frameTimeP95),
      visibleMeshes: perf.visibleMeshes,
      visibleVertices: perf.visibleVertices,
      visibleTriangles: perf.visibleTriangles,
    };
  }

  panelState(): HeroReviewPanelState {
    const metadata = this.capture();
    return {
      camera: metadata.cameraMode,
      animation: metadata.animation,
      lod: metadata.lod,
      modelSource: metadata.modelSource,
      drawCalls: metadata.drawCalls,
      drawCallsAvg120: metadata.drawCallsAvg120,
      activeMeshes: metadata.activeMeshes,
      fps: metadata.fps,
      fpsAvg5s: metadata.fpsAvg5s,
      frameTimeP50: metadata.frameTimeP50,
      frameTimeP95: metadata.frameTimeP95,
      visibleMeshes: metadata.visibleMeshes,
      visibleVertices: metadata.visibleVertices,
      visibleTriangles: metadata.visibleTriangles,
      authoredVisibleMeshCount: metadata.authoredVisibleMeshCount,
      proceduralVisibleMeshCount: metadata.proceduralVisibleMeshCount,
    };
  }

  dispose(): void {
    for (const state of this.savedNodes) state.node.setEnabled(state.enabled);
    for (const state of this.savedMeshes) {
      state.mesh.isVisible = state.visible;
      state.mesh.setEnabled(state.enabled);
    }
    for (const mesh of this.reviewMeshes) mesh.dispose(false, true);
    for (const light of this.reviewLights) light.dispose();
    for (const material of this.reviewMaterials) material.dispose();
    restoreRenderState(this.s, this.savedRenderState);
    this.panel.dispose();
  }

  private samplePerformance(): void {
    const now = performance.now();
    let frameMs = 0;
    if (this.lastFrameAt > 0) {
      frameMs = now - this.lastFrameAt;
      if (frameMs > 0 && frameMs <= 1000) {
        this.frameSamples.push({ at: now, ms: frameMs });
        if (this.frameSamples.length > 600) this.frameSamples.shift();
      }
    }
    this.lastFrameAt = now;

    const drawCalls = Math.max(
      0,
      Math.round((this.s.engine as unknown as { _drawCalls?: { current?: number } })._drawCalls?.current ?? 0),
    );
    this.drawCallSamples.push(drawCalls);
    if (this.drawCallSamples.length > 120) this.drawCallSamples.shift();

    const fiveSecondSamples = this.frameSamples.filter((sample) => now - sample.at <= 5000);
    const frameTimes = this.frameSamples.slice(-120).map((sample) => sample.ms);
    const totalMs = fiveSecondSamples.reduce((sum, sample) => sum + sample.ms, 0);
    const fpsAvg5s = totalMs > 0 ? (fiveSecondSamples.length * 1000) / totalMs : 0;
    const currentFps = frameMs > 0 ? 1000 / frameMs : 0;
    const visible = visibleHeroGeometry(this.s.hero.authoredMeshes);
    this.performance = {
      drawCallsThisFrame: drawCalls,
      drawCallsAvg120: average(this.drawCallSamples),
      fps: currentFps,
      fpsAvg5s,
      frameTimeP50: quantile(frameTimes, 0.5),
      frameTimeP95: quantile(frameTimes, 0.95),
      visibleMeshes: visible.meshes,
      visibleVertices: visible.vertices,
      visibleTriangles: visible.triangles,
    };
  }
}

function topNode(mesh: AbstractMesh): Node {
  let node: Node = mesh;
  while (node.parent) node = node.parent;
  return node;
}

function vector(value: Vector3): { x: number; y: number; z: number } {
  return { x: round(value.x), y: round(value.y), z: round(value.z) };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function visibleHeroGeometry(meshes: readonly AbstractMesh[]): { meshes: number; vertices: number; triangles: number } {
  const visible = meshes.filter((mesh) => mesh.isEnabled() && mesh.isVisible);
  return {
    meshes: visible.length,
    vertices: visible.reduce((sum, mesh) => sum + mesh.getTotalVertices(), 0),
    triangles: visible.reduce((sum, mesh) => sum + Math.floor(mesh.getTotalIndices() / 3), 0),
  };
}

function average(values: readonly number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function saveRenderState(s: GameSystems): SavedRenderState {
  const image = s.scene.imageProcessingConfiguration;
  return {
    clearColor: s.scene.clearColor.clone(),
    ambientColor: s.scene.ambientColor.clone(),
    fogMode: s.scene.fogMode,
    fogColor: s.scene.fogColor.clone(),
    fogDensity: s.scene.fogDensity,
    toneMappingEnabled: image.toneMappingEnabled,
    exposure: image.exposure,
    contrast: image.contrast,
    vignetteEnabled: image.vignetteEnabled,
    bloomEnabled: s.pipeline.bloomEnabled,
    bloomWeight: s.pipeline.bloomWeight,
    imageProcessingEnabled: s.pipeline.imageProcessingEnabled,
  };
}

function configureReviewPresentation(s: GameSystems): void {
  s.scene.clearColor = new Color4(0.035, 0.055, 0.09, 1);
  s.scene.ambientColor = new Color3(0.14, 0.17, 0.23);
  s.scene.fogMode = Scene.FOGMODE_NONE;
  s.scene.imageProcessingConfiguration.toneMappingEnabled = false;
  s.scene.imageProcessingConfiguration.exposure = 0.9;
  s.scene.imageProcessingConfiguration.contrast = 1.0;
  s.scene.imageProcessingConfiguration.vignetteEnabled = false;
  s.pipeline.bloomEnabled = false;
  s.pipeline.imageProcessingEnabled = true;
}

function restoreRenderState(s: GameSystems, state: SavedRenderState): void {
  s.scene.clearColor = state.clearColor;
  s.scene.ambientColor = state.ambientColor;
  s.scene.fogMode = state.fogMode;
  s.scene.fogColor = state.fogColor;
  s.scene.fogDensity = state.fogDensity;
  const image = s.scene.imageProcessingConfiguration;
  image.toneMappingEnabled = state.toneMappingEnabled;
  image.exposure = state.exposure;
  image.contrast = state.contrast;
  image.vignetteEnabled = state.vignetteEnabled;
  s.pipeline.bloomEnabled = state.bloomEnabled;
  s.pipeline.bloomWeight = state.bloomWeight;
  s.pipeline.imageProcessingEnabled = state.imageProcessingEnabled;
}
