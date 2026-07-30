import type { LiteRig } from "./LiteHumanoid";

/** Seconds the death pose plays before the body starts to sink. */
export const DEATH_ANIMATION = 0.25;
/** Seconds the body stays visible in total, animation included. */
export const CORPSE_TIME = 0.75;
/**
 * Hard ceiling. If the death animation event never fires for any reason, the
 * body is recycled anyway rather than standing in the snow for the rest of the
 * run — the previous build had no such guarantee.
 */
export const DEATH_HARD_LIMIT = 1;

export interface CorpseState {
  /** Seconds since the unit died. */
  elapsed: number;
  /** True once the one-shot death bookkeeping has run. */
  resolved: boolean;
  /** True once the visual has been handed back. */
  recycled: boolean;
}

export function newCorpseState(): CorpseState {
  return { elapsed: 0, resolved: false, recycled: false };
}

/**
 * Sinks and shrinks a body once its death pose has played.
 *
 * Instanced meshes share their master's material, so per-body alpha is not
 * available without a per-instance buffer; sinking into the snow reads the same
 * and costs nothing.
 */
export function fadeCorpse(rig: LiteRig, state: CorpseState, baseScale: number): void {
  const sinkStart = DEATH_ANIMATION;
  if (state.elapsed <= sinkStart) return;
  const t = Math.min(1, (state.elapsed - sinkStart) / Math.max(0.1, CORPSE_TIME - sinkStart));
  rig.root.position.y = -t * 1.15;
  const scale = baseScale * (1 - t * 0.45);
  rig.root.scaling.setAll(Math.max(0.001, scale));
}

/** True when the body has outlived its display time or hit the hard limit. */
export function corpseExpired(state: CorpseState): boolean {
  return state.elapsed >= CORPSE_TIME || state.elapsed >= DEATH_HARD_LIMIT;
}
