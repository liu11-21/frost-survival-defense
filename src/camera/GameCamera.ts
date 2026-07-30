import { Scene, TargetCamera, Vector3 } from "@babylonjs/core";
import { computeFraming } from "./CameraFraming";
import { CAMERA } from "../game/GameConfig";
import { clamp, damp, dampVector } from "../util/MathUtil";
import { EffectSettingsState } from "../effects/EffectSettingsState";

export type CameraState =
  | "follow"
  | "harvestFocus"
  | "constructionFocus"
  | "thawFocus"
  | "furnaceFocus"
  | "expansionShowcase"
  | "returnToPlayer";

export interface FocusOptions {
  zoom?: number;
  /** How fast the rig eases toward the new framing. */
  lerp?: number;
  /** Extra planar offset applied to the framing, used by the expansion pan. */
  offset?: Vector3;
}

/**
 * A single tilted follow rig. Every camera state is expressed as "where should
 * the rig look and how close should it be", so transitions are always smooth
 * interpolations rather than cuts.
 */
export class GameCamera {
  readonly camera: TargetCamera;

  private state: CameraState = "follow";
  private zoom = 1;
  private zoomTarget = 1;
  private readonly goalTarget = new Vector3();
  private readonly smoothTarget = new Vector3();
  private readonly extraOffset = new Vector3();
  private readonly goalExtraOffset = new Vector3();
  private readonly scratch = new Vector3();
  private readonly finalTarget = new Vector3();
  private lerpRate = CAMERA.followLerp;
  private shakeAmount = 0;
  private shakeSeed = Math.random() * 100;
  private time = 0;

  private followPosition: Vector3 | null = null;
  private followVelocity: Vector3 | null = null;

  constructor(scene: Scene) {
    this.camera = new TargetCamera("gameCamera", new Vector3(0, 20, -18), scene);
    this.camera.fov = 0.72;
    this.camera.minZ = 0.5;
    this.camera.maxZ = 260;
    this.camera.setTarget(Vector3.Zero());
    scene.activeCamera = this.camera;
  }

  bindFollowTarget(position: Vector3, velocity: Vector3): void {
    this.followPosition = position;
    this.followVelocity = velocity;
    this.smoothTarget.copyFrom(position);
    this.goalTarget.copyFrom(position);
    this.applyRigImmediate();
  }

  get isCinematic(): boolean {
    return this.state !== "follow" && this.state !== "returnToPlayer";
  }

  get currentState(): CameraState {
    return this.state;
  }

  setState(state: CameraState, focus?: Vector3, options: FocusOptions = {}): void {
    this.state = state;
    this.zoomTarget = options.zoom ?? 1;
    this.lerpRate = options.lerp ?? (state === "follow" ? CAMERA.followLerp : CAMERA.cinematicLerp);
    this.goalExtraOffset.copyFrom(options.offset ?? Vector3.ZeroReadOnly);
    if (focus) this.goalTarget.copyFrom(focus);
  }

  /** Update the framing point without restarting the transition. */
  retarget(focus: Vector3, offset?: Vector3): void {
    this.goalTarget.copyFrom(focus);
    if (offset) this.goalExtraOffset.copyFrom(offset);
  }

  /** Adjusts the framing distance without changing the camera state. */
  setZoomTarget(zoom: number): void {
    this.zoomTarget = zoom;
  }

  zoomBy(delta: number): void {
    this.zoom = clamp(this.zoom + delta, CAMERA.minZoom, CAMERA.maxZoom);
  }

  shake(intensity: number): void {
    if (!EffectSettingsState.screenShakeEnabled) return;
    this.shakeAmount = Math.min(0.55, this.shakeAmount + intensity);
    this.shakeSeed = Math.random() * 100;
  }

