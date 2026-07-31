import type { ResourceCost } from "./CombatTypes";
import { DEFENSE_BUILDINGS } from "./DefenseBuildingDefinitions";

/**
 * Every plot the player can build on is "universal": it accepts any
 * player-buildable, non-wall building. Only the four wall sides are their own
 * category, since they are placed by the perimeter system, not chosen freely.
 * "special" exists for a future dedicated plot but nothing uses it yet.
 */
export type BuildSlotCategory = "universal" | "wall" | "special";

export type BuildingType =
  | "mine"
  | "goldMine"
  | "lumberyard"
  | "warehouse"
  | "recruitHall"
  | "autoCollector"
  | "autoRebuilder"
  | "tower"
  | "crossbowTower"
  | "frostTower"
  | "sniperTower"
  | "mortar"
  | "wall";

/** Which attack building fires which way. Drives `BuildingCombat`'s dispatch. */
export type AttackKind = "areaShell" | "singleBolt" | "slowBolt" | "snipe" | "burstMortar";

export interface SlowEffectConfig {
  amount: number;
  duration: number;
  bossAmount: number;
  bossDuration: number;
}

export interface BurnEffectConfig {
  duration: number;
  dps: number;
  maxZones: number;
  bossFactor: number;
}

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  description: string;
  /** One-line positioning text for the build-menu card. */
  role: string;
  maxHealth: number;
  attackPower: number;
  cost: ResourceCost;
  slotCategory: BuildSlotCategory;
  /** Whether enemies can damage and destroy it. Independent of demolition. */
  canBeAttacked: boolean;
  /** Whether the *player* may voluntarily take it down for a partial refund. */
  canBeDemolished: boolean;
  canBeRebuilt: boolean;
  /** Seconds the staged assembly takes. */
  buildTime: number;
  /** Production buildings. */
  produces?: "wood" | "stone" | "gold";
  produceInterval?: number;
  bufferCap?: number;
  /** Attack-building combat. */
  attackKind?: AttackKind;
  attackInterval?: number;
  attackRange?: number;
  /** Mortar only: closer than this, the arc can't be dropped at all. Lives
   * here (not as a hardcoded constant in `BuildingCombat.ts`) specifically so
   * the build-time and hover range preview can read the exact same number
   * real combat fires against, rather than a second copy that could drift. */
  minAttackRange?: number;
  areaRadius?: number;
  maxAreaTargets?: number;
  /** Footprint radius used for collision and enemy stopping distance. */
  radius: number;
  /** Visual mesh extent, used only by the slot-overlap validator. */
  visualBoundsRadius: number;
  /** How close the hero's `E` prompt reach needs to be; documents the existing global `REACH.slot`. */
  interactionRadius: number;
  /** Crossbow/frost/sniper need a clear line to the target; area/arc weapons (tower, mortar) do not. */
  requiresLineOfSight?: boolean;
  /** Sniper: extra multiplier applied only against the boss tier. */
  bonusVsBossFactor?: number;
  /** Sniper: seconds of aim telegraph before the shot actually fires. */
  telegraph?: number;
  /** Sniper: skip targets other snipers have already committed lethal damage to. */
  avoidOverkill?: boolean;
  /** Frost tower's on-hit slow. Refreshes rather than stacking, like the Frost Sorcerer's. */
  slowEffect?: SlowEffectConfig;
  /** Mortar's ground-fire zone. */
  burnEffect?: BurnEffectConfig;
}

