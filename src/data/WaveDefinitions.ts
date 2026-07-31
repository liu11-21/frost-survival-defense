import { BOSS_ESCORT, ENEMY_BY_ID } from "./EnemyDefinitions";
import {
  ENDLESS_DIFFICULTY,
  bossDamageMultiplier,
  bossEscortCount,
  bossHealthMultiplier,
  endlessFieldCapTarget,
  endlessHighTierShare,
  isLevel6BossWave,
} from "./EndlessDifficultyConfig";

export interface SpawnGroup {
  enemyId: string;
  /** Number of squads (not individuals). */
  squads: number;
  /** Which lane index to use; wrapped against the level's live lane count. */
  lane: number;
  /** Seconds after the wave starts before this group appears. */
  delay: number;
  /** Extra multiplier stacked on top of the normal endless scaling curve —
   * used only for a boss's own per-cycle growth, never for ordinary groups. */
  extraHealthMul?: number;
  extraAttackMul?: number;
}

export interface WaveDefinition {
  index: number;
  name: string;
  groups: SpawnGroup[];
  /** Set on boss waves so the UI can announce them. */
  boss?: boolean;
}

/** The hand-authored 10-wave stage. Difficulty comes from count and mix. */
export const STAGE_ONE_WAVES: WaveDefinition[] = [
  {
    index: 1,
    name: "第 1 波",
    groups: [
      { enemyId: "grunt", squads: 1, lane: 0, delay: 0 },
      { enemyId: "grunt", squads: 1, lane: 1, delay: 3 },
    ],
  },
  {
    index: 2,
    name: "第 2 波",
    groups: [
      { enemyId: "grunt", squads: 2, lane: 0, delay: 0 },
      { enemyId: "slinger", squads: 1, lane: 1, delay: 4 },
    ],
  },
  {
    index: 3,
    name: "第 3 波",
    groups: [
      { enemyId: "grunt", squads: 2, lane: 0, delay: 0 },
      { enemyId: "grunt", squads: 2, lane: 1, delay: 2 },
      { enemyId: "slinger", squads: 1, lane: 0, delay: 6 },
      // First appearance: Ice Bomber, cheap and easy to learn to avoid early.
      { enemyId: "bomber", squads: 1, lane: 1, delay: 9 },
    ],
  },
  {
    index: 4,
    name: "第 4 波",
    groups: [
      { enemyId: "grunt", squads: 2, lane: 0, delay: 0 },
      { enemyId: "slinger", squads: 2, lane: 1, delay: 3 },
      { enemyId: "bruiser", squads: 1, lane: 0, delay: 7 },
    ],
  },
  {
    index: 5,
    name: "第 5 波",
    groups: [
      { enemyId: "bruiser", squads: 1, lane: 0, delay: 0 },
      { enemyId: "bruiser", squads: 1, lane: 1, delay: 2 },
      { enemyId: "grunt", squads: 2, lane: 1, delay: 5 },
      { enemyId: "slinger", squads: 1, lane: 0, delay: 8 },
      // First appearance: Commander, alongside enough fodder for its aura to matter.
      { enemyId: "commander", squads: 1, lane: 0, delay: 10 },
    ],
  },
  {
    index: 6,
    name: "第 6 波",
    groups: [
      { enemyId: "grunt", squads: 3, lane: 0, delay: 0 },
      { enemyId: "marksman", squads: 1, lane: 1, delay: 3 },
      { enemyId: "bruiser", squads: 1, lane: 1, delay: 6 },
      // First appearance: Breacher, with a wall standing between it and the base.
      { enemyId: "breacher", squads: 1, lane: 0, delay: 9 },
    ],
  },
  {
    index: 7,
    name: "第 7 波",
    groups: [
      { enemyId: "bruiser", squads: 2, lane: 0, delay: 0 },
      { enemyId: "marksman", squads: 2, lane: 1, delay: 3 },
      { enemyId: "slinger", squads: 2, lane: 0, delay: 7 },
      // First appearance: Ice Armor Heavy.
      { enemyId: "icearmor", squads: 1, lane: 1, delay: 10 },
    ],
  },
  {
    index: 8,
    name: "第 8 波",
    groups: [
      { enemyId: "juggernaut", squads: 1, lane: 0, delay: 0 },
      { enemyId: "grunt", squads: 3, lane: 1, delay: 2 },
      { enemyId: "marksman", squads: 2, lane: 0, delay: 6 },
      // All four new tiers together once, ahead of the boss wave.
      { enemyId: "commander", squads: 1, lane: 1, delay: 9 },
      { enemyId: "bomber", squads: 1, lane: 0, delay: 11 },
    ],
  },
  {
    index: 9,
    name: "第 9 波",
    groups: [
      { enemyId: "juggernaut", squads: 1, lane: 1, delay: 0 },
      { enemyId: "icearmor", squads: 1, lane: 0, delay: 3 },
      { enemyId: "bruiser", squads: 2, lane: 0, delay: 5 },
      { enemyId: "marksman", squads: 2, lane: 1, delay: 8 },
    ],
  },
  {
    index: 10,
    name: "第 10 波 — 寒霜巨像",
    boss: true,
    groups: [
      { enemyId: "boss", squads: 1, lane: 0, delay: 0 },
      { enemyId: BOSS_ESCORT[0], squads: 1, lane: 0, delay: 0.5 },
      { enemyId: BOSS_ESCORT[1], squads: 1, lane: 0, delay: 1 },
      { enemyId: "grunt", squads: 3, lane: 1, delay: 4 },
      { enemyId: "marksman", squads: 2, lane: 1, delay: 8 },
    ],
  },
];

