import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { CombatWorld } from "../combat/CombatWorld";
import { LANES, type LaneDefinition } from "../data/BuildSlotDefinitions";
import { computeLaneCoverage, laneCoverageText } from "../buildings/AttackRangeGeometry";
import { BUILDINGS, BUILDING_BY_ID, type BuildingDefinition } from "../data/BuildingDefinitions";
import { buildMenuCategoryOf, type BuildMenuCategory } from "../data/BuildMenuCategories";
import { entityDescription, entityName, t } from "../localization";
import { classifyEntry, sortClassified, type ClassifiedEntry } from "./BuildMenuSort";
import { buildingThumbnailHtml } from "./BuildingThumbnails";
import { costLine } from "./CostLine";

export type BuildMenuTab = "all" | BuildMenuCategory | "wall";

const UNIVERSAL_TABS: BuildMenuTab[] = ["all", "production", "support", "defense", "automation"];
const UNIVERSAL_DEFS: BuildingDefinition[] = BUILDINGS.filter((b) => b.slotCategory === "universal");
const WALL_DEF = BUILDING_BY_ID.get("wall")!;

export function tabsForSlot(slot: BuildSlot): BuildMenuTab[] {
  if (slot.category === "wall") return ["wall"];
  if (slot.surface === "sky") return ["defense"];
  return UNIVERSAL_TABS;
}

export function tabLabel(tab: BuildMenuTab): string {
  return t(`build.tab.${tab}`);
}

function candidatesFor(slot: BuildSlot): BuildingDefinition[] {
  if (slot.category === "wall") return [WALL_DEF];
  if (slot.surface === "sky") return UNIVERSAL_DEFS.filter((def) => Boolean(def.attackKind));
  return UNIVERSAL_DEFS;
}

export function entriesForTab(
  slot: BuildSlot,
  tab: BuildMenuTab,
  store: ResourceStore,
  furnaceLevel = Number.POSITIVE_INFINITY,
): ClassifiedEntry[] {
  const pool = candidatesFor(slot).filter(
    (def) => tab === "all" || tab === "wall" || buildMenuCategoryOf(def.id) === tab,
  );
  return sortClassified(pool.map((def) => classifyEntry(def, slot, store, furnaceLevel)));
}

export function countsForSlot(slot: BuildSlot, tabs: readonly BuildMenuTab[]): Map<BuildMenuTab, number> {
  const all = candidatesFor(slot);
  const counts = new Map<BuildMenuTab, number>();
  for (const tab of tabs) {
    counts.set(
      tab,
      tab === "all" || tab === "wall"
        ? all.length
        : all.filter((def) => buildMenuCategoryOf(def.id) === tab).length,
    );
  }
  return counts;
}

export function renderTabsHtml(
  tabs: readonly BuildMenuTab[],
  active: BuildMenuTab,
  counts: Map<BuildMenuTab, number>,
): string {
  return `<div class="build-tabs" role="tablist" tabindex="0">${tabs
    .map((tab) =>
      `<button type="button" class="build-tab${tab === active ? " on" : ""}" role="tab" aria-selected="${tab === active}" data-tab="${tab}">${tabLabel(tab)}<b>${counts.get(tab) ?? 0}</b></button>`,
    )
    .join("")}</div>`;
}

function stateTag(entry: ClassifiedEntry): string {
  const keys: Record<number, string> = {
    1: "build.state.ready",
    2: "build.state.close",
    3: "build.state.short",
    4: "build.state.locked",
    5: "build.state.invalid",
  };
  const cls = entry.tier === 1 ? "ok" : entry.tier === 2 ? "warn" : "bad";
  return `<span class="tag ${cls}">${t(keys[entry.tier])}</span>`;
}

export function renderEntryHtml(
  entry: ClassifiedEntry,
  rangeContext?: { slot: BuildSlot; world: CombatWorld; activeLaneCount: number },
): string {
  const def = entry.def;
  const disabled = entry.tier !== 1;
  let coverage = "";
  if (def.attackKind && rangeContext) {
    const liveLanes: LaneDefinition[] = LANES.filter((lane) => lane.index < rangeContext.activeLaneCount);
    const range = (def.attackRange ?? 0) *
      (rangeContext.slot.surface === "sky" && (def.attackKind === "snipe" || def.attackKind === "areaShell") ? 1.5 : 1);
    coverage = laneCoverageText(
      computeLaneCoverage(
        rangeContext.slot.x,
        rangeContext.slot.z,
        range,
        liveLanes,
        def.requiresLineOfSight === true,
        rangeContext.world,
      ),
    );
  }
  const name = entityName("building", def.id, def.name);
  const description = entityDescription("building", def.id, def.description);
  const reason = entry.reasonText || entry.shortfallText;
  const tooltip = [description, coverage, reason].filter(Boolean).join(" · ").replace(/"/g, "&quot;");
  return `
    <button class="entry build-icon-card" data-build-type="${def.id}" ${disabled ? "disabled" : ""}
      title="${tooltip}" aria-label="${name}${coverage ? `, ${coverage}` : ""}">
      <div class="entry-icon build-icon-large">${buildingThumbnailHtml(def.id)}</div>
      <div class="entry-main build-icon-main">
        <div class="entry-name build-icon-name">${name}${stateTag(entry)}</div>
      </div>
      <div class="entry-cost build-icon-cost">
        ${costLine(entry.cost)}
        ${rangeContext?.slot.surface === "sky" ? `<span class="tag sky">${t("build.skyBoost")}</span>` : ""}
      </div>
    </button>`;
}