const ECONOMY_BUILDINGS: BuildingDefinition[] = [
  {
    id: "mine",
    name: "礦場",
    description: "每 0.25 秒產出 1 石頭",
    role: "生產",
    maxHealth: 0,
    attackPower: 0,
    // Stone producer: a modest wood frame, so opening with both basic
    // producers is still possible from the stage's 60 wood / 40 stone start.
    cost: { wood: 35 },
    slotCategory: "universal",
    canBeAttacked: false,
    canBeDemolished: true,
    canBeRebuilt: false,
    buildTime: 2.0,
    produces: "stone",
    produceInterval: 0.25,
    bufferCap: 100,
    radius: 1.5,
    visualBoundsRadius: 1.8,
    interactionRadius: 3.2,
  },
  {
    id: "goldMine",
    name: "金礦",
    description: "每 0.75 秒產出 1 金幣",
    role: "生產",
    maxHealth: 0,
    attackPower: 0,
    // A gold vein needs reinforced timber framing, but should not deepen the
    // old stone-only bottleneck.
    cost: { wood: 110, stone: 90 },
    slotCategory: "universal",
    canBeAttacked: false,
    canBeDemolished: true,
    canBeRebuilt: false,
    buildTime: 3.5,
    produces: "gold",
    produceInterval: 0.75,
    bufferCap: 100,
    radius: 1.5,
    visualBoundsRadius: 1.8,
    interactionRadius: 3.2,
  },
  {
    id: "lumberyard",
    name: "伐木場",
    description: "每 0.25 秒產出 1 木材",
    role: "生產",
    maxHealth: 0,
    attackPower: 0,
    // Lumber producer: the one early facility intentionally stone-forward.
    cost: { stone: 40 },
    slotCategory: "universal",
    canBeAttacked: false,
    canBeDemolished: true,
    canBeRebuilt: false,
    buildTime: 2.0,
    produces: "wood",
    produceInterval: 0.25,
    bufferCap: 100,
    radius: 1.5,
    visualBoundsRadius: 1.7,
    interactionRadius: 3.2,
  },
  {
    id: "warehouse",
    name: "倉庫",
    description: "解除三種資源的容量上限",
    role: "經濟與支援",
    maxHealth: 4000,
    attackPower: 0,
    // Must remain affordable under the pre-warehouse 100-resource cap.
    cost: { wood: 100, stone: 90, gold: 20 },
    slotCategory: "universal",
    canBeAttacked: true,
    canBeDemolished: true,
    canBeRebuilt: true,
    buildTime: 3.0,
    radius: 1.6,
    visualBoundsRadius: 1.9,
    interactionRadius: 3.4,
  },
  {
    id: "recruitHall",
    name: "招募所",
    description: "開啟招募選單，解鎖全部兵種",
    role: "經濟與支援",
    maxHealth: 3000,
    attackPower: 0,
    cost: { wood: 95, stone: 65, gold: 15 },
    slotCategory: "universal",
    canBeAttacked: true,
    canBeDemolished: true,
    canBeRebuilt: true,
    buildTime: 3.0,
    radius: 1.6,
    visualBoundsRadius: 1.9,
    interactionRadius: 3.4,
  },
  {
    id: "autoCollector",
    name: "自動收取設施",
    description: "生產設施產出與敵人掉落金幣直接進入庫存",
    role: "經濟與支援",
    maxHealth: 0,
    attackPower: 0,
    // Automation is machinery-heavy (wood-forward) rather than another
    // several-hundred-stone sink.
    cost: { wood: 220, stone: 180, gold: 50 },
    slotCategory: "universal",
    canBeAttacked: false,
    canBeDemolished: true,
    canBeRebuilt: false,
    buildTime: 3.0,
    radius: 1.5,
    visualBoundsRadius: 1.7,
    interactionRadius: 3.2,
  },
  {
    id: "autoRebuilder",
    name: "自動重建站",
    description: "依摧毀順序自動重建設施",
    role: "經濟與支援",
    maxHealth: 0,
    attackPower: 0,
    cost: { wood: 650, stone: 450, gold: 150 },
    slotCategory: "universal",
    canBeAttacked: false,
    canBeDemolished: true,
    canBeRebuilt: false,
    buildTime: 4.0,
    radius: 1.6,
    visualBoundsRadius: 1.8,
    interactionRadius: 3.2,
  },
];

// The five attack buildings plus the wall live in their own file purely to
// keep this one under the project's line-count convention.
export const BUILDINGS: BuildingDefinition[] = [...ECONOMY_BUILDINGS, ...DEFENSE_BUILDINGS];

export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));

export function buildingsForCategory(category: BuildSlotCategory): BuildingDefinition[] {
  return BUILDINGS.filter((b) => b.slotCategory === category);
}

/** Resources lost when the warehouse falls, scattered as pickups. */
export const WAREHOUSE_LOSS = {
  wood: 0.5,
  stone: 0.5,
  gold: 0.7,
  /** Seconds the scattered pickups stay on the ground. */
  pickupLifetime: 20,
};

/**
 * A wall rebuilt repeatedly inside one wave comes back weaker, so re-walling a
 * breach mid-fight is a delaying tactic rather than a free reset. The penalty
 * clears completely when the next wave begins.
 */
export const WALL_REBUILD_DECAY = {
  factors: [1.0, 0.9, 0.8, 0.7],
  minimum: 0.7,
};

export function wallRebuildFactor(rebuildsThisWave: number): number {
  const f = WALL_REBUILD_DECAY.factors;
  return rebuildsThisWave < f.length ? f[rebuildsThisWave] : WALL_REBUILD_DECAY.minimum;
}

export const AUTO_REBUILD = {
  /** Cooldown after each completed rebuild. */
  cooldown: 10,
};
