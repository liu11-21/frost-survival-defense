import { RETARGET_INTERVAL, STATE_TIMEOUT } from "./AIConfig";
import type { FriendlyBrain } from "./FriendlyStateMachine";

/**
 * The engineer's repair loop: scan every three seconds for the nearest
 * unclaimed damaged facility, walk to it, then complete one timed 10% pulse.
 * Engineers never enter combat and return to their furnace-side post when idle.
 */

export function tickAcquireRepair(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);

  if (b.retargetReady) {
    b.setRetarget(RETARGET_INTERVAL.engineer);
    const repairTarget = b.deps.findRepairTarget?.(b.unit) ?? null;
    if (repairTarget) {
      b.setTarget(repairTarget);
      b.stuck.reset(b.unit.position.x, b.unit.position.z, b.clock);
      b.markActive();
      b.go("moveToRepairRange", "repairTargetFound");
      return;
    }
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
    b.setTarget(null);
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
    if (b.deps.requestRepair?.(b.unit, target)) {
      b.startRepair();
    }
    return;
  }

  b.approach(target, dt);
  b.checkStuck(dt, "moveToRepairRange");
}
