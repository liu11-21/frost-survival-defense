import { Vector3 } from "@babylonjs/core";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import type { Damageable } from "../combat/Damageable";
import { BOSS_TIER_LEVEL } from "../data/CombatTypes";
import type { Building } from "./Building";
import { fireTower } from "./TowerCombat";
import { igniteZone, tickBurnZones } from "./BurnZones";

const aimPoint = new Vector3();

function distSq(x: number, z: number, ox: number, oz: number): number {
  const dx = x - ox;
  const dz = z - oz;
  return dx * dx + dz * dz;
}

function hasLineOfSight(building: Building, target: Damageable, ctx: CombatContext): boolean {
  if (!building.def.requiresLineOfSight) return true;
  return ctx.world.wallBlocks(building.position.x, building.position.z, target.position.x, target.position.z) === null;
}

function rangeFor(building: Building, base: number): number {
  // Only the sky tower and sky sniper explicitly gain extra reach.  The
  // crossbow and frost platform upgrades are attack-speed upgrades, while the
  // mortar's sky upgrade enlarges its impact/burn radius instead of its
  // acquisition radius.
  return building.isSky && (building.def.attackKind === "snipe") ? base * 1.5 : base;
}

/** A projectile always needs a `Damageable` to home in on; ground-aimed shots use this stand-in. */
function groundAim(x: number, z: number): Damageable {
  aimPoint.set(x, 0, z);
  return {
    damageId: -1,
    faction: "enemy",
    position: aimPoint,
    alive: true,
    hitRadius: 0.2,
    kind: "unit",
    level: 0,
    threat: 0,
    health: 1,
    maxHealth: 1,
    applyDamage: () => {},
  };
}

// ------------------------------------------------------------- crossbow ----

/** Nearest to the furnace first; a tied distance is broken by lowest HP ratio. */
function fireSingleBolt(building: Building, ctx: CombatContext): boolean {
  const def = building.def;
  const candidates = ctx.world.queryUnits("enemy", building.position.x, building.position.z, rangeFor(building, def.attackRange ?? 9));
  const visible = candidates.filter((c) => hasLineOfSight(building, c, ctx));
  if (visible.length === 0) return false;

  const furnace = ctx.world.furnace;
  const fx = furnace?.position.x ?? 0;
  const fz = furnace?.position.z ?? 0;
  let best = visible[0];
  let bestDist = distSq(best.position.x, best.position.z, fx, fz);
  let bestRatio = best.health / best.maxHealth;
  for (const c of visible) {
    const d = distSq(c.position.x, c.position.z, fx, fz);
    const ratio = c.health / c.maxHealth;
    if (d < bestDist - 0.05 || (Math.abs(d - bestDist) <= 0.05 && ratio < bestRatio)) {
      best = c;
      bestDist = d;
      bestRatio = ratio;
    }
  }

  const power = building.attackPower * ctx.scaling.towerAttack;
  ctx.vfx.burstAt("muzzleFlash", building.position.x, building.position.z, 12);
  const targets = building.isSky
    ? [best, ...visible.filter((candidate) => candidate !== best).sort((a, b) =>
      distSq(a.position.x, a.position.z, building.position.x, building.position.z) -
      distSq(b.position.x, b.position.z, building.position.x, building.position.z),
    ).slice(0, 2)]
    : [best];
  for (const target of targets) {
    ctx.projectiles.fire("crossbowBolt", building.position.x, 1.0, building.position.z, target, (hx, hz) => {
      if (target.alive) ctx.damage(target, power, hx, hz, "ranged");
      ctx.vfx.rangedHit(hx, hz);
    });
  }
  return true;
}

// --------------------------------------------------------- frost tower ----

function applySlow(building: Building, target: Damageable): void {
  const slow = building.def.slowEffect;
  if (!slow) return;
  const applicable = target as Partial<CombatUnit>;
  if (typeof applicable.applySlowRefresh !== "function") return;
  const isBoss = target.level >= BOSS_TIER_LEVEL;
  applicable.applySlowRefresh(isBoss ? slow.bossAmount : slow.amount, isBoss ? slow.bossDuration : slow.duration);
}

const frostStreak = new WeakMap<Building, { targetId: number; hits: number }>();

function applySkyFreeze(building: Building, target: Damageable, ctx: CombatContext): void {
  if (!building.isSky || target.kind !== "unit") return;
  const unit = target as CombatUnit;
  const previous = frostStreak.get(building);
  const hits = previous && previous.targetId === target.damageId ? previous.hits + 1 : 1;
  if (!unit.alive) {
    frostStreak.delete(building);
    return;
  }
  if (hits >= 3) {
    const boss = target.level >= BOSS_TIER_LEVEL;
    unit.applyStun(boss ? 1.5 : 3, boss ? 0.75 : 0);
    unit.applyVulnerability(boss ? 0.25 : 0.5, boss ? 1.5 : 3);
    ctx.vfx.burstAt("freezeZone", target.position.x, target.position.z, 36);
    frostStreak.set(building, { targetId: target.damageId, hits: 0 });
  } else {
    frostStreak.set(building, { targetId: target.damageId, hits });
  }
}

