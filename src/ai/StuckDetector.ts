import { STUCK } from "./AIConfig";

export interface StuckTelemetry {
  attempts: number;
  stuckFor: number;
  lastMoveAt: number;
  lastRecovery: string;
}

/**
 * Watches whether a unit that *believes* it is moving is actually covering
 * ground. Recovery is escalating and deliberately never starts with a teleport.
 */
export class StuckDetector {
  private lastX = 0;
  private lastZ = 0;
  private accumulated = 0;
  private distanceMoved = 0;
  private _attempts = 0;
  private _stuckFor = 0;
  private _lastMoveAt = 0;
  private _lastRecovery = "none";

  get attempts(): number {
    return this._attempts;
  }
  get stuckFor(): number {
    return this._stuckFor;
  }
  get lastMoveAt(): number {
    return this._lastMoveAt;
  }
  get lastRecovery(): string {
    return this._lastRecovery;
  }
  /** True once escalation has run out of gentle options. */
  get needsHardCorrection(): boolean {
    return this._stuckFor >= STUCK.hardLimit && this._attempts >= STUCK.maxAttempts;
  }

  telemetry(): StuckTelemetry {
    return {
      attempts: this._attempts,
      stuckFor: Number(this._stuckFor.toFixed(2)),
      lastMoveAt: Number(this._lastMoveAt.toFixed(2)),
      lastRecovery: this._lastRecovery,
    };
  }

  reset(x: number, z: number, clock: number): void {
    this.lastX = x;
    this.lastZ = z;
    this.accumulated = 0;
    this.distanceMoved = 0;
    this._attempts = 0;
    this._stuckFor = 0;
    this._lastMoveAt = clock;
    this._lastRecovery = "none";
  }

  /** Call every frame while the unit is trying to move. Returns true if stuck. */
  sample(dt: number, x: number, z: number, clock: number): boolean {
    this.distanceMoved += Math.hypot(x - this.lastX, z - this.lastZ);
    this.lastX = x;
    this.lastZ = z;
    this.accumulated += dt;

    if (this.accumulated < STUCK.window) return false;

    const moved = this.distanceMoved;
    this.accumulated = 0;
    this.distanceMoved = 0;

    if (moved >= STUCK.minDistance) {
      this._stuckFor = 0;
      this._attempts = 0;
      this._lastMoveAt = clock;
      return false;
    }

    this._stuckFor += STUCK.window;
    this._attempts += 1;
    return true;
  }

  /** Called when the unit is not attempting to move, so it cannot be "stuck". */
  markIdle(clock: number): void {
    this.accumulated = 0;
    this.distanceMoved = 0;
    this._stuckFor = 0;
    this._lastMoveAt = clock;
  }

  noteRecovery(kind: string): void {
    this._lastRecovery = kind;
  }
}
