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
 * Drops a burn zone at `(x, z)`. Landing on (roughly) the same spot refreshes
 * the existing zone's duration instead of stacking a second one there; once
 * `maxZones` is already out, the oldest is replaced rather than piling up.
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
  const existing = zones.find((zone) => Math.hypot(zone.x - x, zone.z - z) < radius * 0.6);
  if (existing) {
    existing.remaining = duration;
    return;
  }
  if (zones.length >= maxZones) zones.shift();
  zones.push({ x, z, radius, dps, bossFactor, remaining: duration });
}

/** Ticks one owner's zones: damages everything standing inside, then expires. */
export function tickBurnZones(owner: object, dt: number, ctx: CombatContext): void {
  const zones = zonesByOwner.get(owner);
  if (!zones || zones.length === 0) return;
  for (let i = zones.length - 1; i >= 0; i--) {
    const zone = zones[i];
    zone.remaining -= dt;
    if (zone.remaining <= 0) {
      zones.splice(i, 1);
      continue;
    }
    const targets = ctx.world.queryUnits("enemy", zone.x, zone.z, zone.radius);
    for (const target of targets) {
      const factor = target.level >= BOSS_TIER_LEVEL ? zone.bossFactor : 1;
      ctx.damage(target, zone.dps * dt * factor, zone.x, zone.z);
    }
  }
}

/** For tests/debug: how many zones an owner currently has burning. */
export function activeZoneCount(owner: object): number {
  return zonesByOwner.get(owner)?.length ?? 0;
}
