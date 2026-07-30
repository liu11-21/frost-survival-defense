import { Vector3 } from "@babylonjs/core";
import type { CombatUnit } from "../combat/CombatUnit";
import type { CombatWorld } from "../combat/CombatWorld";
import { clampOutside, isInsideBase } from "../data/BuildSlotDefinitions";
import type { LaneGateManager } from "./LaneGates";

const REFRESH_INTERVAL = 0.5;
const OUTSIDE_MARGIN = 1.2;
/** Seconds of not moving before a unit gives up and smashes the wall in front. */
const STUCK_LIMIT = 3;

/**
 * Routes enemies through the perimeter.
 *
 * Four sides instead of many independent segments collapses what used to be
 * "orbit the ring looking for a gap" into "walk straight at whichever of the
 * four sides is nearest and open" — there is no ring left to orbit. If every
 * side is sealed, or a unit stops making progress for any other reason, it
 * breaks the wall closing its own approach instead. Either way it never
 * stands still, and it never ends up inside except through an open gate or a
 * hole it made.
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

    for (let i = 0; i < this.world.enemies.length; i++) {
      const unit = this.world.enemies[i];
      if (!unit.alive) continue;
      this.route(unit, sealed);
    }
  }

  private route(unit: CombatUnit, sealed: boolean): void {
    const x = unit.position.x;
    const z = unit.position.z;

    // Progress watchdog: anything that stops moving starts breaking a wall.
    const moved = Math.hypot(x - unit.navLastX, z - unit.navLastZ);
    unit.navLastX = x;
    unit.navLastZ = z;
    unit.navStuck = moved < 0.3 ? unit.navStuck + REFRESH_INTERVAL : 0;

    // Anti-exploit: nothing should ever be inside a *fully sealed* perimeter.
    // Knockback, a stray teleport-adjacent effect or a collision edge case
    // are the only ways that could happen, so it is corrected immediately —
    // pushed back out, its interior target dropped, redirected onto the wall
    // — rather than left to fight from a position it could never have
    // reached honestly. This never fires while any side is actually open.
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

    if (isInsideBase(x, z, -OUTSIDE_MARGIN)) {
      // Legitimately inside — through an open gate or a breach. Ordinary
      // combat targeting takes over completely.
      unit.navPoint = null;
      unit.breachTarget = null;
      return;
    }

    // Siege-focus units (the Breacher) never bother looking for a gap
    // elsewhere — their own side's wall outranks every other priority,
    // including a taunt from behind it, for as long as it stands.
    if (unit.def.siegeFocus) {
      const wasBreaching = unit.breachTarget !== null;
      const ownWall = this.gates.breachTargetFor(x, z, unit.laneIndex);
      if (ownWall) {
        unit.navPoint = null;
        unit.breachTarget = ownWall;
        return;
      }
      if (wasBreaching) {
        // The wall just came down — a short hard stun before it presses on.
        unit.applyStun(unit.def.postBreachStun ?? 0, 0);
      }
    }

    if (sealed || unit.navStuck >= STUCK_LIMIT) {
      unit.navPoint = null;
      unit.breachTarget = this.gates.breachTargetFor(x, z, unit.laneIndex);
      unit.navStuck = 0;
      return;
    }

    const gate = this.gates.openApproach(x, z);
    if (!gate) {
      // No side anywhere is open: the wall in front of this lane is the only
      // way in.
      unit.navPoint = null;
      unit.breachTarget = this.gates.breachTargetFor(x, z, unit.laneIndex);
      return;
    }

    // An open side exists: walk straight for it. With only four monolithic
    // sides there is no ring left to circle — `openApproach` already picked
    // whichever open side is nearest, so a direct line is the natural route,
    // with the same collision steering every other obstacle already uses to
    // handle an incidental graze along the way.
    unit.breachTarget = null;
    if (!unit.navPoint) unit.navPoint = new Vector3();
    unit.navPoint.set(gate.innerX, 0, gate.innerZ);
  }
}
