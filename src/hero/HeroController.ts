import { Scene, Vector3 } from "@babylonjs/core";
import { CharacterAvatar, createPlayerAvatar } from "../character/CharacterFactory";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import { allocateDamageId, type Damageable, type TargetKind } from "../combat/Damageable";
import { HERO_MELEE, HERO_REVIVE } from "../data/UnitDefinitions";
import { MAP } from "../data/BuildSlotDefinitions";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { CollisionWorld } from "../util/Collision";
import { yawFromDirection } from "../util/MathUtil";
import type { GameCamera } from "../camera/GameCamera";
import type { PlayerInput } from "../player/PlayerInput";
import type { HeroStats } from "./HeroStats";

const RETARGET_INTERVAL = 0.35;

/**
 * The hero: movement, resource gathering, and an attack that switches between
 * ranged and melee purely by distance. There is no weapon-swap input.
 */
export class HeroController implements Damageable {
  readonly damageId = allocateDamageId();
  readonly faction = "ally" as const;
  readonly kind: TargetKind = "hero";
  readonly displayName = "主角";
  readonly level = 0;
  readonly avatar: CharacterAvatar;
  readonly velocity = new Vector3();

  health: number;
  private _alive = true;
  private downTimer = 0;
  private attackTimer = 0;
  private target: CombatUnit | null = null;
  private retargetTimer = 0;
  private meleeSlow = 0;
  private speed = 0;
  private footAccumulator = 0;

  private readonly desired = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();

  /** Set on the gather swing's hit frame, consumed by the gathering system. */
  private gatherHitPending = false;
  private gatherSwing = false;

