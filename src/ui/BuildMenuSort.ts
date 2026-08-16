import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { BuildingDefinition } from "../data/BuildingDefinitions";
import { buildCostForSurface } from "../data/BuildingDefinitions";
import type { ResourceCost } from "../data/CombatTypes";
import { t } from "../localization";
import { costBreakdown } from "./PanelText";

export type SortTier = 1 | 2 | 3 | 4 | 5;

export interface ClassifiedEntry {
  def: BuildingDefinition;
  tier: SortTier;
  affordable: boolean;
  shortfallText: string;
  reasonText: string;
  totalCost: number;
  cost: ResourceCost;
}

const SMALL_SHORTFALL_RATIO = 0.3;

function totalCostOf(cost: ResourceCost): number {
  return (cost.wood ?? 0) + (cost.stone ?? 0) + (cost.gold ?? 0);
}

export function classifyEntry(
  def: BuildingDefinition,
  slot: BuildSlot,
  store: ResourceStore,
  furnaceLevel = Number.POSITIVE_INFINITY,
): ClassifiedEntry {
  const cost = buildCostForSurface(def, slot.surface);
  const totalCost = totalCostOf(cost);
  if (slot.category !== def.slotCategory && slot.surface !== "sky") {
    return {
      def,
      tier: 5,
      affordable: false,
      shortfallText: "",
      reasonText: t("build.slotBlocked"),
      totalCost,
      cost,
    };
  }
  if (!slot.isUnlocked(furnaceLevel)) {
    return {
      def,
      tier: 4,
      affordable: false,
      shortfallText: "",
      reasonText: t("build.unlock", { level: slot.unlockLevel }),
      totalCost,
      cost,
    };
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

export function sortClassified(entries: ClassifiedEntry[]): ClassifiedEntry[] {
  const declaredIndex = new Map(entries.map((e, i) => [e.def.id, i]));
  return [...entries].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
    return (declaredIndex.get(a.def.id) ?? 0) - (declaredIndex.get(b.def.id) ?? 0);
  });
}
