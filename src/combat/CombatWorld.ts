import type { Faction } from "../data/CombatTypes";
import { segmentHitsBox, type BoxShape } from "../util/Collision";
import type { Damageable } from "./Damageable";
import type { CombatUnit } from "./CombatUnit";

const CELL = 4;
const HALF_EXTENT = 48;
const DIM = Math.ceil((HALF_EXTENT * 2) / CELL);

/**
 * The registry every combat query goes through. Units live in a uniform grid
 * that is rebuilt once per frame, so range queries never scan `scene.meshes`
 * or the whole roster.
 */
export class CombatWorld {
  readonly allies: CombatUnit[] = [];
  readonly enemies: CombatUnit[] = [];
  /** Attackable buildings only. */
  readonly structures: Damageable[] = [];
  /** Walls kept separately for the cheap line-of-sight and blocking tests. */
  readonly walls: Damageable[] = [];

  hero: Damageable | null = null;
  furnace: Damageable | null = null;

  private readonly allyCells: CombatUnit[][] = [];
  private readonly enemyCells: CombatUnit[][] = [];
  private readonly scratch: CombatUnit[] = [];

  constructor() {
    for (let i = 0; i < DIM * DIM; i++) {
      this.allyCells.push([]);
      this.enemyCells.push([]);
    }
  }

  private static cellIndex(x: number, z: number): number {
    const cx = Math.min(DIM - 1, Math.max(0, Math.floor((x + HALF_EXTENT) / CELL)));
    const cz = Math.min(DIM - 1, Math.max(0, Math.floor((z + HALF_EXTENT) / CELL)));
    return cz * DIM + cx;
  }

  /** Call once per frame before any query. */
  rebuildIndex(): void {
    for (let i = 0; i < this.allyCells.length; i++) {
      if (this.allyCells[i].length > 0) this.allyCells[i].length = 0;
      if (this.enemyCells[i].length > 0) this.enemyCells[i].length = 0;
    }
    for (let i = 0; i < this.allies.length; i++) {
      const u = this.allies[i];
      if (!u.alive) continue;
      this.allyCells[CombatWorld.cellIndex(u.position.x, u.position.z)].push(u);
    }
    for (let i = 0; i < this.enemies.length; i++) {
      const u = this.enemies[i];
      if (!u.alive) continue;
      this.enemyCells[CombatWorld.cellIndex(u.position.x, u.position.z)].push(u);
    }
  }

  private cellsFor(faction: Faction): CombatUnit[][] {
    return faction === "ally" ? this.allyCells : this.enemyCells;
  }

