/**
 * Timing for the detailed hero rig. Kept next to the animator rather than in
 * the gameplay data layer, because these are animation frames, not balance.
 */
export const CHOP = {
  /** Length of one full swing. */
  cycleTime: 0.62,
  /** Normalised point in the swing where the blow actually lands. */
  hitFrame: 0.36,
};

/** Back-rack geometry, still used by the hero rig's carry frame. */
export const CARRY = {
  logLength: 1.15,
  logRadius: 0.115,
  rowHeight: 0.2,
  logsPerRow: 2,
};

/** Minimum on-screen time for one construction stage. */
export const BUILD = {
  stageDuration: 0.34,
};
