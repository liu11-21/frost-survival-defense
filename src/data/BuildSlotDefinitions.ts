import { BUILDINGS, type BuildSlotCategory } from "./BuildingDefinitions";

/** The largest footprint (and visual extent) any `"universal"` building can
 * have — every universal slot must clear this against its neighbours, since
 * any of them could end up there. Computed, not hand-copied, so a new
 * building can never quietly widen past what the layout was validated
 * against. */
export const UNIVERSAL_MAX_BUILDING_RADIUS = Math.max(...BUILDINGS.filter((b) => b.slotCategory === "universal").map((b) => b.radius));
export const UNIVERSAL_MAX_VISUAL_RADIUS = Math.max(
  ...BUILDINGS.filter((b) => b.slotCategory === "universal").map((b) => b.visualBoundsRadius),
);

/**
 * Fixed map geometry. The base is a rectangle now, not a ring: four wall
 * sides meet at four corners with no gap, instead of eight independent arcs
 * the player could leave partly unbuilt and enemies could slip between.
 */
const BASE_HALF_WIDTH = 20;
const BASE_HALF_DEPTH = 17;

export const MAP = {
  furnaceRadius: 2.3,
  /** Half-extents of the interior, wall-centre to wall-centre. */
  baseHalfWidth: BASE_HALF_WIDTH,
  baseHalfDepth: BASE_HALF_DEPTH,
  /** Passable gap at the centre of every wall side. */
  gateWidth: 4.2,
  wallThickness: 1.6,
  /** Where enemies appear. Comfortably clear of the rectangle's own corners. */
  spawnRadius: 32,
  /** Hard boundary for the hero. */
  playableRadius: 30,
  groundSize: 110,
  /**
   * The enclosing diagonal, kept under the old name because the camera
   * framing, decorative scatter and lane roads only need an approximate
   * "how far out does the defended area reach" — the true corner distance is
   * the correct, conservative answer for all of them.
   */
  wallRadius: Math.hypot(BASE_HALF_WIDTH, BASE_HALF_DEPTH),
  /** Ground plots available at furnace level 10. */
  universalSlots: 31,
  groundSlots: 31,
  skySlots: 5,
  wallSlots: 4,
};

/** Kept under its old name: the wall's front-to-back thickness. */
export const WALL_SEGMENT_DEPTH = MAP.wallThickness;

export type WallSide = "north" | "east" | "south" | "west";
/** Function only, per the brief — every slot is still fully universal. */
export type SlotRole = "front" | "mid" | "back" | "junction" | "center" | "wall";

export interface WallSideDef {
  side: WallSide;
  slotId: string;
  x: number;
  z: number;
  /** Facing used by the mesh and the build-panel label. */
  yaw: number;
  /** Which axis the wall's long dimension runs along. */
  axis: "x" | "z";
  /** Full masonry-plus-gate length of this side. */
  length: number;
  /** Unit vector pointing away from the base interior. */
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

/**
 * Which of the four sides a point is nearest — the boundary line with the
 * largest signed "outside" distance, whether the point is past it (outside)
 * or simply closest to it (inside). One formula answers both "which wall is
 * this enemy besieging" and "which wall is nearest this interior point".
 */
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

/** True while `(x, z)` is inside the rectangle, `margin` short of the walls. */
export function isInsideBase(x: number, z: number, margin = 0): boolean {
  return Math.abs(x) < BASE_HALF_WIDTH - margin && Math.abs(z) < BASE_HALF_DEPTH - margin;
}

/** How far outside the rectangle `(x, z)` is, in each axis; 0 or negative means inside. */
export function outsideDistance(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x) - BASE_HALF_WIDTH);
  const dz = Math.max(0, Math.abs(z) - BASE_HALF_DEPTH);
  return Math.hypot(dx, dz);
}

/** The nearest legal point just inside the rectangle from any `(x, z)`. */
export function clampInside(x: number, z: number, margin = 0.6): { x: number; z: number } {
  const w = BASE_HALF_WIDTH - margin;
  const d = BASE_HALF_DEPTH - margin;
  return { x: Math.max(-w, Math.min(w, x)), z: Math.max(-d, Math.min(d, z)) };
}

