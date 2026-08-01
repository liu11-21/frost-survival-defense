import type { CombatContext, CombatScaling, CombatVfx } from "./CombatContext";
import type { DamageSource } from "../data/CombatTypes";
import type { CombatUnit } from "./CombatUnit";
import type { CollisionWorld } from "../util/Collision";
import type { CombatWorld } from "./CombatWorld";
import type { Damageable } from "./Damageable";
import type { ProjectilePool } from "./ProjectilePool";

export interface DirectorHooks {
  onKill(unit: CombatUnit): void;
  onStructureHit(target: Damageable, x: number, z: number): void;
  onFurnaceHit(): void;
}

/**
 * Builds the CombatContext. All damage in the game funnels through here, which
 * is what keeps hit feedback consistent no matter who swung.
 */
export function createCombatContext(
  world: CombatWorld,
  collision: CollisionWorld,
  projectiles: ProjectilePool,
  vfx: CombatVfx,
  scaling: CombatScaling,
  hooks: DirectorHooks,
): CombatContext {
  const scratch: CombatUnit[] = [];

  const damage = (target: Damageable, amount: number, fromX: number, fromZ: number, source: DamageSource = "skill"): void => {
    if (!target.alive || amount <= 0) return;
    target.applyDamage(amount, fromX, fromZ, source);
    if (target.kind === "furnace") {
      hooks.onFurnaceHit();
    } else if (target.kind !== "unit" && target.kind !== "hero") {
      hooks.onStructureHit(target, target.position.x, target.position.z);
    }
  };

  const areaDamage = (
    attackerFaction: "ally" | "enemy",
    x: number,
    z: number,
    radius: number,
    amount: number,
    maxTargets: number,
    onHit?: (target: Damageable) => void,
    source: DamageSource = "skill",
  ): number => {
    if (maxTargets <= 0 || amount <= 0) return 0;
    const victimFaction = attackerFaction === "ally" ? "enemy" : "ally";
    const hit = world.queryUnits(victimFaction, x, z, radius, scratch);
    let count = 0;
    for (let i = 0; i < hit.length && count < maxTargets; i++) {
      // Engineers are protected support staff until the hero has fallen.
      if (attackerFaction === "enemy" && hit[i].def.id === "engineer" && world.hero?.alive) continue;
      if (attackerFaction === "ally" && source === "melee" && hit[i].def.isFlying) continue;
      damage(hit[i], amount, x, z, source);
      onHit?.(hit[i]);
      count++;
    }

    if (attackerFaction === "enemy") {
      const hero = world.hero;
      if (hero?.alive && count < maxTargets && within(hero, x, z, radius)) {
        damage(hero, amount, x, z, source);
        onHit?.(hero);
        count++;
      }
      for (let i = 0; i < world.structures.length && count < maxTargets; i++) {
        const s = world.structures[i];
        if (!s.alive || (s as { isSky?: boolean }).isSky || !within(s, x, z, radius + s.hitRadius)) continue;
        damage(s, amount, x, z, source);
        onHit?.(s);
        count++;
      }
      const furnace = world.furnace;
      if (furnace?.alive && count < maxTargets && within(furnace, x, z, radius + furnace.hitRadius)) {
        damage(furnace, amount, x, z, source);
        onHit?.(furnace);
        count++;
      }
    }
    return count;
  };

  return {
    world,
    collision,
    projectiles,
    vfx,
    scaling,
    damage,
    areaDamage,
    reportKill: (unit) => hooks.onKill(unit),
  };
}

function within(target: Damageable, x: number, z: number, radius: number): boolean {
  const dx = target.position.x - x;
  const dz = target.position.z - z;
  return dx * dx + dz * dz <= radius * radius;
}
