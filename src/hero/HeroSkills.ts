import type { BuildingManager } from "../buildings/BuildingManager";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import type { SquadManager } from "../combat/SquadManager";
import {
  AIR_SUPPORT,
  GROUND_SUPPORT,
  HERO_SKILL_BY_ID,
  HERO_SKILLS,
  INFINITE_FIREPOWER,
  SEISMIC_WAVE,
  type HeroSkillId,
} from "./HeroSkillDefinitions";
import type { HeroController } from "./HeroController";

export interface HeroSkillStateView {
  id: HeroSkillId;
  key: string | null;
  keyLabel: string;
  name: string;
  description: string;
  shortDescription: string;
  cooldown: number;
  remaining: number;
  activeRemaining: number;
  /** Compact count shown on Infinite Firepower's card. */
  activeAttackBuildings?: number;
  ready: boolean;
}

interface AirSupportState {
  strikesRemaining: number;
  strikeTimer: number;
  flameRemaining: number;
  flameTickTimer: number;
}

/** Owns the hero's three manual skills, one automatic skill, and their timers. */
export class HeroSkills {
  private readonly remaining = new Map<HeroSkillId, number>();
  private airSupport: AirSupportState | null = null;
  private groundSupportRemaining = 0;

  constructor(
    private readonly hero: HeroController,
    private readonly ctx: CombatContext,
    private readonly buildings: BuildingManager,
    private readonly squads: SquadManager,
  ) {
    this.reset();
  }

  update(dt: number): void {
    for (const skill of HERO_SKILLS) {
      const left = this.remaining.get(skill.id) ?? 0;
      if (left > 0) this.remaining.set(skill.id, Math.max(0, left - dt));
    }
    this.updateAirSupport(dt);
    this.tryAutoCastSeismicWave();
    if (this.groundSupportRemaining > 0) {
      this.groundSupportRemaining = Math.max(0, this.groundSupportRemaining - dt);
      if (this.groundSupportRemaining <= 0 || !this.squads.groundSupportActive) {
        this.squads.dismissGroundSupport();
        this.groundSupportRemaining = 0;
        this.remaining.set("groundSupport", GROUND_SUPPORT.duration > 0
          ? HERO_SKILL_BY_ID.get("groundSupport")?.cooldown ?? 30
          : 30);
      }
    }
  }

  reset(): void {
    this.airSupport = null;
    this.groundSupportRemaining = 0;
    this.squads.dismissGroundSupport();
    for (const skill of HERO_SKILLS) this.remaining.set(skill.id, skill.initialCooldown);
  }

  cooldownRemaining(id: HeroSkillId): number {
    return this.remaining.get(id) ?? 0;
  }

  setCooldownForTest(id: HeroSkillId, seconds: number): void {
    this.remaining.set(id, Math.max(0, seconds));
  }

  states(): HeroSkillStateView[] {
    return HERO_SKILLS.map((skill) => {
      const remaining = this.cooldownRemaining(skill.id);
      const activeRemaining = skill.id === "groundSupport"
        ? this.groundSupportRemaining
        : skill.id === "infiniteFirepower"
          ? this.buildings.attackSpeedBoostRemaining
          : 0;
      return {
        id: skill.id,
        key: skill.key,
        keyLabel: skill.keyLabel,
        name: skill.name,
        description: skill.description,
        shortDescription: skill.shortDescription,
        cooldown: skill.cooldown,
        remaining,
        activeRemaining,
        activeAttackBuildings: skill.id === "infiniteFirepower"
          ? this.buildings.activeAttackBuildingCount
          : undefined,
        ready: remaining <= 0 && activeRemaining <= 0,
      };
    });
  }

  tryUse(id: HeroSkillId): string | null {
    if (id === "seismicWave") return "震地波會在主角戰鬥時自動施放";
    if (!this.hero.alive) return "主角無法行動";
    if (id === "groundSupport" && this.groundSupportRemaining > 0) return "地面支援尚未撤退";
    if ((this.remaining.get(id) ?? 0) > 0) return "技能冷卻中";

    switch (id) {
      case "airSupport":
        this.castAirSupport();
        break;
      case "infiniteFirepower":
        this.castInfiniteFirepower();
        break;
      case "groundSupport":
        if (!this.castGroundSupport()) return "特殊護駕已在場上";
        return null;
    }

    this.remaining.set(id, HERO_SKILL_BY_ID.get(id)?.cooldown ?? 10);
    return null;
  }

  private castAirSupport(): void {
    this.airSupport = {
      strikesRemaining: AIR_SUPPORT.strikes,
      strikeTimer: 0,
      flameRemaining: 0,
      flameTickTimer: AIR_SUPPORT.flameTickInterval,
    };
    this.ctx.vfx.heroSkill("airSupport", 0, 0, AIR_SUPPORT.radius);
    this.ctx.vfx.sound("heroSkillFrost", 1, 0.75);
  }

