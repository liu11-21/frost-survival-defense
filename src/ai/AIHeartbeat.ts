/**
 * Five independently-queryable timestamps per friendly unit, all on the same
 * unified clock the brain itself runs on (never `Date.now()`, never a
 * separately-accumulated timer) — exactly what the F7 AI debug panel and the
 * watchdog need to tell "alive but genuinely stalled" apart from "alive and
 * legitimately idle", instead of inferring it from one blended timer.
 */
export interface AIHeartbeatSnapshot {
  lastUpdateAt: number;
  lastStateChangeAt: number;
  lastMeaningfulActionAt: number;
  lastMovementAt: number;
  lastTargetAcquiredAt: number;
}

export class AIHeartbeat {
  lastUpdateAt = 0;
  lastStateChangeAt = 0;
  lastMeaningfulActionAt = 0;
  lastMovementAt = 0;
  lastTargetAcquiredAt = 0;

  /** Every AI tick, alive or dead — proves the unit is still being ticked at all. */
  markUpdate(clock: number): void {
    this.lastUpdateAt = clock;
  }
  /** Every state transition. */
  markStateChange(clock: number): void {
    this.lastStateChangeAt = clock;
  }
  /** Attack/heal/repair/cast landed, target acquired, gate passed, reload complete. */
  markMeaningfulAction(clock: number): void {
    this.lastMeaningfulActionAt = clock;
  }
  /** Actual measured velocity above the noise floor, not just "trying to move". */
  markMovement(clock: number): void {
    this.lastMovementAt = clock;
  }
  markTargetAcquired(clock: number): void {
    this.lastTargetAcquiredAt = clock;
  }

  snapshot(): AIHeartbeatSnapshot {
    return {
      lastUpdateAt: this.lastUpdateAt,
      lastStateChangeAt: this.lastStateChangeAt,
      lastMeaningfulActionAt: this.lastMeaningfulActionAt,
      lastMovementAt: this.lastMovementAt,
      lastTargetAcquiredAt: this.lastTargetAcquiredAt,
    };
  }
}
