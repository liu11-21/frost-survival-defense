import type { Mesh, Scene, TransformNode } from "@babylonjs/core";
import { BuildingAnimator } from "../construction/BuildingAnimator";
import type { BuildingType } from "../data/BuildingDefinitions";
import type { GameEvents } from "../game/GameEvents";
import type { MaterialFactory } from "../scene/MaterialFactory";
import { createBuildingVisual } from "./BuildingMeshFactory";

export type VisualPhase =
  | "constructing"
  | "completed"
  | "damaged"
  | "destroyed"
  | "demolishing"
  | "disposed";

export interface VisualIntegrity {
  required: number;
  enabled: number;
  disposed: number;
  materialsLost: number;
  ok: boolean;
}

/**
 * Owns one building's meshes for its whole life.
 *
 * The important rule lives in `dispose`: a building owns its *instances*, never
 * the shared materials or textures behind them. The previous code called
 * `root.dispose(false, true)`, and that second argument disposes the materials
 * of every descendant — which were the cached `MaterialFactory` materials every
 * other building was also using. One demolished wall therefore tore the
 * albedo textures out from under every stone, plank, beam and roof mesh in the
 * base, and Babylon silently stops drawing a mesh whose material is not ready.
 * That is why parts of finished buildings vanished, and why it showed up in
 * endless mode first: it is the only mode that destroys and rebuilds enough
 * times to hit it.
 */
export class BuildingVisualController {
  readonly animator: BuildingAnimator;
  private rootNode: TransformNode;
  private readonly ownedMeshes: Mesh[];
  private readonly stageMeshes: Mesh[][];
  private phase: VisualPhase = "constructing";
  private demolishTime = 0;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialFactory,
    events: GameEvents,
    readonly type: BuildingType,
    readonly slotId: string,
    private readonly x: number,
    private readonly z: number,
    private readonly yaw: number,
    private readonly elevation = 0,
  ) {
    const visual = createBuildingVisual(scene, materials, type, x, z, yaw, slotId);
    this.rootNode = visual.root;
    this.rootNode.position.y = elevation;
    this.ownedMeshes = visual.body;
    this.stageMeshes = visual.stages.map((s) => s.meshes);
    this.animator = new BuildingAnimator(events, `${type}@${slotId}`, visual.stages);
  }

  get root(): TransformNode {
    return this.rootNode;
  }
  get currentPhase(): VisualPhase {
    return this.phase;
  }
  get isFinished(): boolean {
    return this.animator.isFinished;
  }
  get meshes(): ReadonlyArray<Mesh> {
    return this.ownedMeshes;
  }

  setPhase(phase: VisualPhase): void {
    this.phase = phase;
  }

  update(dt: number): void {
    if (this.phase === "disposed") return;
    this.animator.update(dt);
    if (!this.animator.isFinished) return;
    if (this.phase === "constructing") {
      this.phase = "completed";
      this.syncCompleted();
    }
  }

  /**
   * Brings every part of a finished building back to its correct visible state.
   * Called on completion, after a rebuild, after a quality change and when the
   * tab regains focus — a safety net, not a substitute for the fix above.
   */
  syncCompleted(): void {
    if (this.phase === "disposed" || this.phase === "demolishing") return;
    if (!this.rootNode.isEnabled()) this.rootNode.setEnabled(true);
    for (const group of this.stageMeshes) {
      for (const mesh of group) {
        if (mesh.isDisposed()) continue;
        if (!mesh.isEnabled()) mesh.setEnabled(true);
        if (!mesh.isVisible) mesh.isVisible = true;
        if (mesh.visibility < 1) mesh.visibility = 1;
      }
    }
    this.rootNode.computeWorldMatrix(true);
  }

  /** Counts what should be on screen against what actually is. */
  inspect(): VisualIntegrity {
    let required = 0;
    let enabled = 0;
    let disposed = 0;
    let materialsLost = 0;
    for (const group of this.stageMeshes) {
      for (const mesh of group) {
        required++;
        if (mesh.isDisposed()) {
          disposed++;
          continue;
        }
        const mat = mesh.material;
        // A disposed shared material leaves the mesh unrenderable but present.
        if (!mat || mat.getScene() === null) materialsLost++;
        if (mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0.01) enabled++;
      }
    }
    const completed = this.phase === "completed" || this.phase === "damaged";
    return {
      required,
      enabled,
      disposed,
      materialsLost,
      ok: !completed || (enabled === required && disposed === 0 && materialsLost === 0),
    };
  }

  /**
   * Rebuilds this building's meshes from scratch when the validator finds a
   * part that no longer exists. It replaces geometry only: no resource is
   * spent, no combat or health-bar registration is touched.
   */
  repair(): void {
    if (this.phase === "disposed") return;
    this.disposeMeshes();
    this.rootNode.dispose(true, false);

    const visual = createBuildingVisual(this.scene, this.materials, this.type, this.x, this.z, this.yaw, this.slotId);
    this.rootNode = visual.root;
    this.rootNode.position.y = this.elevation;
    replaceContents(this.ownedMeshes, visual.body);
    this.stageMeshes.length = 0;
    for (const stage of visual.stages) {
      this.stageMeshes.push(stage.meshes);
      for (const mesh of stage.meshes) mesh.setEnabled(true);
    }
    this.syncCompleted();
  }

  /** Progress 0 → 1 of the take-apart animation. */
  playDemolish(dt: number, duration: number): number {
    this.phase = "demolishing";
    this.demolishTime += dt;
    const t = Math.min(1, this.demolishTime / Math.max(0.1, duration));
    // Parts come off from the top down, so the shape reads as being taken apart.
    const groups = this.stageMeshes.length;
    for (let i = 0; i < groups; i++) {
      const groupStart = (groups - 1 - i) / groups;
      const local = Math.max(0, Math.min(1, (t - groupStart) * groups));
      for (const mesh of this.stageMeshes[i]) {
        if (mesh.isDisposed()) continue;
        const shrink = 1 - local;
        mesh.scaling.setAll(Math.max(0.001, shrink));
        mesh.position.y -= local * dt * 1.4;
        if (local >= 1 && mesh.isEnabled()) mesh.setEnabled(false);
      }
    }
    return t;
  }

  /**
   * Disposes only what this instance created. Materials and textures belong to
   * the shared registry and outlive every individual building.
   */
  dispose(): void {
    if (this.phase === "disposed") return;
    this.phase = "disposed";
    this.disposeMeshes();
    this.rootNode.dispose(true, false);
  }

  private disposeMeshes(): void {
    for (const mesh of this.ownedMeshes) {
      if (!mesh.isDisposed()) mesh.dispose(false, false);
    }
  }
}

function replaceContents<T>(target: T[], next: ReadonlyArray<T>): void {
  target.length = 0;
  for (const item of next) target.push(item);
}
