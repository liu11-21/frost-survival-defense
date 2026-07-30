import { resetSniperShotCounter, sniperShotCount } from "../buildings/BuildingCombat";
import { validateBuildSlots } from "../buildings/SlotLayoutValidation";
import {
  bossDamageMultiplier,
  bossHealthMultiplier,
  isLevel6BossWave,
} from "../data/EndlessDifficultyConfig";
import { buildEndlessWave } from "../data/WaveDefinitions";
import type { GameSystems } from "./GameSystems";

/**
 * Debug hooks for this pass's five changes: universal build slots, the
 * layout validator, the endless early-wave gold reward, and endless boss
 * pacing. Split out of `DebugApi.ts` purely to keep that file's own line
 * count under the project's convention — still development-only and
 * tree-shaken out of production the same way.
 */
export function createV8DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    slotLayoutReport: () => validateBuildSlots(),
    goldAmount: () => Math.floor(s.store.gold),
    resetSniperShots: () => resetSniperShotCounter(),
    sniperShotsFired: () => sniperShotCount(),
    runOver: () => s.run.isOver,
    squadInfo: () => ({
      count: s.squads.allySquadSlotsUsed,
      units: s.squads.livingAllyUnits,
      limit: s.run.squadLimit,
    }),
    earlyWaveReward: () => s.run.previewEarlyWaveReward(),
    claimEarlyWaveNow: () => s.run.callNextWaveEarly(),
    setPrepCountdown: (seconds: number) => s.waves.setPrepCountdown(seconds),
    jumpToWave: (n: number) => s.waves.jumpToWave(n),
    waveTimer: () => ({
      wave: s.waves.currentWave,
      phase: s.waves.currentPhase,
      remaining: Number(s.waves.timeToNextWave.toFixed(2)),
    }),
    bossEligibility: (wave: number) => ({
      isLevel6BossWave: isLevel6BossWave(wave),
      healthMultiplier: Number(bossHealthMultiplier(wave).toFixed(3)),
      damageMultiplier: Number(bossDamageMultiplier(wave).toFixed(3)),
    }),
    /** The exact composed wave (groups, boss flag) without spawning or
     * simulating anything — the cheap way to audit the 1-20 curve. */
    endlessWavePreview: (wave: number, laneCount = 2) => {
      const built = buildEndlessWave(wave, laneCount);
      return {
        boss: built.boss === true,
        groups: built.groups.map((g) => ({ enemyId: g.enemyId, squads: g.squads })),
      };
    },
  };
}
