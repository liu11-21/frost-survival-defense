import { MAP, type LaneDefinition } from "../data/BuildSlotDefinitions";
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
 * Point-to-segment distance against one lane's *entire* path — from near the
 * furnace, out through the wall, to the spawn point — not just the exterior
 * approach. An enemy that has already breached still walks the interior
 * stretch toward the furnace, and a tower plainly covers its own lane there
 * too; restricting the segment to wall-to-spawn (an earlier version of this
 * function did) undersold every tower's real coverage and made "central,
 * covers 3+ lanes" positions geometrically impossible to place at all, since
 * no interior point is within any building's range of a *gate* on a base
 * this size — but every lane's near-furnace end is close to everything near
 * the furnace, which is exactly why a central hub is valuable.
 */
function nearestRoadPoint(x: number, z: number, lane: LaneDefinition): { x: number; z: number; dist: number } {
  const dirX = Math.sin(lane.angle);
  const dirZ = Math.cos(lane.angle);
  const far = MAP.spawnRadius;
  const t = Math.max(0, Math.min(far, x * dirX + z * dirZ));
  const px = dirX * t;
  const pz = dirZ * t;
  return { x: px, z: pz, dist: Math.hypot(x - px, z - pz) };
}

/**
 * Which of the currently-live lanes a building at `(x, z)` with attack range
 * `range` can actually reach — and, for line-of-sight weapons, whether a wall
 * still standing blocks that lane specifically. Shared verbatim by the build-
 * time preview and the real range display so neither can silently diverge
 * from the other, and reuses `CombatWorld.wallBlocks` — the exact same call
 * `BuildingCombat.ts`'s `hasLineOfSight` makes for real shots.
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
    const nearest = nearestRoadPoint(x, z, lane);
    const inRange = nearest.dist <= range;
    const losBlocked =
      inRange && requiresLineOfSight ? world.wallBlocks(x, z, nearest.x, nearest.z) !== null : false;
    return { lane, inRange, losBlocked, sampleX: nearest.x, sampleZ: nearest.z };
  });
}

/** "可覆蓋：北方森林、東側山口，共2條" / the no-coverage warning, matching the
 * exact wording the brief specifies. LOS-blocked lanes count as NOT covered —
 * a crossbow tower that cannot currently see a lane cannot fire down it. */
export function laneCoverageText(entries: LaneCoverageEntry[]): string {
  const covered = entries.filter((e) => e.inRange && !e.losBlocked);
  if (covered.length === 0) return "警告：此位置無法有效覆蓋主要進攻路線";
  return `可覆蓋：${covered.map((e) => e.lane.name).join("、")}，共${covered.length}條`;
}
