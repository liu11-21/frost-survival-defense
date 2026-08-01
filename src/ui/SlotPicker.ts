import { Mesh, MeshBuilder, type Scene } from "@babylonjs/core";
import { BUILD_SLOTS, WALL_SEGMENT_DEPTH } from "../data/BuildSlotDefinitions";

/** How much larger than the slot's own footprint the invisible pick region is
 * — inside the 20-35% tolerance the click-responsiveness pass calls for. */
const PICK_RADIUS_FACTOR = 1.3;

/**
 * One invisible, oversized pick disc per build slot — universal slots and
 * wall slots alike, whether currently empty or occupied. A slot never moves
 * and is never destroyed for the run's duration, so a single mesh created
 * once at startup covers both "empty" and "built-on" clicks without any
 * per-building create/dispose lifecycle to track.
 *
 * These meshes never render, never cast shadows, never collide and never
 * block navigation — `isVisible = false` keeps them out of the render list
 * while leaving them fully pickable.
 */
export class SlotPicker {
  private readonly slotIdByMeshId = new Map<number, string>();
  private readonly meshes: Mesh[] = [];

  constructor(scene: Scene) {
    for (const def of BUILD_SLOTS) {
      const isWall = def.category === "wall";
      const radius = (isWall ? WALL_SEGMENT_DEPTH * 0.5 : def.footprintRadius) * PICK_RADIUS_FACTOR;
      const mesh = MeshBuilder.CreateDisc(
        `slotPicker.${def.id}`,
        { radius: Math.max(1.2, radius), tessellation: 16 },
        scene,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(def.x, def.surface === "sky" ? def.elevation + 0.05 : 0.05, def.z);
      mesh.isVisible = false;
      mesh.isPickable = true;
      mesh.checkCollisions = false;
      mesh.receiveShadows = false;
      mesh.doNotSyncBoundingInfo = true;
      this.slotIdByMeshId.set(mesh.uniqueId, def.id);
      this.meshes.push(mesh);
    }
  }

  /** Resolves a canvas-space pick to a slot id, or null if nothing was hit. */
  pick(scene: Scene, x: number, y: number): string | null {
    const info = scene.pick(x, y, (mesh) => this.slotIdByMeshId.has(mesh.uniqueId));
    if (!info?.hit || !info.pickedMesh) return null;
    return this.slotIdByMeshId.get(info.pickedMesh.uniqueId) ?? null;
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.dispose();
    this.meshes.length = 0;
    this.slotIdByMeshId.clear();
  }
}