/** How far from the origin a ray at this bearing travels before it crosses a wall. */
export function distanceToWall(angle: number): number {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const tx = Math.abs(sin) > 1e-6 ? BASE_HALF_WIDTH / Math.abs(sin) : Infinity;
  const tz = Math.abs(cos) > 1e-6 ? BASE_HALF_DEPTH / Math.abs(cos) : Infinity;
  return Math.min(tx, tz);
}

/** The nearest legal point just outside the rectangle from any `(x, z)`. */
export function clampOutside(x: number, z: number, margin = 0.6): { x: number; z: number } {
  const side = nearestSide(x, z);
  const w = BASE_HALF_WIDTH + margin;
  const d = BASE_HALF_DEPTH + margin;
  if (side.axis === "x") return { x: Math.max(-w, Math.min(w, x)), z: side.z + (side.outward.z * margin) };
  return { x: side.x + side.outward.x * margin, z: Math.max(-d, Math.min(d, z)) };
}

export interface BuildSlotDefinition {
  id: string;
  category: BuildSlotCategory;
  /** Furnace level at which this plot becomes buildable. */
  unlockLevel: number;
  /** Ground plots participate in collision; sky plots are elevated platforms. */
  surface: "ground" | "sky";
  /** World-space platform height. Ground remains at zero. */
  elevation: number;
  x: number;
  z: number;
  /** Facing, so buildings turn their front toward the interior road network. */
  yaw: number;
  /** Kept for the wall slots' side ordering; otherwise unused. */
  ringIndex: number;
  /** Purely descriptive — every slot accepts every building regardless. */
  role: SlotRole;
  /** Which lane(s) this position is meaningfully useful against — one for a
   * single-lane slot, two for a junction, empty for a pure central hub. */
  lanes: WallSide[];
  /** What the player actually sees on selection — never the raw id. */
  name: string;
  /** This slot's own footprint, for future non-uniform plots. Equal to `maxBuildingRadius` today. */
  footprintRadius: number;
  /**
   * The largest radius any building this slot could ever host might need.
   * Every "universal" slot can host anything a `universal` building might be,
   * so this is the same constant everywhere except on wall slots — it is what
   * the layout validator checks pairwise distances against, not whatever
   * happens to be built there this run.
   */
  maxBuildingRadius: number;
}

