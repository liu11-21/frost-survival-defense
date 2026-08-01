import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { CombatWorld } from "../combat/CombatWorld";
import { LANES, type LaneDefinition } from "../data/BuildSlotDefinitions";
import { computeLaneCoverage, laneCoverageText } from "../buildings/AttackRangeGeometry";
import { BUILDINGS, BUILDING_BY_ID, type BuildingDefinition } from "../data/BuildingDefinitions";
import { BUILD_MENU_CATEGORY_NAMES, buildMenuCategoryOf, type BuildMenuCategory } from "../data/BuildMenuCategories";
import { classifyEntry, sortClassified, type ClassifiedEntry } from "./BuildMenuSort";
import { buildingIconSvg } from "./ResourceIcons";
import { attackMethodName, effectiveAgainst, speedWord } from "./PanelText";
import { costLine } from "./CostLine";

export type BuildMenuTab = "all" | BuildMenuCategory | "wall";

const UNIVERSAL_TABS: BuildMenuTab[] = ["all", "production", "support", "defense", "automation"];
const UNIVERSAL_DEFS: BuildingDefinition[] = BUILDINGS.filter((b) => b.slotCategory === "universal");
const WALL_DEF = BUILDING_BY_ID.get("wall")!;

/** Which tabs a slot's category offers — a wall slot only ever gets its own
 * single tab, never the four universal ones, and vice versa. */
export function tabsForSlot(slot: BuildSlot): BuildMenuTab[] {
  if (slot.category === "wall") return ["wall"];
  if (slot.surface === "sky") return ["defense"];
  return UNIVERSAL_TABS;
}

export function tabLabel(tab: BuildMenuTab): string {
  if (tab === "all") return "全部";
  if (tab === "wall") return "防線";
  return BUILD_MENU_CATEGORY_NAMES[tab];
}

/** Every candidate definition for this slot, independent of which tab is
 * active — used both to render the full list and to compute each tab's count. */
function candidatesFor(slot: BuildSlot): BuildingDefinition[] {
  if (slot.category === "wall") return [WALL_DEF];
  if (slot.surface === "sky") return UNIVERSAL_DEFS.filter((def) => Boolean(def.attackKind));
  return UNIVERSAL_DEFS;
}

/** Classified + sorted entries for one tab. `"all"` and `"wall"` show every
 * candidate; a category tab filters to just its own members first. */
export function entriesForTab(slot: BuildSlot, tab: BuildMenuTab, store: ResourceStore, furnaceLevel = Number.POSITIVE_INFINITY): ClassifiedEntry[] {
  const pool = candidatesFor(slot).filter((def) => tab === "all" || tab === "wall" || buildMenuCategoryOf(def.id) === tab);
  return sortClassified(pool.map((def) => classifyEntry(def, slot, store, furnaceLevel)));
}

/** How many candidates each tab holds for this slot, for the tab bar's count badge. */
export function countsForSlot(slot: BuildSlot, tabs: readonly BuildMenuTab[]): Map<BuildMenuTab, number> {
  const all = candidatesFor(slot);
  const counts = new Map<BuildMenuTab, number>();
  for (const tab of tabs) {
    counts.set(tab, tab === "all" || tab === "wall" ? all.length : all.filter((def) => buildMenuCategoryOf(def.id) === tab).length);
  }
  return counts;
}

export function renderTabsHtml(tabs: readonly BuildMenuTab[], active: BuildMenuTab, counts: Map<BuildMenuTab, number>): string {
  return `<div class="build-tabs" role="tablist" tabindex="0">${tabs
    .map(
      (tab) =>
        `<button type="button" class="build-tab${tab === active ? " on" : ""}" role="tab" aria-selected="${tab === active}" data-tab="${tab}">${tabLabel(tab)}<b>${counts.get(tab) ?? 0}</b></button>`,
    )
    .join("")}</div>`;
}

