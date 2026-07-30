/**
 * Every timing constant the friendly AI depends on. Centralised so the stall
 * rules can be reasoned about — and tuned — in one place.
 */

/** How often each role looks for a new target. Never every frame. */
export const RETARGET_INTERVAL = {
  melee: 0.2,
  ranged: 0.25,
  heal: 0.3,
  engineer: 3,
  /** Nothing on the field at all — back off to save queries. */
  idle: 0.5,
};

/** Hard ceilings. A state that overstays its welcome is a bug, so it recovers. */
export const STATE_TIMEOUT = {
  acquireTarget: 0.5,
  moveToTarget: 1.2,
  /** Windup gets the animation's own length plus this slack before it aborts. */
  attackWindupSlack: 0.25,
  attackRecover: 0.6,
  healWindupSlack: 0.3,
  teleport: 0.6,
  stuckRecovery: 1.5,
  returnToFormation: 6,
};

export const STUCK = {
  /** Below this much movement over `window` seconds while moving = stuck. */
  window: 1.2,
  minDistance: 0.15,
  /** Consecutive failures before the last-resort safe correction is allowed. */
  maxAttempts: 4,
  /** Only after this long with no recovery may a short reposition happen. */
  hardLimit: 4,
  sideStepDistance: 1.8,
};

export const WATCHDOG = {
  /** Low-frequency sweep; this is a safety net, not a driver. */
  interval: 0.5,
  /** Alive, enemies present, but nothing happened for this long = suspicious.
   * Deliberately a little ahead of `reportThreshold` so recovery has usually
   * already started before a unit ever reaches the reportable definition. */
  idleLimit: 1.5,
  /** The stall definition itself: no movement and no attack/reacquire for
   * this long, with enemies present and no legal reason to be idle. */
  reportThreshold: 2.0,
};

/** Ranged units keep their distance instead of walking into melee. */
export const STANDOFF: Record<string, { min: number; ideal: number; max: number }> = {
  archer: { min: 4, ideal: 8, max: 11 },
  mage: { min: 3.5, ideal: 6.5, max: 8 },
  medic: { min: 5, ideal: 9, max: 14 },
};

export const FORMATION = {
  /** Ring radius around the rally point for the first row of squads. */
  baseRadius: 2.8,
  ringSpacing: 1.8,
  squadsPerRing: 6,
  /** Spread of members inside one squad. */
  memberSpread: 0.95,
  /** Attack slots around a single enemy so melee units never stack. */
  attackSlots: 6,
  /** Soft separation, strong enough to spread out, weak enough to still close. */
  separationRadius: 1.1,
  separationForce: 1.4,
  /** Separation fades to zero this close to the target so units can land a hit. */
  separationCutoff: 2.4,
};
