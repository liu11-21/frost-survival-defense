import { Vector3 } from "@babylonjs/core";
import type { Faction, UnitDefinition } from "../data/CombatTypes";

import type { FormationSlotManager } from "../ai/FormationSlotManager";
import type { FriendlyBrain } from "../ai/FriendlyStateMachine";
import { validateTarget } from "../ai/TargetValidator";
import { CombatAnimator } from "./CombatAnimator";
import type { CombatContext } from "./CombatContext";
import { allocateDamageId, type Damageable, type TargetKind } from "./Damageable";
import type { LiteRig } from "./LiteHumanoid";
import { motorFace, motorMove, motorReposition, refreshTaunt, reportDamage } from "./UnitMotor";
import { corpseExpired, fadeCorpse, newCorpseState } from "./UnitDeath";
import { updateEnemyBrain } from "./EnemyBrain";
import { resolveUnitAttack } from "./UnitAttacks";
import { acquireAllyTarget, acquireEnemyTarget, approachRange, stopRadius } from "./UnitTargeting";
import { earlyDetonate } from "./BomberLogic";
import { CombatUnitAbilities } from "./CombatUnitAbilities";
import { UnitStatusEffects } from "./UnitStatusEffects";
import { crossesBreakPoint, mitigate } from "./ArmorLogic";
import { ALLY_PROGRESSION, allyUpgradeMultiplier } from "../data/AllyProgressionConfig";

const TAUNT_CHECK_INTERVAL = 0.4;

/** One logical HP pool displayed by several escort members. */
export interface SharedHealthPool {
  health: number;
  maxHealth: number;
  members: CombatUnit[];
  resolvingDeath: boolean;
}

/**
 * One individual fighter.
 *
 * Allies are driven by a `FriendlyBrain` through the motor API below; enemies
 * run the compact inline logic in `updateEnemy`. Both share targeting,
 * validation, attack resolution and the animator's hit-frame contract.
 */
export class CombatUnit implements Damageable {
  readonly damageId = allocateDamageId();
  readonly position = new Vector3();
  readonly kind: TargetKind = "unit";
  /** Bumped whenever this instance is reused, so stale references are detectable. */
  generation = 1;

  private healthValue: number;
  private maxHealthValue: number;
  private sharedHealth: SharedHealthPool | null = null;
  private _alive = true;
  private readonly corpse = newCorpseState();

  private yaw = 0;
  private speed = 0;
  private attackTimer = 0;
  private tauntTimer = Math.random() * TAUNT_CHECK_INTERVAL;
  private reachCheck = Math.random() * 0.35;
  private damageReduction = 0;
  private damageReductionTimer = 0;
  private phasedDamageReduction = 0;
  private phasedDamageReductionTimer = 0;
  private nextPhasedDamageReduction = 0;
  private nextPhasedDamageReductionDuration = 0;
  private target: Damageable | null = null;
  private tauntSource: CombatUnit | null = null;
  private brain: FriendlyBrain | null = null;
  /** Extra multiplier applied to damage this unit deals to structures. */
  siegeMultiplier = 1;
  private attackSpeedBonus = 0;
  private moveSpeedBonus = 0;
  private allyUpgradeLevelValue = 0;
  private vulnerability = 0;
  private vulnerabilityTimer = 0;
  private groundSupportEngagedValue = false;

  /** Slows and the Freeze Zone stun/immunity window — see `UnitStatusEffects`. */
  private readonly status = new UnitStatusEffects();
  /** Bomber countdown, Commander's aura and Frost Sorcerer's Freeze Zone. */
  private readonly abilities: CombatUnitAbilities;

  /** Ice Armor Heavy only: true once the HP-threshold break has fired. */
  armorBroken = false;
  /** Ice Bomber only: armed-countdown state, read and written by BomberLogic. */
  bomberArmed = false;
  bomberCountdown = 0;
  bomberWarnTimer = 0;

  /** Enemy navigation writes these. */
  navPoint: Vector3 | null = null;
  breachTarget: Damageable | null = null;
  laneIndex = 0;
  navLastX = 0;
  navLastZ = 0;
  navStuck = 0;
  home: Vector3 | null = null;

  private readonly animator: CombatAnimator;
  private readonly toTarget = new Vector3();
  private readonly steer = new Vector3();

