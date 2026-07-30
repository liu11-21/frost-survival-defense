import { validateTarget } from "../ai/TargetValidator";
import type { CombatUnit } from "./CombatUnit";
import { enemyTargetPriority, targetOutOfLeash } from "./UnitTargeting";

/** How often an enemy re-asks whether a higher-priority target has appeared. */
const REACH_INTERVAL = 0.2;

/**
 * The compact enemy loop.
 *
 * Allies get the full state machine; enemies only ever need to answer three
 * questions — is my target still legal, can I still get to it, and am I close
 * enough to swing. The reachability re-check is on a timer because a wall can
 * go up between an enemy and its target part way through the approach, and a
 * unit that only re-planned when its target *died* would walk into the new
 * stonework and grind against it.
 *
 * Returns the next value for the caller's reach timer.
 */
export function updateEnemyBrain(unit: CombatUnit, dt: number, reachTimer: number): number {
  let nextTimer = reachTimer - dt;
  const staleReach = nextTimer <= 0;
  if (staleReach) nextTimer = REACH_INTERVAL;

  let current = unit.currentTarget;
  const currentInvalid =
    !current ||
    validateTarget(unit, current) !== "ok" ||
    targetOutOfLeash(unit, current) ||
    (staleReach && !unit.canReach(current));

  if (currentInvalid) {
    unit.setTarget(unit.findHostileTarget());
  } else if (staleReach && !unit.def.siegeFocus && !unit.def.selfDestruct) {
    // `findHostileTarget` writes its result onto the unit. Keep a legal target
    // within its own tier to avoid nearest-target oscillation, but retain the
    // new result whenever it belongs to an earlier tier. This is what makes a
    // rebuilt wall or newly arrived shield immediately reclaim attention.
    const previous = current;
    const preferred = unit.findHostileTarget();
    if (!preferred || enemyTargetPriority(preferred) >= enemyTargetPriority(previous)) {
      unit.setTarget(previous);
    }
  }

  const target = unit.currentTarget;
  if (!target) {
    unit.brakeMotor(dt);
    return nextTimer;
  }

  // While navigation is steering this unit toward a gap it follows the
  // waypoint, whatever it happens to be nominally targeting.
  const marching = unit.navPoint !== null && unit.breachTarget === null;
  const goalX = marching && unit.navPoint ? unit.navPoint.x : target.position.x;
  const goalZ = marching && unit.navPoint ? unit.navPoint.z : target.position.z;
  const dist = unit.distanceTo(goalX, goalZ);
  const stopAt = marching ? 0.9 : unit.attackReach(target);

  if (dist > stopAt) {
    unit.moveMotor(goalX, goalZ, dt, null);
  } else if (marching) {
    unit.brakeMotor(dt);
  } else {
    unit.brakeMotor(dt);
    unit.faceMotor(target.position.x, target.position.z, dt);
    if (unit.canStartAttack()) unit.beginStrike();
  }
  return nextTimer;
}
