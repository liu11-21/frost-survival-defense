import { nearestPointOnLane, type LaneDefinition } from "../data/BuildSlotDefinitions";
import type { CombatWorld } from "../combat/CombatWorld";
import { laneName, t } from "../localization";

export interface LaneCoverageEntry {
  lane: LaneDefinition;
  inRange: boolean;
  losBlocked: boolean;
  sampleX: number;
  sampleZ: number;
}

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
    const losBlocked = inRange && requiresLineOfSight
      ? world.wallBlocks(x, z, nearest.x, nearest.z) !== null
      : false;
    return { lane, inRange, losBlocked, sampleX: nearest.x, sampleZ: nearest.z };
  });
}

export function laneCoverageText(entries: LaneCoverageEntry[]): string {
  const covered = entries.filter((e) => e.inRange && !e.losBlocked);
  if (covered.length === 0) return t("lane.coverage.none");
  return t("lane.coverage.some", {
    lanes: covered.map((e) => laneName(e.lane.index, e.lane.name)).join(" · "),
    count: covered.length,
  });
}
