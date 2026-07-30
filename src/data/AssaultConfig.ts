/** Rules for the Assault squad's high-tier ambush role. */
export const ASSAULT_RULES = {
  /** Deliberately weak against ordinary enemies. */
  baseAttack: 20,
  highTierMinLevel: 4,
  /** 20 × 5 preserves the old 100 attack only against its intended targets. */
  highTierDamageMultiplier: 5,
  invulnerableSeconds: 3,
  reducedDamageSeconds: 3,
  damageReduction: 0.5,
} as const;
