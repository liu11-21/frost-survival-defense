import { Vector3 } from "@babylonjs/core";
import { FORMATION, STANDOFF } from "./AIConfig";

const GOLDEN = 2.39996;

export type FormationRole = "front" | "ranged" | "support";

/**
 * Hands out non-overlapping standing positions.
 *
 * Two separate jobs: where a squad waits when idle (a ring around the rally
 * point), and where an individual stands to attack a specific enemy (a slot on
 * a ring around that enemy). Both are deterministic per unit so nobody chases a
 * position that keeps moving under them.
 */
export class FormationSlotManager {
  private readonly scratch = new Vector3();
  /** enemy damageId -> bitmask of occupied attack slots this frame. */
  private readonly claimed = new Map<number, number>();

  /** Cleared once per frame before combat updates run. */
  beginFrame(): void {
    this.claimed.clear();
  }

  /** Idle rally position for squad `index` around `(cx, cz)`. */
  rallySlot(index: number, cx: number, cz: number, out: Vector3): Vector3 {
    const ring = Math.floor(index / FORMATION.squadsPerRing);
    const radius = FORMATION.baseRadius + ring * FORMATION.ringSpacing;
    const angle = index * GOLDEN;
    out.set(cx + Math.sin(angle) * radius, 0, cz + Math.cos(angle) * radius);
    return out;
  }

  /** Position for member `i` of a squad of `size` centred on the rally slot. */
  memberSlot(i: number, size: number, cx: number, cz: number, out: Vector3): Vector3 {
    if (size <= 1) {
      out.set(cx, 0, cz);
      return out;
    }
    const angle = (i / size) * Math.PI * 2;
    out.set(
      cx + Math.sin(angle) * FORMATION.memberSpread,
      0,
      cz + Math.cos(angle) * FORMATION.memberSpread,
    );
    return out;
  }

  /**
   * A free standing position around `target` for a melee attacker. Claims the
   * slot for this frame so a second unit picks a different one — this is what
   * stops three warriors from grinding against each other on one spot.
   */
  claimAttackSlot(
    targetId: number,
    targetX: number,
    targetZ: number,
    radius: number,
    fromX: number,
    fromZ: number,
    out: Vector3,
  ): Vector3 {
    const mask = this.claimed.get(targetId) ?? 0;
    // Start from the slot nearest our current approach so units do not cross over.
    const preferred = Math.round(
      ((Math.atan2(fromX - targetX, fromZ - targetZ) + Math.PI * 2) / (Math.PI * 2)) *
        FORMATION.attackSlots,
    );

    for (let step = 0; step < FORMATION.attackSlots; step++) {
      const slot = (preferred + step) % FORMATION.attackSlots;
      const bit = 1 << slot;
      if ((mask & bit) !== 0) continue;
      this.claimed.set(targetId, mask | bit);
      const angle = (slot / FORMATION.attackSlots) * Math.PI * 2;
      out.set(targetX + Math.sin(angle) * radius, 0, targetZ + Math.cos(angle) * radius);
      return out;
    }

    // Every slot taken: hold at our current bearing rather than piling in.
    const angle = Math.atan2(fromX - targetX, fromZ - targetZ);
    out.set(targetX + Math.sin(angle) * radius, 0, targetZ + Math.cos(angle) * radius);
    return out;
  }

  /**
   * Keeps a ranged unit inside its comfortable band. Returns null when the
   * current position is already fine, so it does not jitter.
   */
  standoffAdjust(
    unitId: string,
    fromX: number,
    fromZ: number,
    targetX: number,
    targetZ: number,
    out: Vector3,
  ): Vector3 | null {
    const band = STANDOFF[unitId];
    if (!band) return null;
    const dx = fromX - targetX;
    const dz = fromZ - targetZ;
    const dist = Math.hypot(dx, dz);
    if (dist >= band.min && dist <= band.max) return null;

    const inv = 1 / Math.max(0.001, dist);
    const wanted = dist < band.min ? band.ideal : band.max - 0.5;
    out.set(targetX + dx * inv * wanted, 0, targetZ + dz * inv * wanted);
    return out;
  }

  /**
   * Soft separation that fades out near the goal, so crowding spreads units
   * apart without ever preventing them from reaching what they are attacking.
   */
  separation(
    x: number,
    z: number,
    neighbours: ReadonlyArray<{ position: Vector3; alive: boolean }>,
    self: unknown,
    distanceToGoal: number,
    out: Vector3,
  ): Vector3 {
    out.set(0, 0, 0);
    const fade = Math.min(1, Math.max(0, distanceToGoal / FORMATION.separationCutoff));
    if (fade <= 0.01) return out;

    for (let i = 0; i < neighbours.length; i++) {
      const other = neighbours[i];
      if (other === self || !other.alive) continue;
      const dx = x - other.position.x;
      const dz = z - other.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.001 || d > FORMATION.separationRadius) continue;
      const push = ((FORMATION.separationRadius - d) / FORMATION.separationRadius) * fade;
      out.x += (dx / d) * push * FORMATION.separationForce;
      out.z += (dz / d) * push * FORMATION.separationForce;
    }
    void this.scratch;
    return out;
  }
}
