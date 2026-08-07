import type { Vector3 } from "@babylonjs/core";
import type { FormationSlotManager } from "../ai/FormationSlotManager";
import { dampAngle, yawFromDirection } from "../util/MathUtil";
import { validateTarget } from "../ai/TargetValidator";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";

/**
 * Raw movement for a combat unit: steering, soft separation, building
 * collision and turning. Kept apart from `CombatUnit` so the unit file is about
 * state and decisions rather than vector maths.
 */
export function motorMove(
  unit: CombatUnit,
  ctx: CombatContext,
  goalX: number,
  goalZ: number,
  dt: number,
  formation: FormationSlotManager | null,
  steer: Vector3,
  scratch: Vector3,
): number {
  const dx = goalX - unit.position.x;
  const dz = goalZ - unit.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return 0;

  steer.set(dx / dist, 0, dz / dist);

  if (formation) {
    const neighbours = ctx.world.queryUnits(unit.faction, unit.position.x, unit.position.z, 1.2);
    const push = formation.separation(unit.position.x, unit.position.z, neighbours, unit, dist, scratch);
    steer.x += push.x;
    steer.z += push.z;
  }

  const len = Math.hypot(steer.x, steer.z) || 1;
  const speed = unit.effectiveMoveSpeed;
  unit.position.x += (steer.x / len) * speed * dt;
  unit.position.z += (steer.z / len) * speed * dt;
  // Buildings are solid — nobody walks through a standing wall. The gate gap
  // in a perimeter wall is the one exception, and it is faction-filtered.
  if (!unit.isFlying) ctx.collision.resolve(unit.position, unit.hitRadius, Infinity, unit.faction);
  return speed;
}

export function motorFace(position: Vector3, yaw: number, x: number, z: number, dt: number): number {
  const dx = x - position.x;
  const dz = z - position.z;
  if (Math.abs(dx) < 0.0001 && Math.abs(dz) < 0.0001) return yaw;
  return dampAngle(yaw, yawFromDirection(dx, dz), 9, dt);
}

/** A short nudge toward the rally point. Never a jump onto a target. */
export function motorReposition(unit: CombatUnit, ctx: CombatContext, rally: Vector3 | null): void {
  const tx = rally ? rally.x : 0;
  const tz = rally ? rally.z : 0;
  const dx = tx - unit.position.x;
  const dz = tz - unit.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return;
  const step = Math.min(2.5, dist);
  unit.position.x += (dx / dist) * step;
  unit.position.z += (dz / dist) * step;
  if (!unit.isFlying) ctx.collision.resolve(unit.position, unit.hitRadius, Infinity, unit.faction);
}

/** How often a unit re-checks whether it is being taunted. */
const TAUNT_CHECK_INTERVAL = 0.4;

/**
 * Re-evaluates an active taunt.
 *
 * A taunt is dropped the instant its source stops being a legal target, which
 * is what stops units from chasing a dead shield trooper forever. Ordinary
 * enemies pass their lane into the query, so a taunter on another road cannot
 * bypass the lane-first target selector. Ally-side taunts stay lane-neutral.
 */
export function refreshTaunt(unit: CombatUnit, ctx: CombatContext, dt: number, timer: number): number {
  if (unit.tauntSourceRef && validateTarget(unit, unit.tauntSourceRef) !== "ok") {
    unit.clearTaunt();
  }
  const next = timer - dt;
  if (next > 0) return next;

  const taunter = ctx.world.tauntSourceFor(
    unit.faction,
    unit.position.x,
    unit.position.z,
    false,
    unit.faction === "enemy" ? unit.laneIndex : undefined,
  );
  if (taunter !== unit.tauntSourceRef) unit.applyTaunt(taunter);
  return TAUNT_CHECK_INTERVAL;
}

/** Routes a health change to the floating text and the health-bar manager. */
export function reportDamage(
  unit: CombatUnit,
  ctx: CombatContext,
  amount: number,
  kind: "damage" | "heal",
): void {
  ctx.vfx.damageNumber(unit.position.x, unit.position.y + 1.4, unit.position.z, amount, kind);
  ctx.vfx.healthChanged(unit);
}
