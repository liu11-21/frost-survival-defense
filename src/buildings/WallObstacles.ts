import { MAP, type WallSideDef } from "../data/BuildSlotDefinitions";
import { makeBox, type CollisionWorld, type Obstacle } from "../util/Collision";

/**
 * Registers the three physical obstacles one perimeter side needs: two solid
 * half-segments flanking the gate, plus one obstacle exactly in the gap that
 * exempts allies only. Physically there really is a hole there — the gate is
 * not a fiction the pathing layer has to remember not to use, it is a wall
 * that stops one faction and not the other.
 */
export function registerWallObstacles(collision: CollisionWorld, wallSide: WallSideDef): Obstacle[] {
  const registered: Obstacle[] = [];
  const gate = MAP.gateWidth;
  const halfSeg = Math.max(1, (wallSide.length - gate) * 0.5);
  const segCentre = gate * 0.5 + halfSeg * 0.5;
  const alongX = Math.cos(wallSide.yaw);
  const alongZ = -Math.sin(wallSide.yaw);
  const depth = MAP.wallThickness;

  for (const dir of [-1, 1] as const) {
    registered.push(
      collision.add(
        wallSide.x + dir * segCentre * alongX,
        wallSide.z + dir * segCentre * alongZ,
        0,
        makeBox(halfSeg * 0.5, depth * 0.5, wallSide.yaw),
      ),
    );
  }

  const gateObstacle = collision.add(wallSide.x, wallSide.z, 0, makeBox(gate * 0.5, depth * 0.5, wallSide.yaw));
  gateObstacle.exemptFaction = "ally";
  registered.push(gateObstacle);

  return registered;
}
