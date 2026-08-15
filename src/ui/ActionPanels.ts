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
import { entityName, t } from "../localization";
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

export interface PanelResult {
  ok: boolean;
  title: string;
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
  onRangePreview?: (preview: { x: number; z: number; type: BuildingType; surface: "ground" | "sky" } | null) => void;
}

type OpenPanel = "none" | "build" | "recruit" | "furnace";

export class ActionPanels {
  private open: OpenPanel = "none";
  private currentSlot: BuildSlot | null = null;
  private refreshTimer = 0;
  private focused: HTMLButtonElement | null = null;
  private pointerDownInList = false;
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
    window.addEventListener("pointerup", () => {
      this.pointerDownInList = false;
      this.flushIfIdle(this.hostsFor(this.open));
    });

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
      e.stopPropagation();
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
        (index + (event.key === "ArrowRight" ? 1 : -1) + RECRUIT_MENU_TABS.length) % RECRUIT_MENU_TABS.length
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
      this.onToast?.(t("build.needSlot"));
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

    const occupied = slot.building && slot.building.alive ? slot.building : null;
    this.d.refs.buildTitle.textContent = occupied
      ? occupied.isDemolishing
        ? t("build.title.demolishing")
        : t("build.title.occupied", { name: typeName(occupied.type) })
      : t("build.title.empty");

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
    const hadTabFocus = tabsHost.contains(document.activeElement);
    tabsHost.innerHTML = renderTabsHtml(tabs, this.activeTab, countsForSlot(slot, tabs));
    if (hadTabFocus) tabsHost.querySelector<HTMLButtonElement>("button.build-tab.on")?.focus();

    const pending = this.d.buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
    const queueNote = pending >= 0
      ? `<div class="panel-note">${t("build.queueNote", { position: pending + 1 })}</div>`
      : "";

    const entries = entriesForTab(slot, this.activeTab, this.d.store, this.d.buildings.currentFurnaceLevel);
    const rangeContext = { slot, world: this.d.world, activeLaneCount: this.d.waves.activeLaneCount };
    list.innerHTML = queueNote + entries.map((e) => renderEntryHtml(e, rangeContext)).join("");
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
    const name = def ? entityName("building", def.id, def.name) : type;
    if (!result.ok) {
      const missing = def ? costBreakdown(this.d.store, def.cost) : "";
      this.onResult?.({
        ok: false,
        title: t("build.failed", { name }),
        message: missing || (result.reason ?? t("build.failedGeneric")),
        iconId: type,
      });
      return;
    }
    this.onResult?.({
      ok: true,
      title: t("build.started", { name }),
      message: t("build.startedBody", {
        cost: costText(def?.cost ?? {}),
        seconds: def?.buildTime.toFixed(1) ?? "?",
      }),
      iconId: type,
    });
    this.onBuilt?.(type);
    this.renderBuild();
  }

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
