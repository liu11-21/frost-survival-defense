import { RANGE } from "../data/CombatTypes";

export type HeroSkillId = "frostNova" | "barrage" | "rally";

export interface HeroSkillDefinition {
  readonly id: HeroSkillId;
  readonly key: "KeyQ" | "KeyR" | "KeyF";
  readonly name: string;
  readonly description: string;
  readonly cooldown: number;
}

/**
 * The hero's three active abilities. Purely cooldown-gated — like the hero's
 * own auto-attack, none of them spend a resource, so this adds no new economy.
 */
export const HERO_SKILLS: readonly HeroSkillDefinition[] = [
  {
    id: "frostNova",
    key: "KeyQ",
    name: "冰霜震擊",
    description: "以自身為中心震擊，對周圍敵人造成傷害並使其減速。",
    cooldown: 9,
  },
  {
    id: "barrage",
    key: "KeyR",
    name: "火力齊射",
    description: "對目前鎖定的敵人連射數箭，總傷害遠超一次普通攻擊。",
    cooldown: 11,
  },
  {
    id: "rally",
    key: "KeyF",
    name: "緊急集結",
    description: "治療自身與周圍友軍小隊，並賦予短暫傷害減免。",
    cooldown: 18,
  },
];

export const HERO_SKILL_BY_ID = new Map(HERO_SKILLS.map((s) => [s.id, s]));

/** Frost Nova (Q): an instant AoE burst centred on the hero. */
export const FROST_NOVA = {
  radius: 6.5,
  /** Multiplier against `HeroStats.rangedAttack`. */
  damageMul: 2.2,
  maxTargets: 8,
  slowAmount: 0.5,
  slowDuration: 2.5,
  bossSlowAmount: 0.3,
  bossSlowDuration: 1.5,
};

/** Focused Barrage (R): several rapid shots at the hero's current target. */
export const BARRAGE = {
  shots: 4,
  /** Multiplier against `HeroStats.rangedAttack`, applied per shot. */
  damageMulPerShot: 0.7,
  /** Small origin jitter so the volley visibly fans out from one point. */
  spread: 0.4,
};

/** Emergency Rally (F): heals and briefly shields the hero and nearby allies. */
export const RALLY = {
  radius: RANGE.mid,
  healFlat: 60,
  shieldFactor: 0.35,
  shieldDuration: 4,
};
