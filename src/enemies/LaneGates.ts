import type { BuildingManager } from "../buildings/BuildingManager";
import type { Building } from "../buildings/Building";
import type { Damageable } from "../combat/Damageable";
import { LANES, WALL_SIDES, nearestSide, type LaneDefinition, type WallSide } from "../data/BuildSlotDefinitions";

export type GateState = "open" | "partial" | "sealed";

/** Kept for every existing consumer (HUD, debug hooks) — now derived from the
 * one wall side a lane leads to, rather than owning independent state. */
export interface LaneGate {
  laneId: string;
  laneIndex: number;
  name: string;
  shortName: string;
  angle: number;
  side: WallSide;
  wallSlotIds: string[];
  state: GateState;
  blockers: Building[];
  breachTarget: Damageable | null;
}

/**
 * The perimeter is four fixed sides now, not sixteen (nor even eight)
 * independent slots — a lane no longer owns its own gate, it simply leads to
 * whichever of the four sides its bearing is nearest. "Lanes" survive purely
 * as spawn-direction flavour; every reachability and siege question is
 * answered from the four sides directly.
 */
export class LaneGateManager {
  private readonly gates: LaneGate[] = [];
  private liveLanes = 2;

  constructor(private readonly buildings: BuildingManager) {
    for (const lane of LANES) this.gates.push(makeGate(lane));
    this.refresh();
  }

  get all(): ReadonlyArray<LaneGate> {
    return this.gates;
  }

  /** Only the lanes the current level actually spawns on. */
  get live(): LaneGate[] {
    return this.gates.filter((g) => g.laneIndex < this.liveLanes);
  }

  setLiveLaneCount(count: number): void {
    this.liveLanes = Math.max(1, Math.min(LANES.length, count));
  }

  gate(laneIndex: number): LaneGate {
    return this.gates[laneIndex % this.gates.length];
  }

  /** The lane whose bearing is closest to this position. */
  nearestGate(x: number, z: number): LaneGate {
    const side = nearestSide(x, z);
    return this.gates.find((g) => g.side === side.side) ?? this.gates[0];
  }

  /** True when every side is standing, so there is no way in anywhere. */
  get fullySealed(): boolean {
    return WALL_SIDES.every((w) => this.buildingFor(w.side)?.isComplete === true);
  }

  private buildingFor(side: WallSide): Building | undefined {
    const def = WALL_SIDES.find((w) => w.side === side);
    if (!def) return undefined;
    const b = this.buildings.slot(def.slotId)?.building;
    return b?.alive ? b : undefined;
  }

  /** Recomputes each lane's state from what is standing right now. */
  refresh(): void {
    for (const gate of this.gates) {
      const building = this.buildingFor(gate.side);
      gate.blockers.length = 0;
      if (building) gate.blockers.push(building);
      gate.state = building ? (building.isComplete ? "sealed" : "partial") : "open";
      gate.breachTarget = building ?? null;
      // The gate is an authored visual concern; collision/pathing remains the
      // existing deterministic wall logic above.
      building?.setGateOpen(gate.state !== "sealed");
    }
  }

  /**
   * The wall a unit must destroy before it can advance. A side is either
   * standing or it is not — there is no "nearest sealed lane" search to fall
   * back through any more, because every lane on this side already means the
   * same wall.
   */
  breachTargetFor(x: number, z: number, laneIndex: number): Damageable | null {
    const lane = this.gates[laneIndex % this.gates.length];
    const own = this.buildingFor(lane.side);
    if (own) return own;
    const nearest = nearestSide(x, z);
    return this.buildingFor(nearest.side) ?? null;
  }

  /**
   * Where a unit should walk to get inside, or null when nothing is open.
   * With only four sides, "open" simply means the nearest side has no wall
   * standing on it — there is no ring to orbit looking for a distant gap.
   */
  openApproach(x: number, z: number): { angle: number; innerX: number; innerZ: number } | null {
    let best: (typeof WALL_SIDES)[number] | null = null;
    let bestDist = Infinity;
    for (const side of WALL_SIDES) {
      if (this.buildingFor(side.side)) continue;
      const dist = Math.hypot(side.x - x, side.z - z);
      if (dist < bestDist) {
        bestDist = dist;
        best = side;
      }
    }
    if (!best) return null;
    const inward = { x: -Math.sign(best.outward.x) * 2.6, z: -Math.sign(best.outward.z) * 2.6 };
    return {
      angle: Math.atan2(best.outward.x, best.outward.z),
      innerX: best.x + inward.x,
      innerZ: best.z + inward.z,
    };
  }
}

function makeGate(lane: LaneDefinition): LaneGate {
  const side = WALL_SIDES.find((w) => w.side === lane.side)!;
  return {
    laneId: `lane${lane.index}`,
    laneIndex: lane.index,
    name: lane.name,
    shortName: lane.shortName,
    angle: lane.angle,
    side: lane.side,
    wallSlotIds: [side.slotId],
    state: "open",
    blockers: [],
    breachTarget: null,
  };
}
