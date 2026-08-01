import type { CombatContext } from "../combat/CombatContext";
import { BOSS_TIER_LEVEL } from "../data/CombatTypes";

interface BurnZone {
  x: number;
  z: number;
  radius: number;
  dps: number;
  bossFactor: number;
  remaining: number;
}

/** Every mortar owns its own zones — nothing shared across buildings. */
const zonesByOwner = new WeakMap<object, BurnZone[]>();

/**
 * Drops a burn zone at `(x, z)`. Zones from one mortar may overlap, but each
 * keeps its own countdown; `tickBurnZones` deduplicates a target per tick so
 * overlap never doubles that mortar's damage. Once `maxZones` is reached the
 * oldest zone is replaced rather than allowing an unbounded list.
 */
export function igniteZone(
  owner: object,
  x: number,
  z: number,
  radius: number,
  duration: number,
  dps: number,
  maxZones: number,
  bossFactor: number,
): void {
  let zones = zonesByOwner.get(owner);
  if (!zones) {
    zones = [];
    zonesByOwner.set(owner, zones);
  }
  if (zones.length >= maxZones) zones.shift();
  zones.push({ x, z, radius, dps, bossFactor, remaining: duration });
}

/** Ticks one owner's zones: damages everything standing inside, then expires. */
export function tickBurnZones(owner: object, dt: number, ctx: CombatContext): void {
  const zones = zonesByOwner.get(owner);
  if (!zones || zones.length === 0) return;
  const damaged = new Set<number>();
  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i];
    zone.remaining -= dt;
    if (zone.remaining <= 0) {
      zones.splice(i, 1);
      continue;
    }
    const targets = ctx.world.queryUnits("enemy", zone.x, zone.z, zone.radius);
    for (const target of targets) {
      if (damaged.has(target.damageId)) continue;
      const factor = target.level >= BOSS_TIER_LEVEL ? zone.bossFactor : 1;
      ctx.damage(target, zone.dps * dt * factor, zone.x, zone.z, "burn");
      damaged.add(target.damageId);
    }
  }
}

/** For tests/debug: how many zones an owner currently has burning. */
export function activeZoneCount(owner: object): number {
  return zonesByOwner.get(owner)?.length ?? 0;
}