  constructor(
    readonly def: UnitDefinition,
    readonly faction: Faction,
    private readonly rig: LiteRig,
    private readonly ctx: CombatContext,
    private readonly healthMultiplier: number,
    private readonly attackMultiplier: number,
    readonly squadId: number,
  ) {
    this.maxHealthValue = Math.max(1, Math.round(def.maxHealth * healthMultiplier));
    this.healthValue = this.maxHealthValue;
    this.animator = new CombatAnimator(rig);
    this.animator.onHitFrame = () => this.resolveAttack();
    this.abilities = new CombatUnitAbilities(this, ctx);
  }

  attachBrain(brain: FriendlyBrain): void {
    this.brain = brain;
  }

  get alive(): boolean { return this._alive; }
  get health(): number { return this.sharedHealth?.health ?? this.healthValue; }
  private set health(value: number) {
    if (this.sharedHealth) this.sharedHealth.health = value;
    else this.healthValue = value;
  }
  get maxHealth(): number { return this.sharedHealth?.maxHealth ?? this.maxHealthValue; }
  private set maxHealth(value: number) {
    if (this.sharedHealth) this.sharedHealth.maxHealth = value;
    else this.maxHealthValue = value;
  }
  get readyToRemove(): boolean { return !this._alive && corpseExpired(this.corpse); }
  /** Seconds since death, for the tests and the squad HUD. */
  get corpseAge(): number { return this._alive ? 0 : this.corpse.elapsed; }
  get displayName(): string {
    return this.faction === "ally" && !this.def.canRepair && this.allyUpgradeLevelValue > 0
      ? `${this.def.name} +${this.allyUpgradeLevelValue}`
      : this.def.name;
  }
  get hitRadius(): number { return 0.42 * this.def.scale; }
  get level(): number { return this.def.level ?? 0; }
  get threat(): number { return this.attackPower; }
  get attackPower(): number {
    return this.def.attackPower * this.attackMultiplier * allyUpgradeMultiplier(this.allyUpgradeLevelValue);
  }
  get allyUpgradeLevel(): number { return this.allyUpgradeLevelValue; }
  get supportPowerMultiplier(): number { return allyUpgradeMultiplier(this.allyUpgradeLevelValue); }
  get tauntRadius(): number {
    if (this.def.temporaryGroundSupport && !this.groundSupportEngagedValue) return 0;
    return this.def.tauntRadius ?? 0;
  }
  get tauntAffectsBuildings(): boolean { return this.def.tauntAffectsBuildings === true; }
  get currentTarget(): Damageable | null { return this.target; }
  get aiState(): string { return this.brain ? this.brain.state : "enemy"; }
  get aiBrain(): FriendlyBrain | null { return this.brain; }
  get recoverTime(): number {
    return Math.min(0.5, this.effectiveInterval * 0.35);
  }
  get movementSpeed(): number {
    return this.speed;
  }
  /** Effective interval and speed, including any boss-phase bonuses. */
  get effectiveInterval(): number {
    const upgradeSpeed = this.faction === "ally"
      ? this.allyUpgradeLevelValue * ALLY_PROGRESSION.statPerLevel
      : 0;
    return this.def.attackInterval / (1 + upgradeSpeed + this.attackSpeedBonus + this.abilities.auraAttackBonus);
  }
  get effectiveMoveSpeed(): number {
    return this.def.moveSpeed * (1 + this.moveSpeedBonus + this.abilities.auraMoveBonus) * (1 - this.slowFactor);
  }
  get tauntSourceRef(): CombatUnit | null {
    return this.tauntSource;
  }
  get slowFactor(): number {
    return this.status.slowFactor;
  }
  get isStunned(): boolean {
    return this.status.isStunned;
  }
  get activeDamageReduction(): number {
    return Math.max(this.damageReduction, this.phasedDamageReduction);
  }
  get phasedProtectionRemaining(): number {
    return Math.max(0, this.phasedDamageReductionTimer) + this.nextPhasedDamageReductionDuration;
  }
  get vulnerabilityRemaining(): number { return Math.max(0, this.vulnerabilityTimer); }
  get vulnerabilityFactor(): number { return this.vulnerability; }
  get groundSupportEngaged(): boolean { return this.groundSupportEngagedValue; }

  attachSharedHealth(pool: SharedHealthPool): void {
    this.sharedHealth = pool;
    if (!pool.members.includes(this)) pool.members.push(this);
  }

  setGroundSupportEngaged(engaged: boolean): void {
    this.groundSupportEngagedValue = this.def.temporaryGroundSupport === true && engaged;
  }

  applyVulnerability(factor: number, seconds: number): void {
    this.vulnerability = Math.max(this.vulnerability, Math.max(0, factor));
    this.vulnerabilityTimer = Math.max(this.vulnerabilityTimer, Math.max(0, seconds));
  }

