import type { Vector3 } from "@babylonjs/core";
import type { ResourceKind } from "../data/EconomyConfig";
import type { NodeSize } from "../data/ResourceNodeConfig";
import type { ResourceNodeView } from "./ResourceNodeView";

export type NodeState = "available" | "beingHarvested" | "depleted" | "regrowing" | "removed";

let nextNodeId = 1;

/**
 * A finite tree or rock.
 *
 * Capacity is real: every successful strike decrements it, and at zero the node
 * stops producing, drops its harvest collision and changes appearance. Nothing
 * here is on a timer that could quietly refill it.
 */
export class NaturalResourceNode {
  readonly id = nextNodeId++;
  readonly kind: ResourceKind;
  readonly size: NodeSize;
  readonly capacity: number;
  readonly position: Vector3;

  private _remaining: number;
  private _state: NodeState = "available";
  private regrowTimer = 0;
  private respawnTimer = 0;

  constructor(
    kind: "wood" | "stone",
    size: NodeSize,
    capacity: number,
    private readonly view: ResourceNodeView,
  ) {
    this.kind = kind;
    this.size = size;
    this.capacity = capacity;
    this._remaining = capacity;
    this.position = view.position;
    this.view.setStage(1);
  }

  get viewMeshes(): import("@babylonjs/core").Mesh[] {
    return this.view.meshes;
  }

  get remaining(): number {
    return this._remaining;
  }
  get state(): NodeState {
    return this._state;
  }
  /** Only an available node can be worked. */
  get harvestable(): boolean {
    return (this._state === "available" || this._state === "beingHarvested") && this._remaining > 0;
  }
  get isDepleted(): boolean {
    return this._state === "depleted";
  }
  get fillRatio(): number {
    return this.capacity > 0 ? this._remaining / this.capacity : 0;
  }

  distanceSqTo(x: number, z: number): number {
    const dx = this.position.x - x;
    const dz = this.position.z - z;
    return dx * dx + dz * dz;
  }

  markHarvesting(active: boolean): void {
    if (!this.harvestable) return;
    this._state = active ? "beingHarvested" : "available";
  }

  /**
   * Takes exactly one unit. Returns 0 once the node is spent, which is what
   * stops the hero from farming the same tree forever.
   */
  extractOne(): number {
    if (!this.harvestable) return 0;
    this._remaining -= 1;
    this.view.playHitReaction();
    this.view.setStage(this.fillRatio);
    if (this._remaining <= 0) this.deplete();
    return 1;
  }

  private deplete(): void {
    this._remaining = 0;
    this._state = "depleted";
    // The stump / rubble is scenery only — it can no longer be worked.
    this.view.showDepleted();
  }

  /** Endless mode only; stage mode never calls this. */
  beginRespawn(seconds: number): void {
    if (this._state !== "depleted") return;
    this.respawnTimer = seconds;
  }

  update(dt: number, regrowSeconds: number): void {
    if (this._state === "depleted" && this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this._state = "regrowing";
        this.regrowTimer = 0;
        this.view.beginRegrow();
      }
      return;
    }

    if (this._state === "regrowing") {
      this.regrowTimer += dt;
      const t = Math.min(1, this.regrowTimer / Math.max(0.1, regrowSeconds));
      // A visible sapling-to-tree growth, never a pop-in.
      this.view.setRegrowProgress(t);
      if (t >= 1) {
        this._state = "available";
        this._remaining = this.capacity;
        this.view.finishRegrow();
      }
    }

    this.view.update(dt);
  }

  /** Restores the node to full for a fresh run. */
  reset(): void {
    this._remaining = this.capacity;
    this._state = "available";
    this.regrowTimer = 0;
    this.respawnTimer = 0;
    this.view.restore();
    this.view.setStage(1);
  }

  dispose(): void {
    this._state = "removed";
    this.view.dispose();
  }
}