  /**
   * Every living unit of `faction` within `radius`. The result array is reused,
   * so callers must consume it before the next query.
   */
  queryUnits(faction: Faction, x: number, z: number, radius: number, out?: CombatUnit[]): CombatUnit[] {
    const result = out ?? this.scratch;
    result.length = 0;
    const cells = this.cellsFor(faction);
    const minX = Math.max(0, Math.floor((x - radius + HALF_EXTENT) / CELL));
    const maxX = Math.min(DIM - 1, Math.floor((x + radius + HALF_EXTENT) / CELL));
    const minZ = Math.max(0, Math.floor((z - radius + HALF_EXTENT) / CELL));
    const maxZ = Math.min(DIM - 1, Math.floor((z + radius + HALF_EXTENT) / CELL));
    const r2 = radius * radius;

    for (let cz = minZ; cz <= maxZ; cz++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const bucket = cells[cz * DIM + cx];
        for (let i = 0; i < bucket.length; i++) {
          const u = bucket[i];
          const dx = u.position.x - x;
          const dz = u.position.z - z;
          if (dx * dx + dz * dz <= r2) result.push(u);
        }
      }
    }
    return result;
  }

  nearestUnit(
    faction: Faction,
    x: number,
    z: number,
    maxRange: number,
    include: (unit: CombatUnit) => boolean = () => true,
  ): CombatUnit | null {
    const found = this.queryUnits(faction, x, z, maxRange);
    let best: CombatUnit | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < found.length; i++) {
      const u = found[i];
      if (!include(u)) continue;
      const dx = u.position.x - x;
      const dz = u.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  /** Highest tier first, nearest as the tie-break — the hero's standard rule. */
  highestLevelUnit(faction: Faction, x: number, z: number, maxRange: number): CombatUnit | null {
    const found = this.queryUnits(faction, x, z, maxRange);
    let best: CombatUnit | null = null;
    let bestLevel = -1;
    let bestDist = Infinity;
    for (let i = 0; i < found.length; i++) {
      const u = found[i];
      const dx = u.position.x - x;
      const dz = u.position.z - z;
      const d = dx * dx + dz * dz;
      if (u.level > bestLevel || (u.level === bestLevel && d < bestDist)) {
        bestLevel = u.level;
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  /** Most dangerous living unit in range, used by enemy ranged attackers. */
  highestThreatUnit(
    faction: Faction,
    x: number,
    z: number,
    maxRange: number,
    include: (unit: CombatUnit) => boolean = () => true,
  ): CombatUnit | null {
    const found = this.queryUnits(faction, x, z, maxRange);
    let best: CombatUnit | null = null;
    let bestThreat = -1;
    for (let i = 0; i < found.length; i++) {
      const u = found[i];
      if (!include(u)) continue;
      if (u.threat > bestThreat) {
        bestThreat = u.threat;
        best = u;
      }
    }
    return best;
  }

  /**
   * The taunting unit that currently owns `(x, z)`, if any. `isBuilding` gates
   * the tiers whose taunt is not allowed to drag structures. Enemy callers can
   * provide `laneIndex` so a shield/Ground Support source on another road never
   * bypasses the lane-first target contract.
   */
  tauntSourceFor(
    faction: Faction,
    x: number,
    z: number,
    isBuilding: boolean,
    laneIndex?: number,
  ): CombatUnit | null {
    const hostile = faction === "ally" ? this.enemies : this.allies;
    let best: CombatUnit | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < hostile.length; i++) {
      const u = hostile[i];
      if (!u.alive || u.tauntRadius <= 0) continue;
      if (laneIndex !== undefined && u.laneIndex !== laneIndex) continue;
      if (isBuilding && !u.tauntAffectsBuildings) continue;
      const dx = u.position.x - x;
      const dz = u.position.z - z;
      const d = dx * dx + dz * dz;
      if (d <= u.tauntRadius * u.tauntRadius && d < bestDist) {
        bestDist = d;
        best = u;
      }
    }
    return best;
  }

  /** Nearest living attackable structure of the given kinds. */
  nearestStructure(x: number, z: number, maxRange: number, kinds: ReadonlyArray<string>): Damageable | null {
    let best: Damageable | null = null;
    let bestDist = maxRange * maxRange;
    for (let i = 0; i < this.structures.length; i++) {
      const s = this.structures[i];
      if (!s.alive || (s as { isSky?: boolean }).isSky || !kinds.includes(s.kind)) continue;
      const dx = s.position.x - x;
      const dz = s.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * The standing wall between two points, if any.
   *
   * This used to sample the segment against a circle of the wall's `hitRadius`,
   * which for a long wall segment covered barely a tenth of its span — a target
   * behind the middle of a wall read as perfectly reachable. It now tests the
   * segment against each wall's real oriented box, the same geometry that stops
   * units walking through it, so "can I reach that" and "can I walk there"
   * always agree.
   */
  wallBlocks(fromX: number, fromZ: number, toX: number, toZ: number): Damageable | null {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    if (dx * dx + dz * dz < 1e-6) return null;
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      if (!w.alive) continue;
      const box = (w as { blockerBox?: BoxShape | null }).blockerBox;
      if (box) {
        if (segmentHitsBox(fromX, fromZ, toX, toZ, w.position.x, w.position.z, box)) return w;
        continue;
      }
      if (segmentHitsCircle(fromX, fromZ, dx, dz, w.position.x, w.position.z, w.hitRadius + 0.4)) return w;
    }
    return null;
  }

  /**
   * Whether an attacker at `(x, z)` could actually get to `target`, or whether
   * a wall stands in the way. Everything that picks an enemy target asks this
   * before committing — including taunts, which is the whole point: a shield
   * trooper standing safely inside a sealed lane can raise attention, but it
   * can no longer drag anything through solid stone.
   */
  reachable(x: number, z: number, target: Damageable): boolean {
    if (target.kind === "wall") return true;
    return this.wallBlocks(x, z, target.position.x, target.position.z) === null;
  }

  removeDead(): void {
    prune(this.allies);
    prune(this.enemies);
  }

  get livingEnemyCount(): number {
    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) if (this.enemies[i].alive) n++;
    return n;
  }

  clear(): void {
    this.allies.length = 0;
    this.enemies.length = 0;
    this.structures.length = 0;
    this.walls.length = 0;
    this.hero = null;
    this.furnace = null;
  }
}

function segmentHitsCircle(
  ax: number,
  az: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
): boolean {
  const lenSq = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / lenSq));
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz <= radius * radius;
}

function prune(list: CombatUnit[]): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const u = list[read];
    if (u.alive || !u.readyToRemove) list[write++] = u;
    else u.dispose();
  }
  list.length = write;
}
