import type { UnitDefinition } from "../data/CombatTypes";

type ArmorConfig = NonNullable<UnitDefinition["armor"]>;

/** Ice Armor Heavy: halves any single hit under the threshold, keyed off the
 * raw damage value itself — never off who or what dealt it. */
export function mitigate(cfg: ArmorConfig | undefined, broken: boolean, amount: number): number {
  if (!cfg || broken || amount >= cfg.threshold) return amount;
  return amount * 0.5;
}

/** True the one frame HP crosses the break threshold; never true again after. */
export function crossesBreakPoint(cfg: ArmorConfig | undefined, broken: boolean, health: number, maxHealth: number): boolean {
  return cfg !== undefined && !broken && health / maxHealth <= cfg.breakAtPercent;
}