  private updateAirSupport(dt: number): void {
    const state = this.airSupport;
    if (!state) return;
    if (state.strikesRemaining > 0) {
      state.strikeTimer -= dt;
      while (state.strikesRemaining > 0 && state.strikeTimer <= 0) {
        this.ctx.vfx.airStrike(0, 0, AIR_SUPPORT.radius);
        this.ctx.areaDamage(
          "ally",
          0,
          0,
          AIR_SUPPORT.radius,
          AIR_SUPPORT.strikeDamage,
          Number.MAX_SAFE_INTEGER,
        );
        this.ctx.vfx.areaBlast(0, 0, AIR_SUPPORT.radius);
        this.ctx.vfx.burstAt("blast", 0, 0, AIR_SUPPORT.flameParticles);
        state.strikesRemaining--;
        state.strikeTimer += AIR_SUPPORT.strikeInterval;
      }
      if (state.strikesRemaining === 0) {
        state.flameRemaining = AIR_SUPPORT.flameDuration;
        state.flameTickTimer = AIR_SUPPORT.flameTickInterval;
        this.ctx.vfx.groundFire(0, 0, AIR_SUPPORT.radius, AIR_SUPPORT.flameDuration);
      }
      return;
    }

    state.flameRemaining -= dt;
    state.flameTickTimer -= dt;
    while (state.flameRemaining > 0 && state.flameTickTimer <= 0) {
      this.ctx.areaDamage(
        "ally",
        0,
        0,
        AIR_SUPPORT.radius,
        AIR_SUPPORT.flameDps * AIR_SUPPORT.flameTickInterval,
        Number.MAX_SAFE_INTEGER,
      );
      this.ctx.vfx.burstAt("blast", 0, 0, 48);
      state.flameTickTimer += AIR_SUPPORT.flameTickInterval;
    }
    if (state.flameRemaining <= 0) this.airSupport = null;
  }

  private castInfiniteFirepower(): void {
    this.buildings.activateAttackSpeedBoost(
      INFINITE_FIREPOWER.duration,
      INFINITE_FIREPOWER.attackSpeedMultiplier,
    );
    this.ctx.vfx.heroSkill("infiniteFirepower", 0, 0, 8);
    this.ctx.vfx.sound("heroSkillBarrage", 0.9, 1.2);
  }

  private castGroundSupport(): boolean {
    const spawned = this.squads.spawnGroundSupport(this.hero.position.x, this.hero.position.z);
    if (!spawned) return false;
    this.groundSupportRemaining = GROUND_SUPPORT.duration;
    this.remaining.set("groundSupport", 0);
    this.ctx.vfx.heroSkill("groundSupport", this.hero.position.x, this.hero.position.z, 4);
    this.ctx.vfx.sound("heroSkillRally", 1);
    return true;
  }

  private castSeismicWave(): void {
    const { x, z } = this.hero.position;
    const yaw = this.hero.facingYaw;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const minDot = Math.cos(SEISMIC_WAVE.halfAngleRadians);
    const candidates = [...this.ctx.world.queryUnits("enemy", x, z, SEISMIC_WAVE.radius)];
    for (const enemy of candidates) {
      const dx = enemy.position.x - x;
      const dz = enemy.position.z - z;
      const len = Math.hypot(dx, dz);
      if (len < 0.001 || (dx / len) * forwardX + (dz / len) * forwardZ < minDot) continue;
      this.ctx.damage(enemy, SEISMIC_WAVE.damage, x, z);
      if (!enemy.alive) continue;
      const affected = enemy as CombatUnit;
      affected.applyKnockback(x, z, SEISMIC_WAVE.knockbackDistance);
      affected.applyVulnerability(SEISMIC_WAVE.vulnerability, SEISMIC_WAVE.vulnerabilityDuration);
    }
    this.ctx.vfx.heroSkill("seismicWave", x + forwardX * 3, z + forwardZ * 3, SEISMIC_WAVE.radius);
    this.ctx.vfx.sound("heroSkillBarrage", 1, 0.65);
  }

  /** Skill 4 fires itself only while the hero is actively engaging an enemy. */
  private tryAutoCastSeismicWave(): void {
    if (!this.hero.isAttacking || this.cooldownRemaining("seismicWave") > 0) return;
    const { x, z } = this.hero.position;
    const yaw = this.hero.facingYaw;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const minDot = Math.cos(SEISMIC_WAVE.halfAngleRadians);
    const targets = this.ctx.world.queryUnits("enemy", x, z, SEISMIC_WAVE.radius);
    const hasTargetInCone = targets.some((enemy) => {
      const dx = enemy.position.x - x;
      const dz = enemy.position.z - z;
      const length = Math.hypot(dx, dz);
      return length > 0.001 && (dx / length) * forwardX + (dz / length) * forwardZ >= minDot;
    });
    if (!hasTargetInCone) return;
    this.castSeismicWave();
    this.remaining.set("seismicWave", SEISMIC_WAVE.cooldown);
  }
}
