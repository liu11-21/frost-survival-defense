/** Shared delayed self-repair used by the furnace and attackable facilities. */
export const STRUCTURE_SELF_REPAIR = {
  delay: 15,
  tick: 0.5,
  amount: 20,
} as const;

export interface SelfRepairTick {
  timer: number;
  amount: number;
}

/**
 * Advances one delayed, fixed-pulse repair timer without mutating its owner.
 * Taking damage is represented by `sinceDamage` returning to zero; callers
 * therefore share exactly the same reset, delay and pulse cadence.
 */
export function advanceStructureSelfRepair(
  health: number,
  maxHealth: number,
  sinceDamage: number,
  timer: number,
  dt: number,
): SelfRepairTick {
  if (health >= maxHealth || sinceDamage < STRUCTURE_SELF_REPAIR.delay) {
    return { timer: 0, amount: 0 };
  }

  let nextTimer = timer + dt;
  const pulses = Math.floor((nextTimer + 1e-8) / STRUCTURE_SELF_REPAIR.tick);
  if (pulses <= 0) return { timer: nextTimer, amount: 0 };
  nextTimer -= pulses * STRUCTURE_SELF_REPAIR.tick;
  return { timer: nextTimer, amount: pulses * STRUCTURE_SELF_REPAIR.amount };
}