function fireSlowBolt(building: Building, ctx: CombatContext): boolean {
  const def = building.def;
  const candidates = ctx.world.queryUnits("enemy", building.position.x, building.position.z, rangeFor(building, def.attackRange ?? 8));
  const visible = candidates.filter((c) => hasLineOfSight(building, c, ctx));
  if (visible.length === 0) return false;

  let target = visible[0];
  let bestDist = distSq(target.position.x, target.position.z, building.position.x, building.position.z);
  for (const c of visible) {
    const d = distSq(c.position.x, c.position.z, building.position.x, building.position.z);
    if (d < bestDist) {
      target = c;
      bestDist = d;
    }
  }

  const radius = def.areaRadius ?? 2;
  const power = building.attackPower * ctx.scaling.towerAttack;
  ctx.vfx.burstAt("frostCast", building.position.x, building.position.z, 20);
  ctx.projectiles.fire("frostShard", building.position.x, 1.0, building.position.z, target, (hx, hz) => {
    ctx.areaDamage("ally", hx, hz, radius, power, def.maxAreaTargets ?? 5, (hit) => {
      applySlow(building, hit);
      applySkyFreeze(building, hit, ctx);
    }, "ranged");
    ctx.vfx.burstAt("frostImpact", hx, hz, 38);
    ctx.vfx.burstAt("frostMist", hx, hz, 22);
  });
  return true;
}

// -------------------------------------------------------------- sniper ----

/** Committed-but-not-yet-landed damage, so a second sniper skips a target the
 * first one has already lined up a lethal shot on. Released on impact. */
const committed = new Map<number, number>();
function committedDamage(id: number): number {
  return committed.get(id) ?? 0;
}
function commit(id: number, amount: number): void {
  committed.set(id, committedDamage(id) + amount);
}
function release(id: number, amount: number): void {
  const left = committedDamage(id) - amount;
  if (left <= 0.01) committed.delete(id);
  else committed.set(id, left);
}

interface SniperAim {
  target: CombatUnit;
  power: number;
  elapsed: number;
  shotNumber: number;
}
const aiming = new WeakMap<Building, SniperAim>();
const sniperStreak = new WeakMap<Building, { targetId: number; shots: number }>();

/** Test-only counter: how many snipers actually committed to a shot. Used to
 * verify two snipers never both commit to the same already-lethal target. */
let sniperShotsFired = 0;
export function resetSniperShotCounter(): void {
  sniperShotsFired = 0;
}
export function sniperShotCount(): number {
  return sniperShotsFired;
}

/** Boss > breacher-like/high-tier > priority support > highest HP > nearest the furnace. */
function sniperTier(c: CombatUnit): number {
  if (c.level >= BOSS_TIER_LEVEL) return 4;
  if (c.def.siegeFocus || c.level >= 4) return 3;
  if (c.def.priorityTarget) return 2;
  return 1;
}

function pickSniperTarget(candidates: CombatUnit[], fx: number, fz: number): CombatUnit | null {
  let best: CombatUnit | null = null;
  let bestTier = -1;
  let bestHealth = -1;
  let bestDist = Infinity;
  for (const c of candidates) {
    const tier = sniperTier(c);
    const dist = distSq(c.position.x, c.position.z, fx, fz);
    const better =
      tier > bestTier ||
      (tier === bestTier && c.maxHealth > bestHealth) ||
      (tier === bestTier && c.maxHealth === bestHealth && dist < bestDist);
    if (better) {
      best = c;
      bestTier = tier;
      bestHealth = c.maxHealth;
      bestDist = dist;
    }
  }
  return best;
}

/** Acquires and starts the aim telegraph; the actual shot fires once it elapses (see `tickBuildingCombat`). */
function fireSnipe(building: Building, ctx: CombatContext): boolean {
  if (aiming.has(building)) return false;
  const def = building.def;
  const candidates = ctx.world
    .queryUnits("enemy", building.position.x, building.position.z, rangeFor(building, def.attackRange ?? 16))
    .filter((c) => hasLineOfSight(building, c, ctx))
    .filter((c) => !def.avoidOverkill || c.health > committedDamage(c.damageId));
  if (candidates.length === 0) return false;

  const furnace = ctx.world.furnace;
  const target = pickSniperTarget(candidates, furnace?.position.x ?? 0, furnace?.position.z ?? 0);
  if (!target) return false;

  const previous = sniperStreak.get(building);
  const shotNumber = previous && previous.targetId === target.damageId ? previous.shots + 1 : 1;
  const base = building.isSky ? (target.level >= 4 ? 1000 : 300) : def.attackPower;
  const bonus = target.level >= BOSS_TIER_LEVEL ? 1 + (def.bonusVsBossFactor ?? 0) : 1;
  const critical = building.isSky && shotNumber % 3 === 0;
  const power = building.attackPowerFor(base) * ctx.scaling.towerAttack * bonus * (critical ? 2.5 : 1);
  if (def.avoidOverkill) commit(target.damageId, power);
  aiming.set(building, { target, power, elapsed: 0, shotNumber });
  ctx.vfx.burstAt("sniperAim", building.position.x, building.position.z, 1);
  if (critical) ctx.vfx.burstAt("pierce", target.position.x, target.position.z, 24);
  sniperShotsFired++;
  return true;
}

