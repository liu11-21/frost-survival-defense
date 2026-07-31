import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";

/**
 * 掌旗者的增益不會疊加：範圍內只取攻擊與攻速都最高的那一面旗，
 * 讓多隊掌旗者自然覆蓋不同戰線，而不是堆疊出失控的乘法成長。
 */
export function computeBannerAuraBonus(
  unit: CombatUnit,
  ctx: CombatContext,
): { attack: number; attackSpeed: number } {
  let attack = 0;
  let attackSpeed = 0;
  for (const source of ctx.world.allies) {
    const aura = source.def.supportAura;
    if (!aura || source === unit || !source.alive) continue;
    const dx = source.position.x - unit.position.x;
    const dz = source.position.z - unit.position.z;
    if (dx * dx + dz * dz > aura.radius * aura.radius) continue;
    const steps = Math.max(0, source.furnaceLevel - 1);
    attack = Math.max(attack, aura.attackBonus + steps * aura.attackBonusPerFurnaceLevel);
    attackSpeed = Math.max(
      attackSpeed,
      aura.attackSpeedBonus + steps * aura.attackSpeedBonusPerFurnaceLevel,
    );
  }
  return { attack, attackSpeed };
}
