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

function applyOnHitSlow(unit: CombatUnit, target: Damageable): void {
  const slow = unit.def.slowOnHit;
  if (!slow) return;
  const applicable = target as Partial<CombatUnit>;
  if (typeof applicable.applySlowStack !== "function") return;
  const isBoss = target.level >= BOSS_TIER_LEVEL;
  applicable.applySlowStack(isBoss ? slow.bossAmount : slow.amount, slow.duration, slow.maxStacks);
}

function applyAoeSlow(unit: CombatUnit, target: Damageable): void {
  const slow = unit.def.aoeSlow;
  if (!slow) return;
  const applicable = target as Partial<CombatUnit>;
  if (typeof applicable.applySlowRefresh !== "function") return;
  const isBoss = target.level >= BOSS_TIER_LEVEL;
  applicable.applySlowRefresh(isBoss ? slow.bossAmount : slow.amount, isBoss ? slow.bossDuration : slow.duration);
}

/** Ordinary Lv.1-5 enemies cannot damage optional facilities, even by splash.
 * Explicit siege/self-destruct specialists and the Lv.6 boss are exceptions. */
function mayDamageFacilities(unit: CombatUnit): boolean {
  if (unit.faction === "ally") return true;
  return unit.level >= BOSS_TIER_LEVEL || unit.def.siegeFocus === true || unit.def.selfDestruct !== undefined;
}

export function resolveUnitAttack(unit: CombatUnit, target: Damageable, ctx: CombatContext): void {
  if (unit.faction === "ally" && target.kind === "unit" && (target as CombatUnit).isFlying &&
      unit.def.attackType !== "rangedSingle" && unit.def.attackType !== "rangedArea") return;
  const siege = STRUCTURE_KINDS.has(target.kind) ? unit.siegeMultiplier : 1;
  const power = unit.attackPower * siege * tierBonusMultiplier(unit.def, target.level);
  const def = unit.def;
  const includeFacilities = mayDamageFacilities(unit);

  switch (def.attackType) {
    case "meleeSingle":
      ctx.damage(target, power, unit.position.x, unit.position.z, "melee");
      ctx.vfx.meleeHit(target.position.x, target.position.z);
      break;

    case "meleeArea":
      ctx.damage(target, power, unit.position.x, unit.position.z, "melee");
      ctx.areaDamage(
        unit.faction,
        target.position.x,
        target.position.z,
        def.areaRadius ?? 2,
        power,
        (def.maxAreaTargets ?? 5) - 1,
        undefined,
        "melee",
        includeFacilities,
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
            ctx.damage(target, power, hx, hz, "ranged");
            applyOnHitSlow(unit, target);
          }
          ctx.vfx.rangedHit(hx, hz);
        },
      );
      break;
    }

    case "rangedArea": {
      const radius = def.areaRadius ?? 2.5;
      const meteor = def.id === "mage";
      const frost = def.aoeSlow !== undefined;
      if (meteor) ctx.vfx.burstAt("arcaneCast", unit.position.x, unit.position.z, 24);
      if (frost) ctx.vfx.burstAt("frostCast", unit.position.x, unit.position.z, 18);
      ctx.projectiles.fire(
        def.projectileKind ?? (unit.faction === "ally" ? "orb" : "shell"),
        meteor ? target.position.x : unit.position.x,
        meteor ? 11 : 1.1 * def.scale,
        meteor ? target.position.z : unit.position.z,
        target,
        (hx, hz) => {
          ctx.areaDamage(
            unit.faction,
            hx,
            hz,
            radius,
            power,
            def.maxAreaTargets ?? 6,
            (hit) => applyAoeSlow(unit, hit),
            "ranged",
            includeFacilities,
          );
          if (meteor) ctx.vfx.burstAt("arcaneImpact", hx, hz, 54);
          else if (frost) {
            ctx.vfx.burstAt("frostImpact", hx, hz, 42);
            ctx.vfx.burstAt("frostMist", hx, hz, 26);
          } else ctx.vfx.areaBlast(hx, hz, radius);
        },
      );
      break;
    }

    default:
      break;
  }
}
