import { repairStats } from "../combat/Squad";
import type { GameSystems } from "./GameSystems";

/**
 * The v5/v6 unit-inspection hooks (Engineer through Ice Bomber), split out of
 * `DebugApi.ts` purely to keep that file under the project's line budget —
 * still development-only and tree-shaken out of production the same way.
 */
export function createV6DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    spawnAlly: (id: string, x: number, z: number) => s.squads.recruit(id, x, z),
    unitInfo: (defId: string) => {
      const find = (list: typeof s.world.allies) => list.find((u) => u.alive && u.def.id === defId);
      const u = find(s.world.allies) ?? find(s.world.enemies);
      if (!u) return null;
      return {
        hp: Math.ceil(u.health),
        max: u.maxHealth,
        x: Number(u.position.x.toFixed(2)),
        z: Number(u.position.z.toFixed(2)),
        slowFactor: Number(u.slowFactor.toFixed(3)),
        isStunned: u.isStunned,
        armorBroken: u.armorBroken,
        bomberArmed: u.bomberArmed,
        bomberCountdown: Number(u.bomberCountdown.toFixed(2)),
        effectiveMoveSpeed: Number(u.effectiveMoveSpeed.toFixed(2)),
        effectiveInterval: Number(u.effectiveInterval.toFixed(3)),
        aiState: u.aiState,
        targetKind: u.currentTarget?.kind ?? null,
      };
    },
    allUnitsOf: (defId: string) =>
      [...s.world.allies, ...s.world.enemies]
        .filter((u) => u.alive && u.def.id === defId)
        .map((u) => ({
          hp: Math.ceil(u.health),
          x: Number(u.position.x.toFixed(1)),
          z: Number(u.position.z.toFixed(1)),
          slowFactor: Number(u.slowFactor.toFixed(3)),
          isStunned: u.isStunned,
          effectiveMoveSpeed: Number(u.effectiveMoveSpeed.toFixed(2)),
          effectiveInterval: Number(u.effectiveInterval.toFixed(3)),
        })),
    repairStats: () => ({ ...repairStats }),
    allyTargetKind: (defId: string) => {
      const u = s.world.allies.find((a) => a.alive && a.def.id === defId);
      const t = u?.currentTarget as { def?: { id?: string }; kind?: string } | null | undefined;
      if (!t) return null;
      return (t as { def?: { id?: string } }).def?.id ?? t.kind ?? null;
    },
    damageUnit: (defId: string, amount: number) => {
      const find = (list: typeof s.world.allies) => list.find((u) => u.alive && u.def.id === defId);
      const u = find(s.world.allies) ?? find(s.world.enemies);
      if (!u) return false;
      u.applyDamage(amount, u.position.x, u.position.z);
      return true;
    },
  };
}
