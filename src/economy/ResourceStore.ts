import type { ResourceCost } from "../data/CombatTypes";
import { ECONOMY, type ResourceKind } from "../data/EconomyConfig";
import type { GameEvents } from "../game/GameEvents";

/**
 * The single source of truth for wood, stone and gold. Capacity is 100 each
 * until a warehouse stands, and unlimited afterwards.
 */
export class ResourceStore {
  private amounts: Record<ResourceKind, number> = { wood: 0, stone: 0, gold: 0 };
  private warehouseCount = 0;

  constructor(private readonly events: GameEvents) {}

  get wood(): number {
    return this.amounts.wood;
  }
  get stone(): number {
    return this.amounts.stone;
  }
  get gold(): number {
    return this.amounts.gold;
  }
  get hasWarehouse(): boolean {
    return this.warehouseCount > 0;
  }

  get(kind: ResourceKind): number {
    return this.amounts[kind];
  }

  capacity(): number {
    return this.warehouseCount > 0 ? Infinity : ECONOMY.baseCapacity;
  }

  /**
   * Returns whatever the cap trimmed, so the caller can drop it on the ground
   * rather than letting it silently vanish.
   */
  setWarehouseCount(count: number): Record<ResourceKind, number> {
    const trimmed: Record<ResourceKind, number> = { wood: 0, stone: 0, gold: 0 };
    if (this.warehouseCount === count) return trimmed;
    this.warehouseCount = count;
    if (count === 0) {
      for (const kind of ["wood", "stone", "gold"] as ResourceKind[]) {
        const over = this.amounts[kind] - ECONOMY.baseCapacity;
        if (over > 0) {
          trimmed[kind] = over;
          this.amounts[kind] = ECONOMY.baseCapacity;
        }
      }
    }
    this.emit();
    return trimmed;
  }

  reset(wood: number, stone: number, gold: number): void {
    this.amounts.wood = wood;
    this.amounts.stone = stone;
    this.amounts.gold = gold;
    this.warehouseCount = 0;
    this.emit();
  }

  /** Adds up to the current capacity; returns how much was actually stored. */
  add(kind: ResourceKind, amount: number): number {
    if (amount <= 0) return 0;
    const cap = this.capacity();
    const accepted = Math.min(amount, cap - this.amounts[kind]);
    if (accepted <= 0) return 0;
    this.amounts[kind] += accepted;
    this.emit();
    return accepted;
  }

  canAfford(cost: ResourceCost): boolean {
    return (
      this.amounts.wood >= (cost.wood ?? 0) &&
      this.amounts.stone >= (cost.stone ?? 0) &&
      this.amounts.gold >= (cost.gold ?? 0)
    );
  }

  /** All-or-nothing: partial payment is never taken. */
  spend(cost: ResourceCost): boolean {
    if (!this.canAfford(cost)) return false;
    this.amounts.wood -= cost.wood ?? 0;
    this.amounts.stone -= cost.stone ?? 0;
    this.amounts.gold -= cost.gold ?? 0;
    this.emit();
    return true;
  }

  /** Removes a fraction of one resource and reports the amount removed. */
  loseFraction(kind: ResourceKind, fraction: number): number {
    const lost = Math.floor(this.amounts[kind] * fraction);
    if (lost <= 0) return 0;
    this.amounts[kind] -= lost;
    this.emit();
    return lost;
  }

  /** Endless hero-death penalty. Never drives the balance below zero. */
  loseGoldPenalty(fraction: number, minimum: number): number {
    const target = Math.max(minimum, Math.floor(this.amounts.gold * fraction));
    const lost = Math.min(this.amounts.gold, target);
    if (lost <= 0) return 0;
    this.amounts.gold -= lost;
    this.emit();
    return lost;
  }

  /** What is missing for a cost, used by the UI to explain a disabled button. */
  shortfall(cost: ResourceCost): string {
    const parts: string[] = [];
    if (this.amounts.wood < (cost.wood ?? 0)) parts.push("木材");
    if (this.amounts.stone < (cost.stone ?? 0)) parts.push("石頭");
    if (this.amounts.gold < (cost.gold ?? 0)) parts.push("金幣");
    return parts.join("、");
  }

  private emit(): void {
    this.events.emit("resourcesChanged", {
      wood: this.amounts.wood,
      stone: this.amounts.stone,
      gold: this.amounts.gold,
      capacity: this.capacity(),
    });
  }
}
