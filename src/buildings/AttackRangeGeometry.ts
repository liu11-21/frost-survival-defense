import { nearestPointOnLane, type LaneDefinition } from "../data/BuildSlotDefinitions";
import type { CombatWorld } from "../combat/CombatWorld";

export interface LaneCoverageEntry {
  lane: LaneDefinition;
  /** Whether the range circle actually reaches this lane's road. */
  inRange: boolean;
  /** Only meaningful when `inRange` — a wall stands between the building and it. */
  losBlocked: boolean;
  /** The nearest point on this lane's road to the building — reused to place
   * the display's per-lane occlusion marker. */
  sampleX: number;
  sampleZ: number;
}

/**
 * Which of the currently-live lanes a building at `(x, z)` with attack range
 * `range` can actually reach.  The distance is measured against the exact
 * multi-segment path enemies navigate, not against the old radial bearing.
 * Build hover, built-structure information and the range display all call this
 * same function, so winding geometry cannot make the UI disagree with combat.
 */
export function computeLaneCoverage(
  x: number,
  z: number,
  range: number,
  liveLanes: readonly LaneDefinition[],
  requiresLineOfSight: boolean,
  world: CombatWorld,
): LaneCoverageEntry[] {
  return liveLanes.map((lane) => {
    const nearest = nearestPointOnLane(x, z, lane);
    const inRange = nearest.distance <= range;
    const losBlocked =
      inRange && requiresLineOfSight ? world.wallBlocks(x, z, nearest.x, nearest.z) !== null : false;
    return {
      lane,
      inRange,
      losBlocked,
      sampleX: nearest.x,
      sampleZ: nearest.z,
    };
  });
}

/** "可覆蓋：北方森林、東側山口，共2條" / the no-coverage warning.  LOS-blocked
 * lanes count as not covered because a bolt weapon cannot shoot through a wall. */
export function laneCoverageText(entries: LaneCoverageEntry[]): string {
  const covered = entries.filter((e) => e.inRange && !e.losBlocked);
  if (covered.length === 0) return "警告：此位置無法有效覆蓋主要進攻路線";
  return `可覆蓋：${covered.map((e) => e.lane.name).join("、")}，共${covered.length}條`;
}
