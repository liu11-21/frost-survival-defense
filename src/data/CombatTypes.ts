/**
 * Shared vocabulary for everything that fights. Kept free of Babylon imports so
 * the data layer stays pure.
 */

export type Faction = "ally" | "enemy";

/** The level tier the boss occupies. Used to key "vs boss" rules off a
 * numeric threshold instead of checking any unit's id or name. */
export const BOSS_TIER_LEVEL = 6;

export type AttackType = "meleeArea" | "meleeSingle" | "rangedSingle" | "rangedArea" | "heal" | "none";

/** Attack-speed words from the design brief, resolved to real seconds. */
export const ATTACK_SPEED = {
  veryFast: 0.35,
  fast: 0.5,
  mediumFast: 0.7,
  medium: 1.0,
  mediumSlow: 1.4,
  slow: 1.8,
} as const;

/** Range vocabulary from the design brief. */
export const RANGE = {
  melee: 2.2,
  meleeArea: 2.0,
  mid: 8,
  midLarge: 11,
  large: 14,
  tauntSmall: 5,
  tauntMid: 8,
} as const;

export interface ResourceCost {
  wood?: number;
  stone?: number;
  gold?: number;
}

export interface UnitDefinition {
  id: string;
  name: string;
  maxHealth: number;
  attackPower: number;
  attackInterval: number;
  attackRange: number;
  attackType: AttackType;
  /** Radius of the splash for `meleeArea` / `rangedArea`. */
  areaRadius?: number;
  /** How many individuals a single recruited squad contains. */
  squadSize: number;
  recruitCost?: number;
  /** Enemy tier, 1..6. Used for "highest level" targeting and gold value. */
  level?: number;
  /** Gold dropped per individual on death. */
  goldValue?: number;
  /** Radius inside which this unit forces enemies to attack it. */
  tauntRadius?: number;
  /** Whether the taunt also drags buildings' attackers. */
  tauntAffectsBuildings?: boolean;
  moveSpeed: number;
  /** Body scale multiplier for the lite humanoid rig. */
  scale: number;
  /** Palette key in UnitVisuals. */
  visual: string;
  /** Max targets a single area hit may damage. */
  maxAreaTargets?: number;
  /** Assault trooper: blink to the highest-level enemy the moment it spawns. */
  ambushOnSpawn?: boolean;
  /** Seconds of complete immunity granted right after the ambush blink. */
  ambushInvulnerableTime?: number;
  /** Second protection phase after immunity expires. */
  ambushShieldTime?: number;
  ambushShieldFactor?: number;
  /** Extra damage this unit deals to walls, towers and other structures. */
  siegeMultiplier?: number;
  /** Overrides the faction-default projectile mesh, e.g. Musketeer's ball vs the Archer's arrow. */
  projectileKind?: "arrow" | "bolt" | "orb" | "shell" | "musketBall" | "arcaneMeteor";
  /** Overrides the generic attack swoosh with a unit-specific sound. */
  attackSoundOverride?: string;

  // ----------------------------------------------------------- v5 units ----

  /** Engineer: independently seeks and repairs attackable structures. */
  canRepair?: boolean;
  /** Temporary three-person escort summoned by the hero's Ground Support.
   * It never consumes recruitment capacity and only fights after enemies have
   * reached the hero target tier. */
  temporaryGroundSupport?: boolean;

  /** Musketeer-style bonus damage by the target's level tier. Ranges are
   * inclusive; multiple entries may apply to different tiers at once. */
  bonusVsTier?: ReadonlyArray<{ minLevel: number; maxLevel?: number; multiplier: number }>;

  /** Musketeer-style on-hit slow, stacking up to `maxStacks`. `bossAmount`
   * overrides `amount` when the target is the top-tier boss unit. */
  slowOnHit?: {
    amount: number;
    duration: number;
    maxStacks: number;
    bossAmount: number;
  };

  /** Frost Sorcerer's normal-attack AoE slow. Refreshes rather than stacking. */
  aoeSlow?: {
    amount: number;
    duration: number;
    bossAmount: number;
    bossDuration: number;
  };

  /** Frost Sorcerer's periodic Freeze Zone at the densest enemy cluster. */
  freezeZone?: {
    interval: number;
    radius: number;
    stunDuration: number;
    slowAmount: number;
    slowDuration: number;
    bossSlowAmount: number;
    bossSlowDuration: number;
    /** Seconds a target is immune to a fresh stun after one wears off. */
    ccImmunity: number;
  };

  /** Ice Armor Heavy's damage-value-gated mitigation, data-driven by the raw
   * incoming hit, never by attacker identity. */
  armor?: {
    /** Hits dealing less than this raw amount are halved while HP > breakAtPercent. */
    threshold: number;
    breakAtPercent: number;
    moveBonusAfterBreak: number;
  };

  /** Commander's non-stacking buff aura for nearby enemies. */
  aura?: {
    radius: number;
    moveBonus: number;
    attackSpeedBonus: number;
  };
  /** Allies treat this unit as a higher-priority auto-target than usual. */
  priorityTarget?: boolean;
  /** Prefers to hold behind the front line rather than close to melee. */
  holdBack?: boolean;

  /** Ice Bomber's armed-countdown self-destruct. */
  selfDestruct?: {
    armDelay: number;
    /** Distance to a valid target that starts the countdown. */
    triggerRange: number;
    radius: number;
    alliesDamage: number;
    structuresDamage: number;
    furnaceDamage: number;
    /** Fraction of the full values dealt if killed mid-countdown. */
    earlyKillFactor: number;
    earlyKillRadius: number;
  };

  /** Breacher: always attacks the lane's blocking wall before anything else. */
  siegeFocus?: boolean;
  /** Seconds stunned after breaking through a wall. */
  postBreachStun?: number;
}

export interface DamageEvent {
  amount: number;
  sourceFaction: Faction;
  /** World position the blow landed at, used for VFX. */
  x: number;
  z: number;
}
