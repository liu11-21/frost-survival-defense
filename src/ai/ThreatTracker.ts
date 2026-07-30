import type { CombatUnit } from "../combat/CombatUnit";

/**
 * Soft target-saturation for the roster's now-global targeting.
 *
 * Rebuilt from scratch every half-second by `SquadManager` from each living
 * ally's current target — cheap, and it never needs an explicit unclaim: a
 * unit that died or retargeted simply is not counted on the next rebuild.
 * Global targeting alone would let every squad converge on whichever enemy
 * happens to score best, leaving every other approach undefended; this is
 * what spreads them out again once a target already has enough attackers.
 */
const claims = new Map<number, number>();

export function resetClaims(): void {
  claims.clear();
}

export function registerClaim(targetId: number): void {
  claims.set(targetId, (claims.get(targetId) ?? 0) + 1);
}

/** How many allies currently claim this enemy as their target. */
export function claimScore(enemy: CombatUnit): number {
  return claims.get(enemy.damageId) ?? 0;
}

/** Attackers allowed before saturation starts discouraging more pile-up. */
export function claimCap(enemy: CombatUnit): number {
  return enemy.level >= 4 || enemy.def.priorityTarget || enemy.def.siegeFocus ? 8 : 3;
}
