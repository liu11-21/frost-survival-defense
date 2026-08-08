import type { Mesh, Scene, TransformNode } from "@babylonjs/core";
import { BuildingAnimator } from "../construction/BuildingAnimator";
import type { BuildingType } from "../data/BuildingDefinitions";
import type { GameEvents } from "../game/GameEvents";
import type { MaterialFactory } from "../scene/MaterialFactory";
import type { AssetInstance } from "../assets/AssetTypes";
import type { AssetRegistry } from "../assets/AssetRegistry";
import { findAnimationGroup } from "../assets/AnimationRegistry";
import { createBuildingVisual } from "./BuildingMeshFactory";
import type { BuildStageDef } from "../construction/BuildingAnimator";

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

const AUTHORED_BUILDING_KEYS: Partial<Record<BuildingType, string>> = {
  mine: "mine",
  goldMine: "gold_mine",
  lumberyard: "lumberyard",
  warehouse: "warehouse",
  recruitHall: "recruit_hall",
  autoCollector: "auto_collector",
  autoRebuilder: "auto_rebuilder",
  tower: "turret_basic",
  crossbowTower: "crossbow_tower",
  frostTower: "frost_tower",
  sniperTower: "sniper_tower",
  mortar: "mortar",
  wall: "wall_gate",
};

/**
 * Runtime-only presentation scale. This intentionally does NOT touch Blender,
 * GLB authoring, collision, costs or combat radii: the gameplay branch owns
 * scene density, while Claude's art branch keeps ownership of source assets.
 * Walls stay at authored scale because their physical span is the perimeter
 * contract; every other facility reads less crowded beside the narrow lanes.
 */
const FACILITY_RUNTIME_SCALE = 0.82;

function applyRuntimeScale(root: TransformNode, type: BuildingType): void {
  if (type === "wall") return;
  root.scaling.scaleInPlace(FACILITY_RUNTIME_SCALE);
}

/**
 * Owns one building's meshes for its whole life.
 *
 * A building owns its *instances*, never shared materials/textures. This is
 * why dispose/repair never dispose cached materials used by sibling buildings.
 */
export class BuildingVisualController {
  readonly animator: BuildingAnimator;
  private rootNode: TransformNode;
  private readonly ownedMeshes: Mesh[];
  private readonly stageMeshes: Mesh[][];
  private authored: AssetInstance | null = null;
  private readonly authoredKey: string | null;
  private recoilTime = 0;
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
    private readonly assets?: AssetRegistry,
  ) {
    this.authoredKey = AUTHORED_BUILDING_KEYS[type] ?? null;
    const authored = this.authoredKey ? assets?.instantiate(this.authoredKey, `${type}.${slotId}`) ?? null : null;
    const visual = authored
      ? authoredVisual(authored, scene, x, z, yaw, elevation)
      : createBuildingVisual(scene, materials, type, x, z, yaw, slotId);
    this.authored = authored;
    this.rootNode = visual.root;
    this.rootNode.position.y = elevation;
    applyRuntimeScale(this.rootNode, type);
    if (authored) {
      findAnimationGroup(authored.animationGroups, "Idle")?.start(true, 1);
    }
    this.ownedMeshes = visual.body;
    this.stageMeshes = visual.stages.map((stage) => stage.meshes);
    this.animator = new BuildingAnimator(events, `${type}@${slotId}`, visual.stages);
  }

  get root(): TransformNode { return this.rootNode; }
  get currentPhase(): VisualPhase { return this.phase; }
  get isFinished(): boolean { return this.animator.isFinished; }
  get meshes(): ReadonlyArray<Mesh> { return this.ownedMeshes; }

  setPhase(phase: VisualPhase): void { this.phase = phase; }

  update(dt: number): void {
    if (this.phase === "disposed") return;
    this.animator.update(dt);
    if (this.recoilTime > 0) {
      this.recoilTime = Math.max(0, this.recoilTime - dt);
      const recoil = this.authored?.nodes.find((node) => node.name.endsWith(":recoilPart"));
      if (recoil && "position" in recoil) {
        (recoil as TransformNode).position.z = this.recoilTime > 0 ? -0.12 : 0;
      }
    }
    if (!this.animator.isFinished) return;
    if (this.phase === "constructing") {
      this.phase = "completed";
      this.syncCompleted();
    }
  }

  /** Restores every part of a finished building to its visible state. */
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

  /** Rebuild geometry only when the visual validator finds missing parts. */
  repair(): void {
    if (this.phase === "disposed") return;
    this.disposeMeshes();
    this.authored?.dispose();
    this.authored = null;
    this.rootNode.dispose(false, false);

    const authored = this.authoredKey
      ? this.assets?.instantiate(this.authoredKey, `${this.type}.${this.slotId}.repair`) ?? null
      : null;
    const visual = authored
      ? authoredVisual(authored, this.scene, this.x, this.z, this.yaw, this.elevation)
      : createBuildingVisual(this.scene, this.materials, this.type, this.x, this.z, this.yaw, this.slotId);
    this.authored = authored;
    this.rootNode = visual.root;
    this.rootNode.position.y = this.elevation;
    applyRuntimeScale(this.rootNode, this.type);
    if (authored) {
      findAnimationGroup(authored.animationGroups, "Idle")?.start(true, 1);
    }
    replaceContents(this.ownedMeshes, visual.body);
    this.stageMeshes.length = 0;
    for (const stage of visual.stages) {
      this.stageMeshes.push(stage.meshes);
      for (const mesh of stage.meshes) mesh.setEnabled(true);
    }
    this.syncCompleted();
  }

  playDemolish(dt: number, duration: number): number {
    this.phase = "demolishing";
    this.demolishTime += dt;
    const t = Math.min(1, this.demolishTime / Math.max(0.1, duration));
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

  dispose(): void {
    if (this.phase === "disposed") return;
    this.phase = "disposed";
    this.disposeMeshes();
    this.authored?.dispose();
    this.authored = null;
    this.rootNode.dispose(false, false);
  }

  aimAt(x: number, z: number): void {
    const pivot = this.authored?.nodes.find((node) => node.name.endsWith(":yawPivot"));
    if (pivot && "rotation" in pivot) {
      (pivot as TransformNode).rotation.y = Math.atan2(x - this.x, z - this.z) - this.yaw;
    }
  }

  pulseRecoil(): void {
    if (!this.authored) return;
    const group = findAnimationGroup(this.authored.animationGroups, "Recoil");
    if (group) group.start(false);
    this.recoilTime = 0.12;
  }

  setGateOpen(open: boolean): void {
    if (this.type !== "wall" || !this.authored) return;
    const group = findAnimationGroup(this.authored.animationGroups, open ? "GateOpen" : "GateClose");
    group?.start(false);
  }

  private disposeMeshes(): void {
    for (const mesh of this.ownedMeshes) {
      if (!mesh.isDisposed()) mesh.dispose(false, false);
    }
  }
}

function authoredVisual(
  instance: AssetInstance,
  _scene: Scene,
  x: number,
  z: number,
  yaw: number,
  elevation: number,
): { root: TransformNode; stages: BuildStageDef[]; body: Mesh[] } {
  instance.root.position.set(x, elevation, z);
  instance.root.rotation.y = yaw;
  const body = instance.meshes as Mesh[];
  const anchor = instance.root.position.clone();
  const stages: BuildStageDef[] = [{ name: "authored", meshes: body, anchor }];
  return { root: instance.root, stages, body };
}

function replaceContents<T>(target: T[], next: ReadonlyArray<T>): void {
  target.length = 0;
  for (const item of next) target.push(item);
}
