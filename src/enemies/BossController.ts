import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import type { GameEvents } from "../game/GameEvents";

export type BossPhase = 1 | 2 | 3;

export const BOSS_RULES = {
  /** Health fractions at which the next phase begins. */
  phase2At: 0.7,
  phase3At: 0.35,
  slam: {
    cooldown: 8,
    /** Telegraph length. The danger ring is visible for this whole time. */
    windup: 1.2,
    radius: 5,
    /** Damage as a share of the victim's own max health, hard-capped. */
    maxHealthFraction: 0.35,
    /** Structures take half. */
    structureFactor: 0.5,
    baseDamage: 260,
  },
  phase3: {
    attackSpeedBonus: 0.3,
    moveSpeedBonus: 0.15,
    towerDamageReduction: 0.4,
  },
  /** Each consecutive hit from one tower is worth 5% less, to a 30% floor. */
  adaptation: {
    perHit: 0.05,
    max: 0.3,
    /** Layers decay after this long without that tower landing a hit. */
    decayAfter: 3,
    decayPerSecond: 0.1,
  },
};

interface TowerAdaptation {
  stacks: number;
  lastHitAt: number;
}

/**
 * Drives the boss's three phases.
 *
 * The design goal is that the boss threatens squads without erasing them: the
 * slam is always telegraphed, its damage is capped as a share of each victim's
 * own maximum health, and phase three answers tower-stacking with a per-tower
 * adaptation rather than a flat immunity.
 */
export class BossController {
  private unit: CombatUnit | null = null;
  private phase: BossPhase = 1;
  private slamTimer = BOSS_RULES.slam.cooldown;
  private windup = -1;
  private clock = 0;
  private readonly adaptation = new Map<number, TowerAdaptation>();
  private readonly ring: Mesh;
  private readonly ringMaterial: StandardMaterial;
  private readonly slamCentre = new Vector3();
  /** Largest share of any victim max health a slam has dealt, for tests. */
  lastSlamFraction = 0;

