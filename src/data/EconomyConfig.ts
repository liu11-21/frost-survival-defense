export type ResourceKind = "wood" | "stone" | "gold";

export const RESOURCE_KINDS: ResourceKind[] = ["wood", "stone", "gold"];

export const RESOURCE_LABELS: Record<ResourceKind, string> = {
  wood: "木材",
  stone: "石頭",
  gold: "金幣",
};

export const ECONOMY = {
  /** Hero hand-gathering. Deliberately ~4-5x slower than an automated building. */
  heroWoodInterval: 1.0,
  heroStoneInterval: 1.3,
  heroGatherRange: 2.6,
  /** Cap on every resource while no warehouse stands. */
  baseCapacity: 100,
  /** Starting stock, overridden per level. */
  startingWood: 40,
  startingStone: 20,
  startingGold: 0,
  /** Ground pickups the player walks over. */
  pickupMagnetRange: 2.4,
  pickupLifetime: 20,
  coinLifetime: 25,
};

/** Gathering nodes never run dry, so the early game can never dead-lock. */
export const HARVEST_NODE = {
  woodPerGather: 1,
  stonePerGather: 1,
  /** Purely visual: the node shrinks as it is worked and recovers when left alone. */
  visualDrainPerGather: 0.06,
  visualRecoverPerSecond: 0.05,
};
