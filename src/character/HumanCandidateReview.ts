import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Scene, SceneLoader, Vector3 } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

import { HUMAN_APPEARANCE_VARIANTS, resolveHumanCandidateAsset, type HumanAppearanceVariant } from "./HumanAppearance";

/**
 * Isolated Babylon review for the MPFB human candidates.
 *
 * Deliberately its own scene and its own engine loop, touching no gameplay
 * state. The candidates are bare mature bodies with a placeholder material,
 * and they must not reach the production Hero path until a person has looked
 * at them — so this loads them by candidate key rather than through the
 * gameplay asset resolver, which still returns the legacy `hero`.
 *
 * Reached with `?humanCandidateReview=1`.
 */
export interface HumanCandidateReviewState {
  ready: boolean;
  variant: HumanAppearanceVariant;
  assetKey: string | null;
  loaded: boolean;
  meshCount: number;
  triangleCount: number;
  boneCount: number;
  animations: string[];
  currentAnimation: string;
  materialNames: string[];
  boundingBox: { min: number[]; max: number[]; height: number };
  camera: string;
  error: string | null;
  materialNote: string;
}

const CAMERAS: Record<string, { alpha: number; beta: number; radius: number; targetY: number }> = {
  front: { alpha: -Math.PI / 2, beta: Math.PI / 2.15, radius: 3.4, targetY: 0.95 },
  "three-quarter": { alpha: -Math.PI / 2 + 0.72, beta: Math.PI / 2.2, radius: 3.4, targetY: 0.95 },
  side: { alpha: 0, beta: Math.PI / 2.15, radius: 3.4, targetY: 0.95 },
  head: { alpha: -Math.PI / 2 + 0.22, beta: Math.PI / 2.15, radius: 0.62, targetY: 1.66 },
  hand: { alpha: -Math.PI / 2 + 0.55, beta: Math.PI / 2.0, radius: 0.62, targetY: 0.86 },
};

