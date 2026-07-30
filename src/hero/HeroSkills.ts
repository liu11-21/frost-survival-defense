import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import { BOSS_TIER_LEVEL } from "../data/CombatTypes";
import { BARRAGE, FROST_NOVA, HERO_SKILL_BY_ID, HERO_SKILLS, RALLY, type HeroSkillId } from "./HeroSkillDefinitions";
import type { HeroController } from "./HeroController";
import type { HeroStats } from "./HeroStats";

export interface HeroSkillStateView {
  id: HeroSkillId;
  key: string;
  keyLabel: string;
  name: string;
  description: string;
  shortDescription: string;
  cooldown: number;
  remaining: number;
  ready: boolean;
}

/**
 * Cooldowns and effects for the hero's 1/2/3 active skills. Kept out of
 * `HeroController` so that file stays about movement/auto-attack; this owns
 * nothing the controller doesn't already expose (position, target, heal).
 */
export class HeroSkills {
  private readonly remaining = new Map<HeroSkillId, number>(HERO_SKILLS.map((s) => [s.id, 0]));

  constructor(
    private readonly hero: HeroController,
    private readonly stats: HeroStats,
    private readonly ctx: CombatContext,
  ) {}

  update(dt: number): void {
    for (const skill of HERO_SKILLS) {
      const left = this.remaining.get(skill.id) ?? 0;
      if (left > 0) this.remaining.set(skill.id, Math.max(0, left - dt));
    }
  }

  reset(): void {
    for (const skill of HERO_SKILLS) this.remaining.set(skill.id, 0);
  }

  cooldownRemaining(id: HeroSkillId): number {
    return this.remaining.get(id) ?? 0;
  }

  /** Test-only: forces a specific cooldown remaining, bypassing `tryUse`. */
  setCooldownForTest(id: HeroSkillId, seconds: number): void {
    this.remaining.set(id, Math.max(0, seconds));
  }

  states(): HeroSkillStateView[] {
    return HERO_SKILLS.map((s) => {
      const remaining = this.cooldownRemaining(s.id);
      return {
        id: s.id,
        key: s.key,
        keyLabel: s.keyLabel,
        name: s.name,
        description: s.description,
        shortDescription: s.shortDescription,
        cooldown: s.cooldown,
        remaining,
        ready: remaining <= 0,
      };
    });
  }

  /** Attempts to cast. Returns a toast-ready failure reason, or null on success. */
  tryUse(id: HeroSkillId): string | null {
    if (!this.hero.alive) return "主角無法行動";
    if ((this.remaining.get(id) ?? 0) > 0) return "技能冷卻中";

    switch (id) {
      case "frostNova":
        this.castFrostNova();
        break;
      case "barrage":
        if (!this.castBarrage()) return "沒有可攻擊的目標";
        break;
      case "rally":
        this.castRally();
        break;
    }

    this.remaining.set(id, HERO_SKILL_BY_ID.get(id)?.cooldown ?? 10);
    return null;
  }

  private castFrostNova(): void {
    const { x, z } = this.hero.position;
    const damage = this.stats.rangedAttack * FROST_NOVA.damageMul;
    this.ctx.areaDamage("ally", x, z, FROST_NOVA.radius, damage, FROST_NOVA.maxTargets, (hit) => {
      const applicable = hit as Partial<CombatUnit>;
      if (typeof applicable.applySlowRefresh !== "function") return;
      const isBoss = hit.level >= BOSS_TIER_LEVEL;
      applicable.applySlowRefresh(
        isBoss ? FROST_NOVA.bossSlowAmount : FROST_NOVA.slowAmount,
        isBoss ? FROST_NOVA.bossSlowDuration : FROST_NOVA.slowDuration,
      );
    });
    this.ctx.vfx.burstAt("freezeZone", x, z, 40);
    this.ctx.vfx.sound("heroSkillFrost", 0.8);
  }

  /** Returns false (no cooldown spent) when there is nothing to fire at. */
  private castBarrage(): boolean {
    const target = this.hero.currentTarget;
    if (!target || !target.alive) return false;
    const { x, z } = this.hero.position;
    const damage = this.stats.rangedAttack * BARRAGE.damageMulPerShot;
    for (let i = 0; i < BARRAGE.shots; i++) {
      const jitterX = (Math.random() - 0.5) * BARRAGE.spread;
      const jitterZ = (Math.random() - 0.5) * BARRAGE.spread;
      this.ctx.vfx.burstAt("sniperAim", x + jitterX, z + jitterZ, 1);
      this.ctx.projectiles.fire("arrow", x + jitterX, 1.0, z + jitterZ, target, (hx, hz) => {
        if (target.alive) this.ctx.damage(target, damage, hx, hz);
        this.ctx.vfx.rangedHit(hx, hz);
      });
    }
    this.ctx.vfx.sound("heroSkillBarrage", 0.8);
    return true;
  }

  private castRally(): void {
    const { x, z } = this.hero.position;
    this.hero.heal(RALLY.healFlat);
    this.ctx.vfx.heal(x, z);
    const nearby = this.ctx.world.queryUnits("ally", x, z, RALLY.radius);
    for (const unit of nearby) {
      unit.heal(RALLY.healFlat);
      unit.grantDamageReduction(RALLY.shieldFactor, RALLY.shieldDuration);
      this.ctx.vfx.heal(unit.position.x, unit.position.z);
    }
    this.ctx.vfx.sound("heroSkillRally", 0.8);
  }
}
