import { Vector3 } from "@babylonjs/core";
import type { CombatUnit } from "../combat/CombatUnit";
import type { Damageable } from "../combat/Damageable";
import { gateWaypoint } from "./GateRouting";
import type { FormationSlotManager } from "./FormationSlotManager";

/**
 * Movement helpers shared by the brain's combat states.
 *
 * These are the pieces that decide *where to stand*; the brain owns *when* to
 * be in each state. Splitting them keeps both files readable.
 */
export class CombatMovement {
  private readonly goal = new Vector3();
  private readonly scratch = new Vector3();

  /**
   * Walks toward the target. Melee units claim a distinct slot around it so
   * they spread out instead of grinding on the same spot; ranged units keep to
   * their standoff band and back off if something closes on them.
   */
  approach(
    unit: CombatUnit,
    target: Damageable,
    isRanged: boolean,
    formation: FormationSlotManager,
    dt: number,
  ): void {
    // The target is on the other side of the perimeter from this unit: head
    // for the correct gate first, ignoring standoff and attack-slot claims
    // until there is a direct line to actually approach along.
    const gate = gateWaypoint(unit.position.x, unit.position.z, target.position.x, target.position.z);
    if (gate) {
      unit.moveMotor(gate.x, gate.z, dt, null);
      return;
    }

    if (isRanged) {
      const adjust = formation.standoffAdjust(
        unit.def.id,
        unit.position.x,
        unit.position.z,
        target.position.x,
        target.position.z,
        this.scratch,
      );
      if (adjust) {
        unit.moveMotor(adjust.x, adjust.z, dt, formation);
        return;
      }
      unit.moveMotor(target.position.x, target.position.z, dt, formation);
      return;
    }

    formation.claimAttackSlot(
      target.damageId,
      target.position.x,
      target.position.z,
      Math.max(0.6, unit.attackReach(target) - 0.35),
      unit.position.x,
      unit.position.z,
      this.goal,
    );
    unit.moveMotor(this.goal.x, this.goal.z, dt, formation);
  }

  /** A sideways step around whatever is blocking the direct path. */
  sideStep(unit: CombatUnit, towardX: number, towardZ: number, sign: number, distance: number, dt: number): void {
    const dx = towardX - unit.position.x;
    const dz = towardZ - unit.position.z;
    const len = Math.hypot(dx, dz) || 1;
    this.goal.set(
      unit.position.x + (dz / len) * distance * sign,
      0,
      unit.position.z - (dx / len) * distance * sign,
    );
    unit.moveMotor(this.goal.x, this.goal.z, dt, null);
  }

  /** A different standing position around the same target. */
  reslot(
    unit: CombatUnit,
    target: Damageable,
    formation: FormationSlotManager,
    sign: number,
    dt: number,
  ): void {
    formation.claimAttackSlot(
      target.damageId,
      target.position.x,
      target.position.z,
      unit.attackReach(target),
      unit.position.x + sign * 2,
      unit.position.z,
      this.goal,
    );
    unit.moveMotor(this.goal.x, this.goal.z, dt, null);
  }
}
