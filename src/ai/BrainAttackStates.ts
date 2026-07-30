import { validateTarget } from "./TargetValidator";
import type { FriendlyBrain } from "./FriendlyStateMachine";

/**
 * The two states around a swing.
 *
 * `tickWindup` carries the single most important stall guard in the game: if the
 * animation's hit-frame event never arrives, the swing is abandoned on a budget
 * rather than left frozen mid-pose waiting for it.
 */
export function tickWindup(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  if (b.target) b.unit.faceMotor(b.target.position.x, b.target.position.z, dt);
  b.stuck.markIdle(b.clock);

  if (b.stateTime < b.windupBudget) return;
  b.cancelSwing();
  b.go(b.isHealer ? "acquireHealTarget" : b.isEngineer ? "acquireRepairTarget" : "acquireTarget", "windupTimeout");
}

export function tickRecover(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);
  if (!b.recoverReady) return;

  if (b.isHealer) {
    b.go("acquireHealTarget", "recovered");
    return;
  }
  if (b.isEngineer) {
    // A repair target stays a repair target; a self-defence swing at a
    // hostile continues the fight instead of re-checking repair mid-combat.
    if (b.target && validateTarget(b.unit, b.target) === "ok") {
      b.go(b.target.faction === b.unit.faction ? "moveToRepairRange" : "moveToTarget", "recovered");
    } else {
      b.go("acquireRepairTarget", "recoveredNoTarget");
    }
    return;
  }
  if (b.target && validateTarget(b.unit, b.target) === "ok") {
    b.go("moveToTarget", "recovered");
  } else {
    b.go("acquireTarget", "recoveredNoTarget");
  }
}
