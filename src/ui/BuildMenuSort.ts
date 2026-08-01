import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { BuildingDefinition } from "../data/BuildingDefinitions";
import { buildCostForSurface } from "../data/BuildingDefinitions";
import type { ResourceCost } from "../data/CombatTypes";
import { costBreakdown } from "./PanelText";

/**
 * 1 = unlocked and affordable right now; 2 = unlocked, only a small shortfall;
 * 3 = unlocked, a large shortfall; 4 = not yet unlocked; 5 = illegal on this
 * slot. Tiers 4 and 5 are fully wired but never populate against this game's
 * actual data: there is no per-building unlock/prerequisite/count-limit
 * system, and a slot's catalogue is only ever built from types that already
 * match its own category. They exist so the sort stays correct if either kind
 * of gating is ever added, not to fabricate a tier that does not currently
 * apply.
 */
export type SortTier = 1 | 2 | 3 | 4 | 5;

export interface ClassifiedEntry {
  def: BuildingDefinition;
  tier: SortTier;
  affordable: boolean;
  /** Exact per-resource shortfall text, e.g. "缺少 20 木材" — never blank coloring alone. */
  shortfallText: string;
  /** Populated for tier 4/5; explains why in the player's own terms. */
  reasonText: string;
  totalCost: number;
  cost: ResourceCost;
}

/** A shortfall this small counts as "close" rather than "far off" — inside
 * 30% of every short resource's requirement. Chosen so a single production
 * tick or two closes the gap, not an arbitrary hard cutoff. */
const SMALL_SHORTFALL_RATIO = 0.3;

function totalCostOf(cost: ResourceCost): number {
  return (cost.wood ?? 0) + (cost.stone ?? 0) + (cost.gold ?? 0);
}

/** Classifies one building against one already-known-empty slot. */
export function classifyEntry(def: BuildingDefinition, slot: BuildSlot, store: ResourceStore, furnaceLevel = Number.POSITIVE_INFINITY): ClassifiedEntry {
  const cost = buildCostForSurface(def, slot.surface);
  const totalCost = totalCostOf(cost);
  if (slot.category !== def.slotCategory) {
    if (slot.surface !== "sky") {
      return { def, tier: 5, affordable: false, shortfallText: "", reasonText: "此槽位不可建造該設施", totalCost, cost };
    }
  }
  if (!slot.isUnlocked(furnaceLevel)) {
    return { def, tier: 4, affordable: false, shortfallText: "", reasonText: `火爐 Lv.${slot.unlockLevel} 解鎖`, totalCost, cost };
  }
  if (store.canAfford(cost)) {
    return { def, tier: 1, affordable: true, shortfallText: "", reasonText: "", totalCost, cost };
  }

  const ratio = Math.max(
    cost.wood ? Math.max(0, cost.wood - store.wood) / cost.wood : 0,
    cost.stone ? Math.max(0, cost.stone - store.stone) / cost.stone : 0,
    cost.gold ? Math.max(0, cost.gold - store.gold) / cost.gold : 0,
  );
  return {
    def,
    tier: ratio <= SMALL_SHORTFALL_RATIO ? 2 : 3,
    affordable: false,
    shortfallText: costBreakdown(store, cost),
    reasonText: "",
    totalCost,
    cost,
  };
}

/**
 * Tier ascending, then cheaper first, then the definitions' own declared
 * order (a stable, deterministic stand-in for "fixed name order" — there is
 * no separate "recommended" flag in this game's data to break ties with
 * first, so cost is the primary tiebreaker).
 */
export function sortClassified(entries: ClassifiedEntry[]): ClassifiedEntry[] {
  const declaredIndex = new Map(entries.map((e, i) => [e.def.id, i]));
  return [...entries].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
    return (declaredIndex.get(a.def.id) ?? 0) - (declaredIndex.get(b.def.id) ?? 0);
  });
}
