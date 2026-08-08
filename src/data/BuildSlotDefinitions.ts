import { BUILDINGS, type BuildSlotCategory } from "./BuildingDefinitions";

/** Largest footprint any universal building can occupy.  Layout validation
 * always uses the worst case so changing the catalogue cannot silently make a
 * previously legal fixed slot overlap its neighbour. */
export const UNIVERSAL_MAX_BUILDING_RADIUS = Math.max(
  ...BUILDINGS.filter((b) => b.slotCategory === "universal").map((b) => b.radius),
);
export const UNIVERSAL_MAX_VISUAL_RADIUS = Math.max(
  ...BUILDINGS.filter((b) => b.slotCategory === "universal").map((b) => b.visualBoundsRadius),
);

/**
 * Scene-rework G1: the furnace remains the centre, but the masonry perimeter is
 * deliberately compact.  It encloses only the furnace and the four core build
 * plots; the rest of the economy/defence network sits along the approach roads.
 */
const BASE_HALF_WIDTH = 12;
const BASE_HALF_DEPTH = 12;

export const MAP = {
  furnaceRadius: 2.3,
  baseHalfWidth: BASE_HALF_WIDTH,
  baseHalfDepth: BASE_HALF_DEPTH,
  gateWidth: 4.2,
  wallThickness: 1.6,
  /** Approximate radial distance of the four remote spawn mouths. */
  spawnRadius: 46,
  /** Hero can reach every road-side build plot and resource cluster. */
  playableRadius: 48,
  groundSize: 130,
  wallRadius: Math.hypot(BASE_HALF_WIDTH, BASE_HALF_DEPTH),
  universalSlots: 20,
  groundSlots: 20,
  skySlots: 5,
  wallSlots: 4,
};

export const WALL_SEGMENT_DEPTH = MAP.wallThickness;

export type WallSide = "north" | "east" | "south" | "west";
export type SlotRole = "front" | "mid" | "back" | "junction" | "center" | "wall";

export interface WallSideDef {
  side: WallSide;
  slotId: string;
  x: number;
  z: number;
  yaw: number;
  axis: "x" | "z";
  length: number;
  outward: { x: number; z: number };
}

export const WALL_SIDES: WallSideDef[] = [
  { side: "north", slotId: "wallNorth", x: 0, z: BASE_HALF_DEPTH, yaw: 0, axis: "x", length: BASE_HALF_WIDTH * 2, outward: { x: 0, z: 1 } },
  { side: "south", slotId: "wallSouth", x: 0, z: -BASE_HALF_DEPTH, yaw: Math.PI, axis: "x", length: BASE_HALF_WIDTH * 2, outward: { x: 0, z: -1 } },
  { side: "east", slotId: "wallEast", x: BASE_HALF_WIDTH, z: 0, yaw: Math.PI / 2, axis: "z", length: BASE_HALF_DEPTH * 2, outward: { x: 1, z: 0 } },
  { side: "west", slotId: "wallWest", x: -BASE_HALF_WIDTH, z: 0, yaw: -Math.PI / 2, axis: "z", length: BASE_HALF_DEPTH * 2, outward: { x: -1, z: 0 } },
];
export const WALL_SIDE_BY_SLOT = new Map(WALL_SIDES.map((w) => [w.slotId, w]));
export const WALL_SIDE_BY_NAME = new Map(WALL_SIDES.map((w) => [w.side, w]));
export const WALL_SIDE_NAMES: Record<WallSide, string> = {
  north: "北側城牆",
  east: "東側城牆",
  south: "南側城牆",
  west: "西側城牆",
};

export function nearestSide(x: number, z: number): WallSideDef {
  const excess: Record<WallSide, number> = {
    north: z - BASE_HALF_DEPTH,
    south: -BASE_HALF_DEPTH - z,
    east: x - BASE_HALF_WIDTH,
    west: -BASE_HALF_WIDTH - x,
  };
  let best: WallSide = "north";
  let bestVal = -Infinity;
  for (const side of ["north", "south", "east", "west"] as const) {
    if (excess[side] > bestVal) {
      bestVal = excess[side];
      best = side;
    }
  }
  return WALL_SIDE_BY_NAME.get(best)!;
}

export function isInsideBase(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) < BASE_HALF_WIDTH - margin && Math.abs(z) < BASE_HALF_DEPTH - margin;
}

export function outsideDistance(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - BASE_HALF_WIDTH);
  const dz = Math.max(0, Math.abs(z) - BASE_HALF_DEPTH);
  return Math.hypot(dx, dz);
}