function facingCentre(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

/** Hand-placed, not procedural — see `BUILD_SLOTS` below. */
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

const LANE_LABEL: Record<WallSide, string> = { north: "北路", east: "東路", south: "南路", west: "西路" };
const CORNER_LABEL: Record<string, string> = { "north,east": "東北", "south,east": "東南", "south,west": "西南", "north,west": "西北" };

/**
 * Every main lane arranged the way a real fort would actually lay out its
 * defences: two front-line plots flanking the gate, a mid and a back plot
 * further in, all offset to the side of the road itself rather than sitting
 * on it. Four corner junctions cover two adjacent lanes each; two central
 * hubs sit close enough to the furnace to threaten whichever lane's
 * defenders it just breached, on opposite diagonals rather than a ring.
 * Every plot below is validated at load time by `validateBuildSlots()` (see
 * `SlotLayoutValidation.ts`) against the worst case: any of them could end up
 * hosting the single largest `"universal"` building there is, since every
 * slot now accepts every building type — position is the only advantage.
 */
export const BUILD_SLOTS: BuildSlotDefinition[] = [
  // ------------------------------------------------------------- north lane
  plot("northFrontA", -5.71, 12.24, "front", ["north"], `${LANE_LABEL.north}前線A`, 5),
  plot("northFrontB", 5.71, 12.24, "front", ["north"], `${LANE_LABEL.north}前線B`, 5),
  plot("northMid", 2.48, 8.65, "mid", ["north"], `${LANE_LABEL.north}中段`, 2),
  plot("northBack", -2.48, 8.65, "back", ["north"], `${LANE_LABEL.north}後方`, 2),
  // -------------------------------------------------------------- east lane
  plot("eastFrontA", 12.24, -5.71, "front", ["east"], `${LANE_LABEL.east}前線A`, 6),
  plot("eastFrontB", 12.24, 5.71, "front", ["east"], `${LANE_LABEL.east}前線B`, 6),
  plot("eastMid", 8.65, 2.48, "mid", ["east"], `${LANE_LABEL.east}中段`, 1),
  plot("eastBack", 8.65, -2.48, "back", ["east"], `${LANE_LABEL.east}後方`, 3),
  // ------------------------------------------------------------- south lane
  plot("southFrontA", -5.71, -12.24, "front", ["south"], `${LANE_LABEL.south}前線A`, 6),
  plot("southFrontB", 5.71, -12.24, "front", ["south"], `${LANE_LABEL.south}前線B`, 7),
  plot("southMid", 2.48, -8.65, "mid", ["south"], `${LANE_LABEL.south}中段`, 2),
  plot("southBack", -2.48, -8.65, "back", ["south"], `${LANE_LABEL.south}後方`, 3),
  // -------------------------------------------------------------- west lane
  plot("westFrontA", -12.24, -5.71, "front", ["west"], `${LANE_LABEL.west}前線A`, 7),
  plot("westFrontB", -12.24, 5.71, "front", ["west"], `${LANE_LABEL.west}前線B`, 7),
  plot("westMid", -8.65, 2.48, "mid", ["west"], `${LANE_LABEL.west}中段`, 1),
  plot("westBack", -8.65, -2.48, "back", ["west"], `${LANE_LABEL.west}後方`, 3),
  // ------------------------------------------------------- corner junctions
  plot("junctionNE", 10.25, 10.25, "junction", ["north", "east"], `${CORNER_LABEL["north,east"]}交叉火力位`, 4),
  plot("junctionSE", 10.25, -10.25, "junction", ["south", "east"], `${CORNER_LABEL["south,east"]}交叉火力位`, 4),
  plot("junctionSW", -10.25, -10.25, "junction", ["south", "west"], `${CORNER_LABEL["south,west"]}交叉火力位`, 4),
  plot("junctionNW", -10.25, 10.25, "junction", ["north", "west"], `${CORNER_LABEL["north,west"]}交叉火力位`, 5),
  // ------------------------------------------------------------ central hub
  plot("centerA", 3.85, 3.85, "center", [], "中央多路防禦位A", 1),
  plot("centerB", -3.85, -3.85, "center", [], "中央多路防禦位B", 1),

  // ---------------------------------------------------------- outer ring
  // These are deliberately beyond the unchanged wall rectangle. They become
  // forward outposts as the furnace expands and remain ordinary, targetable
  // ground facilities once unlocked.
  plot("outpostNorth", 0, 22, "front", ["north"], "北側外圍前哨", 8),
  plot("outpostNorthEast", 20, 20, "back", ["north", "east"], "東北外圍前哨", 9),
  plot("outpostEast", 24, 0, "front", ["east"], "東側外圍前哨", 8),
  plot("outpostSouthEast", 20, -20, "back", ["south", "east"], "東南外圍前哨", 10),
  plot("outpostSouth", 0, -22, "front", ["south"], "南側外圍前哨", 8),
  plot("outpostSouthWest", -20, -20, "back", ["south", "west"], "西南外圍前哨", 10),
  plot("outpostWest", -24, 0, "front", ["west"], "西側外圍前哨", 9),
  plot("outpostNorthWest", -20, 20, "back", ["north", "west"], "西北外圍前哨", 10),
  plot("outpostFarNorth", 11, 22, "front", ["north"], "北側遠端前哨", 9),

  // ---------------------------------------------------------- sky platforms
  ...[
    ["skyA", 0, 11, "天空平台 A"],
    ["skyB", 10, 3, "天空平台 B"],
    ["skyC", 6, -9, "天空平台 C"],
    ["skyD", -6, -9, "天空平台 D"],
    ["skyE", -10, 3, "天空平台 E"],
  ].map(([id, x, z, name], index): BuildSlotDefinition => ({
    id: String(id),
    category: "sky",
    unlockLevel: 15 + Number(index) * 5,
    surface: "sky",
    elevation: 8,
    x: Number(x),
    z: Number(z),
    yaw: facingCentre(Number(x), Number(z)),
    ringIndex: Number(index),
    role: "center",
    lanes: [],
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
    // Walls are checked against the rectangle geometry directly, never against
    // this generic radius formula — kept only so every slot has the field.
    footprintRadius: WALL_SEGMENT_DEPTH * 0.5,
    maxBuildingRadius: WALL_SEGMENT_DEPTH * 0.5,
  })),
];

export const SLOT_BY_ID = new Map(BUILD_SLOTS.map((s) => [s.id, s]));

export const WALL_SLOT_IDS: string[] = BUILD_SLOTS.filter((s) => s.category === "wall").map((s) => s.id);

/** Every non-wall slot — what the universal-overlap validator checks pairwise. */
export const UNIVERSAL_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter((s) => s.category === "universal");
export const GROUND_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter((s) => s.surface === "ground" && s.category === "universal");
export const SKY_SLOTS: ReadonlyArray<BuildSlotDefinition> = BUILD_SLOTS.filter((s) => s.surface === "sky");

export function unlockedGroundSlotCount(furnaceLevel: number): number {
  return GROUND_SLOTS.filter((slot) => Math.floor(furnaceLevel) >= slot.unlockLevel).length;
}

export function unlockedSkySlotCount(furnaceLevel: number): number {
  return SKY_SLOTS.filter((slot) => Math.floor(furnaceLevel) >= slot.unlockLevel).length;
}

export interface LaneDefinition {
  index: number;
  /** Angle in radians, measured the same way as `yawFromDirection`. */
  angle: number;
  /** Which wall side this approach ultimately leads to. */
  side: WallSide;
  /**
   * A place name, not "lane 1". The camera can be rotated by the framing code,
   * so a landmark is the only direction cue that stays true.
   */
  name: string;
  /** Short form for the compact lane strip. */
  shortName: string;
}

/**
 * Up to six approach lanes. A level or the endless scaler picks how many are
 * live; the rest simply never spawn anything. Every lane funnels into one of
 * the four wall sides — several lanes can share a side.
 */
export const LANES: LaneDefinition[] = [
  { index: 0, angle: 0, side: "north", name: "北方森林", shortName: "北森" },
  { index: 1, angle: Math.PI, side: "south", name: "南方冰原", shortName: "南原" },
  { index: 2, angle: Math.PI / 2, side: "east", name: "東側山口", shortName: "東山" },
  { index: 3, angle: -Math.PI / 2, side: "west", name: "西側廢墟", shortName: "西墟" },
  { index: 4, angle: Math.PI / 4, side: "east", name: "東北關隘", shortName: "東北" },
  { index: 5, angle: -(Math.PI * 3) / 4, side: "west", name: "西南斷崖", shortName: "西南" },
];

export function laneSpawnPoint(lane: LaneDefinition): { x: number; z: number } {
  return {
    x: Math.sin(lane.angle) * MAP.spawnRadius,
    z: Math.cos(lane.angle) * MAP.spawnRadius,
  };
}

/** Positions of the starting harvest nodes, grouped near the production district. */
// Shifted further into the NW/SW corners than the old irregular layout had
// them, so the new west-lane front/mid/back plots (and the NW/SW junctions)
// have a clear, validated corridor between the wall and the harvest ground.
export const HARVEST_NODES = {
  trees: [
    { x: -17, z: 11 },
    { x: -10, z: 14.5 },
    { x: -16, z: 3 },
    { x: -15, z: 9 },
  ],
  rocks: [
    { x: -17, z: -11 },
    { x: -10, z: -14.5 },
    { x: -16, z: -3 },
    { x: -15, z: -9 },
  ],
};
