import { isInsideBase, nearestSide } from "../data/BuildSlotDefinitions";

/**
 * When an ally and its destination are on opposite sides of the perimeter,
 * returns the gate it should walk to first. Returns `null` when a direct line
 * is safe to take as-is — both points inside, or both already outside — which
 * is also what naturally ends the gate-transit phase once a unit has actually
 * walked through: at that point `fromInside` flips to match `toInside`.
 *
 * The interior is one open convex rectangle, so once past the correct gate
 * the rest of the walk to any interior point needs no further routing; the
 * same is true outside. Only the single crossing needs to be found.
 */
export function gateWaypoint(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
): { x: number; z: number } | null {
  const fromInside = isInsideBase(fromX, fromZ);
  const toInside = isInsideBase(toX, toZ);
  if (fromInside === toInside) return null;

  // Whichever endpoint is outside the base determines which side's gate is
  // the correct crossing.
  const outsideX = fromInside ? toX : fromX;
  const outsideZ = fromInside ? toZ : fromZ;
  const side = nearestSide(outsideX, outsideZ);
  return { x: side.x, z: side.z };
}