  update(dt: number): void {
    this.time += dt;

    if (this.state === "follow" || this.state === "returnToPlayer") {
      if (this.followPosition) {
        this.scratch.copyFrom(this.followPosition);
        if (this.followVelocity) {
          this.scratch.x += this.followVelocity.x * CAMERA.lookAheadFactor;
          this.scratch.z += this.followVelocity.z * CAMERA.lookAheadFactor;
        }
        this.scratch.y += 1.0;
        this.goalTarget.copyFrom(this.scratch);
      }
      if (this.state === "returnToPlayer") {
        const distance = Vector3.Distance(this.smoothTarget, this.goalTarget);
        if (distance < 1.4 && Math.abs(this.zoom - this.zoomTarget) < 0.05) {
          this.state = "follow";
          this.lerpRate = CAMERA.followLerp;
        }
      }
    }

    dampVector(this.smoothTarget, this.goalTarget, this.lerpRate, dt);
    dampVector(this.extraOffset, this.goalExtraOffset, this.lerpRate, dt);
    this.zoom = damp(this.zoom, this.zoomTarget * this.userZoom, this.lerpRate * 1.4, dt);

    this.shakeAmount = Math.max(0, this.shakeAmount - dt * CAMERA.shakeDecay * this.shakeAmount * 4 - dt * 0.02);

    this.applyRig();
  }

  private userZoom = 1;
  /** Auto-fitted rig offset. Recomputed whenever the viewport changes. */
  private fitHeight = CAMERA.baseOffset.y;
  private fitDepth = -CAMERA.baseOffset.z;
  private coveredRadius = 0;

  /**
   * Recomputes the framing from the live viewport so the whole wall ring stays
   * on screen at every aspect ratio, rather than trusting a fixed offset.
   */
  refit(aspect: number): void {
    const tiltRatio = Math.abs(CAMERA.baseOffset.z) / CAMERA.baseOffset.y;
    const result = computeFraming(aspect, this.camera.fov, tiltRatio, CAMERA.localViewRadius);
    this.fitHeight = result.height;
    this.fitDepth = result.depth;
    this.coveredRadius = result.coveredRadius;
  }

  get framedRadius(): number {
    return this.coveredRadius;
  }

  /** The ground radius actually visible right now, current zoom included — what the minimap draws as the camera's coverage rectangle. */
  get visibleRadius(): number {
    return this.coveredRadius * this.zoom;
  }

  /** Where the rig is currently looking, on the ground plane — the minimap viewport marker's centre. */
  get focusXZ(): { x: number; z: number } {
    return { x: this.smoothTarget.x, z: this.smoothTarget.z };
  }

  /** Mouse wheel adjusts a separate multiplier so cinematics keep their framing. */
  adjustUserZoom(delta: number): void {
    this.userZoom = clamp(this.userZoom + delta, CAMERA.minZoom, CAMERA.maxZoom);
  }

  private applyRig(): void {
    const z = this.zoom;
    const shakeX = this.shakeAmount * Math.sin(this.time * 47 + this.shakeSeed) * 1.4;
    const shakeY = this.shakeAmount * Math.sin(this.time * 61 + this.shakeSeed * 1.7);

    this.camera.position.set(
      this.smoothTarget.x + CAMERA.baseOffset.x * z + this.extraOffset.x + shakeX,
      Math.max(3.5, this.smoothTarget.y + this.fitHeight * z + this.extraOffset.y + shakeY),
      this.smoothTarget.z - this.fitDepth * z + this.extraOffset.z,
    );
    this.finalTarget.copyFrom(this.smoothTarget);
    this.finalTarget.x += shakeX * 0.4;
    this.camera.setTarget(this.finalTarget);
  }

  private applyRigImmediate(): void {
    this.extraOffset.copyFrom(this.goalExtraOffset);
    this.applyRig();
  }

  /** Camera-relative forward vector projected onto the ground plane. */
  getForwardXZ(out: Vector3): Vector3 {
    out.set(-CAMERA.baseOffset.x, 0, this.fitDepth);
    const len = Math.hypot(out.x, out.z) || 1;
    out.x /= len;
    out.z /= len;
    return out;
  }

  /** Camera-relative right vector projected onto the ground plane. */
  getRightXZ(out: Vector3): Vector3 {
    this.getForwardXZ(out);
    const fx = out.x;
    const fz = out.z;
    out.x = fz;
    out.z = -fx;
    return out;
  }
}