/** Enemy pools the endless generator draws from, gated by wave number. */
const ENDLESS_POOL: Array<{ id: string; fromWave: number; weight: number }> = [
  { id: "grunt", fromWave: 1, weight: 5 },
  { id: "slinger", fromWave: 2, weight: 4 },
  { id: "bomber", fromWave: 3, weight: 3 },
  { id: "bruiser", fromWave: 4, weight: 3 },
  { id: "commander", fromWave: 5, weight: 2 },
  { id: "breacher", fromWave: 6, weight: 2 },
  { id: "marksman", fromWave: 6, weight: 3 },
  { id: "icearmor", fromWave: 7, weight: 2 },
  { id: "juggernaut", fromWave: 9, weight: 2 },
  { id: "bombardier", fromWave: 12, weight: 2 },
];

/** First-encounter toast text, shown once per run the first time each of
 * these appears — a one-line heads-up, never a blocking dialog. */
export const ENEMY_INTRO: Record<string, { title: string; body: string }> = {
  bomber: { title: "冰爆怪出現", body: "接近任何目標會倒數自爆，聽到警告聲請保持距離或搶先擊殺。" },
  commander: { title: "號令者出現", body: "為附近敵人加成攻速與移速，友軍會優先攻擊他，建議優先集火。" },
  breacher: { title: "破城者出現", body: "無視嘲諷，一定會先攻擊擋路的城牆，對城牆傷害 ×3。" },
  icearmor: { title: "冰甲重兵出現", body: "低傷害攻擊會被護甲減半，血量過半後護甲碎裂並加速。" },
};

/** Level-5 and level-6 enemies are milestone threats, never ordinary waves. */
function allowedOnWave(enemyId: string, wave: number): boolean {
  const level = ENEMY_BY_ID.get(enemyId)?.level ?? 1;
  return level < 5 || wave % 5 === 0;
}

/**
 * Regular (non-milestone) waves are composed rather than authored: a soft
 * field-cap target sizes the wave, and a high-tier share caps how much of
 * that budget may go to level-3+ enemies — both climb by wave bracket, per
 * `EndlessDifficultyConfig`. Waves 1-10 are almost pure numbers; the mix
 * only really opens up from wave 11.
 */
