import { CHOP } from "./AnimationConfig";
import { clamp01, damp } from "../util/MathUtil";
import {
  POSE_KEYS,
  blankPose,
  chopPose,
  depositPose,
  frozenPose,
  idlePose,
  locomotionPose,
  wakeUpPose,
} from "./PoseLibrary";
import type { HumanoidRig } from "./ProceduralHumanoid";

export type CharacterState =
  | "idle"
  | "walk"
  | "sprint"
  | "carryWalk"
  | "chop"
  | "deposit"
  | "frozen"
  | "thaw"
  | "wakeUp";

/**
 * Procedural animation driver. It only ever writes joint rotations and a
 * vertical body offset, which keeps the same interface a GLB `AnimationGroup`
 * would need — swapping in skinned clips later means replacing this class, not
 * its callers.
 */
export class CharacterAnimator {
  private state: CharacterState = "idle";
  private phase = 0;
  private chopTime = 0;
  private chopHitFired = false;
  private depositTime = 0;
  private readonly target = blankPose();
  private readonly current = blankPose();
  private blendRate = 13;
  /** 0 = fully collapsed / frozen crouch, 1 = standing tall. */
  private riseProgress = 1;
  private shiver = 0;
  /** A looping chop keeps swinging; a one-shot returns to locomotion. */
  private chopLoop = true;

  onChopHit: (() => void) | null = null;
  onChopWindup: (() => void) | null = null;
  onDepositThrow: (() => void) | null = null;

  constructor(private readonly rig: HumanoidRig) {}

  get currentState(): CharacterState {
    return this.state;
  }

  setState(state: CharacterState): void {
    if (this.state === state) return;
    if (state === "chop") {
      this.chopLoop = true;
      this.chopTime = 0;
      this.chopHitFired = false;
      this.onChopWindup?.();
    }
    if (state === "deposit") this.depositTime = 0;
    this.state = state;
    this.blendRate = state === "chop" ? 22 : 13;
  }

  setRiseProgress(value: number): void {
    this.riseProgress = clamp01(value);
  }

  setShiver(value: number): void {
    this.shiver = value;
  }

  /** Progress through the current chop swing, 0..1. */
  get chopProgress(): number {
    return this.chopTime / CHOP.cycleTime;
  }

  /** True while a swing is still playing out. */
  get isSwinging(): boolean {
    return this.state === "chop";
  }

  /** Plays exactly one swing, then falls back to idle. */
  strikeOnce(): void {
    this.state = "chop";
    this.chopTime = 0;
    this.chopHitFired = false;
    this.chopLoop = false;
    this.blendRate = 22;
    this.onChopWindup?.();
  }

  update(dt: number, speed: number, carryRatio: number): void {
    const clock = performance.now() * 0.001;

    switch (this.state) {
      case "idle":
        this.phase += dt * 1.6;
        idlePose(this.target, this.phase, clock, carryRatio);
        this.blendRate = 13;
        break;
      case "walk":
      case "sprint":
      case "carryWalk": {
        const sprinting = this.state === "sprint";
        const carrying = this.state === "carryWalk";
        const cadence = (sprinting ? 2.05 : 1.72) * Math.max(0.55, speed / 5.2) * Math.PI;
        this.phase += dt * cadence;
        locomotionPose(this.target, this.phase, sprinting, carrying, carryRatio);
        this.blendRate = 13;
        break;
      }
      case "chop":
        this.tickChop(dt, carryRatio);
        break;
      case "deposit":
        this.tickDeposit(dt, carryRatio);
        break;
      case "frozen":
        frozenPose(this.target, clock, 0);
        this.blendRate = 9;
        break;
      case "thaw":
        frozenPose(this.target, clock, this.shiver);
        this.blendRate = 30;
        break;
      case "wakeUp":
        wakeUpPose(this.target, clock, this.riseProgress);
        this.blendRate = 11;
        break;
    }

    this.applyPose(dt);
  }

  private tickChop(dt: number, carryRatio: number): void {
    this.chopTime += dt;
    const t = this.chopTime / CHOP.cycleTime;

    if (!this.chopHitFired && t >= CHOP.hitFrame) {
      this.chopHitFired = true;
      this.onChopHit?.();
    }
    if (t >= 1) {
      if (!this.chopLoop) {
        this.chopLoop = true;
        this.state = "idle";
        this.chopTime = 0;
        return;
      }
      this.chopTime -= CHOP.cycleTime;
      this.chopHitFired = false;
      this.onChopWindup?.();
    }

    this.blendRate = 26;
    chopPose(this.target, this.chopTime / CHOP.cycleTime, carryRatio);
  }

  private tickDeposit(dt: number, carryRatio: number): void {
    this.depositTime += dt;
    const cycle = 0.44;
    if (this.depositTime >= cycle) {
      this.depositTime -= cycle;
      this.onDepositThrow?.();
    }
    this.blendRate = 18;
    depositPose(this.target, this.depositTime / cycle, carryRatio);
  }

  private applyPose(dt: number): void {
    const c = this.current;
    const g = this.target;
    const r = this.blendRate;
    for (const key of POSE_KEYS) {
      c[key] = damp(c[key], g[key], r, dt);
    }

    const rig = this.rig;
    rig.body.position.y = c.bodyY;
    rig.body.rotation.set(c.bodyPitch, c.bodyYaw, c.bodyRoll);
    rig.pelvis.rotation.x = c.pelvisPitch;
    rig.chest.rotation.set(c.chestPitch, c.chestYaw, 0);
    rig.head.rotation.set(c.headPitch, c.headYaw, 0);
    rig.shoulderL.rotation.set(c.shoulderLX, 0, c.shoulderLZ);
    rig.shoulderR.rotation.set(c.shoulderRX, 0, c.shoulderRZ);
    rig.elbowL.rotation.x = c.elbowL;
    rig.elbowR.rotation.x = c.elbowR;
    rig.hipL.rotation.x = c.hipL;
    rig.hipR.rotation.x = c.hipR;
    rig.kneeL.rotation.x = c.kneeL;
    rig.kneeR.rotation.x = c.kneeR;
  }
}