// -------------------------------------------------------------- mortar ----

function fireBurstMortar(building: Building, ctx: CombatContext): boolean {
  const def = building.def;
  const range = rangeFor(building, def.attackRange ?? 14);
  const minRange = def.minAttackRange ?? 0;
  const radius = building.isSky ? (def.areaRadius ?? 4) * 1.5 : (def.areaRadius ?? 4);
  const candidates = ctx.world
    .queryUnits("enemy", building.position.x, building.position.z, range)
    .filter((c) => distSq(c.position.x, c.position.z, building.position.x, building.position.z) >= minRange * minRange);
  if (candidates.length === 0) return false;

  let bestX = candidates[0].position.x;
  let bestZ = candidates[0].position.z;
  let bestScore = -Infinity;
  for (const c of candidates) {
    let covered = 0;
    for (const o of candidates) if (distSq(o.position.x, o.position.z, c.position.x, c.position.z) <= radius * radius) covered++;
    const score = covered * 100 + c.level * 10;
    if (score > bestScore) {
      bestScore = score;
      bestX = c.position.x;
      bestZ = c.position.z;
    }
  }

  const power = building.isSky ? building.attackPowerFor(500) * ctx.scaling.towerAttack : building.attackPower * ctx.scaling.towerAttack;
  const burn = building.isSky
    ? { duration: 10, dps: 300, maxZones: 3, bossFactor: 0.5 }
    : def.burnEffect;
  ctx.vfx.burstAt("muzzleFlash", building.position.x, building.position.z, 24);
  ctx.projectiles.fire("mortarShell", building.position.x, 3.0, building.position.z, groundAim(bestX, bestZ), (hx, hz) => {
    ctx.areaDamage("ally", hx, hz, radius, power, def.maxAreaTargets ?? 8, undefined, "ranged");
    ctx.vfx.areaBlast(hx, hz, radius);
    if (burn) {
      const burnRadius = building.isSky ? radius : radius * 0.7;
      igniteZone(building, hx, hz, burnRadius, burn.duration, burn.dps, burn.maxZones, burn.bossFactor);
      ctx.vfx.groundFire(hx, hz, burnRadius, burn.duration);
    }
  });
  return true;
}

/** The sky mortar accelerates with nearby targets, while all other weapons
 * retain the authored interval. */
export function attackIntervalFor(building: Building, ctx: CombatContext): number {
  if (building.isSky && building.def.attackKind === "burstMortar") {
    const nearby = ctx.world.queryUnits("enemy", building.position.x, building.position.z, 8).length;
    return Math.max(2, 3 - nearby * 0.1);
  }
  if (building.isSky && (building.def.attackKind === "singleBolt" || building.def.attackKind === "slowBolt")) {
    return (building.def.attackInterval ?? 1.5) / 1.5;
  }
  return building.def.attackInterval ?? 1.5;
}

// -------------------------------------------------------------- dispatch ----

/** Called every frame regardless of the attack cooldown: advances a mortar's
 * burn zones and a sniper's aim telegraph, neither of which waits for the
 * next `attackInterval` tick to make progress. */
export function tickBuildingCombat(building: Building, dt: number, ctx: CombatContext): void {
  if (building.def.burnEffect) tickBurnZones(building, dt, ctx);

  const aim = aiming.get(building);
  if (!aim) return;
  if (!aim.target.alive) {
    if (building.def.avoidOverkill) release(aim.target.damageId, aim.power);
    aiming.delete(building);
    return;
  }
  aim.elapsed += dt;
  if (aim.elapsed < (building.def.telegraph ?? 0)) return;
  aiming.delete(building);
  const target = aim.target;
  const power = aim.power;
  ctx.projectiles.fire("sniperRound", building.position.x, 1.4, building.position.z, target, (hx, hz) => {
    if (building.def.avoidOverkill) release(target.damageId, power);
    if (target.alive) {
      ctx.damage(target, power, hx, hz, "ranged");
      if (building.isSky) {
        const vulnerable = target as Partial<CombatUnit>;
        vulnerable.applyRemoteVulnerability?.(0.2, 5);
        if (building.isSky) ctx.vfx.burstAt("armorShatter", target.position.x, target.position.z, 12);
        sniperStreak.set(building, { targetId: target.damageId, shots: aim.shotNumber });
      }
    } else {
      sniperStreak.delete(building);
    }
    ctx.vfx.rangedHit(hx, hz);
  });
}

/** Cooldown-gated fire attempt, dispatched by the building's `attackKind`. */
export function fireBuilding(building: Building, ctx: CombatContext): boolean {
  switch (building.def.attackKind) {
    case "areaShell":
      return fireTower(building, ctx);
    case "singleBolt":
      return fireSingleBolt(building, ctx);
    case "slowBolt":
      return fireSlowBolt(building, ctx);
    case "snipe":
      return fireSnipe(building, ctx);
    case "burstMortar":
      return fireBurstMortar(building, ctx);
    default:
      return false;
  }
}
