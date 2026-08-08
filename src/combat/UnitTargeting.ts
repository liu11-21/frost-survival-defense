import { isInsideBase, WALL_SEGMENT_DEPTH } from "../data/BuildSlotDefinitions";
import { BOSS_TIER_LEVEL } from "../data/CombatTypes";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";
import type { Damageable } from "./Damageable";
import { claimCap, claimScore } from "../ai/ThreatTracker";

/** Still used by the engineer's bounded repair search — see `SquadManager.findRepairTarget`. */
export const ALLY_ENGAGE_RANGE = 13;
/** Legacy baseline retained for specialist behaviour and debug expectations. */
export const ENEMY_AGGRO_RANGE = 8;

/** Enemy perception hierarchy requested by the lane rework.  A Lv.5 elite can
 * notice a same-lane defender sooner than an ordinary ranged unit, and an
 * ordinary ranged unit sooner than melee.  Cross-lane *shots* are stricter:
 * they still require actual attack range. */
export const ENEMY_LOCK_RANGE = {
  melee: 6,
  ranged: 10,
  elite5Plus: 14,
} as const;

function isRanged(unit: CombatUnit): boolean {
  return unit.def.attackType === "rangedSingle" || unit.def.attackType === "rangedArea";
}

function withinRange(t: Damageable, x: number, z: number, range: number): boolean {
  const dx = t.position.x - x;
  const dz = t.position.z - z;
  const extra = t.hitRadius;
  const r = range + extra;
  return dx * dx + dz * dz <= r * r;
}

export function enemyLockRange(unit: CombatUnit): number {
  if (unit.level >= 5) return ENEMY_LOCK_RANGE.elite5Plus;
  if (isRanged(unit)) return ENEMY_LOCK_RANGE.ranged;
  return ENEMY_LOCK_RANGE.melee;
}

export function isCrossLaneUnitTarget(unit: CombatUnit, target: Damageable | null): boolean {
  return Boolean(
    target &&
      target.kind === "unit" &&
      (target as CombatUnit).laneIndex !== unit.laneIndex,
  );
}

function legalAllyCandidate(attacker: CombatUnit, candidate: CombatUnit): boolean {
  if (!candidate.alive) return false;
  if (candidate.isFlying && !isRanged(attacker)) return false;
  return attacker.canReach(candidate);
}

function allyScore(candidate: CombatUnit): number {
  let score = 0;
  if (isInsideBase(candidate.position.x, candidate.position.z)) score += 10_000;
  if (candidate.def.priorityTarget) score += 5_000;
  score += candidate.level * 100;
  const overCap = claimScore(candidate) - claimCap(candidate);
  if (overCap > 0) score -= overCap * 3_000;
  return score;
}

