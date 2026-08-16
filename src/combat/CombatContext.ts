import type { CollisionWorld } from "../util/Collision";
import type { CombatWorld } from "./CombatWorld";
import type { Damageable } from "./Damageable";
import type { ProjectilePool } from "./ProjectilePool";
import type { CombatUnit } from "./CombatUnit";
import type { DamageSource } from "../data/CombatTypes";

/** Effects the combat layer can request without knowing how they are produced. */
export interface CombatVfx {
  meleeHit(x: number, z: number): void;
  rangedHit(x: number, z: number): void;
  areaBlast(x: number, z: number, radius: number): void;
  heal(x: number, z: number): void;
  repair(x: number, z: number): void;
  burstAt(key: string, x: number, z: number, count: number): void;
  heroSkill(
    kind: "airSupport" | "infiniteFirepower" | "groundSupport" | "seismicWave",
    x: number,
    z: number,
    radius: number,
  ): void;
  airStrike(x: number, z: number, radius: number): void;
  groundFire(x: number, z: number, radius: number, duration: number): void;
  supportAura(x: number, z: number, radius: number): void;
  taunt(x: number, z: number, radius: number): void;
  teleport(x: number, z: number): void;
  unitDeath(x: number, z: number, level: number): void;
  buildingHit(x: number, z: number): void;
  sound(name: string, volume?: number, pitch?: number): void;
  /** Positional counterpart for real world-space combat events. */
  soundAt?(name: string, x: number, z: number, volume?: number, pitch?: number, priorityBoost?: number): void;
  damageNumber(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void;
  healthChanged(target: Damageable): void;
  registerHealthBar(target: Damageable): void;
}

/** Run-wide multipliers that combat reads but never owns. */
export interface CombatScaling {
  allyAttack: number;
  allyHealth: number;
  towerAttack: number;
  enemyAttack: number;
  enemyHealth: number;
  heroAttack: number;
  goldDrop: number;
}

export function neutralScaling(): CombatScaling {
  return {
    allyAttack: 1,
    allyHealth: 1,
    towerAttack: 1,
    enemyAttack: 1,
    enemyHealth: 1,
    heroAttack: 1,
    goldDrop: 1,
  };
}

/** Everything a unit needs from the outside world during its update. */
export interface CombatContext {
  world: CombatWorld;
  collision: CollisionWorld;
  projectiles: ProjectilePool;
  vfx: CombatVfx;
  scaling: CombatScaling;
  damage(target: Damageable, amount: number, fromX: number, fromZ: number, source?: DamageSource): void;
  /**
   * Splash damage centred on a point. `includeFacilities` affects only ordinary
   * built structures; the central furnace remains a valid objective. This lets
   * Lv.1-5 enemies obey the no-facility rule without creating a second area
   * damage implementation or accidentally making the furnace immune.
   */
  areaDamage(
    attackerFaction: "ally" | "enemy",
    x: number,
    z: number,
    radius: number,
    amount: number,
    maxTargets: number,
    onHit?: (target: Damageable) => void,
    source?: DamageSource,
    includeFacilities?: boolean,
  ): number;
  reportKill(unit: CombatUnit): void;
}
