import { validateTarget } from "../ai/TargetValidator";
import { nextLaneWaypoint } from "../data/LaneNavigation";
import type { CombatUnit } from "./CombatUnit";
import {
  enemyTargetPriority,
  isCrossLaneUnitTarget,
  targetOutOfLeash,
} from "./UnitTargeting";

/** How often an enemy re-asks whether a higher-priority / same-lane target appeared. */
const REACH_INTERVAL = 0.2;

/**
 * Compact enemy loop with one extra lane invariant:
 *
 * - normal same-lane defenders can interrupt waypoint marching;
 * - a permitted cross-lane fallback is never chased. It fires only while the
 *   target is in real attack range, then movement resumes along this unit's own
 *   lane during the cooldown;
 * - the furnace remains the nominal target while no defender is locally legal,
 *   so EnemyNavigator can keep advancing the winding route.
 */
export function updateEnemyBrain(unit: CombatUnit, dt: number, reachTimer: number): number {
  let nextTimer = reachTimer - dt;
  const staleReach = nextTimer <= 0;
  if (staleReach) nextTimer = REACH_INTERVAL;

  let current = unit.currentTarget;
  const currentInvalid =
    !current ||
    validateTarget(unit, current) !== "ok" ||
    (unit.faction === "enemy" && (current as { isSky?: boolean }).isSky === true) ||
    targetOutOfLeash(unit, current) ||
    (staleReach && !unit.canReach(current));

  if (currentInvalid) {
    unit.setTarget(unit.findHostileTarget());
  } else if (staleReach && !unit.def.siegeFocus && !unit.def.selfDestruct) {
    const previous = current;
    const previousCross = isCrossLaneUnitTarget(unit, previous);
    const preferred = unit.findHostileTarget();
    const preferredCross = isCrossLaneUnitTarget(unit, preferred);

    const shouldRestorePrevious =
      !preferred ||
      (previousCross && preferredCross && enemyTargetPriority(preferred) >= enemyTargetPriority(previous)) ||
      (!previousCross && enemyTargetPriority(preferred) >= enemyTargetPriority(previous));
    if (shouldRestorePrevious) unit.setTarget(previous);
  }

  const target = unit.currentTarget;
  if (!target) {
    const advance = unit.navPoint ?? nextLaneWaypoint(unit.laneIndex, unit.position.x, unit.position.z, "inbound");
    unit.moveMotor(advance.x, advance.z, dt, null);
    return nextTimer;
  }

  const crossLaneFallback = isCrossLaneUnitTarget(unit, target);
  if (crossLaneFallback) {
    const distance = unit.distanceTo(target.position.x, target.position.z);
    if (distance > unit.attackReach(target)) {
      unit.setTarget(null);
      const advance = unit.navPoint ?? nextLaneWaypoint(unit.laneIndex, unit.position.x, unit.position.z, "inbound");
      unit.moveMotor(advance.x, advance.z, dt, null);
      return nextTimer;
    }

    unit.faceMotor(target.position.x, target.position.z, dt);
    if (unit.canStartAttack()) {
      unit.brakeMotor(dt);
      unit.beginStrike();
    } else {
      const advance = unit.navPoint ?? nextLaneWaypoint(unit.laneIndex, unit.position.x, unit.position.z, "inbound");
      unit.moveMotor(advance.x, advance.z, dt, null);
    }
    return nextTimer;
  }

  const targetIsSameLaneUnit = target.kind === "unit";
  const targetDistance = unit.distanceTo(target.position.x, target.position.z);
  const shouldFollowRoad =
    unit.navPoint !== null &&
    unit.breachTarget === null &&
    (target.kind === "furnace" || (targetIsSameLaneUnit && targetDistance > unit.attackReach(target)));

  const goalX = shouldFollowRoad && unit.navPoint ? unit.navPoint.x : target.position.x;
  const goalZ = shouldFollowRoad && unit.navPoint ? unit.navPoint.z : target.position.z;
  const dist = unit.distanceTo(goalX, goalZ);
  const stopAt = shouldFollowRoad ? 0.9 : unit.attackReach(target);

  if (dist > stopAt) {
    unit.moveMotor(goalX, goalZ, dt, null);
  } else if (shouldFollowRoad) {
    // EnemyNavigator refreshes this waypoint every 0.35s. The look-ahead
    // contract in nextLaneWaypoint guarantees the refreshed point is beyond
    // the bend instead of the endpoint we have just reached.
    unit.brakeMotor(dt);
  } else {
    unit.brakeMotor(dt);
    unit.faceMotor(target.position.x, target.position.z, dt);
    if (unit.canStartAttack()) unit.beginStrike();
  }
  return nextTimer;
}
