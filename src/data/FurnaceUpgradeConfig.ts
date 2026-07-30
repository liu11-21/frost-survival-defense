import type { ResourceCost } from "./CombatTypes";

export const FURNACE = {
  maxHealth: 30000,
  /** Allies and the hero inside this radius are healed. */
  healRadius: 9,
  /** Per second, as a fraction of the target's own max health. */
  healFraction: 0.01,
  healMinimum: 5,
  healTick: 0.5,
  /** Seconds without taking damage before the furnace repairs itself. */
  selfHealDelay: 15,
  selfHealTick: 0.5,
  selfHealAmount: 20,
  startLevel: 1,
  /** Endless cap. The data structure allows raising this later. */
  maxLevel: 20,
  radius: 2.3,
};

/**
 * Every upgrade adds a flat share of the *base* value — linear, never compound.
 */
export const FURNACE_UPGRADE = {
  heroMaxHealthPct: 0.1,
  heroRangedPct: 0.1,
  heroMeleePct: 0.1,
  /** Attack interval shrinks by this fraction of the base interval per level. */
  heroAttackSpeedPct: 0.03,
  furnaceMaxHealthPct: 0.1,
  /** Endless only. */
  squadLimitPerLevel: 2,
};

/** Cost of taking the furnace from level n to n+1. */
export function furnaceUpgradeCost(nextLevel: number): ResourceCost {
  const n = Math.max(1, nextLevel - 1);
  return { wood: 100 * n, stone: 100 * n, gold: 20 * n };
}

/** Furnace max health at a given level, rounded up as the brief requires. */
export function furnaceMaxHealth(level: number): number {
  const bonus = (level - 1) * FURNACE_UPGRADE.furnaceMaxHealthPct;
  return Math.ceil(FURNACE.maxHealth * (1 + bonus));
}
