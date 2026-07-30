import type { GameSystems } from "../game/GameSystems";
import { MINIMAP } from "../game/GameConfig";
import { WALL_SIDES, type WallSide } from "../data/BuildSlotDefinitions";
import { buildMenuCategoryOf, type BuildMenuCategory } from "../data/BuildMenuCategories";

export interface MinimapCluster {
  x: number;
  z: number;
  count: number;
}

export interface MinimapWallSide {
  side: WallSide;
  x: number;
  z: number;
  axis: "x" | "z";
  length: number;
  outward: { x: number; z: number };
  healthPct: number;
  /** No wall built yet at all, vs. built-but-damaged, vs. healthy. */
  state: "open" | "damaged" | "sealed";
  breached: boolean;
}

export interface MinimapStructure {
  x: number;
  z: number;
  category: BuildMenuCategory;
  name: string;
}

export interface MinimapSlot {
  id: string;
  x: number;
  z: number;
}

export interface MinimapSnapshot {
  hero: { x: number; z: number; alive: boolean };
  allyClusters: MinimapCluster[];
  enemyClusters: MinimapCluster[];
  boss: { x: number; z: number; healthPct: number } | null;
  furnaceHealthPct: number;
  structures: MinimapStructure[];
  emptySlots: MinimapSlot[];
  wallSides: MinimapWallSide[];
  camera: { x: number; z: number; radius: number };
  anyBreach: boolean;
}

function bucketKey(x: number, z: number, cell: number): string {
  return `${Math.round(x / cell)}_${Math.round(z / cell)}`;
}

/** Grid-buckets a flat list of alive combatants into count-labelled clusters. */
function clusterPositions(points: Array<{ x: number; z: number }>): MinimapCluster[] {
  const buckets = new Map<string, MinimapCluster>();
  for (const p of points) {
    const key = bucketKey(p.x, p.z, MINIMAP.clusterCellSize);
    const bucket = buckets.get(key);
    if (bucket) {
      // Running centroid, so a cluster's dot sits where its members actually are.
      bucket.x = (bucket.x * bucket.count + p.x) / (bucket.count + 1);
      bucket.z = (bucket.z * bucket.count + p.z) / (bucket.count + 1);
      bucket.count += 1;
    } else {
      buckets.set(key, { x: p.x, z: p.z, count: 1 });
    }
  }
  return [...buckets.values()];
}

/**
 * One low-frequency read of everything the minimap and full map draw. Pure
 * data — no meshes, no second scene, safe to call at 5-10Hz.
 */
export function gatherMinimapSnapshot(s: GameSystems): MinimapSnapshot {
  const bossUnit = s.boss.active ? s.boss.boss : null;

  const enemyPoints: Array<{ x: number; z: number }> = [];
  for (const u of s.world.enemies) {
    if (!u.alive || u === bossUnit) continue;
    enemyPoints.push({ x: u.position.x, z: u.position.z });
  }

  const allyClusters: MinimapCluster[] = [];
  for (const squad of s.squads.allySquads) {
    let count = 0;
    let sx = 0;
    let sz = 0;
    for (const m of squad.members) {
      if (!m.alive) continue;
      count++;
      sx += m.position.x;
      sz += m.position.z;
    }
    if (count > 0) allyClusters.push({ x: sx / count, z: sz / count, count });
  }

  const structures: MinimapStructure[] = [];
  const emptySlots: MinimapSlot[] = [];
  for (const slot of s.buildings.slots) {
    if (slot.category === "wall") continue;
    if (slot.occupied && slot.building) {
      structures.push({
        x: slot.x,
        z: slot.z,
        category: buildMenuCategoryOf(slot.building.type),
        name: slot.building.type,
      });
    } else {
      emptySlots.push({ id: slot.id, x: slot.x, z: slot.z });
    }
  }

  let anyBreach = false;
  const wallSides: MinimapWallSide[] = WALL_SIDES.map((w) => {
    const building = s.buildings.slot(w.slotId)?.building;
    const alive = building?.alive === true;
    const healthPct = alive ? building!.health / Math.max(1, building!.maxHealth) : 0;
    const state: MinimapWallSide["state"] = !alive ? "open" : healthPct <= MINIMAP.breachWarnFraction ? "damaged" : "sealed";
    const breached = !alive || healthPct <= MINIMAP.breachWarnFraction;
    if (breached) anyBreach = true;
    return {
      side: w.side,
      x: w.x,
      z: w.z,
      axis: w.axis,
      length: w.length,
      outward: w.outward,
      healthPct,
      state,
      breached,
    };
  });

  return {
    hero: { x: s.hero.position.x, z: s.hero.position.z, alive: s.hero.alive },
    allyClusters,
    enemyClusters: clusterPositions(enemyPoints),
    boss: bossUnit ? { x: bossUnit.position.x, z: bossUnit.position.z, healthPct: bossUnit.health / Math.max(1, bossUnit.maxHealth) } : null,
    furnaceHealthPct: s.furnace.healthPercent,
    structures,
    emptySlots,
    wallSides,
    camera: { x: s.camera.focusXZ.x, z: s.camera.focusXZ.z, radius: s.camera.visibleRadius },
    anyBreach,
  };
}
