import type { BuildingManager } from "../buildings/BuildingManager";
import type { Building } from "../buildings/Building";
import type { Damageable } from "../combat/Damageable";
import { LANES, WALL_SIDES, nearestSide, type LaneDefinition, type WallSide } from "../data/BuildSlotDefinitions";

export type GateState = "open" | "partial" | "sealed";

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
 * One logical gate per approach lane.  The wall perimeter is still four fixed
 * sides, but unlike the previous "nearest open side" implementation a lane can
 * no longer migrate to a neighbour just because that neighbour has a breach.
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

  get live(): LaneGate[] {
    return this.gates.filter((g) => g.laneIndex < this.liveLanes);
  }

  setLiveLaneCount(count: number): void {
    this.liveLanes = Math.max(1, Math.min(LANES.length, count));
  }

  gate(laneIndex: number): LaneGate {
    return this.gates[((laneIndex % this.gates.length) + this.gates.length) % this.gates.length];
  }

  nearestGate(x: number, z: number): LaneGate {
    const side = nearestSide(x, z);
    return this.gates.find((g) => g.side === side.side) ?? this.gates[0];
  }

  get fullySealed(): boolean {
    return WALL_SIDES.every((w) => this.buildingFor(w.side)?.isComplete === true);
  }

  private buildingFor(side: WallSide): Building | undefined {
    const def = WALL_SIDES.find((w) => w.side === side);
    if (!def) return undefined;
    const b = this.buildings.slot(def.slotId)?.building;
    return b?.alive ? b : undefined;
  }

  refresh(): void {
    for (const gate of this.gates) {
      const building = this.buildingFor(gate.side);
      gate.blockers.length = 0;
      if (building) gate.blockers.push(building);
      gate.state = building ? (building.isComplete ? "sealed" : "partial") : "open";
      gate.breachTarget = building ?? null;
      building?.setGateOpen(gate.state !== "sealed");
    }
  }

  /**
   * The only wall this lane is allowed to breach.  The former fallback to
   * `nearestSide(x,z)` is intentionally gone: it was the pathing equivalent of
   * A-lane enemies deciding to become B-lane enemies when B happened to open.
   */
  breachTargetFor(_x: number, _z: number, laneIndex: number): Damageable | null {
    const lane = this.gate(laneIndex);
    return this.buildingFor(lane.side) ?? null;
  }

  /** Legacy helper retained for callers outside enemy navigation.  It returns
   * the nearest open side but EnemyNavigator no longer uses it. */
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
