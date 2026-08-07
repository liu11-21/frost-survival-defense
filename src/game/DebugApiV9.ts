import type { HeroSkillId } from "../hero/HeroSkillDefinitions";
import { structureRepairFixedBurst } from "../combat/StructureSelfRepair";
import { LANES, nearestPointOnLane } from "../data/BuildSlotDefinitions";
import type { GameSystems } from "./GameSystems";

/** Hero-skill plus scene/lane inspection and control for the permanent harness. */
export function createV9DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    heroSkillState: () => s.heroSkills.states(),
    useHeroSkill: (id: HeroSkillId) => s.heroSkills.tryUse(id),
    setHeroSkillCooldown: (id: HeroSkillId, seconds: number) => s.heroSkills.setCooldownForTest(id, seconds),
    setFurnaceLevel: (level: number) => {
      const previousMax = s.heroStats.maxHealth;
      s.furnace.setLevel(level);
      s.heroStats.setFurnaceLevel(s.furnace.currentLevel);
      s.hero.refreshMaxHealth(previousMax);
      s.squads.setFurnaceLevel(s.furnace.currentLevel);
      s.buildings.setFurnaceLevel(s.furnace.currentLevel);
      s.arena.setFurnaceLevel(s.furnace.currentLevel);
      return s.furnace.currentLevel;
    },
    furnaceLevel: () => s.furnace.currentLevel,
    structureRepairBurstAt: (level: number, maxHealthAtLevelEleven: number) =>
      structureRepairFixedBurst(level, maxHealthAtLevelEleven),
    slotProduction: (slotId: string) => {
      const building = s.buildings.slot(slotId)?.building;
      return building
        ? {
            type: building.type,
            complete: building.isComplete,
            attackable: building.def.canBeAttacked,
            produces: building.produces ?? null,
            interval: building.def.produceInterval ?? null,
            stored: building.storedAmount,
          }
        : null;
    },
    skillEffectSnapshot: () => s.feedback.skillEffectSnapshot(),
    attackBuildingBoost: () => ({
      multiplier: s.buildings.attackSpeedMultiplier,
      remaining: s.buildings.attackSpeedBoostRemaining,
    }),
    groundSupportInfo: () => ({
      active: s.squads.groundSupportActive,
      health: s.squads.groundSupportHealth,
      members: s.squads.allySquads.find((squad) => squad.isGroundSupportSquad)?.aliveCount ?? 0,
      engaged:
        s.squads.allySquads
          .find((squad) => squad.isGroundSupportSquad)
          ?.members.some((member) => member.groundSupportEngaged) ?? false,
    }),
    damageGroundSupport: (amount: number) => {
      const member = s.squads.allySquads
        .find((squad) => squad.isGroundSupportSquad)
        ?.members.find((candidate) => candidate.alive);
      member?.applyDamage(amount, 0, 0);
      return s.squads.groundSupportHealth;
    },
    enemyStatus: () =>
      s.world.enemies
        .filter((enemy) => enemy.alive)
        .map((enemy) => ({
          id: enemy.def.id,
          hp: enemy.health,
          x: enemy.position.x,
          z: enemy.position.z,
          target: enemy.currentTarget?.kind ?? null,
          targetId:
            (enemy.currentTarget as { def?: { id?: string } } | null)?.def?.id ??
            enemy.currentTarget?.kind ??
            null,
          targetLane:
            enemy.currentTarget?.kind === "unit"
              ? (enemy.currentTarget as { laneIndex?: number }).laneIndex ?? null
              : null,
          laneIndex: enemy.laneIndex,
          moveSpeed: enemy.def.moveSpeed,
          navPoint: enemy.navPoint ? { x: enemy.navPoint.x, z: enemy.navPoint.z } : null,
          vulnerability: enemy.vulnerabilityFactor,
          vulnerabilityRemaining: enemy.vulnerabilityRemaining,
        })),

    // ------------------------------------------------------- G1 lane probes
    laneDefinitions: () =>
      LANES.map((lane) => ({
        index: lane.index,
        name: lane.name,
        side: lane.side,
        path: lane.path.map((point) => ({ ...point })),
        pathLength: Number(
          lane.path
            .slice(0, -1)
            .reduce((sum, point, index) => {
              const next = lane.path[index + 1];
              return sum + Math.hypot(next.x - point.x, next.z - point.z);
            }, 0)
            .toFixed(3),
        ),
      })),
    allyLaneStatus: () =>
      s.squads.allySquads.flatMap((squad) =>
        squad.members
          .filter((member) => member.alive)
          .map((member) => ({
            id: member.def.id,
            squadId: squad.id,
            laneIndex: member.laneIndex,
            x: member.position.x,
            z: member.position.z,
            home: member.home ? { x: member.home.x, z: member.home.z } : null,
            targetLane:
              member.currentTarget?.kind === "unit"
                ? (member.currentTarget as { laneIndex?: number }).laneIndex ?? null
                : null,
          })),
      ),
    /** Test-only deterministic deployment; production uses the real drag/drop
     * path in Game.handleRecruitDrop. */
    deploySquadForTest: (defId: string, laneIndex: number, x: number, z: number) => {
      const squad = [...s.squads.allySquads]
        .reverse()
        .find((candidate) => candidate.alive && candidate.def.id === defId);
      const lane = LANES[((laneIndex % LANES.length) + LANES.length) % LANES.length];
      if (!squad || !lane) return false;
      const snap = nearestPointOnLane(x, z, lane);
      for (let i = 0; i < squad.members.length; i++) {
        const member = squad.members[i];
        if (!member.alive) continue;
        const offset = (i - (squad.members.length - 1) * 0.5) * 0.7;
        member.laneIndex = lane.index;
        member.setPosition(snap.x + offset, snap.z);
        member.home = member.position.clone();
        member.aiBrain?.forceReacquire("debugLaneDeploy");
      }
      return true;
    },
    healthLabelFacing: () =>
      s.scene.meshes
        .filter((mesh) => mesh.name.startsWith("hpLabelPlane") && mesh.isEnabled())
        .map((mesh) => ({
          billboard: mesh.billboardMode,
          hasParent: mesh.parent !== null,
        })),
    heroTargetId: () => s.hero.currentTarget?.def.id ?? null,
    heroTargetAlive: () => s.hero.currentTarget?.alive ?? null,
    heroFacingYaw: () => s.hero.facingYaw,
  };
}
