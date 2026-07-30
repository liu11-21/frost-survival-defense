import type { UnitDefinition } from "./CombatTypes";

/** Run-local strengthening shared by every recruitable ally except Engineers. */
export const ALLY_PROGRESSION = {
  statPerLevel: 0.1,
  /** The first upgrade costs half the recruit price; later levels add 25%. */
  startingCostFactor: 0.5,
  costGrowthPerLevel: 0.25,
} as const;

export function allyUpgradeMultiplier(level: number): number {
  return 1 + Math.max(0, Math.floor(level)) * ALLY_PROGRESSION.statPerLevel;
}

export function allyUpgradeCost(def: UnitDefinition, nextLevel: number): number {
  const level = Math.max(1, Math.floor(nextLevel));
  const factor =
    ALLY_PROGRESSION.startingCostFactor +
    (level - 1) * ALLY_PROGRESSION.costGrowthPerLevel;
  return Math.max(1, Math.ceil((def.recruitCost ?? 0) * factor));
}

