import { Vector3 } from "@babylonjs/core";
import type { CombatUnit } from "../combat/CombatUnit";
import type { Damageable } from "../combat/Damageable";
import { STUCK } from "./AIConfig";
import { CombatMovement } from "./BrainCombatStates";
import type { FormationSlotManager } from "./FormationSlotManager";
import type { StuckDetector } from "./StuckDetector";

export type RecoveryOutcome = "continue" | "returnToFormation" | "dropTarget" | "finished";

export interface RecoveryContext {
  unit: CombatUnit;
  target: Damageable | null;
  formation: FormationSlotManager;
  stuck: StuckDetector;
  rally: Vector3 | null;
  sideStepSign: number;
  stateElapsed: number;
}

/**
 * Escalating recovery for a unit that has stopped making progress.
 *
 * The order matters: sidestep, then a different attack slot, then fall back to
 * the formation, then give up on the target entirely. Repositioning is the very
 * last resort and only ever moves toward the rally point — never onto a target
 * and never across a wall, because a teleport-first policy hides real pathing
 * bugs instead of fixing them.
 */
export function stepRecovery(ctx: RecoveryContext, dt: number): RecoveryOutcome {
  const { unit, stuck } = ctx;
  unit.clearMotorVelocity();
  const attempts = stuck.attempts;

  if (attempts <= 1) {
    stuck.noteRecovery("sideStep");
    const towardX = ctx.target ? ctx.target.position.x : (ctx.rally?.x ?? 0);
    const towardZ = ctx.target ? ctx.target.position.z : (ctx.rally?.z ?? 0);
    movement.sideStep(unit, towardX, towardZ, ctx.sideStepSign, STUCK.sideStepDistance, dt);
  } else if (attempts <= 2 && ctx.target) {
    stuck.noteRecovery("newAttackSlot");
    movement.reslot(unit, ctx.target, ctx.formation, ctx.sideStepSign, dt);
  } else if (attempts <= 3 && ctx.rally) {
    stuck.noteRecovery("returnToFormation");
    return "returnToFormation";
  } else {
    stuck.noteRecovery("dropTarget");
    return "dropTarget";
  }

  if (ctx.stateElapsed < STUCK.window * 1.25) return "continue";

  if (stuck.needsHardCorrection) {
    stuck.noteRecovery("safeNudge");
    unit.safeReposition(ctx.rally);
  }
  return "finished";
}

const movement = new CombatMovement();
