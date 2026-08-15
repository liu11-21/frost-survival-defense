import { LANES } from "../data/BuildSlotDefinitions";
import { ENEMY_BY_ID } from "../data/EnemyDefinitions";
import type { WaveDefinition } from "../data/WaveDefinitions";
import { laneName, laneShortName, t } from "../localization";

const ELITE_LEVEL = 4;

export interface LaneWarning {
  laneIndex: number;
  name: string;
  shortName: string;
  angle: number;
  count: number;
  eliteCount: number;
  boss: boolean;
}

export function previewWave(wave: WaveDefinition, laneCount: number): LaneWarning[] {
  const byLane = new Map<number, LaneWarning>();
  for (const group of wave.groups) {
    const laneIndex = group.lane % Math.max(1, laneCount);
    const lane = LANES[laneIndex] ?? LANES[0];
    let entry = byLane.get(laneIndex);
    if (!entry) {
      entry = {
        laneIndex,
        name: laneName(laneIndex, lane.name),
        shortName: laneShortName(laneIndex, lane.shortName),
        angle: lane.angle,
        count: 0,
        eliteCount: 0,
        boss: false,
      };
      byLane.set(laneIndex, entry);
    }
    const def = ENEMY_BY_ID.get(group.enemyId);
    if (!def) continue;
    const individuals = group.squads * def.squadSize;
    entry.count += individuals;
    if (def.id === "boss") entry.boss = true;
    else if ((def.level ?? 0) >= ELITE_LEVEL) entry.eliteCount += individuals;
  }
  return [...byLane.values()].sort((a, b) => b.count - a.count);
}

export function previewText(lanes: ReadonlyArray<LaneWarning>): string {
  if (lanes.length === 0) return t("wave.preview.none");
  return lanes.map((lane) => {
    const extras: string[] = [];
    if (lane.boss) extras.push("Boss");
    if (lane.eliteCount > 0) extras.push(t("wave.preview.elite", { count: lane.eliteCount }));
    const extra = extras.length > 0
      ? t("wave.preview.contains", { items: extras.join(t("wave.preview.and")) })
      : "";
    return t("wave.preview.line", { lane: laneName(lane.laneIndex, lane.name), count: lane.count, extra });
  }).join("\n");
}
