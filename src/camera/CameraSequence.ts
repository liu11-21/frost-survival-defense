import { Vector3 } from "@babylonjs/core";
import type { CameraState, GameCamera } from "./GameCamera";

export interface SequenceStep {
  state: CameraState;
  /** Static framing point, or a function evaluated every frame for moving shots. */
  focus: Vector3 | ((elapsed: number, duration: number) => Vector3);
  duration: number;
  zoom?: number;
  lerp?: number;
  offset?: Vector3;
  onEnter?: () => void;
  onUpdate?: (progress: number) => void;
}

/**
 * Plays a list of camera framings back to back. Used for the build reveal, the
 * survivor thaw and the furnace upgrade showcase.
 */
export class CameraSequence {
  private steps: SequenceStep[] = [];
  private index = -1;
  private elapsed = 0;
  private onDone: (() => void) | null = null;
  private readonly scratch = new Vector3();

  constructor(private readonly camera: GameCamera) {}

  get isPlaying(): boolean {
    return this.index >= 0;
  }

  play(steps: SequenceStep[], onDone?: () => void): void {
    this.steps = steps;
    this.index = -1;
    this.elapsed = 0;
    this.onDone = onDone ?? null;
    this.advance();
  }

  cancel(): void {
    this.index = -1;
    this.steps = [];
    this.onDone = null;
  }

  update(dt: number): void {
    if (this.index < 0) return;
    const step = this.steps[this.index];
    this.elapsed += dt;

    const focus = typeof step.focus === "function" ? step.focus(this.elapsed, step.duration) : step.focus;
    this.scratch.copyFrom(focus);
    this.camera.retarget(this.scratch, step.offset);
    step.onUpdate?.(Math.min(1, this.elapsed / step.duration));

    if (this.elapsed >= step.duration) {
      this.elapsed = 0;
      this.advance();
    }
  }

  private advance(): void {
    this.index += 1;
    if (this.index >= this.steps.length) {
      this.index = -1;
      this.steps = [];
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
      return;
    }
    const step = this.steps[this.index];
    const focus = typeof step.focus === "function" ? step.focus(0, step.duration) : step.focus;
    this.camera.setState(step.state, focus, {
      zoom: step.zoom,
      lerp: step.lerp,
      offset: step.offset,
    });
    step.onEnter?.();
  }
}
