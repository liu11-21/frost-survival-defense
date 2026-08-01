import type { BuildSlot } from "../buildings/BuildSlot";
import type { BuildingManager } from "../buildings/BuildingManager";
import { BUILDING_BY_ID, type BuildingType } from "../data/BuildingDefinitions";
import type { SquadManager } from "../combat/SquadManager";
import type { CombatWorld } from "../combat/CombatWorld";
import type { ResourceStore } from "../economy/ResourceStore";
import type { Furnace } from "../heat/Furnace";
import type { HeroStats } from "../hero/HeroStats";
import type { RunController } from "../modes/RunController";
import type { WaveManager } from "../enemies/WaveManager";
import type { Building } from "../buildings/Building";
import { costBreakdown, typeName } from "./PanelText";
import { costText } from "./CostLine";
import { renderBuildingInfo } from "./BuildingInfoPanel";
import { renderFurnacePanel } from "./FurnacePanel";
import { countsForSlot, entriesForTab, renderEntryHtml, renderTabsHtml, tabsForSlot, type BuildMenuTab } from "./BuildMenuView";
import {
  RECRUIT_MENU_TABS,
  renderRecruitList,
  renderRecruitTabsHtml,
  type RecruitMenuTab,
} from "./RecruitMenuView";
import type { UIRefs } from "./UIRoot";

/** What a panel action produced, ready for the notification layer. */
export interface PanelResult {
  ok: boolean;
  title: string;
  /** Plain text. Never markup — see `Notifications`. */
  message: string;
  iconId?: BuildingType | "wood" | "stone" | "gold";
}

export interface PanelDeps {
  refs: UIRefs;
  buildings: BuildingManager;
  store: ResourceStore;
  squads: SquadManager;
  run: RunController;
  furnace: Furnace;
  heroStats: HeroStats;
  world: CombatWorld;
  waves: WaveManager;
  /** Hovering a not-yet-built attack building's card previews its range at
   * the slot it would be built on; `null` clears it. */
  onRangePreview?: (preview: { x: number; z: number; type: BuildingType; surface: "ground" | "sky" } | null) => void;
}

type OpenPanel = "none" | "build" | "recruit" | "furnace";

/**
 * The build, recruit and furnace panels.
 *
 * Every entry states what it does, what it costs and — when it is unavailable —
 * exactly what is missing, because "資源不足" on its own tells the player
 * nothing they can act on.
 */
export class ActionPanels {
  private open: OpenPanel = "none";
  private currentSlot: BuildSlot | null = null;
  private refreshTimer = 0;
  private focused: HTMLButtonElement | null = null;
  /** True while the pointer is held down somewhere inside either list — kept
   * separate from CSS `:hover` because a press can start, then the cursor can
   * (very slightly) drift off the element before release. */
  private pointerDownInList = false;
  /** Set when a periodic refresh was skipped because the player was mid-click
   * or mid-hover on a card; flushed the moment the interaction ends, so the
   * panel is never more than one interaction stale. */
  private pendingRefresh = false;
  private activeTab: BuildMenuTab = "all";
  private activeRecruitTab: RecruitMenuTab = "melee";

  onToast: ((text: string) => void) | null = null;
  onResult: ((result: PanelResult) => void) | null = null;
  onBuilt: ((type: BuildingType) => void) | null = null;
  onDemolishRequest: ((slot: BuildSlot, building: Building) => void) | null = null;

