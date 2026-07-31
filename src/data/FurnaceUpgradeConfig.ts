import type { ResourceCost } from "./CombatTypes";

export const FURNACE = {
  maxHealth: 30000,
  /** Allies and the hero inside this radius are healed. */
  healRadius: 9,
  /** Per second, as a fraction of the target's own max health. */
  healFraction: 0.01,
  healMinimum: 5,
  healTick: 0.5,
  startLevel: 1,
  /** Furnace progression cap shared by stage and endless modes. */
  maxLevel: 100,
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
  /** Every recruitable ally, including Engineers and support units. */
  allyMaxHealthPct: 0.1,
  allyAttackPct: 0.1,
  allyAttackSpeedPct: 0.1,
  /** Every attackable facility, including walls and non-attacking utilities. */
  facilityMaxHealthPct: 0.1,
  facilityAttackPct: 0.1,
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

/** Central-fire progression is linear from base stats, never compounded. */
export function furnaceAllyHealthMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level) - 1) * FURNACE_UPGRADE.allyMaxHealthPct;
}

export function furnaceAllyAttackMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level) - 1) * FURNACE_UPGRADE.allyAttackPct;
}

export function furnaceAllyAttackSpeedMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level) - 1) * FURNACE_UPGRADE.allyAttackSpeedPct;
}

export function furnaceFacilityHealthMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level) - 1) * FURNACE_UPGRADE.facilityMaxHealthPct;
}

export function furnaceFacilityAttackMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level) - 1) * FURNACE_UPGRADE.facilityAttackPct;
}
