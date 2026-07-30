import { LANES } from "../data/BuildSlotDefinitions";
import { ENEMY_BY_ID } from "../data/EnemyDefinitions";
import type { WaveDefinition } from "../data/WaveDefinitions";

/** Enemies of this tier and above are called out separately in the warning. */
const ELITE_LEVEL = 4;

export interface LaneWarning {
  laneIndex: number;
  /** The place name, e.g. 北方森林 — never "lane 1". */
  name: string;
  shortName: string;
  angle: number;
  /** Individuals, not squads: the number the player will actually see. */
  count: number;
  eliteCount: number;
  boss: boolean;
}

/**
 * Turns a wave definition into the per-lane warning the player gets before it
 * arrives. "There are three lanes" was never actionable; "北方森林 8 名，東側山口
 * 5 名含 1 名高階單位" is.
 */
export function previewWave(wave: WaveDefinition, laneCount: number): LaneWarning[] {
  const byLane = new Map<number, LaneWarning>();

  for (const group of wave.groups) {
    const laneIndex = group.lane % Math.max(1, laneCount);
    const lane = LANES[laneIndex] ?? LANES[0];
    let entry = byLane.get(laneIndex);
    if (!entry) {
      entry = {
        laneIndex,
        name: lane.name,
        shortName: lane.shortName,
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

/** The multi-line text the pre-wave banner shows. */
export function previewText(lanes: ReadonlyArray<LaneWarning>): string {
  if (lanes.length === 0) return "沒有偵測到來襲路線";
  return lanes
    .map((lane) => {
      const extras: string[] = [];
      if (lane.boss) extras.push("Boss");
      if (lane.eliteCount > 0) extras.push(`${lane.eliteCount} 名高階單位`);
      const tail = extras.length > 0 ? `，包含 ${extras.join(" 與 ")}` : "";
      return `${lane.name}：${lane.count} 名敵人${tail}`;
    })
    .join("\n");
}
