import { repairStats } from "../combat/Squad";
import { tierBonusMultiplier } from "../combat/UnitAttacks";
import { CODEX_ENTRIES } from "../data/CodexData";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import type { GameSystems } from "./GameSystems";

/**
 * The v5/v6 unit-inspection hooks (Engineer through Ice Bomber), split out of
 * `DebugApi.ts` purely to keep that file under the project's line budget —
 * still development-only and tree-shaken out of production the same way.
 */
export function createV6DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    spawnAlly: (id: string, x: number, z: number) => s.squads.recruit(id, x, z, s.furnace.currentLevel),
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
        modelSource: u.modelSource,
        authoredVisibleMeshCount: u.authoredVisibleMeshCount,
        proceduralVisibleMeshCount: u.proceduralVisibleMeshCount,
        currentAuthoredAnimation: u.currentAuthoredAnimation,
        currentLod: u.currentLod,
        attackPower: Number(u.attackPower.toFixed(2)),
        furnaceLevel: u.furnaceLevel,
        isFlying: u.isFlying,
        bannerAttackBonus: Number(u.bannerAttackBonus.toFixed(3)),
        bannerAttackSpeedBonus: Number(u.bannerAttackSpeedBonus.toFixed(3)),
        damageReduction: Number(u.activeDamageReduction.toFixed(2)),
        protectionRemaining: Number(u.phasedProtectionRemaining.toFixed(2)),
        aiState: u.aiState,
        targetKind: u.currentTarget?.kind ?? null,
      };
    },
    allUnitsOf: (defId: string) =>
      [...s.world.allies, ...s.world.enemies]
        .filter((u) => u.alive && u.def.id === defId)
        .map((u) => ({
          hp: Math.ceil(u.health),
          max: u.maxHealth,
          attackPower: Number(u.attackPower.toFixed(2)),
          furnaceLevel: u.furnaceLevel,
          isFlying: u.isFlying,
          bannerAttackBonus: Number(u.bannerAttackBonus.toFixed(3)),
          bannerAttackSpeedBonus: Number(u.bannerAttackSpeedBonus.toFixed(3)),
          x: Number(u.position.x.toFixed(1)),
          z: Number(u.position.z.toFixed(1)),
          slowFactor: Number(u.slowFactor.toFixed(3)),
          isStunned: u.isStunned,
          effectiveMoveSpeed: Number(u.effectiveMoveSpeed.toFixed(2)),
          effectiveInterval: Number(u.effectiveInterval.toFixed(3)),
          modelSource: u.modelSource,
          authoredVisibleMeshCount: u.authoredVisibleMeshCount,
          proceduralVisibleMeshCount: u.proceduralVisibleMeshCount,
          currentAuthoredAnimation: u.currentAuthoredAnimation,
          currentLod: u.currentLod,
        })),
    repairStats: () => ({ ...repairStats }),
    engineerReport: () =>
      s.squads.allySquads
        .filter((squad) => squad.alive && squad.isEngineerSquad)
        .map((squad) => {
          const unit = squad.members.find((member) => member.alive);
          const target = squad.assignedRepairTarget;
          return {
            squadId: squad.id,
            hp: unit ? Math.ceil(unit.health) : 0,
            x: unit ? Number(unit.position.x.toFixed(2)) : 0,
            z: unit ? Number(unit.position.z.toFixed(2)) : 0,
            targetSlot: target?.slot.id ?? null,
            state: unit?.aiState ?? "none",
          };
        }),
    engineerCounts: () => ({
      used: s.squads.engineerSquadsUsed,
      limit: s.run.engineerLimit,
      regularUsed: s.squads.allySquadSlotsUsed,
    }),
    furnaceAllyInfo: (defId: string) => s.run.allyFurnaceStats(defId),
    allyCombatPreview: (defId: string, targetLevel: number) => {
      const def = ALLY_BY_ID.get(defId);
      if (!def) return null;
      const tierMultiplier = tierBonusMultiplier(def, targetLevel);
      return {
        attackPower: def.attackPower,
        recruitCost: def.recruitCost ?? 0,
        tierMultiplier,
        damage: def.attackPower * tierMultiplier,
      };
    },
    codexEntry: (id: string) => {
      const entry = CODEX_ENTRIES.find((candidate) => candidate.id === id);
      return entry ? { name: entry.name, role: entry.role, fields: entry.fields, advice: entry.advice } : null;
    },
    allyTargetKind: (defId: string) => {
      const u = s.world.allies.find((a) => a.alive && a.def.id === defId);
      const t = (u?.aiBrain?.currentTarget ?? u?.currentTarget) as
        | { def?: { id?: string }; kind?: string }
        | null
        | undefined;
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
