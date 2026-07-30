import { Vector3 } from "@babylonjs/core";
import type { Faction } from "../data/CombatTypes";

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  /** Obstacles can be switched off (e.g. a felled tree becomes a low stump). */
  active: boolean;
  /**
   * Set for long straight blockers such as wall segments. A circle of radius
   * 1.9 cannot represent a seventeen-unit wall — it leaves walk-through gaps at
   * both ends, which is exactly how enemies used to slip past a sealed lane.
   */
  box?: BoxShape;
  /**
   * When set, this obstacle does not block that faction at all — the ally-only
   * gate gap in a perimeter wall is a real physical opening for allies and a
   * solid obstacle for everyone else, rather than a hole the pathing layer has
   * to remember not to use.
   */
  exemptFaction?: Faction;
}

export interface BoxShape {
  halfWidth: number;
  halfDepth: number;
  /** Rotation about Y. Local +X runs along the wall, local +Z through it. */
  yaw: number;
  sin: number;
  cos: number;
}

export function makeBox(halfWidth: number, halfDepth: number, yaw: number): BoxShape {
  return { halfWidth, halfDepth, yaw, sin: Math.sin(yaw), cos: Math.cos(yaw) };
}

/**
 * A small circle-and-box solver. The settlement is flat and sparse, so a
 * navigation mesh would be overkill — pushing agents out of overlapping shapes
 * handles both the player and the worker steering. Walls use oriented boxes so
 * a segment blocks along its whole length rather than only at its centre.
 */
export class CollisionWorld {
  private readonly obstacles: Obstacle[] = [];

  add(x: number, z: number, radius: number, box?: BoxShape): Obstacle {
    const obstacle: Obstacle = { x, z, radius, active: true, box };
    this.obstacles.push(obstacle);
    return obstacle;
  }

  remove(obstacle: Obstacle): void {
    const index = this.obstacles.indexOf(obstacle);
    if (index >= 0) this.obstacles.splice(index, 1);
  }

  /**
   * Resolves `position` (mutated in place) against every active obstacle.
   * `faction`, when given, skips any obstacle exempting that faction — the
   * ally-only gate gap in a perimeter wall being the only current use.
   */
  resolve(position: Vector3, agentRadius: number, maxRadius = Infinity, faction?: Faction): boolean {
    let touched = false;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.active) continue;
      if (faction && o.exemptFaction === faction) continue;
      if (o.box ? pushOutOfBox(position, o, o.box, agentRadius) : pushOutOfCircle(position, o, agentRadius)) {
        touched = true;
      }
    }

    const radial = Math.sqrt(position.x * position.x + position.z * position.z);
    if (radial > maxRadius) {
      const scale = maxRadius / radial;
      position.x *= scale;
      position.z *= scale;
      touched = true;
    }
    return touched;
  }

  /**
   * Steering avoidance: returns a sideways nudge that keeps an agent from
   * walking straight into an obstacle that sits between it and its goal.
   */
  avoidance(from: Vector3, dirX: number, dirZ: number, agentRadius: number, out: Vector3, faction?: Faction): Vector3 {
    out.set(0, 0, 0);
    const lookAhead = 3.2;
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      if (!o.active) continue;
      if (faction && o.exemptFaction === faction) continue;
      const dx = o.x - from.x;
      const dz = o.z - from.z;
      const along = dx * dirX + dz * dirZ;
      if (along <= 0 || along > lookAhead) continue;
      const side = dx * dirZ - dz * dirX;
      // A wall is wide: steering around it is hopeless, so do not even try.
      const clearance = (o.box ? o.box.halfDepth : o.radius) + agentRadius + 0.35;
      if (o.box || Math.abs(side) > clearance) continue;
      const strength = (1 - along / lookAhead) * (1 - Math.abs(side) / clearance);
      const sign = side >= 0 ? -1 : 1;
      out.x += dirZ * sign * strength * 1.8;
      out.z += -dirX * sign * strength * 1.8;
    }
    return out;
  }
}

function pushOutOfCircle(position: Vector3, o: Obstacle, agentRadius: number): boolean {
  const dx = position.x - o.x;
  const dz = position.z - o.z;
  const minDist = o.radius + agentRadius;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist || distSq < 1e-8) return false;
  const dist = Math.sqrt(distSq);
  const push = (minDist - dist) / dist;
  position.x += dx * push;
  position.z += dz * push;
  return true;
}

/**
 * Pushes an agent out along whichever local axis it is least deep into, which
 * for a thin wall is almost always straight back out the face it came in by.
 */
function pushOutOfBox(position: Vector3, o: Obstacle, box: BoxShape, agentRadius: number): boolean {
  const dx = position.x - o.x;
  const dz = position.z - o.z;
  const localX = dx * box.cos - dz * box.sin;
  const localZ = dx * box.sin + dz * box.cos;

  const limitX = box.halfWidth + agentRadius;
  const limitZ = box.halfDepth + agentRadius;
  const overlapX = limitX - Math.abs(localX);
  const overlapZ = limitZ - Math.abs(localZ);
  if (overlapX <= 0 || overlapZ <= 0) return false;

  let outX = 0;
  let outZ = 0;
  if (overlapZ <= overlapX) outZ = localZ >= 0 ? overlapZ : -overlapZ;
  else outX = localX >= 0 ? overlapX : -overlapX;

  position.x += outX * box.cos + outZ * box.sin;
  position.z += -outX * box.sin + outZ * box.cos;
  return true;
}

/**
 * True when the segment `(ax,az) → (bx,bz)` crosses this box. Used for the
 * line-of-sight and reachability tests, so "is my target behind a wall" is
 * answered by the same geometry that stops units walking through it.
 */
export function segmentHitsBox(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  box: BoxShape,
): boolean {
  const toLocal = (x: number, z: number): [number, number] => {
    const dx = x - cx;
    const dz = z - cz;
    return [dx * box.cos - dz * box.sin, dx * box.sin + dz * box.cos];
  };
  const [x0, z0] = toLocal(ax, az);
  const [x1, z1] = toLocal(bx, bz);

  // Slab test in the box's own frame.
  let tMin = 0;
  let tMax = 1;
  const axes: Array<[number, number, number]> = [
    [x0, x1 - x0, box.halfWidth],
    [z0, z1 - z0, box.halfDepth],
  ];
  for (const [start, delta, half] of axes) {
    if (Math.abs(delta) < 1e-6) {
      if (Math.abs(start) > half) return false;
      continue;
    }
    const t1 = (-half - start) / delta;
    const t2 = (half - start) / delta;
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    if (lo > tMin) tMin = lo;
    if (hi < tMax) tMax = hi;
    if (tMin > tMax) return false;
  }
  return true;
}