function stateTag(entry: ClassifiedEntry): string {
  if (entry.tier === 1) return `<span class="tag ok">可建造</span>`;
  if (entry.tier === 2) return `<span class="tag warn">缺口不大</span>`;
  if (entry.tier === 3) return `<span class="tag bad">資源不足</span>`;
  if (entry.tier === 4) return `<span class="tag bad">尚未解鎖</span>`;
  return `<span class="tag bad">此處不可建造</span>`;
}

/** One build-menu card. First layer: icon/name/role/cost/state/core stat.
 * Hover/expanded layer (`.entry-expand`) carries the full numeric spread —
 * CSS reveals it on hover/focus so the compact list stays scannable.
 *
 * `rangeContext`, when given, computes the lane-coverage line from the exact
 * same `computeLaneCoverage` call the real ground-range display and the
 * built-structure info panel use — never a separately hardcoded preview. */
export function renderEntryHtml(entry: ClassifiedEntry, rangeContext?: { slot: BuildSlot; world: CombatWorld; activeLaneCount: number }): string {
  const def = entry.def;
  const disabled = entry.tier !== 1;
  const combatLine = def.attackKind
    ? `<div class="entry-desc">傷害 ${def.attackPower} · 攻速 ${speedWord(def.attackInterval ?? 1)}（${(def.attackInterval ?? 0).toFixed(2)} 秒）
        · 距離 ${def.attackRange ?? 0} · ${attackMethodName(def.attackKind)}</div>
      <div class="entry-desc special">剋制：${effectiveAgainst(def.id)}</div>`
    : "";
  let coverageLine = "";
  if (def.attackKind && rangeContext) {
    const liveLanes: LaneDefinition[] = LANES.filter((l) => l.index < rangeContext.activeLaneCount);
    const coverage = computeLaneCoverage(
      rangeContext.slot.x,
      rangeContext.slot.z,
      (def.attackRange ?? 0) * (rangeContext.slot.surface === "sky" && (def.attackKind === "snipe" || def.attackKind === "areaShell") ? 1.5 : 1),
      liveLanes,
      def.requiresLineOfSight === true,
      rangeContext.world,
    );
    coverageLine = `<div class="entry-desc special">${laneCoverageText(coverage)}</div>`;
  }
  const expand = `
    <div class="entry-expand">
      ${def.canBeAttacked ? `<div class="entry-desc">最大生命 ${def.maxHealth}</div>` : `<div class="entry-desc">不可被攻擊</div>`}
      <div class="entry-desc">建造時間 ${def.buildTime.toFixed(1)} 秒 · ${def.canBeRebuilt ? "可自動重建" : "不可自動重建"}</div>
      ${def.produces ? `<div class="entry-desc">產出：${def.produces === "wood" ? "木材" : def.produces === "stone" ? "石頭" : "金幣"}，每 ${def.produceInterval?.toFixed(2)} 秒 1 單位，緩衝上限 ${def.bufferCap}</div>` : ""}
      ${def.attackRange ? `<div class="entry-desc">最小距離 ${def.minAttackRange ?? 0} · 最大距離 ${def.attackRange}</div>` : ""}
      ${coverageLine}
    </div>`;
  const reasonLine = entry.tier >= 4 ? `<span class="bad">${entry.reasonText}</span>` : "";
  const cost = entry.cost;
  return `
    <button class="entry" data-build-type="${def.id}" ${disabled ? "disabled" : ""}>
      <div class="entry-icon">${buildingIconSvg(def.id, 30)}</div>
      <div class="entry-main">
        <div class="entry-name">${def.name}<span class="tag">${def.role}</span>${stateTag(entry)}</div>
        <div class="entry-desc">${def.description}</div>
        ${combatLine}
        ${expand}
      </div>
      <div class="entry-cost">${costLine(cost)}${entry.shortfallText ? `<span class="bad">${entry.shortfallText}</span>` : ""}${reasonLine}${rangeContext?.slot.surface === "sky" ? `<span class="tag sky">天空 ×1.5</span>` : ""}</div>
    </button>`;
}
