import { damp, easeOutCubic } from "../util/MathUtil";
import type { LiteRig } from "./LiteHumanoid";
import { EffectSettingsState } from "../effects/EffectSettingsState";

export type CombatAnimState = "idle" | "walk" | "attack" | "hit" | "death" | "cast" | "taunt";

/**
 * Procedural animation for the lite rig. Only seven numbers are blended, which
 * keeps a hundred simultaneous fighters affordable.
 */
export class CombatAnimator {
  private state: CombatAnimState = "idle";
  private phase = Math.random() * 10;
  private actionTime = 0;
  private hitFlash = 0;
  private deathTime = -1;
  private authoredState = "";

  // current (blended) pose
  private bodyY = 0;
  private bodyPitch = 0;
  private armL = 0;
  private armR = 0;
  private legL = 0;
  private legR = 0;
  private headPitch = 0;

  /** Set by the owner so the animator knows when the blow should land. */
  hitFrame = 0.45;
  onHitFrame: (() => void) | null = null;

  constructor(private readonly rig: LiteRig) {}

  get currentState(): CombatAnimState {
    return this.state;
  }

  get isBusy(): boolean {
    return this.state === "attack" || this.state === "cast" || this.state === "taunt";
  }

  setState(next: CombatAnimState): void {
    if (this.state === next) return;
    if (next === "attack" || next === "cast" || next === "taunt") this.actionTime = 0;
    if (next === "death") this.deathTime = 0;
    this.state = next;
  }

  /** Plays one swing; the hit event fires partway through, never at the start. */
  strike(duration: number, kind: CombatAnimState = "attack"): void {
    this.state = kind;
    this.actionTime = 0;
    this.actionDuration = Math.max(0.16, duration);
    this.hitFired = false;
  }

  /** Duration scales with the "flash intensity" setting — this codebase has
   * no per-instance colour/emissive flash (shared materials, see
   * `EffectSettingsState`'s doc comment), so intensity instead controls how
   * pronounced the hit-recoil dip reads. */
  flashHit(): void {
    this.hitFlash = 0.22 * EffectSettingsState.flashIntensity;
  }

  /**
   * Cancels an in-flight swing. Used when the hit-frame event never arrives, so
   * a unit can never be left frozen in an attack pose waiting for it.
   */
  abortAction(): void {
    if (!this.isBusy) return;
    this.hitFired = true;
    this.actionTime = this.actionDuration;
    this.state = "idle";
  }

  private actionDuration = 0.5;
  private hitFired = false;

  update(dt: number, speed: number): void {
    this.syncAuthoredAnimation();
    if (this.state === "death") {
      this.updateDeath(dt);
      return;
    }

    let tBodyY = 0;
    let tPitch = 0;
    let tArmL = 0;
    let tArmR = 0;
    let tLegL = 0;
    let tLegR = 0;
    let tHead = 0;
    let rate = 12;

    if (this.state === "attack" || this.state === "cast" || this.state === "taunt") {
      this.actionTime += dt;
      const t = Math.min(1, this.actionTime / this.actionDuration);
      if (!this.hitFired && t >= this.hitFrame) {
        this.hitFired = true;
        this.onHitFrame?.();
      }
      rate = 26;
      // wind up, then snap through
      const swing = t < this.hitFrame ? t / this.hitFrame : 1 - easeOutCubic((t - this.hitFrame) / (1 - this.hitFrame));
      if (this.state === "cast") {
        tArmR = -2.2 * swing;
        tArmL = -0.9 * swing;
        tPitch = -0.12 * swing;
        tHead = -0.1 * swing;
      } else if (this.state === "taunt") {
        tArmR = -1.6 * swing;
        tArmL = -1.6 * swing;
        tPitch = -0.18 * swing;
        tBodyY = 0.06 * swing;
      } else {
        tArmR = 1.9 * swing - 0.9;
        tArmL = -0.5 * swing;
        tPitch = 0.28 * (1 - swing) * (t > this.hitFrame ? 1 : 0) - 0.16 * swing;
        tLegL = -0.18;
        tLegR = 0.14;
      }
      if (t >= 1) this.state = speed > 0.4 ? "walk" : "idle";
    } else if (this.state === "walk") {
      this.phase += dt * (4.2 + speed * 1.4);
      const s = Math.sin(this.phase);
      tLegL = -s * 0.6;
      tLegR = s * 0.6;
      tArmL = s * 0.5;
      tArmR = -s * 0.5;
      tBodyY = Math.abs(Math.sin(this.phase * 2)) * 0.05;
      tPitch = 0.07;
    } else {
      this.phase += dt * 1.4;
      const breathe = Math.sin(this.phase) * 0.5 + 0.5;
      tBodyY = breathe * 0.02;
      tArmL = 0.06 + breathe * 0.05;
      tArmR = 0.06 + breathe * 0.05;
      tHead = Math.sin(this.phase * 0.6) * 0.08;
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      // a sharp recoil that reads even in a crowd
      tPitch -= this.hitFlash * 1.6;
      tBodyY -= this.hitFlash * 0.18;
      rate = 30;
    }

    this.bodyY = damp(this.bodyY, tBodyY, rate, dt);
    this.bodyPitch = damp(this.bodyPitch, tPitch, rate, dt);
    this.armL = damp(this.armL, tArmL, rate, dt);
    this.armR = damp(this.armR, tArmR, rate, dt);
    this.legL = damp(this.legL, tLegL, rate, dt);
    this.legR = damp(this.legR, tLegR, rate, dt);
    this.headPitch = damp(this.headPitch, tHead, rate, dt);
    this.apply();
  }

  private updateDeath(dt: number): void {
    this.deathTime += dt;
    const t = Math.min(1, this.deathTime / 0.9);
    const e = easeOutCubic(t);
    this.rig.body.rotation.x = e * 1.5;
    this.rig.body.position.y = -e * 0.42;
    this.rig.shoulderL.rotation.x = e * 1.1;
    this.rig.shoulderR.rotation.x = e * 1.1;
    this.rig.hipL.rotation.x = -e * 0.5;
    this.rig.hipR.rotation.x = -e * 0.4;
    this.rig.root.scaling.y = Math.max(0.02, this.rig.root.scaling.x * (1 - e * 0.35));
  }

  private syncAuthoredAnimation(): void {
    const authored = this.rig.authored;
    if (!authored) return;
    const state = this.state === "walk"
      ? "Walk"
      : this.state === "attack"
        ? "Attack"
        : this.state === "cast"
          ? "Cast"
          : this.state === "death"
            ? "Death"
            : this.state === "hit"
              ? "Hit"
              : "Idle";
    if (state === this.authoredState) return;
    this.authoredState = state;
    for (const group of authored.animationGroups) group.stop();
    const group = authored.animationGroups.find((candidate) => candidate.name === state || candidate.name.endsWith(`:${state}`));
    group?.start(state === "Idle" || state === "Walk", 1);
  }

  /** 0..1, how far through the death animation the corpse is. */
  get deathProgress(): number {
    return this.deathTime < 0 ? 0 : Math.min(1, this.deathTime / 0.9);
  }

  private apply(): void {
    const rig = this.rig;
    rig.body.position.y = this.bodyY;
    rig.body.rotation.x = this.bodyPitch;
    rig.head.rotation.x = this.headPitch;
    rig.shoulderL.rotation.x = this.armL;
    rig.shoulderR.rotation.x = this.armR;
    rig.hipL.rotation.x = this.legL;
    rig.hipR.rotation.x = this.legR;
  }
}
