import type { CollisionWorld } from "../util/Collision";
import type { CombatWorld } from "./CombatWorld";
import type { Damageable } from "./Damageable";
import type { ProjectilePool } from "./ProjectilePool";
import type { CombatUnit } from "./CombatUnit";

/** Effects the combat layer can request without knowing how they are produced. */
export interface CombatVfx {
  meleeHit(x: number, z: number): void;
  rangedHit(x: number, z: number): void;
  areaBlast(x: number, z: number, radius: number): void;
  heal(x: number, z: number): void;
  repair(x: number, z: number): void;
  /** Generic passthrough to any registered particle burst, for one-off abilities. */
  burstAt(key: string, x: number, z: number, count: number): void;
  /** Large, readable cast marker for the hero's manual and automatic skills. */
  heroSkill(
    kind: "airSupport" | "infiniteFirepower" | "groundSupport" | "seismicWave",
    x: number,
    z: number,
    radius: number,
  ): void;
  /** A visible descending bombardment marker for Air Support's three hits. */
  airStrike(x: number, z: number, radius: number): void;
  /** Persistent flame patches for Air Support and mortar burn zones. */
  groundFire(x: number, z: number, radius: number, duration: number): void;
  taunt(x: number, z: number, radius: number): void;
  teleport(x: number, z: number): void;
  unitDeath(x: number, z: number, level: number): void;
  buildingHit(x: number, z: number): void;
  sound(name: string, volume?: number, pitch?: number): void;
  /** Floating combat text. Merged per target over a short window. */
  damageNumber(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void;
  /** A unit or structure's health changed; the bar manager reveals its bar. */
  healthChanged(target: Damageable): void;
  /** Announces a newly spawned unit so its bar can be shown briefly. */
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
  /** Applies damage and routes the hit feedback. */
  damage(target: Damageable, amount: number, fromX: number, fromZ: number): void;
  /**
   * Splash damage centred on a point. Returns how many targets were hit.
   * `onHit`, when given, runs once per unit actually damaged — e.g. for an
   * on-hit slow that must only land on things the blast really reached.
   */
  areaDamage(
    attackerFaction: "ally" | "enemy",
    x: number,
    z: number,
    radius: number,
    amount: number,
    maxTargets: number,
    onHit?: (target: Damageable) => void,
  ): number;
  /** Called once per individual death so gold can drop. */
  reportKill(unit: CombatUnit): void;
}
