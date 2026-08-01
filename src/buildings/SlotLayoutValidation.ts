import { BUILD_SLOTS, HARVEST_NODES, MAP, UNIVERSAL_SLOTS, isInsideBase, type BuildSlotDefinition } from "../data/BuildSlotDefinitions";

/**
 * Every empty slot must already be legal the moment the map loads — the brief
 * is explicit that a rejected build click is not an acceptable substitute for
 * a correct layout. This checks the same worst case `BuildingManager.canBuild`
 * can never rule out: any two `"universal"` slots could each end up hosting
 * the single largest building there is.
 */
const SAFETY_MARGIN = 1.5;
/** How far back from a gate's centreline a plot must stay, so a building never
 * sits in the lane allies and enemies actually use to reach that gate. */
const GATE_LANE_HALF = MAP.gateWidth / 2 + 1.6;
/** Only checked this close to a wall — a plot far from every gate needs no lateral clearance. */
const GATE_LANE_DEPTH = 8;
const NODE_RADIUS_ESTIMATE = 1.0;

export interface SlotPairIssue {
  a: string;
  b: string;
  distance: number;
  required: number;
}
export interface SlotIssue {
  id: string;
  kind: "wall" | "furnace" | "gateLane" | "node";
  detail: string;
}

export interface SlotLayoutReport {
  overlaps: SlotPairIssue[];
  placementIssues: SlotIssue[];
  ok: boolean;
}

function wallClearance(x: number, z: number): number {
  return Math.min(MAP.baseHalfWidth - Math.abs(x), MAP.baseHalfDepth - Math.abs(z));
}

/** Validates the whole fixed layout. Cheap and pure — safe to call at boot and from tests. */
export function validateBuildSlots(): SlotLayoutReport {
  const overlaps: SlotPairIssue[] = [];
  const placementIssues: SlotIssue[] = [];
  const slots: ReadonlyArray<BuildSlotDefinition> = UNIVERSAL_SLOTS;

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      const required = a.maxBuildingRadius + b.maxBuildingRadius + SAFETY_MARGIN;
      if (distance < required) overlaps.push({ a: a.id, b: b.id, distance, required });
    }
  }

  for (const slot of slots) {
    const clearance = wallClearance(slot.x, slot.z);
    // Inner plots must clear the unchanged wall rectangle and its gates. The
    // late-game outposts deliberately sit beyond that rectangle, so those
    // checks would incorrectly reject the expansion the furnace is meant to
    // unlock.
    if (isInsideBase(slot.x, slot.z)) {
      const wallRequired = MAP.wallThickness / 2 + slot.maxBuildingRadius + SAFETY_MARGIN;
      if (clearance < wallRequired) {
        placementIssues.push({ id: slot.id, kind: "wall", detail: `clearance ${clearance.toFixed(2)} < ${wallRequired.toFixed(2)}` });
      }
      if (clearance < GATE_LANE_DEPTH) {
        const nearestNS = MAP.baseHalfDepth - Math.abs(slot.z) <= MAP.baseHalfWidth - Math.abs(slot.x);
        const lateral = nearestNS ? Math.abs(slot.x) : Math.abs(slot.z);
        if (lateral < GATE_LANE_HALF) {
          placementIssues.push({ id: slot.id, kind: "gateLane", detail: `lateral ${lateral.toFixed(2)} < ${GATE_LANE_HALF.toFixed(2)}` });
        }
      }
    }
    const furnaceRequired = MAP.furnaceRadius + slot.maxBuildingRadius + SAFETY_MARGIN;
    const fromFurnace = Math.hypot(slot.x, slot.z);
    if (fromFurnace < furnaceRequired) {
      placementIssues.push({ id: slot.id, kind: "furnace", detail: `distance ${fromFurnace.toFixed(2)} < ${furnaceRequired.toFixed(2)}` });
    }
    const nodeRequired = slot.maxBuildingRadius + NODE_RADIUS_ESTIMATE + SAFETY_MARGIN;
    for (const node of [...HARVEST_NODES.trees, ...HARVEST_NODES.rocks]) {
      const d = Math.hypot(slot.x - node.x, slot.z - node.z);
      if (d < nodeRequired) placementIssues.push({ id: slot.id, kind: "node", detail: `distance ${d.toFixed(2)} < ${nodeRequired.toFixed(2)}` });
    }
  }

  return { overlaps, placementIssues, ok: overlaps.length === 0 && placementIssues.length === 0 };
}

/** For the F6 dev overlay: every universal slot's own footprint circle, and whether it currently clears every neighbour. */
export function slotOverlapRadii(): ReadonlyArray<{ id: string; x: number; z: number; radius: number }> {
  return BUILD_SLOTS.filter((s) => s.category === "universal").map((s) => ({ id: s.id, x: s.x, z: s.z, radius: s.maxBuildingRadius }));
}