function regularWaveGroups(wave: number, laneCount: number): SpawnGroup[] {
  const targetUnits = endlessFieldCapTarget(wave);
  const highShare = endlessHighTierShare(wave);
  // Level 5/6 appearances are milestone-only. Keeping the gate at wave
  // composition time makes it impossible for an ordinary random-ish wave to
  // smuggle a bombardier or boss into a non-multiple-of-five round.
  const pool = ENDLESS_POOL.filter((p) => p.fromWave <= wave && allowedOnWave(p.id, wave));
  const fodderPool = pool.filter((p) => (ENEMY_BY_ID.get(p.id)?.level ?? 1) <= 2);

  const groups: SpawnGroup[] = [];
  let spentUnits = 0;
  let spentHighTierUnits = 0;
  let i = 0;
  while (spentUnits < targetUnits && i < 40) {
    const underHighTierBudget = spentUnits === 0 || spentHighTierUnits / spentUnits < highShare;
    const usable = underHighTierBudget || fodderPool.length === 0 ? pool : fodderPool;
    const pick = usable[(i * 3 + wave) % usable.length];
    const def = ENEMY_BY_ID.get(pick.id);
    if (!def) {
      i++;
      continue;
    }
    groups.push({ enemyId: pick.id, squads: 1, lane: i % laneCount, delay: Math.min(20, i * 1.6) });
    spentUnits += def.squadSize;
    if ((def.level ?? 1) >= 3) spentHighTierUnits += def.squadSize;
    i++;
  }
  return groups;
}

/** Wave 10: an elite squad — one level-4 unit plus fodder — but never a level-6 boss. */
function eliteWave(laneCount: number): WaveDefinition {
  const wave = ENDLESS_DIFFICULTY.eliteWave;
  return {
    index: wave,
    name: `第 ${wave} 波 — 精英部隊`,
    groups: [
      { enemyId: "grunt", squads: 3, lane: 0 % laneCount, delay: 0 },
      { enemyId: "slinger", squads: 2, lane: 1 % laneCount, delay: 3 },
      { enemyId: "bruiser", squads: 2, lane: 0 % laneCount, delay: 6 },
      { enemyId: "juggernaut", squads: 1, lane: 1 % laneCount, delay: 9 },
    ],
  };
}

/** Wave 15: a strengthened level-5 elite — still not a full level-6 boss. */
function miniEliteWave(laneCount: number): WaveDefinition {
  const wave = ENDLESS_DIFFICULTY.miniEliteWave;
  return {
    index: wave,
    name: `第 ${wave} 波 — 強化精英`,
    groups: [
      { enemyId: "bombardier", squads: 1, lane: 0 % laneCount, delay: 0, extraHealthMul: 1.3, extraAttackMul: 1.15 },
      { enemyId: "icearmor", squads: 1, lane: 1 % laneCount, delay: 2 },
      { enemyId: "marksman", squads: 2, lane: 0 % laneCount, delay: 5 },
      { enemyId: "grunt", squads: 3, lane: 1 % laneCount, delay: 8 },
    ],
  };
}

export function buildEndlessWave(wave: number, laneCount: number): WaveDefinition {
  if (wave === ENDLESS_DIFFICULTY.eliteWave) return eliteWave(laneCount);
  if (wave === ENDLESS_DIFFICULTY.miniEliteWave) return miniEliteWave(laneCount);

  const isBoss = isLevel6BossWave(wave);
  const groups = regularWaveGroups(wave, laneCount);

  if (isBoss) {
    const healthMul = bossHealthMultiplier(wave);
    const attackMul = bossDamageMultiplier(wave);
    groups.unshift({ enemyId: "boss", squads: 1, lane: 0, delay: 0, extraHealthMul: healthMul, extraAttackMul: attackMul });
    const escorts = bossEscortCount(wave);
    for (let i = 0; i < escorts; i++) {
      groups.splice(i + 1, 0, { enemyId: BOSS_ESCORT[i % BOSS_ESCORT.length], squads: 1, lane: 0, delay: 0.6 + i * 0.6 });
    }
  }

  return {
    index: wave,
    name: isBoss ? `第 ${wave} 波 — Boss` : `第 ${wave} 波`,
    groups,
    boss: isBoss,
  };
}
