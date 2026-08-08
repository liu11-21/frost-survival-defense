import { ALLY_UNITS } from "../data/UnitDefinitions";
import { RECRUIT_DRAG_MIME } from "../input/RecruitDrag";
import { resourceIcon } from "./ResourceIcons";
import type { PanelDeps, PanelResult } from "./ActionPanels";

export type RecruitMenuTab = "melee" | "ranged" | "support" | "engineer";

export const RECRUIT_MENU_TABS: readonly RecruitMenuTab[] = ["melee", "ranged", "support", "engineer"];

const RECRUIT_TAB_LABELS: Record<RecruitMenuTab, string> = {
  melee: "近戰",
  ranged: "遠程",
  support: "支援",
  engineer: "工程",
};

const UNIT_GLYPHS: Record<string, string> = {
  warrior: "戰",
  shield: "盾",
  archer: "弓",
  medic: "療",
  flagbearer: "旗",
  mage: "法",
  assault: "突",
  engineer: "修",
  musketeer: "銃",
  frostmage: "霜",
};

function recruitCategory(defId: string): RecruitMenuTab {
  if (defId === "engineer") return "engineer";
  if (defId === "medic" || defId === "flagbearer") return "support";
  if (defId === "warrior" || defId === "shield" || defId === "assault") return "melee";
  return "ranged";
}

export function renderRecruitTabsHtml(active: RecruitMenuTab): string {
  return `<div class="build-tabs recruit-tabs" role="tablist" tabindex="0">${RECRUIT_MENU_TABS.map(
    (tab) =>
      `<button type="button" class="build-tab recruit-tab${tab === active ? " on" : ""}" role="tab" aria-selected="${tab === active}" data-recruit-tab="${tab}">${RECRUIT_TAB_LABELS[tab]}</button>`,
  ).join("")}</div>`;
}

function unitIconSvg(id: string): string {
  const glyph = UNIT_GLYPHS[id] ?? "兵";
  return `<svg class="recruit-glyph" viewBox="0 0 48 48" width="42" height="42" aria-hidden="true">
    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="2" opacity=".72"/>
    <path d="M14 34c2-6 6-9 10-9s8 3 10 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="24" cy="17" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/>
    <text x="36" y="15" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">${glyph}</text>
  </svg>`;
}

export interface RecruitMenuCallbacks {
  onResult(result: PanelResult): void;
  onFocus(button: HTMLButtonElement): void;
  onRerender(): void;
}

/**
 * Compact roster.  The panel is intentionally not a second codex: cards carry
 * only identity, price and availability. Full stats/special rules stay in the
 * existing Codex screen. A legal card exports a drag payload; spending does not
 * happen until the canvas accepts the drop on a real lane.
 */
export function renderRecruitList(
  d: PanelDeps,
  callbacks: RecruitMenuCallbacks,
  activeTab: RecruitMenuTab,
): void {
  const { buildings, squads, run, store, refs } = d;
  const hasHall = buildings.hasRecruitHall;
  const count = squads.allySquadSlotsUsed;
  const limit = run.squadLimit;
  refs.recruitHeader.textContent = hasHall
    ? `小隊 ${count}/${limit} · 工程 ${squads.engineerSquadsUsed}/${run.engineerLimit} · 金 ${Math.floor(store.gold)}`
    : "招募所尚未完成";

  const list = refs.recruitList;
  list.innerHTML = hasHall
    ? '<div class="panel-note recruit-drag-hint">拖曳兵種圖示到進攻路線部署。完整數值與特殊規則請查看圖鑑。</div>'
    : '<div class="panel-note">先建造招募所，才能拖曳部署小隊。</div>';

  const visible = ALLY_UNITS.filter((def) => recruitCategory(def.id) === activeTab);
  for (const def of visible) {
    const cost = run.recruitCost(def.id);
    const engineer = def.canRepair === true;
    let reason = "";
    if (!hasHall) reason = "招募所未完成";
    else if (engineer && squads.engineerSquadsUsed >= run.engineerLimit) reason = `工程上限 ${run.engineerLimit}`;
    else if (!engineer && count >= limit) reason = `小隊上限 ${limit}`;
    else if (store.gold < cost) reason = `缺 ${Math.ceil(cost - store.gold)} 金`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry recruit-icon-card";
    button.dataset.recruit = def.id;
    button.disabled = Boolean(reason);
    button.draggable = !reason;
    button.title = reason || `${def.name}：拖曳到路線部署`;
    button.innerHTML = `
      <span class="recruit-icon-wrap">${unitIconSvg(def.id)}</span>
      <span class="recruit-icon-name">${def.name}</span>
      <strong class="recruit-icon-cost">${resourceIcon("gold", 16)} ${cost}</strong>
      ${reason ? `<span class="bad recruit-icon-reason">${reason}</span>` : ""}`;

    button.addEventListener("dragstart", (event) => {
      if (reason || !event.dataTransfer) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData(RECRUIT_DRAG_MIME, def.id);
      event.dataTransfer.setData("text/plain", def.id);
      button.classList.add("dragging");
    });
    button.addEventListener("dragend", () => button.classList.remove("dragging"));
    button.addEventListener("click", () => {
      callbacks.onResult({
        ok: false,
        title: def.name,
        message: reason || "請按住此圖示，拖曳到任一進攻路線上部署。",
        iconId: "gold",
      });
    });
    button.addEventListener("focus", () => callbacks.onFocus(button));
    list.appendChild(button);
  }
}