  applyKnockback(fromX: number, fromZ: number, distance: number): void {
    const dx = this.position.x - fromX;
    const dz = this.position.z - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.001 || distance <= 0) return;
    this.position.x += (dx / len) * distance;
    this.position.z += (dz / len) * distance;
    this.ctx.collision.resolve(this.position, this.hitRadius, Infinity, this.faction);
    this.rig.root.position.copyFrom(this.position);
  }

  applySlowStack(amount: number, duration: number, maxStacks: number): void {
    this.status.applySlowStack(amount, duration, maxStacks);
  }

  applySlowRefresh(amount: number, duration: number): void {
    this.status.applySlowRefresh(amount, duration);
  }

  applyStun(duration: number, ccImmunity: number): boolean {
    return this.status.applyStun(duration, ccImmunity);
  }

  /** Boss phase three. Permanent for the remainder of that unit's life. */
  applySpeedBonus(attackBonus: number, moveBonus: number): void {
    this.attackSpeedBonus = attackBonus;
    this.moveSpeedBonus = moveBonus;
  }

  /** Applies a run-local class upgrade to an already deployed or new ally. */
  applyAllyUpgradeLevel(level: number): void {
    if (this.faction !== "ally" || this.def.canRepair) return;
    const next = Math.max(0, Math.floor(level));
    if (next === this.allyUpgradeLevelValue) return;
    const previousMax = this.maxHealth;
    this.allyUpgradeLevelValue = next;
    this.maxHealth = Math.max(
      1,
      Math.round(this.def.maxHealth * this.healthMultiplier * allyUpgradeMultiplier(next)),
    );
    // An upgrade grants its new HP immediately without erasing existing damage.
    this.health = Math.min(this.maxHealth, this.health + Math.max(0, this.maxHealth - previousMax));
  }

  setPosition(x: number, z: number): void {
    this.position.set(x, 0, z);
    this.rig.root.position.copyFrom(this.position);
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.rig.root.rotation.y = yaw;
  }

  grantDamageReduction(factor: number, seconds: number): void {
    this.damageReduction = factor;
    this.damageReductionTimer = seconds;
  }

  /**
   * Two consecutive protection stages. Assault uses 3s at 100% reduction,
   * followed by 3s at 50%; a large simulation step may cross both safely.
   */
  grantPhasedDamageReduction(
    firstFactor: number,
    firstSeconds: number,
    secondFactor: number,
    secondSeconds: number,
  ): void {
    this.phasedDamageReduction = Math.max(0, Math.min(1, firstFactor));
    this.phasedDamageReductionTimer = Math.max(0, firstSeconds);
    this.nextPhasedDamageReduction = Math.max(0, Math.min(1, secondFactor));
    this.nextPhasedDamageReductionDuration = Math.max(0, secondSeconds);
    if (this.phasedDamageReductionTimer <= 0) this.advancePhasedDamageReduction(0);
  }

  applyDamage(amount: number, _fromX: number, _fromZ: number): void {
    if (!this._alive) return;
    const raw = mitigate(this.def.armor, this.armorBroken, amount);
    const taken = raw * (1 + this.vulnerability) * (1 - this.activeDamageReduction);
    this.health -= taken;
    this.animator.flashHit();
    reportDamage(this, this.ctx, taken, "damage");
    if (this.health <= 0) {
      this.health = 0;
      if (this.sharedHealth && !this.sharedHealth.resolvingDeath) {
        this.sharedHealth.resolvingDeath = true;
        for (const member of this.sharedHealth.members) member.die();
      } else if (!this.sharedHealth) {
        this.die();
      }
      return;
    }
    if (crossesBreakPoint(this.def.armor, this.armorBroken, this.health, this.maxHealth)) {
      this.armorBroken = true;
      this.moveSpeedBonus += this.def.armor?.moveBonusAfterBreak ?? 0;
      this.rig.setArmorVisible(false);
      this.ctx.vfx.burstAt("armorShatter", this.position.x, this.position.z, 22);
      this.ctx.vfx.sound("armorBreak", 0.7);
    }
  }

  heal(amount: number): void {
    if (!this._alive || this.health >= this.maxHealth) return;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    reportDamage(this, this.ctx, this.health - before, "heal");
  }

  /**
   * The one-shot death path. Everything that could keep a dead unit relevant is
   * released here — target, taunt, animation lock, formation slot and any armed
   * attack — and the guard makes sure none of it can run twice.
   */
  private die(reportKill = true): void {
    if (!this._alive || this.corpse.resolved) return;
    // Ice Bomber, killed mid-countdown: a smaller explosion still goes off.
    // The full-countdown detonation clears `bomberArmed` itself before it
    // kills the unit, so this never fires twice for the same blast.
    if (this.def.selfDestruct && this.bomberArmed) {
      this.bomberArmed = false;
      earlyDetonate(this, this.ctx, this.def.selfDestruct);
    }
    this._alive = false;
    this.corpse.resolved = true;
    this.corpse.elapsed = 0;
    this.generation += 1;
    this.target = null;
    this.tauntSource = null;
    this.breachTarget = null;
    this.navPoint = null;
    this.speed = 0;
    this.animator.abortAction();
    this.animator.setState("death");
    this.ctx.vfx.unitDeath(this.position.x, this.position.z, this.level);
    this.brain?.onDeath();
    if (reportKill) this.ctx.reportKill(this);
  }

  /** Skill summons leave the field without counting as a combat death. */
  withdraw(): void {
    this.die(false);
  }

  update(dt: number): void {
    if (!this._alive) {
      // Once `dispose()` has handed `this.rig` back to the template pool, it
      // may already belong to a brand-new unit. Touching it after that races
      // that unit's own writes every frame — the classic "alive unit stuck at
      // a frozen, shrunk pose" symptom, caused by a dead object nobody has
      // pruned yet, not by anything wrong with the live unit's own AI.
      if (this.corpse.recycled) return;
      this.corpse.elapsed += dt;
      this.animator.update(dt, 0);
      fadeCorpse(this.rig, this.corpse, this.def.scale);
      this.rig.root.position.x = this.position.x;
      this.rig.root.position.z = this.position.z;
      return;
    }

    // Protection durations are real combat time and must not become longer
    // just because the unit was stunned during the ambush window.
    if (this.damageReductionTimer > 0) {
      this.damageReductionTimer -= dt;
      if (this.damageReductionTimer <= 0) this.damageReduction = 0;
    }
    if (this.vulnerabilityTimer > 0) {
      this.vulnerabilityTimer -= dt;
      if (this.vulnerabilityTimer <= 0) {
        this.vulnerability = 0;
        this.vulnerabilityTimer = 0;
      }
    }
    if (this.phasedDamageReductionTimer > 0) {
      this.phasedDamageReductionTimer -= dt;
      if (this.phasedDamageReductionTimer <= 0) {
        this.advancePhasedDamageReduction(-this.phasedDamageReductionTimer);
      }
    }

    // Fully frozen while stunned: no movement, targeting or attack-cooldown
    // progress. `UnitStatusEffects` opens its own post-stun immunity window.
    if (this.status.tick(dt) === "stunned") {
      this.speed = 0;
      if (!this.animator.isBusy) this.animator.setState("idle");
      this.animator.update(dt, 0);
      this.rig.root.position.copyFrom(this.position);
      return;
    }

    if (this.attackTimer > 0) this.attackTimer -= dt;
    this.tauntTimer = refreshTaunt(this, this.ctx, dt, this.tauntTimer);

    if (this.brain) this.brain.update(dt);
    else this.updateEnemy(dt);
    this.abilities.tickFreezeZone(dt);

    if (!this.animator.isBusy) {
      this.animator.setState(this.speed > 0.35 ? "walk" : "idle");
    }
    this.animator.update(dt, this.speed);
    this.rig.root.position.copyFrom(this.position);
  }

  private advancePhasedDamageReduction(overflow: number): void {
    this.phasedDamageReduction = this.nextPhasedDamageReduction;
    this.phasedDamageReductionTimer = this.nextPhasedDamageReductionDuration - overflow;
    this.nextPhasedDamageReduction = 0;
    this.nextPhasedDamageReductionDuration = 0;
    if (this.phasedDamageReductionTimer <= 0) {
      this.phasedDamageReduction = 0;
      this.phasedDamageReductionTimer = 0;
    }
  }

  // -------------------------------------------------------- brain motor ----

  /** Nearest legal hostile, honouring an active taunt first. */
  findHostileTarget(): Damageable | null {
    if (this.def.temporaryGroundSupport && !this.groundSupportEngagedValue) {
      this.target = null;
      return null;
    }
    // General enemies enforce their wall/shield/... tier order inside
    // `acquireEnemyTarget`; an old taunt reference must not jump ahead of it.
    if (
      this.faction === "ally" &&
      this.tauntSource &&
      validateTarget(this, this.tauntSource) === "ok" &&
      this.canReach(this.tauntSource)
    ) {
      return this.tauntSource;
    }
    const found = this.faction === "ally" ? acquireAllyTarget(this, this.ctx) : acquireEnemyTarget(this, this.ctx);
    this.target = found;
    return found;
  }

  /**
   * Enemies may only commit to something a wall does not stand in front of.
   * Allies are inside the perimeter with the things they defend, so the test
   * would only ever cost them time.
   */
  canReach(target: Damageable): boolean {
    if (this.faction === "ally") return true;
    return this.ctx.world.reachable(this.position.x, this.position.z, target);
  }

  /** Drops an expired taunt and re-plans. */
  clearTaunt(): void {
    this.tauntSource = null;
    if (this.target && validateTarget(this, this.target) !== "ok") this.target = null;
    this.brain?.forceReacquire("tauntSourceLost");
  }

  /**
   * Accepts a new taunt source; null simply clears the current one. An
   * unreachable taunter is remembered but not chased — the next retarget will
   * pick the wall in the way instead.
   */
  applyTaunt(taunter: CombatUnit | null): void {
    this.tauntSource = taunter;
    if (!taunter) return;
    if (this.canReach(taunter)) this.target = taunter;
    this.brain?.forceReacquire("taunted");
  }

  setTarget(target: Damageable | null): void {
    this.target = target;
  }

  attackReach(target: Damageable): number {
    return approachRange(this, target) + stopRadius(target);
  }

  distanceTo(x: number, z: number): number {
    return Math.hypot(this.position.x - x, this.position.z - z);
  }

  canStartAttack(): boolean {
    return this.attackTimer <= 0 && !this.animator.isBusy && this.def.attackType !== "none";
  }

  /** Starts one swing and returns how long it should take. */
  beginStrike(kindOverride?: "cast"): number {
    const kind = kindOverride ?? (this.def.attackType === "rangedArea" ? "cast" : "attack");
    const duration = Math.min(this.effectiveInterval * 0.85, 0.6);
    this.attackTimer = this.effectiveInterval;
    this.animator.strike(duration, kind);
    this.ctx.vfx.sound(
      this.def.attackSoundOverride ?? (this.faction === "ally" ? "allyAttack" : "enemyAttack"),
      0.35,
      0.85 + Math.random() * 0.4,
    );
    return duration;
  }

  /** Frees a swing that never reached its hit frame. */
  clearAnimationLock(): void {
    this.animator.abortAction();
  }

  moveMotor(goalX: number, goalZ: number, dt: number, formation: FormationSlotManager | null): void {
    this.speed = motorMove(this, this.ctx, goalX, goalZ, dt, formation, this.steer, this.toTarget);
    this.faceMotor(goalX, goalZ, dt);
  }

  brakeMotor(dt: number): void {
    this.speed *= Math.exp(-10 * dt);
    if (this.speed < 0.05) this.speed = 0;
  }

  clearMotorVelocity(): void {
    this.speed = 0;
  }

  faceMotor(x: number, z: number, dt: number): void {
    this.yaw = motorFace(this.position, this.yaw, x, z, dt);
    this.rig.root.rotation.y = this.yaw;
  }

  /**
   * Last-resort correction. Moves a short way toward the rally point only —
   * never onto a target, never across a wall.
   */
  safeReposition(rally: Vector3 | null): void {
    motorReposition(this, this.ctx, rally);
    this.speed = 0;
  }

  // ------------------------------------------------------------- enemy -----

  private updateEnemy(dt: number): void {
    this.reachCheck = updateEnemyBrain(this, dt, this.reachCheck);
    this.abilities.tickEnemy(dt);
  }

  /** The animator's hit frame. Allies gate it through the brain's token. */
  private resolveAttack(): void {
    if (!this._alive) return;
    if (this.brain && !this.brain.onHitFrame()) return;
    const target = this.target;
    if (!target || validateTarget(this, target) !== "ok") return;
    resolveUnitAttack(this, target, this.ctx);
  }

  /**
   * Releases the visual back to its template pool and invalidates every
   * reference anyone might still be holding. Safe to call twice.
   */
  dispose(): void {
    if (this.corpse.recycled) return;
    this.corpse.recycled = true;
    this.generation += 1;
    this.target = null;
    this.tauntSource = null;
    this.breachTarget = null;
    this.navPoint = null;
    this.rig.release();
  }
}
