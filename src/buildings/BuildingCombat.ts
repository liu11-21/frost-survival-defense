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
  const candidates = ctx.world.queryUnits("enemy", building.position.x, building.position.z, def.attackRange ?? 9);
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

  const power = (def.attackPower ?? 18) * ctx.scaling.towerAttack;
  ctx.projectiles.fire("crossbowBolt", building.position.x, 1.0, building.position.z, best, (hx, hz) => {
    if (best.alive) ctx.damage(best, power, hx, hz);
    ctx.vfx.rangedHit(hx, hz);
  });
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

function fireSlowBolt(building: Building, ctx: CombatContext): boolean {
  const def = building.def;
  const candidates = ctx.world.queryUnits("enemy", building.position.x, building.position.z, def.attackRange ?? 8);
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
  const power = (def.attackPower ?? 10) * ctx.scaling.towerAttack;
  ctx.projectiles.fire("frostShard", building.position.x, 1.0, building.position.z, target, (hx, hz) => {
    ctx.areaDamage("ally", hx, hz, radius, power, def.maxAreaTargets ?? 5, (hit) => applySlow(building, hit));
    ctx.vfx.burstAt("frostMist", hx, hz, 10);
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
}
const aiming = new WeakMap<Building, SniperAim>();

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
    .queryUnits("enemy", building.position.x, building.position.z, def.attackRange ?? 16)
    .filter((c) => hasLineOfSight(building, c, ctx))
    .filter((c) => !def.avoidOverkill || c.health > committedDamage(c.damageId));
  if (candidates.length === 0) return false;

  const furnace = ctx.world.furnace;
  const target = pickSniperTarget(candidates, furnace?.position.x ?? 0, furnace?.position.z ?? 0);
  if (!target) return false;

  const bonus = target.level >= BOSS_TIER_LEVEL ? 1 + (def.bonusVsBossFactor ?? 0) : 1;
  const power = (def.attackPower ?? 120) * ctx.scaling.towerAttack * bonus;
  if (def.avoidOverkill) commit(target.damageId, power);
  aiming.set(building, { target, power, elapsed: 0 });
  ctx.vfx.burstAt("sniperAim", building.position.x, building.position.z, 1);
  sniperShotsFired++;
  return true;
}

// -------------------------------------------------------------- mortar ----

function fireBurstMortar(building: Building, ctx: CombatContext): boolean {
  const def = building.def;
  const range = def.attackRange ?? 14;
  const minRange = def.minAttackRange ?? 0;
  const radius = def.areaRadius ?? 4;
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

  const power = (def.attackPower ?? 80) * ctx.scaling.towerAttack;
  const burn = def.burnEffect;
  ctx.projectiles.fire("mortarShell", building.position.x, 3.0, building.position.z, groundAim(bestX, bestZ), (hx, hz) => {
    ctx.areaDamage("ally", hx, hz, radius, power, def.maxAreaTargets ?? 8);
    ctx.vfx.areaBlast(hx, hz, radius);
    if (burn) igniteZone(building, hx, hz, radius * 0.7, burn.duration, burn.dps, burn.maxZones, burn.bossFactor);
  });
  return true;
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
    if (target.alive) ctx.damage(target, power, hx, hz);
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
