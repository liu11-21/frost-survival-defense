import { RETARGET_INTERVAL, STATE_TIMEOUT } from "./AIConfig";
import type { FriendlyBrain } from "./FriendlyStateMachine";

/**
 * The engineer's repair loop: find the weakest repairable structure, walk to
 * it, and swing a repair the same way a melee unit swings an attack. Falls
 * back to `findHostileTarget` for self-defence whenever nothing needs fixing,
 * so an engineer with no work to do is never defenceless.
 */

export function tickAcquireRepair(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);

  if (b.retargetReady) {
    b.setRetarget(RETARGET_INTERVAL.heal);
    const repairTarget = b.deps.findRepairTarget?.(b.unit) ?? null;
    if (repairTarget) {
      b.setTarget(repairTarget);
      b.stuck.reset(b.unit.position.x, b.unit.position.z, b.clock);
      b.markActive();
      b.go("moveToRepairRange", "repairTargetFound");
      return;
    }
    const enemy = b.unit.findHostileTarget();
    if (enemy) {
      b.setTarget(enemy);
      b.stuck.reset(b.unit.position.x, b.unit.position.z, b.clock);
      b.markActive();
      b.go("moveToTarget", "noRepairFightInstead");
      return;
    }
    b.setRetarget(RETARGET_INTERVAL.idle);
  }

  if (b.stateTime >= STATE_TIMEOUT.acquireTarget) {
    b.markActive();
    b.go(b.hasRally ? "followFormation" : "holdPosition", "engineerIdle");
  }
}

export function tickMoveToRepair(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  const target = b.target;
  if (!target || !target.alive || target.health >= target.maxHealth) {
    b.go("acquireRepairTarget", "repairTargetGone");
    return;
  }

  const reach = b.unit.attackReach(target);
  const dist = b.unit.distanceTo(target.position.x, target.position.z);

  if (dist <= reach) {
    b.unit.brakeMotor(dt);
    b.unit.faceMotor(target.position.x, target.position.z, dt);
    b.stuck.markIdle(b.clock);
    b.markActive();
    if (b.unit.canStartAttack() && b.deps.requestRepair?.(b.unit, target)) {
      b.startRepair();
    }
    return;
  }

  b.approach(target, dt);
  b.checkStuck(dt, "moveToRepairRange");
}
