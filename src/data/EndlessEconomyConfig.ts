/**
 * "立即下一波" used to just forfeit the rest of the prep timer for nothing.
 * Endless mode now pays back the seconds the player chose not to spend,
 * scaled down at higher waves so the reward never outgrows the run's own
 * economy. Stage mode keeps the button but never reads this config.
 */
export const ENDLESS_ECONOMY = {
  /** Wave 1-10 baseline; it rises by this much every following ten waves. */
  goldPerSecond: 1,
  goldPerSecondPerTenWaves: 1,
  /** Calling into a wave containing level-4+ enemies is a risk premium. */
  highTierEarlyCallMultiplier: 2,
  /** Below this many seconds left, calling the wave early pays nothing —
   * a courtesy tap in the last moment isn't a real decision to reward. */
  minRewardSeconds: 2,
};

/** The baseline grows at waves 11, 21, 31... instead of shrinking over time. */
export function endlessEarlyWaveMultiplier(wave: number): number {
  const completedTenWaveBands = Math.floor((Math.max(1, wave) - 1) / 10);
  return ENDLESS_ECONOMY.goldPerSecond + completedTenWaveBands * ENDLESS_ECONOMY.goldPerSecondPerTenWaves;
}

/** The exact reward `callNextWaveNow` grants, and what the HUD button previews. */
export function endlessEarlyWaveReward(wave: number, remainingSeconds: number, hasLevelFourOrHigher = false): number {
  if (remainingSeconds < ENDLESS_ECONOMY.minRewardSeconds) return 0;
  const eliteMultiplier = hasLevelFourOrHigher ? ENDLESS_ECONOMY.highTierEarlyCallMultiplier : 1;
  return Math.floor(remainingSeconds * endlessEarlyWaveMultiplier(wave) * eliteMultiplier);
}
