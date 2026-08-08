import { LANES, nearestPointOnLane, type LanePoint } from "./BuildSlotDefinitions";

/**
 * Chooses a waypoint far enough beyond the unit's current projection that the
 * motor's normal stopping distance cannot leave it parked forever at a bend.
 *
 * `nearestPointOnLane()` deliberately returns the first equally-near segment.
 * Near a shared vertex that can be the segment we just traversed. Advancing
 * only `segmentIndex + 1` therefore points back at the same vertex. The t-gates
 * below explicitly cross that boundary once the unit is in the last/first 28%
 * of a segment.
 */
export function nextLaneWaypoint(
  laneIndex: number,
  x: number,
  z: number,
  direction: "inbound" | "outbound",
): LanePoint {
  const lane = LANES[((laneIndex % LANES.length) + LANES.length) % LANES.length];
  const nearest = nearestPointOnLane(x, z, lane);

  if (direction === "inbound") {
    const index = nearest.segmentIndex + (nearest.t >= 0.72 ? 2 : 1);
    return lane.path[Math.min(lane.path.length - 1, index)];
  }

  const index = nearest.segmentIndex - (nearest.t <= 0.28 ? 1 : 0);
  return lane.path[Math.max(0, index)];
}
