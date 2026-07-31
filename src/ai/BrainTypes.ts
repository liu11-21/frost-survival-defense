import type { Vector3 } from "@babylonjs/core";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import type { Damageable } from "../combat/Damageable";
import type { FormationSlotManager } from "./FormationSlotManager";
import type { StuckDetector } from "./StuckDetector";

/** Every state a friendly unit can be in. Exactly one is active at a time. */
export type AllyState =
  | "spawn"
  | "followFormation"
  | "acquireTarget"
  | "moveToTarget"
  | "attackWindup"
  | "attackRecover"
  | "holdPosition"
  | "returnToFormation"
  | "stuckRecovery"
  | "acquireHealTarget"
  | "moveToHealRange"
  | "healWindup"
  | "healRecover"
  | "acquireRepairTarget"
  | "moveToRepairRange"
  | "repairWindup"
  | "repairRecover"
  | "selectTeleportTarget"
  | "teleport"
  | "ambushAttack"
  | "dead";

/** A recorded transition, kept as a short ring buffer for the debug panel. */
export interface AIEvent {
  at: number;
  from: AllyState;
  to: AllyState;
  reason: string;
}

/** Everything the brain needs from the wider game, without reaching into it. */
export interface BrainDeps {
  ctx: CombatContext;
  formation: FormationSlotManager;
  /** Squad-level heal request; returns true if a heal event was started. */
  requestHeal?: (unit: CombatUnit) => boolean;
  /** True while a heal target exists anywhere on the field. */
  hasHealTarget?: (unit: CombatUnit) => boolean;
  /** Where to stand to reach the current heal target, or null. */
  findHealPosition?: (unit: CombatUnit) => { x: number; z: number } | null;
  /** Applies the armed squad heal on the healer's hit frame. */
  releaseHeal?: (unit: CombatUnit) => boolean;
  /** Engineer: the nearest unclaimed repairable structure, or null. */
  findRepairTarget?: (unit: CombatUnit) => Damageable | null;
  /** Arms one squad-wide repair event on the given structure. */
  requestRepair?: (unit: CombatUnit, target: Damageable) => boolean;
  /** Applies the armed squad repair on the engineer's hit frame. */
  releaseRepair?: (unit: CombatUnit) => boolean;
}

/** The narrow surface the split-out idle and heal states are allowed to touch. */
export interface BrainInternals {
  unit: CombatUnit;
  deps: BrainDeps;
  stuck: StuckDetector;
  rally: Vector3;
  hasRally: boolean;
  isHealer: boolean;
  isEngineer: boolean;
  isSupporter: boolean;
  state: AllyState;
  stateTime: number;
  clock: number;
  retargetReady: boolean;
  setRetarget(seconds: number): void;
  markActive(): void;
  setTarget(target: Damageable | null): void;
  go(to: AllyState, reason: string): void;
  startHeal(): void;
  startRepair(): void;
  /** Walks toward a stationary structure target, melee-style. */
  approach(target: Damageable, dt: number): void;
  checkStuck(dt: number, from: AllyState): void;
  target: Damageable | null;
  windupBudget: number;
  recoverReady: boolean;
  cancelSwing(): void;
}
