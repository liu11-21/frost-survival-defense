import type { Damageable } from "../combat/Damageable";
import type { CombatUnit } from "../combat/CombatUnit";

/** Why a target was rejected. Surfaced by the AI debug panel, never in-game. */
export type InvalidReason =
  | "ok"
  | "null"
  | "dead"
  | "disposed"
  | "recycled"
  | "sameFaction"
  | "noHealth"
  | "outOfWorld"
  | "beyondLeash";

/** Beyond this radius nothing is a legal target — it has left the playfield. */
const WORLD_LIMIT = 60;

/**
 * The single validity rule every attacker shares — hero, allies, enemies and
 * towers. Before this existed each caller checked a different subset, which is
 * how units ended up holding references to pooled-and-reused corpses.
 */
export function validateTarget(
  seeker: { faction: string; position: { x: number; z: number } },
  target: Damageable | null,
  maxRange = Infinity,
): InvalidReason {
  if (!target) return "null";
  if (!target.alive) return "dead";
  if (target.health <= 0) return "noHealth";
  if (target.faction === seeker.faction) {
    // The one carve-out: an engineer-like repair unit is allowed to hold a
    // same-faction *structure* as its target so it can walk to and fix it.
    // Every other seeker — including engineers picking a fight in self
    // defence — still gets the ordinary same-faction rejection.
    const canRepair = (seeker as Partial<CombatUnit> & { def?: { canRepair?: boolean } }).def?.canRepair === true;
    const repairable = target.kind !== "unit" && target.kind !== "hero";
    if (!canRepair || !repairable) return "sameFaction";
  }

  // A pooled unit that was recycled gets a fresh generation stamp; anything
  // holding the old stamp is looking at a corpse that has already been reused.
  const gen = (target as Partial<CombatUnit>).generation;
  const seen = (target as { _seenGeneration?: number })._seenGeneration;
  if (gen !== undefined && seen !== undefined && gen !== seen) return "recycled";

  const tx = target.position.x;
  const tz = target.position.z;
  if (!Number.isFinite(tx) || !Number.isFinite(tz)) return "disposed";
  if (Math.hypot(tx, tz) > WORLD_LIMIT) return "outOfWorld";

  if (maxRange !== Infinity) {
    const dx = tx - seeker.position.x;
    const dz = tz - seeker.position.z;
    if (dx * dx + dz * dz > maxRange * maxRange) return "beyondLeash";
  }
  return "ok";
}

export function isValidTarget(
  seeker: { faction: string; position: { x: number; z: number } },
  target: Damageable | null,
  maxRange = Infinity,
): boolean {
  return validateTarget(seeker, target, maxRange) === "ok";
}
