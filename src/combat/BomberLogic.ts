import type { UnitDefinition } from "../data/CombatTypes";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";

type SelfDestructConfig = NonNullable<UnitDefinition["selfDestruct"]>;

const WARN_TICK = 0.3;

/**
 * Ice Bomber. Reuses the ordinary enemy targeting/movement pipeline (it still
 * runs `updateEnemyBrain` every frame, same as any other enemy) and only adds
 * the arm/countdown/detonate logic on top — so it automatically inherits the
 * LaneGate, wall-blocking, reachability and taunt rules every other enemy
 * already obeys, rather than re-implementing them.
 */
export function updateBomber(unit: CombatUnit, dt: number, ctx: CombatContext): void {
  const cfg = unit.def.selfDestruct;
  if (!cfg || !unit.alive) return;

  if (!unit.bomberArmed) {
    const target = unit.currentTarget;
    const inRange =
      target !== null &&
      target.alive &&
      // The movement motor stops at the target's outer edge. Reuse that exact
      // reach so a bomber beside a large facility does not wait forever for
      // its centre point to enter the smaller unit-only trigger radius.
      unit.distanceTo(target.position.x, target.position.z) <= unit.attackReach(target);
    if (inRange) {
      unit.bomberArmed = true;
      unit.bomberCountdown = cfg.armDelay;
      unit.bomberWarnTimer = 0;
    }
    return;
  }

  unit.bomberCountdown -= dt;
  unit.bomberWarnTimer -= dt;
  if (unit.bomberWarnTimer <= 0) {
    const progress = 1 - Math.max(0, unit.bomberCountdown) / cfg.armDelay;
    // The warning accelerates as the countdown closes in, per the brief.
    unit.bomberWarnTimer = Math.max(0.06, WARN_TICK * (1 - progress * 0.75));
    ctx.vfx.sound("bomberWarn", 0.5, 0.8 + progress * 1.2);
    ctx.vfx.burstAt("bomberWarn", unit.position.x, unit.position.z, 5);
  }

  if (unit.bomberCountdown <= 0) {
    unit.bomberArmed = false;
    splash(unit, ctx, cfg, cfg.radius, 1);
    // Guaranteed kill: the full detonation is not a response to damage, so
    // nothing else will otherwise take this unit off the field.
    unit.applyDamage(1e9, unit.position.x, unit.position.z);
  }
}

/** Killed mid-countdown: a smaller blast still goes off. Called from `CombatUnit.die()`. */
export function earlyDetonate(unit: CombatUnit, ctx: CombatContext, cfg: SelfDestructConfig): void {
  splash(unit, ctx, cfg, cfg.earlyKillRadius, cfg.earlyKillFactor);
}

function splash(unit: CombatUnit, ctx: CombatContext, cfg: SelfDestructConfig, radius: number, scale: number): void {
  const cx = unit.position.x;
  const cz = unit.position.z;
  const r2 = radius * radius;

  const allies = ctx.world.queryUnits("ally", cx, cz, radius);
  for (let i = 0; i < allies.length; i++) ctx.damage(allies[i], cfg.alliesDamage * scale, cx, cz);

  const hero = ctx.world.hero;
  if (hero?.alive) {
    const dx = hero.position.x - cx;
    const dz = hero.position.z - cz;
    if (dx * dx + dz * dz <= r2) ctx.damage(hero, cfg.alliesDamage * scale, cx, cz);
  }

  for (const s of ctx.world.structures) {
    if (!s.alive) continue;
    const dx = s.position.x - cx;
    const dz = s.position.z - cz;
    const reach = radius + s.hitRadius;
    if (dx * dx + dz * dz <= reach * reach) ctx.damage(s, cfg.structuresDamage * scale, cx, cz);
  }

  const furnace = ctx.world.furnace;
  if (furnace?.alive) {
    const dx = furnace.position.x - cx;
    const dz = furnace.position.z - cz;
    const reach = radius + furnace.hitRadius;
    if (dx * dx + dz * dz <= reach * reach) ctx.damage(furnace, cfg.furnaceDamage * scale, cx, cz);
  }

  ctx.vfx.areaBlast(cx, cz, radius);
  ctx.vfx.burstAt("bomberWarn", cx, cz, scale >= 1 ? 40 : 16);
  ctx.vfx.sound("bomberBlast", scale >= 1 ? 1 : 0.5);
}
