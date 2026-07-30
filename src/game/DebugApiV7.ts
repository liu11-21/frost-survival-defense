import { MAP, WALL_SIDES } from "../data/BuildSlotDefinitions";
import type { GameSystems } from "./GameSystems";

/**
 * Debug hooks for the four-side perimeter rework: inspecting the rectangle's
 * geometry and forcing a unit's raw position, which is what the anti-exploit
 * position-correction test needs to simulate "ended up inside via a glitch"
 * without actually finding a real exploit to trigger it through.
 */
export function createV7DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    perimeterInfo: () => ({
      halfWidth: MAP.baseHalfWidth,
      halfDepth: MAP.baseHalfDepth,
      gateWidth: MAP.gateWidth,
      sides: WALL_SIDES.map((w) => ({ side: w.side, slotId: w.slotId, x: w.x, z: w.z, length: w.length })),
    }),
    teleportUnit: (defId: string, x: number, z: number) => {
      const find = (list: typeof s.world.allies) => list.find((u) => u.alive && u.def.id === defId);
      const u = find(s.world.allies) ?? find(s.world.enemies);
      if (!u) return false;
      u.setPosition(x, z);
      return true;
    },
    allEnemyPositions: () =>
      s.world.enemies
        .filter((e) => e.alive)
        .map((e) => ({ id: e.def.id, x: Number(e.position.x.toFixed(2)), z: Number(e.position.z.toFixed(2)) })),
  };
}
