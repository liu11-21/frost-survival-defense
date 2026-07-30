import { STAGE_ONE_WAVES, type WaveDefinition } from "./WaveDefinitions";

export type GameMode = "stage" | "endless";

export interface GameModeRules {
  mode: GameMode;
  initialSquadLimit: number;
  allowFurnaceUpgrade: boolean;
  /** Extra squad slots granted per furnace level. Stage mode grants none. */
  squadLimitPerFurnaceLevel: number;
  /** Stage mode wipes every scrap of progress between levels. */
  resetBetweenStages: boolean;
  /** Endless mode charges the hero for dying. */
  heroDeathGoldPenalty: boolean;
  /** Endless mode offers a three-choice upgrade every ten waves. */
  offersRunUpgrades: boolean;
}

export const STAGE_RULES: GameModeRules = {
  mode: "stage",
  initialSquadLimit: 8,
  allowFurnaceUpgrade: true,
  squadLimitPerFurnaceLevel: 0,
  resetBetweenStages: true,
  heroDeathGoldPenalty: false,
  offersRunUpgrades: false,
};

export const ENDLESS_RULES: GameModeRules = {
  mode: "endless",
  initialSquadLimit: 8,
  allowFurnaceUpgrade: true,
  squadLimitPerFurnaceLevel: 2,
  resetBetweenStages: false,
  heroDeathGoldPenalty: true,
  offersRunUpgrades: true,
};

export interface LevelDefinition {
  id: string;
  name: string;
  description: string;
  waves: WaveDefinition[];
  /** How many approach lanes are live in this level. */
  laneCount: number;
  startingWood: number;
  startingStone: number;
  startingGold: number;
  /** Seconds of build time before wave 1 arrives. */
  prepTime: number;
  /** Seconds between waves once the previous one has been cleared. */
  waveInterval: number;
  allowFurnaceUpgrade: boolean;
  /** Flat multiplier on enemy health and damage for this level. */
  difficulty: number;
}

export const LEVELS: LevelDefinition[] = [
  {
    id: "stage-1",
    name: "第一關 · 雙線防守",
    description: "兩條進攻路線，10 波敵人。守住火爐即勝利。",
    waves: STAGE_ONE_WAVES,
    laneCount: 2,
    startingWood: 60,
    startingStone: 40,
    startingGold: 15,
    prepTime: 50,
    waveInterval: 22,
    allowFurnaceUpgrade: true,
    difficulty: 1,
  },
  {
    id: "stage-2",
    name: "第二關 · 三線圍攻",
    description: "同樣 10 波，但三條路線同時推進，初始資源更少。",
    waves: STAGE_ONE_WAVES,
    laneCount: 3,
    startingWood: 45,
    startingStone: 30,
    startingGold: 15,
    prepTime: 42,
    waveInterval: 19,
    allowFurnaceUpgrade: true,
    difficulty: 1.15,
  },
  {
    id: "stage-3",
    name: "第三關 · 四面楚歌",
    description: "四條路線、最短準備時間，考驗城牆與砲塔的佈局。",
    waves: STAGE_ONE_WAVES,
    laneCount: 4,
    startingWood: 35,
    startingStone: 25,
    startingGold: 15,
    prepTime: 36,
    waveInterval: 17,
    allowFurnaceUpgrade: true,
    difficulty: 1.3,
  },
];

export const LEVEL_BY_ID = new Map(LEVELS.map((l) => [l.id, l]));

/** Endless scaling. Linear on purpose — nothing here compounds. */
export const ENDLESS_SCALING = {
  healthPerWave: 0.12,
  attackPerWave: 0.08,
  countPerWave: 0.1,
  startingLanes: 2,
  maxLanes: 6,
  /** A new lane and a boss every this many waves. */
  lanesEveryWaves: 10,
  prepTime: 55,
  waveInterval: 20,
  startingWood: 60,
  startingStone: 40,
  startingGold: 15,
};

export function endlessHealthMultiplier(wave: number): number {
  return 1 + ENDLESS_SCALING.healthPerWave * (wave - 1);
}

export function endlessAttackMultiplier(wave: number): number {
  return 1 + ENDLESS_SCALING.attackPerWave * (wave - 1);
}

export function endlessCountMultiplier(wave: number): number {
  return 1 + ENDLESS_SCALING.countPerWave * (wave - 1);
}

export function endlessLaneCount(wave: number): number {
  const extra = Math.floor((wave - 1) / ENDLESS_SCALING.lanesEveryWaves);
  return Math.min(ENDLESS_SCALING.maxLanes, ENDLESS_SCALING.startingLanes + extra);
}
