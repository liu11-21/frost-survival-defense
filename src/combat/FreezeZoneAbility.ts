import { BOSS_TIER_LEVEL, type UnitDefinition } from "../data/CombatTypes";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";

type FreezeZoneConfig = NonNullable<UnitDefinition["freezeZone"]>;

/**
 * Frost Sorcerer's periodic ability. Picks the densest legal enemy cluster
 * within the caster's own attack range, then stuns ordinary enemies briefly
 * before slowing them, while the boss tier only ever gets the reduced slow —
 * it is never fully stunned, per the brief's crowd-control-vs-boss limit.
 */
export function castFreezeZone(caster: CombatUnit, ctx: CombatContext, cfg: FreezeZoneConfig): void {
  const candidates = ctx.world.queryUnits("enemy", caster.position.x, caster.position.z, caster.def.attackRange);
  if (candidates.length === 0) return;

  let bestCx = candidates[0].position.x;
  let bestCz = candidates[0].position.z;
  let bestCount = -1;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let count = 0;
    for (let j = 0; j < candidates.length; j++) {
      const o = candidates[j];
      const dx = o.position.x - c.position.x;
      const dz = o.position.z - c.position.z;
      if (dx * dx + dz * dz <= cfg.radius * cfg.radius) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestCx = c.position.x;
      bestCz = c.position.z;
    }
  }

  // Re-queries the same shared buffer; `candidates` is no longer read past this point.
  const nearby = ctx.world.queryUnits("enemy", bestCx, bestCz, cfg.radius);
  for (let i = 0; i < nearby.length; i++) {
    const e = nearby[i];
    if (e.level >= BOSS_TIER_LEVEL) {
      e.applySlowRefresh(cfg.bossSlowAmount, cfg.bossSlowDuration);
      continue;
    }
    e.applyStun(cfg.stunDuration, cfg.ccImmunity);
    // The slow window covers the stun too, so the full "stun then slow"
    // sequence adds up to stunDuration + slowDuration regardless of whether
    // the stun itself landed (a target on CC-immunity still gets slowed).
    e.applySlowRefresh(cfg.slowAmount, cfg.stunDuration + cfg.slowDuration);
  }

  ctx.vfx.burstAt("freezeZone", bestCx, bestCz, 55);
  ctx.vfx.areaBlast(bestCx, bestCz, cfg.radius);
  ctx.vfx.sound("freezeZoneSlam", 0.8);
}
