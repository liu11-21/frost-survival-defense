import type { HeroSkillId } from "../hero/HeroSkillDefinitions";
import { structureRepairFixedBurst } from "../combat/StructureSelfRepair";
import type { GameSystems } from "./GameSystems";

/** Hero active-skill (1/2/3) inspection and control for the test harness. */
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
      return s.furnace.currentLevel;
    },
    furnaceLevel: () => s.furnace.currentLevel,
    structureRepairBurstAt: (level: number, maxHealthAtLevelEleven: number) =>
      structureRepairFixedBurst(level, maxHealthAtLevelEleven),
    heroTargetId: () => s.hero.currentTarget?.def.id ?? null,
    heroTargetAlive: () => s.hero.currentTarget?.alive ?? null,
  };
}
