import type { CombatWorld } from "../combat/CombatWorld";

/**
 * How much an engineer squad speeds up a building still under construction.
 *
 * Presence alone grants the full bonus — it does not scale with how many
 * engineers are nearby, and multiple engineer squads standing in range at
 * once still cap at the same 20%, per the brief's "not stacking" rule.
 */
export const ENGINEER_BUILD_BOOST = {
  radius: 4,
  bonus: 0.2,
};

/** True while any living engineer stands within boost range of `(x, z)`. */
export function engineerNearby(world: CombatWorld, x: number, z: number): boolean {
  const r2 = ENGINEER_BUILD_BOOST.radius * ENGINEER_BUILD_BOOST.radius;
  for (const ally of world.allies) {
    if (!ally.alive || ally.def.canRepair !== true) continue;
    const dx = ally.position.x - x;
    const dz = ally.position.z - z;
    if (dx * dx + dz * dz <= r2) return true;
  }
  return false;
}