export function clampInside(x: number, z: number, margin = 0.6): { x: number; z: number } {
  const w = BASE_HALF_WIDTH - margin;
  const d = BASE_HALF_DEPTH - margin;
  return { x: Math.max(-w, Math.min(w, x)), z: Math.max(-d, Math.min(d, z)) };
}

export function distanceToWall(angle: number): number {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const tx = Math.abs(sin) > 1e-6 ? BASE_HALF_WIDTH / Math.abs(sin) : Infinity;
  const tz = Math.abs(cos) > 1e-6 ? BASE_HALF_DEPTH / Math.abs(cos) : Infinity;
  return Math.min(tx, tz);
}

export function clampOutside(x: number, z: number, margin = 0.6): { x: number; z: number } {
  const side = nearestSide(x, z);
  const w = BASE_HALF_WIDTH + margin;
  const d = BASE_HALF_DEPTH + margin;
  if (side.axis === "x") {
    return { x: Math.max(-w, Math.min(w, x)), z: side.z + side.outward.z * margin };
  }
  return { x: side.x + side.outward.x * margin, z: Math.max(-d, Math.min(d, z)) };
}

export interface BuildSlotDefinition {
  id: string;
  category: BuildSlotCategory;
  unlockLevel: number;
  surface: "ground" | "sky";
  elevation: number;
  x: number;
  z: number;
  yaw: number;
  ringIndex: number;
  role: SlotRole;
  /** Roads this plot is intentionally positioned to cover. */
  lanes: WallSide[];
  name: string;
  footprintRadius: number;
  maxBuildingRadius: number;
}

