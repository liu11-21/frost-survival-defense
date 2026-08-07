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
  /** Scene is up and a candidate is loaded. NOT production acceptance --
   *  that is VARIANT_READY_ROLES and only a human sets it. */
  sceneReady: boolean;
  candidateLoaded: boolean;
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
  cameraSolved: {
    radius: number; alpha: number; beta: number; targetY: number;
    clearanceFromBounds: number; insideBounds: boolean;
  } | null;
  error: string | null;
  materialNote: string;
}

/**
 * Camera framing is DERIVED, never guessed.
 *
 * The first version hard-coded alpha/beta/radius and got all three wrong:
 * "front" showed the character's back, the framing sat too far out, and the
 * head preset put the near plane inside the mesh. Distances that are typed in
 * are distances that stop being true the moment a model changes height.
 *
 * Each preset instead says what it wants to see -- a fraction of the body,
 * centred at a fraction of its height -- and the radius is solved from the
 * bounding box and the field of view.
 */
interface Framing {
  /** Rotation about the model's up axis, 0 = dead in front of the character. */
  yaw: number;
  /** Elevation above the horizon, radians. */
  pitch: number;
  /** Height to look at, as a fraction of the body's height. */
  targetHeight: number;
  /** Vertical extent to fill the frame with, as a fraction of body height. */
  coverage: number;
}

const FRAMINGS: Record<string, Framing> = {
  front: { yaw: 0, pitch: 0.06, targetHeight: 0.52, coverage: 1.18 },
  "three-quarter": { yaw: -0.72, pitch: 0.08, targetHeight: 0.52, coverage: 1.18 },
  side: { yaw: -Math.PI / 2, pitch: 0.06, targetHeight: 0.52, coverage: 1.18 },
  head: { yaw: -0.20, pitch: 0.04, targetHeight: 0.90, coverage: 0.42 },
  hand: { yaw: -0.55, pitch: -0.02, targetHeight: 0.52, coverage: 0.46 },
  gameplay: { yaw: -0.45, pitch: 0.55, targetHeight: 0.50, coverage: 1.35 },
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
      sceneReady: false, candidateLoaded: false, variant: this.variant, assetKey: null, loaded: false,
      meshCount: 0, triangleCount: 0, boneCount: 0, animations: [], currentAnimation: "none",
      materialNames: [], boundingBox: { min: [], max: [], height: 0 }, camera: this.cameraName,
      cameraSolved: null,
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
    this.state.sceneReady = true;
    this.state.candidateLoaded = this.state.loaded;
    this.publish();
  }

  setCamera(name: string): void {
    const framing = FRAMINGS[name] ?? FRAMINGS.front;
    this.cameraName = name in FRAMINGS ? name : "front";

    const box = this.state.boundingBox;
    const height = box.height > 0.01 ? box.height : 1.8;
    const centreX = box.min.length ? (box.min[0] + box.max[0]) / 2 : 0;
    const centreZ = box.min.length ? (box.min[2] + box.max[2]) / 2 : 0;
    const floor = box.min.length ? box.min[1] : 0;

    // Solve the distance that makes `coverage` fill the vertical field of
    // view, then keep it outside the body and outside the near plane.
    const wanted = height * framing.coverage;
    const halfWidth = box.min.length ? Math.max(
      Math.abs(box.max[0] - box.min[0]), Math.abs(box.max[2] - box.min[2])) / 2 : 0.3;
    const solved = (wanted * 0.5) / Math.tan(this.camera.fov * 0.5);
    const radius = Math.max(solved, halfWidth + this.camera.minZ * 4 + 0.12);

    // alpha is measured from +X in Babylon; the character faces +Z, so facing
    // the front means looking from +Z back toward the origin.
    this.camera.alpha = Math.PI / 2 + framing.yaw;
    this.camera.beta = Math.PI / 2 - framing.pitch;
    this.camera.radius = radius;
    this.camera.setTarget(new Vector3(centreX, floor + height * framing.targetHeight, centreZ));

    this.state.camera = this.cameraName;
    this.state.cameraSolved = {
      radius: Number(radius.toFixed(4)),
      alpha: Number(this.camera.alpha.toFixed(4)),
      beta: Number(this.camera.beta.toFixed(4)),
      targetY: Number((floor + height * framing.targetHeight).toFixed(4)),
      // Distance from the camera to the nearest point of the bounding box, so
      // a test can prove the near plane is not inside the model.
      clearanceFromBounds: Number((radius - halfWidth).toFixed(4)),
      insideBounds: radius <= halfWidth,
    };
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
