import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";

/**
 * Commander's non-stacking buff aura. Only the strongest single source in
 * range applies — multiple commanders never add up — and a fully-sealed wall
 * between the two blocks it, same as any other reachability check.
 */
export function computeAuraBonus(unit: CombatUnit, ctx: CombatContext): { move: number; attack: number } {
  let moveBonus = 0;
  let attackBonus = 0;
  const enemies = ctx.world.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const source = enemies[i];
    const aura = source.def.aura;
    if (!aura || source === unit || !source.alive) continue;
    const dx = source.position.x - unit.position.x;
    const dz = source.position.z - unit.position.z;
    if (dx * dx + dz * dz > aura.radius * aura.radius) continue;
    if (ctx.world.wallBlocks(source.position.x, source.position.z, unit.position.x, unit.position.z)) continue;
    moveBonus = Math.max(moveBonus, aura.moveBonus);
    attackBonus = Math.max(attackBonus, aura.attackSpeedBonus);
  }
  return { move: moveBonus, attack: attackBonus };
}
