import { isInsideBase, WALL_SEGMENT_DEPTH } from "../data/BuildSlotDefinitions";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";
import type { Damageable } from "./Damageable";
import { claimCap, claimScore } from "../ai/ThreatTracker";

/** Still used by the engineer's bounded repair search — see `SquadManager.findRepairTarget`. */
export const ALLY_ENGAGE_RANGE = 13;
export const ENEMY_AGGRO_RANGE = 8;

/** Fallback order once taunts and nearby friendlies are ruled out. */
const STRUCTURE_ORDER = ["tower", "warehouse", "recruitHall"] as const;

function isRanged(unit: CombatUnit): boolean {
  return unit.def.attackType === "rangedSingle" || unit.def.attackType === "rangedArea";
}

function withinRange(t: Damageable, x: number, z: number, range: number): boolean {
  const dx = t.position.x - x;
  const dz = t.position.z - z;
  return dx * dx + dz * dz <= range * range;
}

/**
 * Allies search the *entire* battlefield for a target, not a local radius —
 * "global" describes the search space, not the frame cost: this only runs on
 * the brain's own retarget timer (0.2-0.35s), a flat scan of the enemy list,
 * no spatial grid needed because every enemy is a candidate anyway.
 *
 * Priority: an enemy already inside the perimeter always outranks one still
 * outside it; a flagged priority target (e.g. the Commander) outranks an
 * ordinary one; higher level outranks lower; nearest breaks the remaining
 * ties. `claimScore` then softly steers *equally* good choices away from a
 * target that already has enough attackers on it, so the whole roster does
 * not converge on one weak enemy while every other approach goes undefended.
 */
export function acquireAllyTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  const enemies = ctx.world.enemies;
  let best: CombatUnit | null = null;
  let bestScore = -Infinity;
  let bestDist = Infinity;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;
    const dx = e.position.x - unit.position.x;
    const dz = e.position.z - unit.position.z;
    const dist = dx * dx + dz * dz;

    let s = 0;
    if (isInsideBase(e.position.x, e.position.z)) s += 10_000;
    if (e.def.priorityTarget) s += 5_000;
    s += e.level * 100;
    const overCap = claimScore(e) - claimCap(e);
    if (overCap > 0) s -= overCap * 3_000;

    if (s > bestScore || (s === bestScore && dist < bestDist)) {
      bestScore = s;
      bestDist = dist;
      best = e;
    }
  }
  return best;
}

/**
 * Enemy target selection.
 *
 * Reachability comes *before* priority, always. The old order was taunt →
 * nearby friendly → structure → wall → core, with no test for whether any of
 * those could actually be walked to; a taunting shield trooper behind a closed
 * lane therefore became the chosen target, and the unit walked at it until the
 * steering solver squeezed it around the end of the wall model. Now every
 * candidate is filtered through `world.reachable`, and a unit with nothing
 * reachable is given the wall that is in its way.
 */
export function acquireEnemyTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  const world = ctx.world;
  const x = unit.position.x;
  const z = unit.position.z;
  const canReach = (t: Damageable | null): t is Damageable =>
    t !== null && t.alive && world.reachable(x, z, t);

  const taunter = world.tauntSourceFor(unit.faction, x, z, false);
  // A taunt from behind a wall still raises attention — it just cannot be
  // answered until the wall is down, so it becomes a reason to break through.
  if (canReach(taunter)) return taunter;

  const ranged = isRanged(unit);
  if (ranged) {
    const threat = world.highestThreatUnit("ally", x, z, unit.def.attackRange);
    if (canReach(threat)) return threat;
    const hero = world.hero;
    if (hero && hero.alive && withinRange(hero, x, z, unit.def.attackRange) && canReach(hero)) return hero;
  } else {
    const nearAlly = world.nearestUnit("ally", x, z, ENEMY_AGGRO_RANGE);
    const hero = world.hero;
    const heroClose = hero !== null && hero.alive && withinRange(hero, x, z, ENEMY_AGGRO_RANGE);
    if (canReach(nearAlly) && !heroClose) return nearAlly;
    if (heroClose && canReach(hero)) return hero;
  }

  const structure = world.nearestStructure(x, z, ENEMY_AGGRO_RANGE + 4, STRUCTURE_ORDER);
  if (canReach(structure)) return structure;

  // Nothing can be got at: navigation has already chosen which wall is in the
  // way. This is the only path that leads inside a sealed perimeter.
  if (unit.breachTarget?.alive) return unit.breachTarget;

  const furnace = world.furnace;
  // Navigation has found a gap and is walking this unit to it. Stopping to
  // chew on the wall it happens to be standing behind would undo that.
  if (unit.navPoint) return furnace;
  if (furnace) {
    const blocker = world.wallBlocks(x, z, furnace.position.x, furnace.position.z);
    if (blocker) return blocker;
  }
  return furnace;
}

/**
 * How far from a target's origin an attacker has to stop.
 *
 * A wall is a long thin slab, so treating it as a disc of its `hitRadius`
 * parked besiegers four units clear of the stonework — far enough that a manned
 * perimeter could not shoot back, which turned a fully sealed base into a
 * permanent stalemate. Against a wall the stopping distance is its real
 * thickness instead.
 */
export function stopRadius(target: Damageable): number {
  if (target.kind !== "wall") return target.hitRadius;
  return WALL_SEGMENT_DEPTH * 0.5 + 0.35;
}

/**
 * How close to stand before attacking. A siege unit shelling a wall from the far
 * edge of its range would sit outside every defence and stalemate the wave, so
 * anything shooting a *structure* commits to close quarters.
 */
export function approachRange(unit: CombatUnit, target: Damageable): number {
  const structural =
    target.kind === "wall" ||
    target.kind === "tower" ||
    target.kind === "warehouse" ||
    target.kind === "recruitHall";
  return structural ? Math.min(unit.def.attackRange, 2.6) : unit.def.attackRange;
}

/** Only ever called for enemies — allies pursue globally and never leash off a target. */
export function targetOutOfLeash(unit: CombatUnit, target: Damageable): boolean {
  if (target.kind === "furnace") return false;
  const dx = target.position.x - unit.position.x;
  const dz = target.position.z - unit.position.z;
  const leash = ENEMY_AGGRO_RANGE + 14;
  return dx * dx + dz * dz > leash * leash;
}
