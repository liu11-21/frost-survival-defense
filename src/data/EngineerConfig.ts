/** Rules for the independent, non-combat Engineer support squads. */
export const ENGINEER_RULES = {
  scanInterval: 3,
  safeRepairInterval: 3,
  underAttackRepairInterval: 6,
  /** Repeated enemy hits keep this window open, selecting the slower cadence. */
  underAttackWindow: 3,
  repairFraction: 0.1,
  baseLimit: 2,
  /** Lv.80 is deliberately the first point at which five squads are allowed. */
  extraLimitLevels: [20, 50, 80] as const,
  furnaceIdleRadius: 3.2,
} as const;

export function engineerSquadLimit(furnaceLevel: number): number {
  let limit = ENGINEER_RULES.baseLimit;
  for (const level of ENGINEER_RULES.extraLimitLevels) {
    if (furnaceLevel >= level) limit++;
  }
  return limit;
}

