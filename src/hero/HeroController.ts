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
import type { AssetRegistry } from "../assets/AssetRegistry";

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
    // The authored hero and procedural fallback both face local +Z, which is
    // also the gameplay forward direction. From the south side of the furnace
    // the initial heading therefore points north toward +Z.
    this.avatar.setYawImmediate(0);
    this.health = stats.maxHealth;
    this.avatar.animator.onChopHit = () => this.onSwingHit();
  }

  /** Called after the optional GLB preload; no-op while the procedural fallback is active. */
  applyAuthoredAsset(assets: AssetRegistry): boolean {
    const instance = assets.instantiate("hero", "hero.player");
    if (!instance) return false;
    this.avatar.attachAuthored(instance);
    this.alignAuthoredFront(instance);
    return true;
  }

  /**
   * Calibrate the imported root from an authored face marker instead of
   * hard-coding a π correction. This keeps the gameplay +Z convention stable
   * if a future Blender export changes the glTF child orientation.
   */
  private alignAuthoredFront(instance: ReturnType<AssetRegistry["instantiate"]>): void {
    if (!instance) return;
    instance.root.rotation.set(0, 0, 0);

    const faceMarker = instance.meshes.find((mesh) => {
      const name = mesh.name.toLowerCase();
      return name.endsWith(":head.nose") || name.endsWith(":head.eye.l") || name.endsWith(":head.eye.r");
    });
    if (!faceMarker) return;

    instance.root.computeWorldMatrix(true);
    faceMarker.computeWorldMatrix(true);
    const origin = instance.root.getAbsolutePosition();
    const face = faceMarker.getAbsolutePosition();
    if (face.z - origin.z < -0.02) {
      instance.root.rotation.y = Math.PI;
    }
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
    return this.avatar.root.rotation.y;
  }
  get modelSource(): "GLB" | "procedural" {
    return this.avatar.modelSource;
  }
  get authoredAnimationNames(): readonly string[] {
    return this.avatar.authoredAnimationNames;
  }
  get authoredMeshes(): readonly import("@babylonjs/core").AbstractMesh[] {
    return this.avatar.authoredMeshes;
  }
  get authoredVisibleMeshCount(): number {
    return this.avatar.authoredVisibleMeshCount;
  }
  get proceduralVisibleMeshCount(): number {
    return this.avatar.proceduralVisibleMeshCount;
  }
  get currentAuthoredAnimation(): string | null {
    return this.avatar.currentAuthoredAnimation;
  }
  get reviewLod(): 0 | 1 | 2 {
    return this.avatar.currentReviewLod;
  }

  setReviewAnimation(name: string): void {
    this.avatar.setReviewAnimation(name);
  }

  setReviewLod(lod: 0 | 1 | 2): void {
    this.avatar.setReviewLod(lod);
  }

  setReviewLodAuto(): void {
    this.avatar.setReviewLodAuto();
  }

  /** Keeps authored animation groups advancing without running gameplay AI. */
  updateReview(dt = 0.016): void {
    // Review captures stop Babylon's render loop, so advance the selected
    // authored clip explicitly while leaving gameplay AI and movement idle.
    this.avatar.advanceReview(dt);
  }
  /** A live combat lock, rather than merely facing a recently-dead target. */
  get isAttacking(): boolean {
    return this._alive && this.target?.alive === true && !this.outOfRange(this.target);
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
    this.avatar.setYawImmediate(0);
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
    this.avatar.playAuthoredAttack(this.inMelee ? "MeleeAttack" : "RangedAttack");
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
      this.ctx.damage(target, power, this.position.x, this.position.z, "melee");
      // The hero is the one melee exception: his skill/impact can still catch
      // an airborne target standing inside the shock radius.
      this.ctx.areaDamage("ally", target.position.x, target.position.z, HERO_MELEE.radius, power, 5, undefined, "skill");
      this.ctx.vfx.meleeHit(target.position.x, target.position.z);
    } else {
      const power = this.stats.rangedAttack;
      this.ctx.projectiles.fire("arrow", this.position.x, 1.0, this.position.z, target, (hx, hz) => {
        if (target.alive) this.ctx.damage(target, power, hx, hz, "ranged");
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
