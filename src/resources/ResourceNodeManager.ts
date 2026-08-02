import type { Scene } from "@babylonjs/core";
import {
  GATHER,
  RESPAWN,
  STONE_CAPACITY,
  STONE_NODES,
  TREE_CAPACITY,
  TREE_NODES,
} from "../data/ResourceNodeConfig";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { CollisionWorld } from "../util/Collision";
import type { AssetRegistry } from "../assets/AssetRegistry";
import { NaturalResourceNode } from "./NaturalResourceNode";
import { ResourceNodeView } from "./ResourceNodeView";

/**
 * Owns every natural node, finds the one the hero is working, and handles
 * regrowth in endless mode.
 */
export class ResourceNodeManager {
  readonly nodes: NaturalResourceNode[] = [];
  private readonly views: ResourceNodeView[] = [];
  private respawnEnabled = false;

  constructor(scene: Scene, materials: MaterialFactory, collision: CollisionWorld) {
    for (const spot of TREE_NODES) {
      const view = new ResourceNodeView(scene, materials, collision, "wood", spot.x, spot.z, spot.size);
      this.views.push(view);
      this.nodes.push(new NaturalResourceNode("wood", spot.size, TREE_CAPACITY[spot.size], view));
    }
    for (const spot of STONE_NODES) {
      const view = new ResourceNodeView(scene, materials, collision, "stone", spot.x, spot.z, spot.size);
      this.views.push(view);
      this.nodes.push(new NaturalResourceNode("stone", spot.size, STONE_CAPACITY[spot.size], view));
    }
  }

  /** Attach resource GLBs after AssetRegistry.preload; procedural visuals remain the fallback. */
  attachAuthoredAssets(assets: AssetRegistry): void {
    for (const view of this.views) view.attachAuthoredAssets(assets);
  }

  /** Endless mode regrows nodes; stage mode leaves them spent for the run. */
  setRespawnEnabled(enabled: boolean): void {
    this.respawnEnabled = enabled;
  }

  get totalRemaining(): { wood: number; stone: number } {
    let wood = 0;
    let stone = 0;
    for (const node of this.nodes) {
      if (node.kind === "wood") wood += node.remaining;
      else if (node.kind === "stone") stone += node.remaining;
    }
    return { wood, stone };
  }

  /** Closest workable node within gathering range, or null. */
  findNearest(x: number, z: number, range = GATHER.range): NaturalResourceNode | null {
    let best: NaturalResourceNode | null = null;
    let bestDist = range * range;
    for (const node of this.nodes) {
      if (!node.harvestable) continue;
      const d = node.distanceSqTo(x, z);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  /** Closest node of any state, used for prompts and the tutorial's highlight. */
  findNearestAny(x: number, z: number, range: number): NaturalResourceNode | null {
    let best: NaturalResourceNode | null = null;
    let bestDist = range * range;
    for (const node of this.nodes) {
      const d = node.distanceSqTo(x, z);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  update(dt: number): void {
    for (const node of this.nodes) {
      if (this.respawnEnabled && node.isDepleted) {
        node.beginRespawn(node.kind === "wood" ? RESPAWN.treeSeconds : RESPAWN.stoneSeconds);
      }
      node.update(dt, RESPAWN.regrowSeconds);
    }
  }

  /** Full reset between runs: everything back to full, nothing spent. */
  resetAll(): void {
    for (const node of this.nodes) node.reset();
  }

  dispose(): void {
    for (const node of this.nodes) node.dispose();
    this.nodes.length = 0;
    this.views.length = 0;
  }
}
