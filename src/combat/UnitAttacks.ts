import { BOSS_TIER_LEVEL } from "../data/CombatTypes";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";
import type { Damageable } from "./Damageable";

/**
 * Applies one unit's attack. Always called from the animator's hit frame, never
 * when the swing starts — that timing rule lives in CombatAnimator.
 */
const STRUCTURE_KINDS = new Set(["wall", "tower", "warehouse", "recruitHall", "furnace"]);

/** Tier bonus keyed off the target's level — never a hard-coded enemy id. */
export function tierBonusMultiplier(
  def: CombatUnit["def"],
  targetLevel: number,
): number {
  const rules = def.bonusVsTier;
  if (!rules) return 1;
  for (const r of rules) {
    if (targetLevel >= r.minLevel && (r.maxLevel === undefined || targetLevel <= r.maxLevel)) {
      return r.multiplier;
    }
  }
  return 1;
}

/** Applies an on-hit slow to a unit target, halved (per its own config) against the boss tier. */
function applyOnHitSlow(unit: CombatUnit, target: Damageable): void {
  const slow = unit.def.slowOnHit;
  if (!slow) return;
  const applicable = target as Partial<CombatUnit>;
  if (typeof applicable.applySlowStack !== "function") return;
  const isBoss = target.level >= BOSS_TIER_LEVEL;
  applicable.applySlowStack(isBoss ? slow.bossAmount : slow.amount, slow.duration, slow.maxStacks);
}

/** Frost Sorcerer's AoE slow, refreshing rather than stacking, reduced against the boss. */
function applyAoeSlow(unit: CombatUnit, target: Damageable): void {
  const slow = unit.def.aoeSlow;
  if (!slow) return;
  const applicable = target as Partial<CombatUnit>;
  if (typeof applicable.applySlowRefresh !== "function") return;
  const isBoss = target.level >= BOSS_TIER_LEVEL;
  applicable.applySlowRefresh(isBoss ? slow.bossAmount : slow.amount, isBoss ? slow.bossDuration : slow.duration);
}

export function resolveUnitAttack(unit: CombatUnit, target: Damageable, ctx: CombatContext): void {
  // Higher enemy tiers hit fortifications harder than they hit people.
  const siege = STRUCTURE_KINDS.has(target.kind) ? unit.siegeMultiplier : 1;
  const power = unit.attackPower * siege * tierBonusMultiplier(unit.def, target.level);
  const def = unit.def;

  switch (def.attackType) {
    case "meleeSingle":
      ctx.damage(target, power, unit.position.x, unit.position.z);
      ctx.vfx.meleeHit(target.position.x, target.position.z);
      break;

    case "meleeArea":
      ctx.damage(target, power, unit.position.x, unit.position.z);
      ctx.areaDamage(
        unit.faction,
        target.position.x,
        target.position.z,
        def.areaRadius ?? 2,
        power,
        (def.maxAreaTargets ?? 5) - 1,
      );
      ctx.vfx.meleeHit(target.position.x, target.position.z);
      break;

    case "rangedSingle": {
      const projectile = def.projectileKind ?? (unit.faction === "ally" ? "arrow" : "bolt");
      ctx.projectiles.fire(
        projectile,
        unit.position.x,
        1.0 * def.scale,
        unit.position.z,
        target,
        (hx, hz) => {
          if (target.alive) {
            ctx.damage(target, power, hx, hz);
            applyOnHitSlow(unit, target);
          }
          ctx.vfx.rangedHit(hx, hz);
        },
      );
      break;
    }

    case "rangedArea": {
      const radius = def.areaRadius ?? 2.5;
      ctx.projectiles.fire(
        unit.faction === "ally" ? "orb" : "shell",
        unit.position.x,
        1.1 * def.scale,
        unit.position.z,
        target,
        (hx, hz) => {
          ctx.areaDamage(unit.faction, hx, hz, radius, power, def.maxAreaTargets ?? 6, (hit) =>
            applyAoeSlow(unit, hit),
          );
          ctx.vfx.areaBlast(hx, hz, radius);
          if (def.aoeSlow) ctx.vfx.burstAt("frostMist", hx, hz, 16);
        },
      );
      break;
    }

    default:
      break;
  }
}