  constructor(
    scene: Scene,
    private readonly events: GameEvents,
  ) {
    this.ringMaterial = new StandardMaterial("mat.bossSlam", scene);
    this.ringMaterial.emissiveColor = new Color3(1, 0.25, 0.18);
    this.ringMaterial.diffuseColor = Color3.Black();
    this.ringMaterial.specularColor = Color3.Black();
    this.ringMaterial.disableLighting = true;
    this.ringMaterial.alpha = 0.42;

    this.ring = MeshBuilder.CreateDisc("bossSlamRing", { radius: 1, tessellation: 36 }, scene);
    this.ring.material = this.ringMaterial;
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 0.06;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);
  }

  get active(): boolean {
    return this.unit !== null && this.unit.alive;
  }
  get currentPhase(): BossPhase {
    return this.phase;
  }
  get boss(): CombatUnit | null {
    return this.unit;
  }
  /** 0..1 while the slam is charging, -1 when idle. Drives the warning bar. */
  get slamProgress(): number {
    return this.windup < 0 ? -1 : Math.min(1, this.windup / BOSS_RULES.slam.windup);
  }
  get hasTowerResistance(): boolean {
    return this.phase === 3;
  }

  attach(unit: CombatUnit): void {
    this.unit = unit;
    this.phase = 1;
    this.slamTimer = BOSS_RULES.slam.cooldown;
    this.windup = -1;
    this.adaptation.clear();
    this.events.emit("bossSpawned", { name: unit.def.name, maxHealth: unit.maxHealth });
  }

  detach(): void {
    if (this.unit) this.events.emit("bossDefeated", {});
    this.unit = null;
    this.windup = -1;
    this.ring.setEnabled(false);
    this.adaptation.clear();
  }

  /**
   * Damage scaling a tower gets against the boss. Every consecutive hit from
   * the same tower is worth slightly less, so stacking one firing line stops
   * being the whole answer — but the hero and squads are never affected.
   */
  towerDamageFactor(towerId: number): number {
    if (this.phase !== 3) return 1;
    const entry = this.adaptation.get(towerId);
    const stacked = entry ? entry.stacks * BOSS_RULES.adaptation.perHit : 0;
    const capped = Math.min(BOSS_RULES.adaptation.max, stacked);
    return (1 - BOSS_RULES.phase3.towerDamageReduction) * (1 - capped);
  }

  /** Called whenever a tower's shell actually damages the boss. */
  registerTowerHit(towerId: number): void {
    const entry = this.adaptation.get(towerId);
    if (entry) {
      entry.stacks = Math.min(BOSS_RULES.adaptation.max / BOSS_RULES.adaptation.perHit, entry.stacks + 1);
      entry.lastHitAt = this.clock;
    } else {
      this.adaptation.set(towerId, { stacks: 1, lastHitAt: this.clock });
    }
  }

  update(dt: number, ctx: CombatContext): void {
    this.clock += dt;
    const unit = this.unit;
    if (!unit || !unit.alive) {
      if (this.unit) this.detach();
      return;
    }

    this.updatePhase(unit);
    this.decayAdaptation(dt);

    if (this.phase < 2) {
      this.ring.setEnabled(false);
      return;
    }

    if (this.windup >= 0) {
      this.windup += dt;
      const t = Math.min(1, this.windup / BOSS_RULES.slam.windup);
      // The ring grows into its final size so the danger zone is unmissable.
      const r = BOSS_RULES.slam.radius * (0.35 + 0.65 * t);
      this.ring.position.set(this.slamCentre.x, 0.06, this.slamCentre.z);
      this.ring.scaling.set(r, r, r);
      this.ringMaterial.alpha = 0.25 + 0.35 * t;
      if (this.windup >= BOSS_RULES.slam.windup) this.executeSlam(ctx);
      return;
    }

    this.ring.setEnabled(false);
    this.slamTimer -= dt;
    if (this.slamTimer <= 0) this.beginSlam(unit, ctx);
  }

  private updatePhase(unit: CombatUnit): void {
    const ratio = unit.health / Math.max(1, unit.maxHealth);
    const next: BossPhase = ratio <= BOSS_RULES.phase3At ? 3 : ratio <= BOSS_RULES.phase2At ? 2 : 1;
    if (next === this.phase) return;
    this.phase = next;
    if (next === 3) {
      unit.applySpeedBonus(BOSS_RULES.phase3.attackSpeedBonus, BOSS_RULES.phase3.moveSpeedBonus);
    }
    this.events.emit("bossPhaseChanged", { phase: next });
  }

  private decayAdaptation(dt: number): void {
    for (const [id, entry] of this.adaptation) {
      if (this.clock - entry.lastHitAt < BOSS_RULES.adaptation.decayAfter) continue;
      entry.stacks -= BOSS_RULES.adaptation.decayPerSecond * dt / BOSS_RULES.adaptation.perHit;
      if (entry.stacks <= 0) this.adaptation.delete(id);
    }
  }

  private beginSlam(unit: CombatUnit, ctx: CombatContext): void {
    this.windup = 0;
    this.slamCentre.copyFrom(unit.position);
    this.ring.setEnabled(true);
    ctx.vfx.sound("bossSlamWindup", 0.9);
    this.events.emit("bossSlamWarning", {});
  }

  private executeSlam(ctx: CombatContext): void {
    this.windup = -1;
    this.slamTimer = BOSS_RULES.slam.cooldown;
    this.ring.setEnabled(false);

    const cx = this.slamCentre.x;
    const cz = this.slamCentre.z;
    const r = BOSS_RULES.slam.radius;

    // Damage is capped per victim as a share of their own maximum health, so a
    // full-strength squad is always left standing and able to retreat.
    const allies = ctx.world.queryUnits("ally", cx, cz, r);
    for (const ally of allies) {
      if (!ally.alive) continue;
      const cap = ally.maxHealth * BOSS_RULES.slam.maxHealthFraction;
      const dealt = Math.min(BOSS_RULES.slam.baseDamage, cap);
      this.lastSlamFraction = Math.max(this.lastSlamFraction, dealt / ally.maxHealth);
      ctx.damage(ally, dealt, cx, cz);
    }
    const hero = ctx.world.hero;
    if (hero?.alive) {
      const dx = hero.position.x - cx;
      const dz = hero.position.z - cz;
      if (dx * dx + dz * dz <= r * r) {
        const cap = hero.maxHealth * BOSS_RULES.slam.maxHealthFraction;
        ctx.damage(hero, Math.min(BOSS_RULES.slam.baseDamage, cap), cx, cz);
      }
    }
    for (const structure of ctx.world.structures) {
      if (!structure.alive) continue;
      const dx = structure.position.x - cx;
      const dz = structure.position.z - cz;
      if (dx * dx + dz * dz > (r + structure.hitRadius) * (r + structure.hitRadius)) continue;
      ctx.damage(structure, BOSS_RULES.slam.baseDamage * BOSS_RULES.slam.structureFactor, cx, cz);
    }

    ctx.vfx.areaBlast(cx, cz, r);
    ctx.vfx.sound("bossSlam", 1);
    this.events.emit("bossSlamLanded", {});
  }

  /** The slam ring is a danger zone medics and archers must never stand in. */
  dangerZone(): { x: number; z: number; radius: number } | null {
    if (this.windup < 0) return null;
    return { x: this.slamCentre.x, z: this.slamCentre.z, radius: BOSS_RULES.slam.radius };
  }

  dispose(): void {
    this.ring.dispose();
    this.ringMaterial.dispose();
  }
}
