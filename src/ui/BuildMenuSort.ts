import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { BuildingDefinition } from "../data/BuildingDefinitions";
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
}

/** A shortfall this small counts as "close" rather than "far off" — inside
 * 30% of every short resource's requirement. Chosen so a single production
 * tick or two closes the gap, not an arbitrary hard cutoff. */
const SMALL_SHORTFALL_RATIO = 0.3;

function totalCostOf(def: BuildingDefinition): number {
  return (def.cost.wood ?? 0) + (def.cost.stone ?? 0) + (def.cost.gold ?? 0);
}

/** Classifies one building against one already-known-empty slot. */
export function classifyEntry(def: BuildingDefinition, slot: BuildSlot, store: ResourceStore): ClassifiedEntry {
  const totalCost = totalCostOf(def);
  if (slot.category !== def.slotCategory) {
    return { def, tier: 5, affordable: false, shortfallText: "", reasonText: "此槽位不可建造該設施", totalCost };
  }
  if (store.canAfford(def.cost)) {
    return { def, tier: 1, affordable: true, shortfallText: "", reasonText: "", totalCost };
  }

  const ratio = Math.max(
    def.cost.wood ? Math.max(0, def.cost.wood - store.wood) / def.cost.wood : 0,
    def.cost.stone ? Math.max(0, def.cost.stone - store.stone) / def.cost.stone : 0,
    def.cost.gold ? Math.max(0, def.cost.gold - store.gold) / def.cost.gold : 0,
  );
  return {
    def,
    tier: ratio <= SMALL_SHORTFALL_RATIO ? 2 : 3,
    affordable: false,
    shortfallText: costBreakdown(store, def.cost),
    reasonText: "",
    totalCost,
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
