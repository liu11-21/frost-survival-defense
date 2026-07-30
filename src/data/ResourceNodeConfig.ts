export type NodeSize = "small" | "medium" | "large";

/** Yield per node size, from the design brief. */
export const TREE_CAPACITY: Record<NodeSize, number> = { small: 6, medium: 10, large: 16 };
export const STONE_CAPACITY: Record<NodeSize, number> = { small: 8, medium: 14, large: 22 };

export const GATHER = {
  /** Seconds between successful chops / mining strikes. */
  woodInterval: 0.55,
  stoneInterval: 0.7,
  /** The first strike must land quickly so gathering feels immediate. */
  woodFirstHit: 0.4,
  stoneFirstHit: 0.5,
  /** Range at which the hero engages a node. */
  range: 2.6,
  /** Walking away stops production this quickly — no gathering at a distance. */
  releaseDelay: 0.15,
  /** Normalised point in the swing where the tool actually connects. */
  hitFrame: 0.36,
};

/** Endless mode regrows nodes; stage mode never does. */
export const RESPAWN = {
  treeSeconds: 90,
  stoneSeconds: 120,
  /** Seconds the sapling takes to grow back to full size. */
  regrowSeconds: 6,
};

export interface NodePlacement {
  x: number;
  z: number;
  size: NodeSize;
}

/**
 * Fixed node layout. Total starting yield is deliberately finite:
 * 42 wood and 58 stone, enough to open with but not to coast on — the player
 * has to switch to mines and lumberyards.
 */
export const TREE_NODES: NodePlacement[] = [
  { x: -4.4, z: 8.6, size: "large" },
  { x: -7.8, z: 6.2, size: "medium" },
  { x: 5.2, z: 8.9, size: "medium" },
  { x: 8.6, z: 5.4, size: "small" },
  { x: -9.6, z: 10.4, size: "small" },
  { x: 9.8, z: 9.6, size: "small" },
];

export const STONE_NODES: NodePlacement[] = [
  { x: -8.9, z: -4.6, size: "large" },
  { x: -5.4, z: -8.2, size: "medium" },
  { x: 8.4, z: -5.8, size: "medium" },
  { x: 4.6, z: -8.8, size: "small" },
  { x: -10.2, z: -9.4, size: "small" },
];
