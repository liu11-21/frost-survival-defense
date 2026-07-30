import type { HeroSkillId } from "../hero/HeroSkillDefinitions";
import type { GameSystems } from "./GameSystems";

/** Hero active-skill (Q/R/F) inspection and control for the test harness. */
export function createV9DebugApi(s: GameSystems): Record<string, unknown> {
  return {
    heroSkillState: () => s.heroSkills.states(),
    useHeroSkill: (id: HeroSkillId) => s.heroSkills.tryUse(id),
    setHeroSkillCooldown: (id: HeroSkillId, seconds: number) => s.heroSkills.setCooldownForTest(id, seconds),
    heroTargetId: () => s.hero.currentTarget?.def.id ?? null,
    heroTargetAlive: () => s.hero.currentTarget?.alive ?? null,
  };
}
