import { Vector3 } from "@babylonjs/core";
import type { CombatUnit } from "../combat/CombatUnit";
import type { CombatWorld } from "../combat/CombatWorld";
import {
  LANES,
  clampOutside,
  isInsideBase,
  nearestPointOnLane,
} from "../data/BuildSlotDefinitions";
import { nextLaneWaypoint } from "../data/LaneNavigation";
import type { LaneGateManager } from "./LaneGates";

const REFRESH_INTERVAL = 0.35;
const OUTSIDE_MARGIN = 1.0;
const GATE_COMMIT_SEGMENTS = 1;

/**
 * Enemy navigation now follows the same winding polyline the ground shader and
 * range previews use. A unit owns one lane for its whole life: it progresses
 * waypoint-by-waypoint, reaches only that lane's gate, breaks only that lane's
 * wall, then enters the compact furnace enclosure.
 */
export class EnemyNavigator {
  private timer = 0;

  constructor(
    private readonly world: CombatWorld,
    private readonly gates: LaneGateManager,
  ) {}

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_INTERVAL;

    this.gates.refresh();
    const sealed = this.gates.fullySealed;

    for (const unit of this.world.enemies) {
      if (!unit.alive) continue;
      // Flying bodies still ignore terrain/walls, but targeting remains lane-
      // aware unless their own unit definition provides specialist behaviour.
      if (unit.isFlying) {
        unit.navPoint = null;
        unit.breachTarget = null;
        continue;
      }
      this.route(unit, sealed);
    }
  }

  private route(unit: CombatUnit, sealed: boolean): void {
    const x = unit.position.x;
    const z = unit.position.z;
    const lane = LANES[((unit.laneIndex % LANES.length) + LANES.length) % LANES.length];
    const projection = nearestPointOnLane(x, z, lane);

    const moved = Math.hypot(x - unit.navLastX, z - unit.navLastZ);
    unit.navLastX = x;
    unit.navLastZ = z;
    // Keep telemetry meaningful for the existing watchdog, but do not turn a
    // deliberate combat pause into permission to jump to another wall.
    unit.navStuck = moved < 0.25 ? unit.navStuck + REFRESH_INTERVAL : 0;

    // Fully sealed means any unit found inside got there by a physics/teleport
    // edge case. Put it back outside its OWN wall and let normal breaching
    // resume rather than leaving an impossible attacker behind the defence.
    if (sealed && isInsideBase(x, z)) {
      const fix = clampOutside(x, z, 0.8);
      unit.position.x = fix.x;
      unit.position.z = fix.z;
      unit.setTarget(null);
      unit.navPoint = null;
      unit.breachTarget = this.gates.breachTargetFor(fix.x, fix.z, unit.laneIndex);
      unit.navStuck = 0;
      return;
    }

    const closeEnoughToGate =
      projection.segmentIndex >= Math.max(0, lane.gatePointIndex - GATE_COMMIT_SEGMENTS);
    const ownWall = this.gates.breachTargetFor(x, z, unit.laneIndex);

    // The wall only becomes a combat target at the final approach. The old
    // implementation assigned it globally from spawn, which made every enemy
    // cut a straight line through the winding-road design.
    if (closeEnoughToGate && ownWall?.alive) {
      unit.navPoint = null;
      unit.breachTarget = ownWall;
      unit.navStuck = 0;
      return;
    }

    // Once through an open/broken gate the interior is intentionally simple:
    // targeting can take over and move directly around the furnace enclosure.
    if (isInsideBase(x, z, -OUTSIDE_MARGIN)) {
      if (unit.def.siegeFocus && unit.breachTarget && !unit.breachTarget.alive) {
        unit.applyStun(unit.def.postBreachStun ?? 0, 0);
      }
      unit.navPoint = null;
      unit.breachTarget = null;
      unit.navStuck = 0;
      return;
    }

    unit.breachTarget = null;
    const next = nextLaneWaypoint(unit.laneIndex, x, z, "inbound");
    if (!unit.navPoint) unit.navPoint = new Vector3();
    unit.navPoint.set(next.x, 0, next.z);
  }
}
