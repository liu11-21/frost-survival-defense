/** Shared level-scaled self-repair used by the furnace and attackable facilities. */
export const STRUCTURE_SELF_REPAIR = {
  percentDelay: 15,
  tick: 0.5,
  percentPerLevelPerSecond: 0.01,
  percentLevelCap: 10,
  fixedBurstDelay: 8,
  fixedBurstStartLevel: 11,
  fixedBurstBaseFraction: 0.1,
  fixedBurstPerExtraLevel: 5000,
} as const;

export interface SelfRepairTick {
  timer: number;
  amount: number;
  fixedBurstApplied: boolean;
}

/** Continuous max-health repair per second: 1% at Lv.1, capped at 10%. */
export function structureRepairPercentPerSecond(furnaceLevel: number): number {
  const level = Math.max(1, Math.min(STRUCTURE_SELF_REPAIR.percentLevelCap, Math.floor(furnaceLevel)));
  return level * STRUCTURE_SELF_REPAIR.percentPerLevelPerSecond;
}

/**
 * One burst after 8 quiet seconds. Lv.11 starts at 10% of that structure's
 * Lv.11 maximum HP; every later level adds a flat 5,000 HP, never another
 * percentage increase.
 */
export function structureRepairFixedBurst(
  furnaceLevel: number,
  maxHealthAtLevelEleven: number,
): number {
  const level = Math.floor(furnaceLevel);
  if (level < STRUCTURE_SELF_REPAIR.fixedBurstStartLevel) return 0;
  const extraLevels = level - STRUCTURE_SELF_REPAIR.fixedBurstStartLevel;
  return (
    maxHealthAtLevelEleven * STRUCTURE_SELF_REPAIR.fixedBurstBaseFraction +
    extraLevels * STRUCTURE_SELF_REPAIR.fixedBurstPerExtraLevel
  );
}

/**
 * Advances both repair layers without mutating its owner:
 * - Lv.1-10: after 15 quiet seconds, restore 1%-10% max HP per second.
 * - Lv.11: after 8 quiet seconds, also restore 10% of its Lv.11 max HP once.
 * - Lv.12+: add a flat 5,000 HP to that one-time burst per further level.
 */
export function advanceStructureSelfRepair(
  health: number,
  maxHealth: number,
  sinceDamage: number,
  timer: number,
  fixedBurstApplied: boolean,
  furnaceLevel: number,
  dt: number,
  maxHealthAtLevelEleven = maxHealth,
): SelfRepairTick {
  if (health >= maxHealth) {
    return { timer: 0, amount: 0, fixedBurstApplied };
  }

  let amount = 0;
  let nextBurstApplied = fixedBurstApplied;
  const fixedBurst = structureRepairFixedBurst(furnaceLevel, maxHealthAtLevelEleven);
  if (!nextBurstApplied && fixedBurst > 0 && sinceDamage >= STRUCTURE_SELF_REPAIR.fixedBurstDelay) {
    amount += fixedBurst;
    nextBurstApplied = true;
  }

  if (sinceDamage < STRUCTURE_SELF_REPAIR.percentDelay) {
    return { timer: 0, amount, fixedBurstApplied: nextBurstApplied };
  }

  let nextTimer = timer + dt;
  const pulses = Math.floor((nextTimer + 1e-8) / STRUCTURE_SELF_REPAIR.tick);
  if (pulses <= 0) return { timer: nextTimer, amount, fixedBurstApplied: nextBurstApplied };
  nextTimer -= pulses * STRUCTURE_SELF_REPAIR.tick;
  amount +=
    pulses *
    maxHealth *
    structureRepairPercentPerSecond(furnaceLevel) *
    STRUCTURE_SELF_REPAIR.tick;
  return { timer: nextTimer, amount, fixedBurstApplied: nextBurstApplied };
}
