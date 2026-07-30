import { Matrix, Vector3 } from "@babylonjs/core";
import type { GameCamera } from "../camera/GameCamera";
import type { CombatWorld } from "../combat/CombatWorld";
import type { Damageable } from "../combat/Damageable";

/** Cursor tolerance in CSS pixels. */
const PICK_RADIUS = 46;

/**
 * Finds what the cursor is over by projecting candidates to the screen rather
 * than ray-picking.
 *
 * Every unit mesh is `isPickable = false` — they are instanced and the picker
 * would have to walk them all — so a screen-space nearest test is both cheaper
 * and gives a forgiving hit area, which is what a hover tooltip wants.
 */
export class HoverPicker {
  private readonly projected = new Vector3();

  constructor(
    private readonly world: CombatWorld,
    private readonly camera: GameCamera,
  ) {}

  find(pointer: { x: number; y: number } | null, width: number, height: number): Damageable | null {
    if (!pointer) return null;
    const scene = this.camera.camera.getScene();
    const transform = scene.getTransformMatrix();
    const viewport = this.camera.camera.viewport.toGlobal(width, height);

    let best: Damageable | null = null;
    let bestDist = PICK_RADIUS * PICK_RADIUS;

    const consider = (target: Damageable | null): void => {
      if (!target?.alive) return;
      Vector3.ProjectToRef(target.position, Matrix.IdentityReadOnly, transform, viewport, this.projected);
      if (this.projected.z <= 0 || this.projected.z >= 1) return;
      const dx = this.projected.x - pointer.x;
      const dy = this.projected.y - pointer.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = target;
      }
    };

    for (const enemy of this.world.enemies) consider(enemy);
    for (const ally of this.world.allies) consider(ally);
    for (const structure of this.world.structures) consider(structure);
    consider(this.world.hero);
    consider(this.world.furnace);
    return best;
  }
}
