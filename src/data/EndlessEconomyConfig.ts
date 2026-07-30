/**
 * "立即下一波" used to just forfeit the rest of the prep timer for nothing.
 * Endless mode now pays back the seconds the player chose not to spend,
 * scaled down at higher waves so the reward never outgrows the run's own
 * economy. Stage mode keeps the button but never reads this config.
 */
export const ENDLESS_ECONOMY = {
  goldPerSecond: 1,
  /** Below this many seconds left, calling the wave early pays nothing —
   * a courtesy tap in the last moment isn't a real decision to reward. */
  minRewardSeconds: 2,
};

export function endlessEarlyWaveMultiplier(wave: number): number {
  if (wave <= 10) return 1.0;
  if (wave <= 20) return 0.8;
  if (wave <= 40) return 0.6;
  return 0.5;
}

/** The exact reward `callNextWaveNow` grants, and what the HUD button previews. */
export function endlessEarlyWaveReward(wave: number, remainingSeconds: number): number {
  if (remainingSeconds < ENDLESS_ECONOMY.minRewardSeconds) return 0;
  return Math.floor(remainingSeconds * ENDLESS_ECONOMY.goldPerSecond * endlessEarlyWaveMultiplier(wave));
}