function facingCentre(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

function plot(
  id: string,
  x: number,
  z: number,
  role: SlotRole,
  lanes: WallSide[],
  name: string,
  unlockLevel: number,
): BuildSlotDefinition {
  return {
    id,
    category: "universal",
    unlockLevel,
    surface: "ground",
    elevation: 0,
    x,
    z,
    yaw: facingCentre(x, z),
    ringIndex: 0,
    role,
    lanes,
    name,
    footprintRadius: UNIVERSAL_MAX_BUILDING_RADIUS,
    maxBuildingRadius: UNIVERSAL_MAX_BUILDING_RADIUS,
  };
}

const LANE_LABEL: Record<WallSide, string> = {
  north: "北路",
  east: "東路",
  south: "南路",
  west: "西路",
};

/**
 * Twenty ground plots replace the old 31-plot ring.  Only four sit inside the
 * wall and they are separated diagonally around the furnace.  The other sixteen
 * are deliberately staggered beside the winding roads, so a developed run
 * reads as four defensive corridors rather than a pile of buildings at origin.
 */
export const BUILD_SLOTS: BuildSlotDefinition[] = [
  // Four core plots: the only non-wall ground construction close to the furnace.
  plot("coreNE", 5.2, 5.2, "center", ["north", "east"], "核心東北交叉火力位", 1),
  plot("coreSE", 5.2, -5.2, "center", ["east", "south"], "核心東南交叉火力位", 1),
  plot("coreSW", -5.2, -5.2, "center", ["south", "west"], "核心西南交叉火力位", 1),
  plot("coreNW", -5.2, 5.2, "center", ["west", "north"], "核心西北交叉火力位", 1),

  // North road — each pad sits beside, never on, the lane centreline.
  plot("northInner", -4.5, 14.7, "back", ["north"], `${LANE_LABEL.north}內側`, 1),
  plot("northMid", 12.5, 23.5, "mid", ["north"], `${LANE_LABEL.north}中段`, 3),
  plot("northOuter", -10.5, 30.5, "front", ["north"], `${LANE_LABEL.north}外段`, 5),
  plot("northFar", -18.5, 39.5, "front", ["north"], `${LANE_LABEL.north}遠端`, 8),

  // East road.
  plot("eastInner", 14.7, 4.5, "back", ["east"], `${LANE_LABEL.east}內側`, 1),
  plot("eastMid", 23.5, -12.5, "mid", ["east"], `${LANE_LABEL.east}中段`, 3),
  plot("eastOuter", 30.5, 10.5, "front", ["east"], `${LANE_LABEL.east}外段`, 6),
  plot("eastFar", 39.5, 18.5, "front", ["east"], `${LANE_LABEL.east}遠端`, 9),

  // South road.
  plot("southInner", 4.5, -14.7, "back", ["south"], `${LANE_LABEL.south}內側`, 2),
  plot("southMid", -12.5, -23.5, "mid", ["south"], `${LANE_LABEL.south}中段`, 4),
  plot("southOuter", 10.5, -30.5, "front", ["south"], `${LANE_LABEL.south}外段`, 7),
  plot("southFar", 18.5, -39.5, "front", ["south"], `${LANE_LABEL.south}遠端`, 10),

  // West road.
  plot("westInner", -14.7, -4.5, "back", ["west"], `${LANE_LABEL.west}內側`, 2),
  plot("westMid", -23.5, 12.5, "mid", ["west"], `${LANE_LABEL.west}中段`, 4),
  plot("westOuter", -30.5, -10.5, "front", ["west"], `${LANE_LABEL.west}外段`, 7),
  plot("westFar", -39.5, -18.5, "front", ["west"], `${LANE_LABEL.west}遠端`, 10),

  // Sky platforms stay separate from ground crowding and keep their existing
  // combat buff.  Their `lanes` metadata is descriptive only; sky weapons still
  // acquire targets through real combat range.
  ...[
    ["skyA", 16, 16, "天空平台 A", ["north", "east"]],
    ["skyB", 16, -16, "天空平台 B", ["east", "south"]],
    ["skyC", -16, -16, "天空平台 C", ["south", "west"]],
    ["skyD", -16, 16, "天空平台 D", ["west", "north"]],
    ["skyE", 0, 26, "天空平台 E", ["north"]],
  ].map(([id, x, z, name, lanes], index): BuildSlotDefinition => ({
    id: String(id),
    category: "sky",
    unlockLevel: 15 + index * 5,
    surface: "sky",
    elevation: 8,
    x: Number(x),
    z: Number(z),
    yaw: facingCentre(Number(x), Number(z)),
    ringIndex: index,
    role: "junction",
    lanes: lanes as WallSide[],
    name: String(name),
    footprintRadius: UNIVERSAL_MAX_BUILDING_RADIUS,
    maxBuildingRadius: UNIVERSAL_MAX_BUILDING_RADIUS,
  })),

  ...WALL_SIDES.map((w): BuildSlotDefinition => ({
    id: w.slotId,
    category: "wall",
    unlockLevel: 1,
    surface: "ground",
    elevation: 0,
    x: w.x,
    z: w.z,
    yaw: w.yaw,
    ringIndex: ["north", "east", "south", "west"].indexOf(w.side),
    role: "wall",
    lanes: [w.side],
    name: WALL_SIDE_NAMES[w.side],
    footprintRadius: WALL_SEGMENT_DEPTH * 0.5,
    maxBuildingRadius: WALL_SEGMENT_DEPTH * 0.5,
  })),
];

export const SLOT_BY_ID = new Map(BUILD_SLOTS.map((s) => [s.id, s]));
export const WALL_SLOT_IDS: string[] = BUILD_SLOTS.filter((s) => s.category === "wall").map((s) => s.id);
export const UNIVERSAL_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter((s) => s.category === "universal");
export const GROUND_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter(
  (s) => s.surface === "ground" && s.category === "universal",
);
export const SKY_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter((s) => s.surface === "sky");

export function unlockedGroundSlotCount(furnaceLevel: number): number {
  return GROUND_SLOTS.filter((slot) => Math.floor(furnaceLevel) >= slot.unlockLevel).length;
}

export function unlockedSkySlotCount(furnaceLevel: number): number {
  return SKY_SLOTS.filter((slot) => Math.floor(furnaceLevel) >= slot.unlockLevel).length;
}

export interface LanePoint {
  x: number;
  z: number;
}

export interface LaneDefinition {
  index: number;
  /** Outward bearing retained for spawn spread, HUD arrows and legacy visuals. */
  angle: number;
  side: WallSide;
  name: string;
  shortName: string;
  /** Ordered from enemy spawn to the central furnace. */
  path: readonly LanePoint[];
  /** Path index on the wall centreline. */
  gatePointIndex: number;
}

const p = (x: number, z: number): LanePoint => ({ x, z });

/**
 * Four real S-shaped approach paths.  Each is ~69.5 world units long — more
 * than double the old 32-unit radial march — while still crossing its own wall
 * through the central gate and terminating at the furnace.
 */
export const LANES: LaneDefinition[] = [
  {
    index: 0,
    angle: Math.atan2(-10, 45),
    side: "north",
    name: "北方森林",
    shortName: "北森",
    gatePointIndex: 6,
    path: [p(-10, 45), p(-14, 37), p(-6, 30), p(8, 25), p(13, 18), p(7, 14), p(0, 12), p(0, 8), p(0, 0)],
  },
  {
    index: 1,
    angle: Math.atan2(45, 10),
    side: "east",
    name: "東側山口",
    shortName: "東山",
    gatePointIndex: 6,
    path: [p(45, 10), p(37, 14), p(30, 6), p(25, -8), p(18, -13), p(14, -7), p(12, 0), p(8, 0), p(0, 0)],
  },
  {
    index: 2,
    angle: Math.atan2(10, -45),
    side: "south",
    name: "南方冰原",
    shortName: "南原",
    gatePointIndex: 6,
    path: [p(10, -45), p(14, -37), p(6, -30), p(-8, -25), p(-13, -18), p(-7, -14), p(0, -12), p(0, -8), p(0, 0)],
  },
  {
    index: 3,
    angle: Math.atan2(-45, -10),
    side: "west",
    name: "西側廢墟",
    shortName: "西墟",
    gatePointIndex: 6,
    path: [p(-45, -10), p(-37, -14), p(-30, -6), p(-25, 8), p(-18, 13), p(-14, 7), p(-12, 0), p(-8, 0), p(0, 0)],
  },
];

export function laneSpawnPoint(lane: LaneDefinition): { x: number; z: number } {
  const spawn = lane.path[0];
  return { x: spawn.x, z: spawn.z };
}

function nearestPointOnSegment(
  x: number,
  z: number,
  a: LanePoint,
  b: LanePoint,
): { x: number; z: number; dist: number; t: number } {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const wx = x - a.x;
  const wz = z - a.z;
  const denom = vx * vx + vz * vz;
  const t = denom <= 1e-8 ? 0 : Math.max(0, Math.min(1, (wx * vx + wz * vz) / denom));
  const px = a.x + vx * t;
  const pz = a.z + vz * t;
  return { x: px, z: pz, dist: Math.hypot(x - px, z - pz), t };
}

export interface LaneProjection {
  lane: LaneDefinition;
  laneIndex: number;
  segmentIndex: number;
  x: number;
  z: number;
  distance: number;
  t: number;
}

/** Nearest point on any real winding road.  Recruitment drag/drop, range
 * coverage and test probes all use this same projection. */
export function nearestLanePoint(x: number, z: number, maxDistance = Infinity): LaneProjection | null {
  let best: LaneProjection | null = null;
  for (const lane of LANES) {
    for (let i = 0; i < lane.path.length - 1; i++) {
      const hit = nearestPointOnSegment(x, z, lane.path[i], lane.path[i + 1]);
      if (hit.dist > maxDistance || (best && hit.dist >= best.distance)) continue;
      best = {
        lane,
        laneIndex: lane.index,
        segmentIndex: i,
        x: hit.x,
        z: hit.z,
        distance: hit.dist,
        t: hit.t,
      };
    }
  }
  return best;
}

/** Nearest point on one lane only, used by tower coverage and lane-locked AI. */
export function nearestPointOnLane(x: number, z: number, lane: LaneDefinition): LaneProjection {
  let best: LaneProjection | null = null;
  for (let i = 0; i < lane.path.length - 1; i++) {
    const hit = nearestPointOnSegment(x, z, lane.path[i], lane.path[i + 1]);
    if (best && hit.dist >= best.distance) continue;
    best = {
      lane,
      laneIndex: lane.index,
      segmentIndex: i,
      x: hit.x,
      z: hit.z,
      distance: hit.dist,
      t: hit.t,
    };
  }
  return best ?? {
    lane,
    laneIndex: lane.index,
    segmentIndex: 0,
    x: lane.path[0].x,
    z: lane.path[0].z,
    distance: Math.hypot(x - lane.path[0].x, z - lane.path[0].z),
    t: 0,
  };
}

/** One waypoint farther along the unit's own road.  Enemy movement is inbound
 * toward the furnace; allied between-shot movement is outbound so a ranged
 * fallback shot never causes the squad to drift sideways into another lane. */
export function laneAdvancePoint(
  laneIndex: number,
  x: number,
  z: number,
  direction: "inbound" | "outbound",
): LanePoint {
  const lane = LANES[((laneIndex % LANES.length) + LANES.length) % LANES.length];
  const nearest = nearestPointOnLane(x, z, lane);
  const index = direction === "inbound"
    ? Math.min(lane.path.length - 1, nearest.segmentIndex + 1)
    : Math.max(0, nearest.segmentIndex);
  return lane.path[index];
}

/** Starting natural-resource clusters live between roads rather than inside a
 * construction corridor. */
export const HARVEST_NODES = {
  trees: [
    { x: -27, z: 27 },
    { x: -32, z: 24 },
    { x: -24, z: 32 },
    { x: -34, z: 30 },
  ],
  rocks: [
    { x: 27, z: -27 },
    { x: 32, z: -24 },
    { x: 24, z: -32 },
    { x: 34, z: -30 },
  ],
};