  onFootstep: (() => void) | null = null;
  onDeath: (() => void) | null = null;
  onRevive: (() => void) | null = null;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    private readonly stats: HeroStats,
    private readonly ctx: CombatContext,
    private readonly collision: CollisionWorld,
  ) {
    this.avatar = createPlayerAvatar(scene, materials);
    this.avatar.rig.root.scaling.setAll(0.78);
    this.avatar.position.set(0, 0, -4.5);
    this.avatar.setYawImmediate(Math.PI);
    this.health = stats.maxHealth;
    this.avatar.animator.onChopHit = () => this.onSwingHit();
  }

  get position(): Vector3 {
    return this.avatar.position;
  }
  get alive(): boolean {
    return this._alive;
  }
  get isDown(): boolean {
    return !this._alive;
  }
  get downRemaining(): number {
    return Math.max(0, this.downTimer);
  }
  get hitRadius(): number {
    return 0.45;
  }
  get maxHealth(): number {
    return this.stats.maxHealth;
  }
  get threat(): number {
    return this.stats.rangedAttack * 1.5;
  }
  get healthPercent(): number {
    return this.health / this.stats.maxHealth;
  }
  get currentTarget(): CombatUnit | null {
    return this.target;
  }
  get facingYaw(): number {
    return this.avatar.rig.root.rotation.y;
  }
  /** True while the hero is close enough to a target to be swinging. */
  get inMelee(): boolean {
    if (!this.target) return false;
    const d = distanceXZ(this.position, this.target.position);
    return d <= HERO_MELEE.threshold + this.target.hitRadius;
  }

  applyDamage(amount: number, _fromX: number, _fromZ: number): void {
    if (!this._alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.goDown();
    }
  }

  heal(amount: number): void {
    if (!this._alive) return;
    this.health = Math.min(this.stats.maxHealth, this.health + amount);
  }

  /** Applied when the furnace level or a run upgrade changes the hero's cap. */
  refreshMaxHealth(previousMax: number): void {
    const delta = this.stats.maxHealth - previousMax;
    if (delta > 0 && this._alive) this.health += delta;
    this.health = Math.min(this.health, this.stats.maxHealth);
  }

  private goDown(): void {
    this._alive = false;
    this.downTimer = HERO_REVIVE.downTime;
    this.target = null;
    this.velocity.setAll(0);
    this.avatar.animator.setState("frozen");
    this.avatar.animator.setRiseProgress(0);
    this.ctx.vfx.sound("heroDown", 1);
    this.onDeath?.();
  }

  private revive(): void {
    this._alive = true;
    this.health = Math.ceil(this.stats.maxHealth * HERO_REVIVE.healthFraction);
    this.avatar.position.set(0, 0, -MAP.furnaceRadius - 1.4);
    this.avatar.animator.setState("wakeUp");
    this.avatar.animator.setRiseProgress(1);
    this.ctx.vfx.sound("heroRevive", 1);
    this.onRevive?.();
  }

  setPosition(x: number, z: number): void {
    this.avatar.position.set(x, 0, z);
  }

  resetForNewRun(): void {
    this._alive = true;
    this.health = this.stats.maxHealth;
    this.downTimer = 0;
    this.target = null;
    this.avatar.position.set(0, 0, -4.5);
    this.avatar.setYawImmediate(Math.PI);
    this.avatar.animator.setState("idle");
    this.avatar.animator.setRiseProgress(1);
  }

  update(dt: number, input: PlayerInput, camera: GameCamera, inputLocked: boolean): void {
    if (!this._alive) {
      this.downTimer -= dt;
      this.avatar.animator.update(dt, 0, 0);
      if (this.downTimer <= 0) this.revive();
      return;
    }

    this.updateMovement(dt, input, camera, inputLocked);
    this.updateCombat(dt);
    this.avatar.setVelocity(this.velocity);
    this.avatar.update(dt, this.speed, 0);
  }

  private updateMovement(dt: number, input: PlayerInput, camera: GameCamera, locked: boolean): void {
    const hasInput = !locked && input.hasMoveInput;
    if (hasInput) {
      camera.getForwardXZ(this.forward);
      camera.getRightXZ(this.right);
      this.desired.set(
        this.forward.x * input.moveZ + this.right.x * input.moveX,
        0,
        this.forward.z * input.moveZ + this.right.z * input.moveX,
      );
      const len = Math.hypot(this.desired.x, this.desired.z) || 1;
      this.desired.x /= len;
      this.desired.z /= len;
    } else {
      this.desired.setAll(0);
    }

    const sprint = input.sprinting && !locked ? 1.35 : 1;
    const slow = this.meleeSlow > 0 ? HERO_MELEE.slowFactor : 1;
    const maxSpeed = this.stats.moveSpeed * sprint * slow;
    const targetVX = this.desired.x * maxSpeed;
    const targetVZ = this.desired.z * maxSpeed;
    const step = (hasInput ? 30 : 34) * dt;
    const dvx = targetVX - this.velocity.x;
    const dvz = targetVZ - this.velocity.z;
    const dLen = Math.hypot(dvx, dvz);
    if (dLen <= step || dLen < 1e-4) {
      this.velocity.x = targetVX;
      this.velocity.z = targetVZ;
    } else {
      this.velocity.x += (dvx / dLen) * step;
      this.velocity.z += (dvz / dLen) * step;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.collision.resolve(this.position, 0.42, MAP.playableRadius, "ally");

    if (this.meleeSlow > 0) this.meleeSlow -= dt;

    if (this.speed > 0.5) {
      this.footAccumulator += this.speed * dt;
      if (this.footAccumulator >= 1.5) {
        this.footAccumulator = 0;
        this.onFootstep?.();
      }
    }

    // Face the target when fighting, otherwise face where we are going.
    if (this.target) {
      this.avatar.turnTowards(
        yawFromDirection(this.target.position.x - this.position.x, this.target.position.z - this.position.z),
        11,
        dt,
      );
    } else if (this.speed > 0.25) {
      this.avatar.turnTowards(yawFromDirection(this.velocity.x, this.velocity.z), 11, dt);
    }
  }

  private updateCombat(dt: number): void {
    if (this.attackTimer > 0) this.attackTimer -= dt;
    this.retargetTimer -= dt;

    // Taunt overrides everything; otherwise only look for a new target when the
    // current one is gone, never every frame.
    const taunter = this.ctx.world.tauntSourceFor("ally", this.position.x, this.position.z, false);
    if (taunter) {
      this.target = taunter;
    } else if (!this.target || !this.target.alive || this.outOfRange(this.target)) {
      if (this.retargetTimer <= 0) {
        this.retargetTimer = RETARGET_INTERVAL;
        this.target = this.ctx.world.highestLevelUnit(
          "enemy",
          this.position.x,
          this.position.z,
          this.stats.rangedRange,
        );
      }
    }

    if (!this.target || this.attackTimer > 0) {
      if (!this.avatar.animator.isSwinging) this.setLocomotionState();
      return;
    }

    this.attackTimer = this.stats.attackInterval;
    this.gatherSwing = false;
    this.avatar.animator.strikeOnce();
    if (this.inMelee) {
      this.meleeSlow = 0.28;
      this.ctx.vfx.sound("heroMelee", 0.6, 0.9 + Math.random() * 0.2);
    } else {
      this.ctx.vfx.sound("heroRanged", 0.5, 0.95 + Math.random() * 0.2);
    }
  }

  private setLocomotionState(): void {
    if (this.speed > 0.35) this.avatar.animator.setState(this.speed > 6 ? "sprint" : "walk");
    else this.avatar.animator.setState("idle");
  }

  private outOfRange(target: CombatUnit): boolean {
    return distanceXZ(this.position, target.position) > this.stats.rangedRange + 2;
  }

  /**
   * One swing of the axe or pick. Returns false when the hero is mid-animation,
   * so a gather never double-fires.
   */
  beginGatherSwing(): boolean {
    if (!this._alive || this.avatar.animator.isSwinging) return false;
    this.gatherSwing = true;
    this.gatherHitPending = false;
    this.avatar.animator.strikeOnce();
    return true;
  }

  /** True exactly once per swing, on the frame the tool connects. */
  consumeGatherHit(): boolean {
    if (!this.gatherHitPending) return false;
    this.gatherHitPending = false;
    return true;
  }

  /** Turns the hero toward the node being worked. */
  faceGatherTarget(x: number, z: number, dt: number): void {
    if (this.speed > 0.5) return;
    this.avatar.turnTowards(yawFromDirection(x - this.position.x, z - this.position.z), 10, dt);
  }

  /** The animator's hit frame: either a gather payout or a combat blow. */
  private onSwingHit(): void {
    if (this.gatherSwing) {
      this.gatherSwing = false;
      this.gatherHitPending = true;
      return;
    }
    this.resolveAttack();
  }

  /** Fired on the animation's hit frame — never when the swing begins. */
  private resolveAttack(): void {
    const target = this.target;
    if (!this._alive || !target || !target.alive) return;
    const dist = distanceXZ(this.position, target.position);

    if (dist <= HERO_MELEE.threshold + target.hitRadius) {
      const power = this.stats.meleeAttack;
      this.ctx.damage(target, power, this.position.x, this.position.z);
      this.ctx.areaDamage("ally", target.position.x, target.position.z, HERO_MELEE.radius, power, 5);
      this.ctx.vfx.meleeHit(target.position.x, target.position.z);
    } else {
      const power = this.stats.rangedAttack;
      this.ctx.projectiles.fire("arrow", this.position.x, 1.0, this.position.z, target, (hx, hz) => {
        if (target.alive) this.ctx.damage(target, power, hx, hz);
        this.ctx.vfx.rangedHit(hx, hz);
      });
    }
  }

}

function distanceXZ(a: Vector3, b: Vector3): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
