import type { HeroSkillId } from "../hero/HeroSkillDefinitions";
import { structureRepairFixedBurst } from "../combat/StructureSelfRepair";
import type { GameSystems } from "./GameSystems";

/** Hero-skill (1/2/3 plus automatic 4) inspection and control for the test harness. */
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
          vulnerability: enemy.vulnerabilityFactor,
          vulnerabilityRemaining: enemy.vulnerabilityRemaining,
        })),
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
