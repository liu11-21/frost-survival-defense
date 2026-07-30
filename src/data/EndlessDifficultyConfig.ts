/**
 * Endless mode's wave-1-through-20 pacing. The old generator made every
 * tenth wave a full level-6 boss, which meant wave 10 ended runs before the
 * player had a real economy, army or defence built up. The boss is now a
 * milestone the player grows into, not a wall they hit on schedule.
 */
export const ENDLESS_DIFFICULTY = {
  /** The very first level-6 boss. Nothing before this wave may spawn one. */
  firstBossWave: 20,
  /** A major boss wave recurs on this cadence once the first one has landed. */
  bossCycleWaves: 10,
  /** Wave 10: an elite wave — a level-4 unit plus fodder, no boss. */
  eliteWave: 10,
  /** Wave 15: a strengthened level-5 elite, still not a full boss. */
  miniEliteWave: 15,
  /** Per-cycle boss growth once bosses start recurring (wave 20, 30, 40…). */
  bossHealthPerCycle: 0.2,
  bossDamagePerCycle: 0.1,
  /** The first boss wave's escort is lighter than every one after it. */
  firstBossEscortCount: 1,
  laterBossEscortCount: 2,

  /** Soft field-cap targets (total individual units this wave aims for), one
   * tier per bracket. Wave 11 intentionally drops below the wave-10 elite
   * headcount, then resumes a smooth climb instead of spiking immediately. */
  fieldCapBrackets: [
    { throughWave: 5, min: 8, max: 14 },
    { throughWave: 10, min: 12, max: 20 },
    { throughWave: 15, min: 14, max: 26 },
    { throughWave: 20, min: 20, max: 36 },
  ],
  /** Above wave 20, the cap keeps climbing at the last bracket's own slope. */
  fieldCapGrowthPastWave20: 0.8,

  /** Share of the wave's spend that may go to level-3+ enemies. Waves 1-10
   * are almost pure numbers; the mix only really opens up from wave 11, and
   * boss-tier composition only ramps once bosses themselves have started. */
  highTierShareByWave: [
    { throughWave: 10, share: 0.15 },
    { throughWave: 14, share: 0.25 },
    { throughWave: 19, share: 0.35 },
    { throughWave: 30, share: 0.5 },
    { throughWave: Infinity, share: 0.6 },
  ],
};

/** True only on a wave that is allowed to spawn a full level-6 boss. */
export function isLevel6BossWave(wave: number): boolean {
  const d = ENDLESS_DIFFICULTY;
  if (wave < d.firstBossWave) return false;
  return (wave - d.firstBossWave) % d.bossCycleWaves === 0;
}

/** 0 on the first boss wave, 1 on the next, and so on. */
export function bossCycleIndex(wave: number): number {
  const d = ENDLESS_DIFFICULTY;
  return Math.max(0, Math.floor((wave - d.firstBossWave) / d.bossCycleWaves));
}

export function bossHealthMultiplier(wave: number): number {
  return 1 + bossCycleIndex(wave) * ENDLESS_DIFFICULTY.bossHealthPerCycle;
}
export function bossDamageMultiplier(wave: number): number {
  return 1 + bossCycleIndex(wave) * ENDLESS_DIFFICULTY.bossDamagePerCycle;
}
export function bossEscortCount(wave: number): number {
  return wave === ENDLESS_DIFFICULTY.firstBossWave
    ? ENDLESS_DIFFICULTY.firstBossEscortCount
    : ENDLESS_DIFFICULTY.laterBossEscortCount;
}

/** Interpolates within whichever bracket `wave` falls into, so the target
 * climbs smoothly across a bracket rather than jumping at its edge. */
export function endlessFieldCapTarget(wave: number): number {
  const d = ENDLESS_DIFFICULTY;
  const brackets = d.fieldCapBrackets;
  let prevWave = 0;
  for (const bracket of brackets) {
    if (wave <= bracket.throughWave) {
      const span = bracket.throughWave - prevWave;
      const t = span > 0 ? (wave - prevWave) / span : 1;
      return Math.round(bracket.min + (bracket.max - bracket.min) * Math.max(0, Math.min(1, t)));
    }
    prevWave = bracket.throughWave;
  }
  const lastBracket = brackets[brackets.length - 1];
  const extraWaves = wave - lastBracket.throughWave;
  return Math.round(lastBracket.max + extraWaves * d.fieldCapGrowthPastWave20);
}

export function endlessHighTierShare(wave: number): number {
  for (const tier of ENDLESS_DIFFICULTY.highTierShareByWave) if (wave <= tier.throughWave) return tier.share;
  return ENDLESS_DIFFICULTY.highTierShareByWave[ENDLESS_DIFFICULTY.highTierShareByWave.length - 1].share;
}
