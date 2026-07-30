import { FURNACE_UPGRADE } from "../data/FurnaceUpgradeConfig";
import { HERO, HERO_MELEE } from "../data/UnitDefinitions";
import type { UpgradeState } from "../data/UpgradeDefinitions";

/**
 * Derived hero numbers. Furnace levels add a flat share of the *base* value and
 * run upgrades multiply on top, so nothing here ever compounds with itself.
 */
export class HeroStats {
  private furnaceLevel = 1;

  constructor(private readonly upgrades: UpgradeState) {}

  setFurnaceLevel(level: number): void {
    this.furnaceLevel = Math.max(1, level);
  }

  private get levelBonus(): number {
    return this.furnaceLevel - 1;
  }

  get maxHealth(): number {
    const fromFurnace = 1 + this.levelBonus * FURNACE_UPGRADE.heroMaxHealthPct;
    return Math.ceil(HERO.maxHealth * fromFurnace * this.upgrades.multiplier("heroHealth"));
  }

  get rangedAttack(): number {
    const fromFurnace = 1 + this.levelBonus * FURNACE_UPGRADE.heroRangedPct;
    return HERO.attackPower * fromFurnace * this.upgrades.multiplier("heroAttack");
  }

  get meleeAttack(): number {
    const fromFurnace = 1 + this.levelBonus * FURNACE_UPGRADE.heroMeleePct;
    return HERO_MELEE.power * fromFurnace * this.upgrades.multiplier("heroAttack");
  }

  /** Attack speed is expressed as a shrinking interval, floored so it stays sane. */
  get attackInterval(): number {
    const speedUp =
      1 + this.levelBonus * FURNACE_UPGRADE.heroAttackSpeedPct + (this.upgrades.multiplier("heroSpeed") - 1);
    return Math.max(0.18, HERO.attackInterval / speedUp);
  }

  get rangedRange(): number {
    return HERO.attackRange;
  }

  get moveSpeed(): number {
    return HERO.moveSpeed;
  }

  reset(): void {
    this.furnaceLevel = 1;
  }
}