function chooseAllyEnemy(
  unit: CombatUnit,
  ctx: CombatContext,
  include: (enemy: CombatUnit) => boolean,
): CombatUnit | null {
  let best: CombatUnit | null = null;
  let bestScore = -Infinity;
  let bestDist = Infinity;
  for (const enemy of ctx.world.enemies) {
    if (!legalAllyCandidate(unit, enemy) || !include(enemy)) continue;
    const dx = enemy.position.x - unit.position.x;
    const dz = enemy.position.z - unit.position.z;
    const dist = dx * dx + dz * dz;
    const score = allyScore(enemy);
    if (score > bestScore || (score === bestScore && dist < bestDist)) {
      best = enemy;
      bestScore = score;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Lane-locked allied acquisition:
 *
 * 1. A target already inside this unit's real attack range on the same lane.
 * 2. Ranged units only: an in-range target on another lane, used as one-shot
 *    fallback fire while they keep progressing on their own lane.
 * 3. A same-lane target farther away, which melee/ranged units may chase along
 *    their own corridor.  Melee never receives a cross-lane target at all.
 */
export function acquireAllyTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  const sameLaneInRange = chooseAllyEnemy(
    unit,
    ctx,
    (enemy) => enemy.laneIndex === unit.laneIndex && withinRange(enemy, unit.position.x, unit.position.z, unit.def.attackRange),
  );
  if (sameLaneInRange) return sameLaneInRange;

  if (isRanged(unit)) {
    const crossLaneShot = chooseAllyEnemy(
      unit,
      ctx,
      (enemy) =>
        enemy.laneIndex !== unit.laneIndex &&
        withinRange(enemy, unit.position.x, unit.position.z, unit.def.attackRange),
    );
    if (crossLaneShot) return crossLaneShot;
  }

  return chooseAllyEnemy(unit, ctx, (enemy) => enemy.laneIndex === unit.laneIndex);
}

/** Enemy target tiers. Lower numbers always pre-empt higher ones.  Kept intact
 * for the Lv.6 boss' legacy global order and specialist compatibility. */
export function enemyTargetPriority(target: Damageable): number {
  if (target.kind === "wall") return 0;
  if (target.kind === "unit") {
    const defId = (target as Damageable & { def?: { id?: string } }).def?.id;
    if (defId === "groundSupport") return 0;
    if (defId === "shield") return 1;
    if (defId === "engineer") return 4;
    return 2;
  }
  if (target.kind === "hero") return 3;
  if (target.kind === "tower" || target.kind === "warehouse" || target.kind === "recruitHall") return 5;
  if (target.kind === "furnace") return 6;
  return 7;
}

function nearestReachableAlly(
  unit: CombatUnit,
  ctx: CombatContext,
  include: (candidate: CombatUnit) => boolean,
  range = Infinity,
): CombatUnit | null {
  let best: CombatUnit | null = null;
  let bestDist = Infinity;
  for (const candidate of ctx.world.allies) {
    if (!candidate.alive || !include(candidate) || !unit.canReach(candidate)) continue;
    if (!withinRange(candidate, unit.position.x, unit.position.z, range)) continue;
    const dx = candidate.position.x - unit.position.x;
    const dz = candidate.position.z - unit.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function nearestReachableStructure(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  let best: Damageable | null = null;
  let bestDist = Infinity;
  for (const candidate of ctx.world.structures) {
    if (!candidate.alive || candidate.kind === "wall" || (candidate as { isSky?: boolean }).isSky || !unit.canReach(candidate)) continue;
    const dx = candidate.position.x - unit.position.x;
    const dz = candidate.position.z - unit.position.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return best;
}

function validDefender(candidate: CombatUnit, heroAlive: boolean): boolean {
  if (candidate.def.temporaryGroundSupport) return false;
  if (candidate.def.id === "engineer" && heroAlive) return false;
  return true;
}

function sameLaneDefender(
  unit: CombatUnit,
  ctx: CombatContext,
  range: number,
  shieldOnly = false,
): CombatUnit | null {
  return nearestReachableAlly(
    unit,
    ctx,
    (candidate) =>
      candidate.laneIndex === unit.laneIndex &&
      validDefender(candidate, ctx.world.hero?.alive === true) &&
      (shieldOnly ? candidate.def.id === "shield" : candidate.def.id !== "shield"),
    range,
  );
}

function crossLaneDefender(unit: CombatUnit, ctx: CombatContext): CombatUnit | null {
  const canCross = isRanged(unit) || unit.level >= 5;
  if (!canCross) return null;
  const range = unit.def.attackRange;
  const heroAlive = ctx.world.hero?.alive === true;
  // Shield remains the first target inside the *fallback* tier as well, but a
  // shield on another road never drags melee across the map because this branch
  // is reachable only by ranged or Lv.5+ units and only inside attack range.
  const shield = nearestReachableAlly(
    unit,
    ctx,
    (candidate) => candidate.laneIndex !== unit.laneIndex && candidate.def.id === "shield",
    range,
  );
  if (shield) return shield;
  return nearestReachableAlly(
    unit,
    ctx,
    (candidate) =>
      candidate.laneIndex !== unit.laneIndex &&
      candidate.def.id !== "shield" &&
      validDefender(candidate, heroAlive),
    range,
  );
}

/**
 * Explicit specialist behaviour. Breachers may hit their lane wall and bombers
 * retain their self-destruct victim search; these are the requested exceptions
 * to the ordinary Lv.1-5 "no facilities" rule.
 */
function acquireSpecialistEnemyTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  const world = ctx.world;
  const x = unit.position.x;
  const z = unit.position.z;
  const canReach = (t: Damageable | null): t is Damageable =>
    t !== null && t.alive && world.reachable(x, z, t);

  if (unit.def.siegeFocus && unit.breachTarget?.alive) return unit.breachTarget;

  const taunter = world.tauntSourceFor(unit.faction, x, z, false);
  if (canReach(taunter)) return taunter;

  const ranged = isRanged(unit);
  const engineerAllowed = (candidate: CombatUnit): boolean =>
    !candidate.def.temporaryGroundSupport &&
    (candidate.def.id !== "engineer" || !world.hero?.alive);
  if (ranged) {
    const threat = world.highestThreatUnit("ally", x, z, unit.def.attackRange, engineerAllowed);
    if (canReach(threat)) return threat;
    const hero = world.hero;
    if (hero && hero.alive && withinRange(hero, x, z, unit.def.attackRange) && canReach(hero)) return hero;
  } else {
    const nearAlly = world.nearestUnit("ally", x, z, ENEMY_AGGRO_RANGE, engineerAllowed);
    const hero = world.hero;
    const heroClose = hero !== null && hero.alive && withinRange(hero, x, z, ENEMY_AGGRO_RANGE);
    if (canReach(nearAlly) && !heroClose) return nearAlly;
    if (heroClose && canReach(hero)) return hero;
  }

  const structure = world.nearestStructure(
    x,
    z,
    ENEMY_AGGRO_RANGE + 4,
    ["tower", "warehouse", "recruitHall"],
  );
  if (canReach(structure)) return structure;
  if (unit.breachTarget?.alive) return unit.breachTarget;

  const furnace = world.furnace;
  if (unit.navPoint) return furnace;
  if (furnace) {
    const blocker = world.wallBlocks(x, z, furnace.position.x, furnace.position.z);
    if (blocker) return blocker;
  }
  return furnace;
}

/** The Lv.6 boss deliberately keeps the old global six-tier target order:
 * wall → shield → other ally → hero → facility → furnace. */
function acquireLegacyBossTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  const world = ctx.world;
  const x = unit.position.x;
  const z = unit.position.z;
  const furnace = world.furnace;

  if (!unit.isFlying && unit.breachTarget?.alive) return unit.breachTarget;
  if (!unit.isFlying && !unit.navPoint && furnace?.alive) {
    const blocker = world.wallBlocks(x, z, furnace.position.x, furnace.position.z);
    if (blocker?.alive) return blocker;
  }

  const shield = nearestReachableAlly(unit, ctx, (candidate) => candidate.def.id === "shield");
  if (shield) return shield;
  const otherAlly = nearestReachableAlly(
    unit,
    ctx,
    (candidate) =>
      candidate.def.id !== "shield" &&
      candidate.def.id !== "engineer" &&
      !candidate.def.temporaryGroundSupport,
  );
  if (otherAlly) return otherAlly;

  const hero = world.hero;
  if (hero?.alive && unit.canReach(hero)) return hero;
  if (!hero?.alive) {
    const engineer = nearestReachableAlly(unit, ctx, (candidate) => candidate.def.id === "engineer");
    if (engineer) return engineer;
  }
  const structure = nearestReachableStructure(unit, ctx);
  if (structure) return structure;
  if (furnace?.alive) {
    const blocker = unit.isFlying ? null : world.wallBlocks(x, z, furnace.position.x, furnace.position.z);
    if (blocker?.alive) return blocker;
    return furnace;
  }
  return null;
}

/**
 * Ordinary enemy acquisition is lane-first and range-bounded:
 *
 * - Lv.1-5 never selects an ordinary facility.
 * - same-lane defenders inside attack range always come before a cross-lane shot;
 * - ranged and Lv.5 units may take a cross-lane shot only inside attack range;
 * - if neither shot exists, a same-lane defender inside the unit's lock radius
 *   may be approached; otherwise the unit keeps marching toward the furnace;
 * - Hero is deliberately lane-neutral: if the player personally enters the
 *   unit's lock radius they can intercept that lane.
 */
export function acquireEnemyTarget(unit: CombatUnit, ctx: CombatContext): Damageable | null {
  if (unit.def.siegeFocus || unit.def.selfDestruct) return acquireSpecialistEnemyTarget(unit, ctx);
  if (unit.level >= BOSS_TIER_LEVEL) return acquireLegacyBossTarget(unit, ctx);

  const world = ctx.world;
  const furnace = world.furnace;
  const lockRange = enemyLockRange(unit);

  // A lane wall is not an optional facility; it is the route blocker that must
  // be removed before a ground unit can reach the furnace.
  if (!unit.isFlying && unit.breachTarget?.alive) return unit.breachTarget;

  const sameShieldInRange = sameLaneDefender(unit, ctx, unit.def.attackRange, true);
  if (sameShieldInRange) return sameShieldInRange;
  const sameOtherInRange = sameLaneDefender(unit, ctx, unit.def.attackRange, false);
  if (sameOtherInRange) return sameOtherInRange;

  const hero = world.hero;
  if (hero?.alive && withinRange(hero, unit.position.x, unit.position.z, unit.def.attackRange) && unit.canReach(hero)) {
    return hero;
  }

  const cross = crossLaneDefender(unit, ctx);
  if (cross) return cross;

  const sameShieldDetected = sameLaneDefender(unit, ctx, lockRange, true);
  if (sameShieldDetected) return sameShieldDetected;
  const sameOtherDetected = sameLaneDefender(unit, ctx, lockRange, false);
  if (sameOtherDetected) return sameOtherDetected;

  if (hero?.alive && withinRange(hero, unit.position.x, unit.position.z, lockRange) && unit.canReach(hero)) {
    return hero;
  }
  if (!hero?.alive) {
    const engineer = nearestReachableAlly(
      unit,
      ctx,
      (candidate) => candidate.def.id === "engineer" && candidate.laneIndex === unit.laneIndex,
      lockRange,
    );
    if (engineer) return engineer;
  }

  // No legal defender in this lane: continue the route.  `EnemyNavigator`
  // supplies the winding navPoint and swaps to the lane wall when necessary.
  return furnace?.alive ? furnace : null;
}

/** A wall is a long thin slab, so stopping uses its real thickness rather than
 * treating the whole segment as a giant disc. */
export function stopRadius(target: Damageable): number {
  if (target.kind !== "wall") return target.hitRadius;
  return WALL_SEGMENT_DEPTH * 0.5 + 0.35;
}

/** Structure attackers commit to close quarters; unit-vs-unit uses authored range. */
export function approachRange(unit: CombatUnit, target: Damageable): number {
  const structural =
    target.kind === "wall" ||
    target.kind === "tower" ||
    target.kind === "warehouse" ||
    target.kind === "recruitHall";
  return structural ? Math.min(unit.def.attackRange, 2.6) : unit.def.attackRange;
}

/** Only ever called for enemies.  Cross-lane fallback is dropped the instant
 * the target leaves real attack range; same-lane targets get a small sensor
 * hysteresis so they do not flicker at the perception boundary. */
export function targetOutOfLeash(unit: CombatUnit, target: Damageable): boolean {
  if (target.kind === "furnace" || target.kind === "wall") return false;
  const dx = target.position.x - unit.position.x;
  const dz = target.position.z - unit.position.z;
  const leash = isCrossLaneUnitTarget(unit, target)
    ? approachRange(unit, target) + stopRadius(target) + 0.25
    : unit.level >= BOSS_TIER_LEVEL
      ? ENEMY_AGGRO_RANGE + 14
      : enemyLockRange(unit) + 3;
  return dx * dx + dz * dz > leash * leash;
}