  constructor(private readonly d: PanelDeps) {
    d.refs.recruitToggle.addEventListener("click", () => this.closeAll());
    for (const host of [d.refs.buildList, d.refs.recruitList, d.refs.buildTabs, d.refs.recruitTabs]) {
      host.addEventListener("pointerdown", () => {
        this.pointerDownInList = true;
      });
      host.addEventListener("pointerleave", () => this.flushIfIdle(this.hostsFor(this.open)));
    }
    // Pointerup is tracked at the window level: a press can end after the
    // cursor has already left the list (or the whole window), and a periodic
    // refresh must never fire while any button anywhere is still mid-press.
    window.addEventListener("pointerup", () => {
      this.pointerDownInList = false;
      this.flushIfIdle(this.hostsFor(this.open));
    });

    // Tab clicks/keys are delegated on the (never-replaced) tab-bar container,
    // not on individual tab buttons — the container survives every re-render,
    // so this is wired exactly once rather than needing to be reattached.
    d.refs.buildTabs.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-tab]");
      if (!btn?.dataset.tab) return;
      this.activeTab = btn.dataset.tab as BuildMenuTab;
      this.renderBuild();
    });
    d.refs.buildTabs.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!this.currentSlot) return;
      e.preventDefault();
      e.stopPropagation(); // never let PlayerInput's window-level listener treat this as hero movement
      const tabs = tabsForSlot(this.currentSlot);
      const idx = tabs.indexOf(this.activeTab);
      this.activeTab = tabs[(idx + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      this.renderBuild();
    });
    d.refs.recruitTabs.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-recruit-tab]");
      if (!button?.dataset.recruitTab) return;
      this.activeRecruitTab = button.dataset.recruitTab as RecruitMenuTab;
      this.renderRecruit();
    });
    d.refs.recruitTabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      const index = RECRUIT_MENU_TABS.indexOf(this.activeRecruitTab);
      this.activeRecruitTab = RECRUIT_MENU_TABS[
        (index + (event.key === "ArrowRight" ? 1 : -1) + RECRUIT_MENU_TABS.length) %
          RECRUIT_MENU_TABS.length
      ];
      this.renderRecruit();
    });
  }

  private hostsFor(panel: OpenPanel): HTMLElement[] {
    if (panel === "build") return [this.d.refs.buildList, this.d.refs.buildTabs];
    if (panel === "recruit") return [this.d.refs.recruitList, this.d.refs.recruitTabs];
    if (panel === "furnace") return [this.d.refs.recruitList];
    return [];
  }

  /**
   * A card (or tab) is "being interacted with" for as long as the pointer is
   * pressed anywhere in it, hovering it, or it holds keyboard focus — exactly
   * the cases the periodic refresh must never interrupt, since any of them
   * can be mid-click when the innerHTML swap would otherwise tear the clicked
   * button out from under the pointer.
   */
  private isInteracting(hosts: HTMLElement[]): boolean {
    if (hosts.length === 0) return false;
    if (this.pointerDownInList) return true;
    return hosts.some((host) => host.matches(":hover") || host.contains(document.activeElement));
  }

  private flushIfIdle(hosts: HTMLElement[]): void {
    if (!this.pendingRefresh || this.isInteracting(hosts)) return;
    this.pendingRefresh = false;
    this.renderOpenPanel();
  }

  get isBuildOpen(): boolean {
    return this.open === "build";
  }
  get isRecruitOpen(): boolean {
    return this.open === "recruit";
  }
  get anyOpen(): boolean {
    return this.open !== "none";
  }
  get nearbySlot(): BuildSlot | null {
    return this.currentSlot;
  }

  setNearbySlot(slot: BuildSlot | null): void {
    if (this.currentSlot === slot) return;
    this.currentSlot = slot;
    if (!slot && this.open === "build") this.closeAll();
    else if (this.open === "build") this.renderBuild();
  }

  toggleBuild(): void {
    if (this.open === "build") this.closeAll();
    else this.openBuild();
  }

  openBuild(): void {
    if (!this.currentSlot) {
      this.onToast?.("靠近建築槽位才能建造");
      return;
    }
    if (this.open !== "build") this.activeTab = "all";
    this.show("build");
    this.renderBuild();
  }

  toggleRecruit(): void {
    if (this.open === "recruit") this.closeAll();
    else this.openRecruit();
  }

  openRecruit(): void {
    if (this.open !== "recruit") this.activeRecruitTab = "melee";
    this.show("recruit");
    this.renderRecruit();
  }

  openFurnace(): void {
    this.show("furnace");
    this.renderFurnace();
  }

  closeAll(): void {
    this.open = "none";
    this.focused = null;
    this.d.refs.buildPanel.classList.remove("show");
    this.d.refs.recruitPanel.classList.remove("show");
    this.d.onRangePreview?.(null);
  }

  /** Enter activates whatever the panel is offering first. */
  confirmFocused(): void {
    if (this.open === "none") return;
    const button = this.focused ?? this.firstEnabledButton();
    button?.click();
  }

  update(dt: number): void {
    this.refreshTimer -= dt;
    if (this.refreshTimer > 0) return;
    this.refreshTimer = 0.25;
    if (this.open === "none") return;
    // Never tear down and rebuild the list out from under an in-flight click:
    // this is what used to eat clicks whose mousedown/mouseup straddled a
    // periodic refresh. Deferring here — and flushing the instant the
    // interaction ends, above — removes the race instead of just narrowing it.
    if (this.isInteracting(this.hostsFor(this.open))) {
      this.pendingRefresh = true;
      return;
    }
    this.renderOpenPanel();
  }

  private renderOpenPanel(): void {
    if (this.open === "build") this.renderBuild();
    else if (this.open === "recruit") this.renderRecruit();
    else if (this.open === "furnace") this.renderFurnace();
  }

  private show(panel: OpenPanel): void {
    this.open = panel;
    this.d.refs.buildPanel.classList.toggle("show", panel === "build");
    this.d.refs.recruitPanel.classList.toggle("show", panel === "recruit" || panel === "furnace");
  }

  private firstEnabledButton(): HTMLButtonElement | null {
    const host = this.open === "build" ? this.d.refs.buildList : this.d.refs.recruitList;
    return host.querySelector<HTMLButtonElement>("button.entry:not(:disabled), button.recruit-action:not(:disabled)");
  }

  // -------------------------------------------------------------- build ----

  private renderBuild(): void {
    const slot = this.currentSlot;
    const list = this.d.refs.buildList;
    const tabsHost = this.d.refs.buildTabs;
    if (!slot) {
      list.innerHTML = "";
      tabsHost.innerHTML = "";
      this.d.onRangePreview?.(null);
      return;
    }

    // The player always sees the slot's natural name (e.g. "北路前線A",
    // "東北交叉火力位") — never the internal id, which only tools/tests use.
    const occupied = slot.building && slot.building.alive ? slot.building : null;
    this.d.refs.buildTitle.textContent = occupied
      ? occupied.isDemolishing
        ? `${slot.name}：拆除中`
        : `${slot.name}：${typeName(occupied.type)}`
      : `${slot.name}（空閒可建造）`;

    if (occupied) {
      tabsHost.innerHTML = "";
      this.d.onRangePreview?.(null);
      renderBuildingInfo(list, slot, occupied, this.d.buildings, this.d.store, this.d.world, this.d.waves, {
        onDemolish: (s, b) => this.onDemolishRequest?.(s, b),
      });
      return;
    }

    const tabs = tabsForSlot(slot);
    if (!tabs.includes(this.activeTab)) this.activeTab = tabs[0];
    // Rebuilding the tab bar destroys whichever button held focus — restore
    // it to the newly-active tab so a second ArrowLeft/Right keypress still
    // reaches this same delegated listener instead of landing on `body`.
    const hadTabFocus = tabsHost.contains(document.activeElement);
    tabsHost.innerHTML = renderTabsHtml(tabs, this.activeTab, countsForSlot(slot, tabs));
    if (hadTabFocus) tabsHost.querySelector<HTMLButtonElement>("button.build-tab.on")?.focus();

    const pending = this.d.buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
    const queueNote =
      pending >= 0
        ? `<div class="panel-note">此點位在自動重建佇列第 ${pending + 1} 位，也可以手動先建。</div>`
        : "";

    const entries = entriesForTab(slot, this.activeTab, this.d.store, this.d.buildings.currentFurnaceLevel);
    const rangeContext = { slot, world: this.d.world, activeLaneCount: this.d.waves.activeLaneCount };
    list.innerHTML = queueNote + entries.map((e) => renderEntryHtml(e, rangeContext)).join("");
    // A rebuild replaces every card, so whatever was hovered before is gone —
    // never leave a stale range preview pointed at a destroyed DOM node.
    this.d.onRangePreview?.(null);
    for (const button of Array.from(list.querySelectorAll<HTMLButtonElement>("button.entry"))) {
      const type = button.dataset.buildType as BuildingType;
      button.addEventListener("click", () => this.doBuild(slot.id, type));
      button.addEventListener("focus", () => {
        this.focused = button;
      });
      if (BUILDING_BY_ID.get(type)?.attackKind) {
        button.addEventListener("pointerenter", () => this.d.onRangePreview?.({ x: slot.x, z: slot.z, type, surface: slot.surface }));
        button.addEventListener("pointerleave", () => this.d.onRangePreview?.(null));
      }
    }
  }

  private doBuild(slotId: string, type: BuildingType): void {
    const def = BUILDING_BY_ID.get(type);
    const health = type === "wall" ? this.d.run.wallHealthMultiplier : 1;
    const result = this.d.buildings.build(slotId, type, health);
    if (!result.ok) {
      const missing = def ? costBreakdown(this.d.store, def.cost) : "";
      this.onResult?.({
        ok: false,
        title: `無法建造：${def?.name ?? ""}`,
        message: missing || (result.reason ?? "無法建造"),
        iconId: type,
      });
      return;
    }
    // Plain words, not `costLine` — that returns SVG markup for the panel's
    // innerHTML and would print as source in a text-rendered notification.
    this.onResult?.({
      ok: true,
      title: `開始建造：${def?.name ?? type}`,
      message: `消耗 ${costText(def?.cost ?? {})}，預計 ${def?.buildTime.toFixed(1) ?? "?"} 秒完成。`,
      iconId: type,
    });
    this.onBuilt?.(type);
    this.renderBuild();
  }
  // ------------------------------------------------------------ recruit ----

  private renderRecruit(): void {
    this.d.refs.recruitTabs.innerHTML = renderRecruitTabsHtml(this.activeRecruitTab);
    renderRecruitList(this.d, {
      onResult: (result) => this.onResult?.(result),
      onFocus: (button) => {
        this.focused = button;
      },
      onRerender: () => this.renderRecruit(),
    }, this.activeRecruitTab);
  }

  // ------------------------------------------------------------ furnace ----

  private renderFurnace(): void {
    this.d.refs.recruitTabs.innerHTML = "";
    const button = renderFurnacePanel(this.d, (result) => {
      this.onResult?.(result);
      this.renderFurnace();
    });
    if (button) {
      button.addEventListener("focus", () => {
        this.focused = button;
      });
    }
  }
}
