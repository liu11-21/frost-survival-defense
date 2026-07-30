import type { Vector3 } from "@babylonjs/core";
import type { Faction } from "../data/CombatTypes";

export type TargetKind = "unit" | "hero" | "wall" | "tower" | "warehouse" | "recruitHall" | "furnace";

/** Coarse kind-level order; unit subtiers are resolved in `UnitTargeting`. */
export const TARGET_PRIORITY: Record<TargetKind, number> = {
  hero: 3,
  unit: 2,
  wall: 0,
  tower: 4,
  warehouse: 4,
  recruitHall: 4,
  furnace: 5,
};

/** Anything that can be attacked and can die. */
export interface Damageable {
  readonly damageId: number;
  readonly faction: Faction;
  readonly position: Vector3;
  readonly alive: boolean;
  /** Stopping distance so attackers do not walk inside the model. */
  readonly hitRadius: number;
  readonly kind: TargetKind;
  /** Enemy tier for "highest level first" targeting; 0 for structures. */
  readonly level: number;
  /** Used by enemy ranged units picking the most dangerous thing in range. */
  readonly threat: number;
  readonly health: number;
  readonly maxHealth: number;
  applyDamage(amount: number, fromX: number, fromZ: number): void;
}

let nextDamageId = 1;
export function allocateDamageId(): number {
  return nextDamageId++;
}
