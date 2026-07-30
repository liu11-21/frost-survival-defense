import { RETARGET_INTERVAL, STATE_TIMEOUT } from "./AIConfig";
import { gateWaypoint } from "./GateRouting";
import type { FriendlyBrain } from "./FriendlyStateMachine";

/**
 * The non-combat half of the friendly brain: healing, the formation walk and
 * the holding pattern.
 *
 * Split out of the state machine so that file stays about transitions. Each of
 * these still obeys the same two rules — one active state, and every wait has a
 * timeout with a defined exit.
 */

export function tickAcquireHeal(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);

  if (b.retargetReady) {
    b.setRetarget(RETARGET_INTERVAL.heal);
    if (b.deps.hasHealTarget?.(b.unit)) {
      b.markActive();
      b.go("moveToHealRange", "healTargetFound");
      return;
    }
    b.setRetarget(RETARGET_INTERVAL.idle);
  }

  // Nobody to heal: fall back to the rally point rather than standing exposed.
  if (b.stateTime >= STATE_TIMEOUT.acquireTarget) {
    b.markActive();
    b.go(b.hasRally ? "followFormation" : "holdPosition", "noHealTarget");
  }
}

export function tickMoveToHeal(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  const pos = b.deps.findHealPosition?.(b.unit) ?? null;
  if (!pos) {
    b.go("acquireHealTarget", "healTargetGone");
    return;
  }

  // Global search means the patient can be anywhere on the field; walk to
  // within comfortable heal range of them — routed through a gate first if
  // they are on the other side of the perimeter — rather than only ever
  // healing whoever happens to already be near the rally point.
  const dist = b.unit.distanceTo(pos.x, pos.z);
  if (dist > b.unit.def.attackRange * 0.85) {
    const gate = gateWaypoint(b.unit.position.x, b.unit.position.z, pos.x, pos.z);
    const goal = gate ?? pos;
    b.unit.moveMotor(goal.x, goal.z, dt, b.deps.formation);
    b.checkStuck(dt, "moveToHealRange");
    return;
  }

  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);
  // Holding station waiting for the heal timer is not a stall.
  b.markActive();

  if (b.unit.canStartAttack() && b.deps.requestHeal?.(b.unit)) {
    b.startHeal();
    return;
  }
  if (b.stateTime >= 1.5) b.go("acquireHealTarget", "healStalled");
}

export function tickFormation(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;

  if (b.retargetReady) {
    b.setRetarget(RETARGET_INTERVAL.idle);
    const found = b.isHealer || b.isEngineer ? null : b.unit.findHostileTarget();
    if (found) {
      b.setTarget(found);
      b.stuck.reset(b.unit.position.x, b.unit.position.z, b.clock);
      b.go("moveToTarget", "targetSpotted");
      return;
    }
    if (b.isHealer && b.deps.hasHealTarget?.(b.unit)) {
      b.go("moveToHealRange", "healNeeded");
      return;
    }
    if (b.isEngineer) {
      b.go("acquireRepairTarget", "engineerScan");
      return;
    }
  }

  if (!b.hasRally) {
    b.go("holdPosition", "noRally");
    return;
  }

  const dist = b.unit.distanceTo(b.rally.x, b.rally.z);
  if (dist > 0.7) {
    b.unit.moveMotor(b.rally.x, b.rally.z, dt, b.deps.formation);
    b.checkStuck(dt, "followFormation");
    return;
  }

  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);
  b.markActive();
  if (b.state === "returnToFormation") b.go("followFormation", "arrived");
}

export function tickHold(brain: FriendlyBrain, dt: number): void {
  const b = brain.internals;
  b.unit.brakeMotor(dt);
  b.stuck.markIdle(b.clock);
  b.markActive();

  if (b.hasRally) {
    b.go("followFormation", "rallyAvailable");
    return;
  }
  if (b.retargetReady) {
    b.setRetarget(RETARGET_INTERVAL.idle);
    b.go(b.isHealer ? "acquireHealTarget" : b.isEngineer ? "acquireRepairTarget" : "acquireTarget", "holdRetry");
  }
}