export class HumanCandidateReview {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private variant: HumanAppearanceVariant = "male";
  private cameraName = "front";
  private state: HumanCandidateReviewState;
  private disposeCurrent: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.055, 0.062, 0.075, 1);
    this.scene.imageProcessingConfiguration.exposure = 1.0;
    this.scene.imageProcessingConfiguration.contrast = 1.0;

    this.camera = new ArcRotateCamera("review", -Math.PI / 2, Math.PI / 2.15, 3.4, new Vector3(0, 0.95, 0), this.scene);
    this.camera.attachControl(canvas, true);
    this.camera.minZ = 0.02;

    // Neutral three-point, same reasoning as the studio review lighting: a
    // key, a broad fill so nothing falls into dead black, and a cool rim to
    // hold the silhouette off the background.
    const key = new DirectionalLight("key", new Vector3(0.42, -0.68, 0.62), this.scene);
    key.intensity = 2.1;
    key.diffuse = new Color3(1.0, 0.98, 0.95);
    const fill = new HemisphericLight("fill", new Vector3(-0.3, 0.7, -0.5), this.scene);
    fill.intensity = 0.75;
    fill.diffuse = new Color3(0.76, 0.81, 0.92);
    fill.groundColor = new Color3(0.30, 0.32, 0.36);
    const rim = new DirectionalLight("rim", new Vector3(-0.55, -0.22, -0.78), this.scene);
    rim.intensity = 1.1;
    rim.diffuse = new Color3(0.62, 0.74, 0.98);

    this.state = {
      ready: false, variant: this.variant, assetKey: null, loaded: false,
      meshCount: 0, triangleCount: 0, boneCount: 0, animations: [], currentAnimation: "none",
      materialNames: [], boundingBox: { min: [], max: [], height: 0 }, camera: this.cameraName,
      error: null,
      materialNote: "TEMPORARY FLAT FALLBACK MATERIAL — official CC0 skin not yet installed",
    };
    this.publish();
    this.engine.runRenderLoop(() => this.scene.render());
    window.addEventListener("resize", () => this.engine.resize());
    void this.setVariant("male");
  }

  async setVariant(variant: HumanAppearanceVariant): Promise<void> {
    this.variant = variant;
    const key = resolveHumanCandidateAsset("hero", variant);
    this.state.variant = variant;
    this.state.assetKey = key;
    if (!key) {
      this.state.error = `no candidate asset for hero + ${variant}`;
      this.state.loaded = false;
      this.publish();
      return;
    }
    this.disposeCurrent?.();
    this.disposeCurrent = null;
    try {
      const container = await SceneLoader.LoadAssetContainerAsync(
        "/assets/models/characters/", `${key}.glb`, this.scene);
      container.addAllToScene();
      this.disposeCurrent = () => container.removeAllFromScene();

      // LOD0 only; the review is about the close read.
      for (const mesh of container.meshes) {
        const name = mesh.name.toLowerCase();
        if (name.startsWith("lod1") || name.startsWith("lod2") || name.includes("col_")) {
          mesh.setEnabled(false);
        }
      }
      const visible = container.meshes.filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
      let triangles = 0;
      for (const mesh of visible) triangles += (mesh.getTotalIndices() / 3) | 0;

      let min = new Vector3(1e9, 1e9, 1e9);
      let max = new Vector3(-1e9, -1e9, -1e9);
      for (const mesh of visible) {
        mesh.computeWorldMatrix(true);
        const info = mesh.getBoundingInfo().boundingBox;
        min = Vector3.Minimize(min, info.minimumWorld);
        max = Vector3.Maximize(max, info.maximumWorld);
      }

      this.state.loaded = true;
      this.state.error = null;
      this.state.meshCount = visible.length;
      this.state.triangleCount = triangles;
      this.state.boneCount = container.skeletons[0]?.bones.length ?? 0;
      this.state.animations = container.animationGroups.map((g) => g.name).sort();
      this.state.materialNames = [...new Set(visible.map((m) => m.material?.name ?? "none"))];
      this.state.boundingBox = {
        min: [min.x, min.y, min.z].map((v) => Number(v.toFixed(4))),
        max: [max.x, max.y, max.z].map((v) => Number(v.toFixed(4))),
        height: Number((max.y - min.y).toFixed(4)),
      };
      for (const group of container.animationGroups) group.stop();
      this.state.currentAnimation = "none";
      this.setCamera(this.cameraName);
    } catch (error) {
      this.state.loaded = false;
      this.state.error = String(error).slice(0, 220);
    }
    this.state.ready = this.state.loaded;
    this.publish();
  }

  setCamera(name: string): void {
    const preset = CAMERAS[name] ?? CAMERAS.front;
    this.cameraName = name in CAMERAS ? name : "front";
    this.camera.alpha = preset.alpha;
    this.camera.beta = preset.beta;
    this.camera.radius = preset.radius;
    this.camera.setTarget(new Vector3(0, preset.targetY, 0));
    this.state.camera = this.cameraName;
    this.publish();
  }

  playAnimation(name: string, normalized = 0): void {
    const groups = this.scene.animationGroups;
    for (const group of groups) group.stop();
    const group = groups.find((g) => g.name === name || g.name.endsWith(`:${name}`));
    if (!group) {
      this.state.currentAnimation = "none";
      this.publish();
      return;
    }
    group.start(false);
    group.pause();
    const frame = group.from + (group.to - group.from) * normalized;
    group.goToFrame(frame);
    this.state.currentAnimation = name;
    this.publish();
  }

  renderFrame(): void {
    this.scene.render();
  }

  private publish(): void {
    window.__humanCandidateReview = { ...this.state };
  }
}

export function startHumanCandidateReview(canvas: HTMLCanvasElement): HumanCandidateReview {
  const review = new HumanCandidateReview(canvas);
  window.frostboundHumanCandidate = {
    setVariant: (variant: string) => review.setVariant(
      HUMAN_APPEARANCE_VARIANTS.includes(variant as HumanAppearanceVariant)
        ? (variant as HumanAppearanceVariant) : "male"),
    setCamera: (name: string) => review.setCamera(name),
    play: (name: string, normalized?: number) => review.playAnimation(name, normalized ?? 0),
    render: () => review.renderFrame(),
  };
  return review;
}
