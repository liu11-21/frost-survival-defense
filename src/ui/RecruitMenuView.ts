import { ALLY_UNITS } from "../data/UnitDefinitions";
import { RECRUIT_DRAG_MIME } from "../input/RecruitDrag";
import { entityName, t } from "../localization";
import { resourceIcon } from "./ResourceIcons";
import { unitThumbnailSvg } from "./UnitThumbnails";
import type { PanelDeps, PanelResult } from "./ActionPanels";

export type RecruitMenuTab = "melee" | "ranged" | "support" | "engineer";

export const RECRUIT_MENU_TABS: readonly RecruitMenuTab[] = ["melee", "ranged", "support", "engineer"];

function recruitCategory(defId: string): RecruitMenuTab {
  if (defId === "engineer") return "engineer";
  if (defId === "medic" || defId === "flagbearer") return "support";
  if (defId === "warrior" || defId === "shield" || defId === "assault") return "melee";
  return "ranged";
}

export function renderRecruitTabsHtml(active: RecruitMenuTab): string {
  return `<div class="build-tabs recruit-tabs" role="tablist" tabindex="0">${RECRUIT_MENU_TABS.map(
    (tab) =>
      `<button type="button" class="build-tab recruit-tab${tab === active ? " on" : ""}" role="tab" aria-selected="${tab === active}" data-recruit-tab="${tab}">${t(`recruit.tab.${tab}`)}</button>`,
  ).join("")}</div>`;
}

export interface RecruitMenuCallbacks {
  onResult(result: PanelResult): void;
  onFocus(button: HTMLButtonElement): void;
  onRerender(): void;
}

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
    ? t("recruit.header", {
        count,
        limit,
        engineers: squads.engineerSquadsUsed,
        engineerLimit: run.engineerLimit,
        gold: Math.floor(store.gold),
      })
    : t("recruit.noHall");

  const list = refs.recruitList;
  list.innerHTML = hasHall
    ? `<div class="panel-note recruit-drag-hint">${t("recruit.dragHint")}</div>`
    : `<div class="panel-note">${t("recruit.buildHallFirst")}</div>`;

  const visible = ALLY_UNITS.filter((def) => recruitCategory(def.id) === activeTab);
  for (const def of visible) {
    const cost = run.recruitCost(def.id);
    const engineer = def.canRepair === true;
    let reason = "";
    if (!hasHall) reason = t("recruit.reasonHall");
    else if (engineer && squads.engineerSquadsUsed >= run.engineerLimit) {
      reason = t("recruit.reasonEngineerCap", { limit: run.engineerLimit });
    } else if (!engineer && count >= limit) {
      reason = t("recruit.reasonSquadCap", { limit });
    } else if (store.gold < cost) {
      reason = t("recruit.reasonGold", { amount: Math.ceil(cost - store.gold) });
    }

    const name = entityName("unit", def.id, def.name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "entry recruit-icon-card";
    button.dataset.recruit = def.id;
    button.disabled = Boolean(reason);
    button.draggable = !reason;
    button.title = reason || t("recruit.dragTitle", { name });
    button.innerHTML = `
      <span class="recruit-icon-wrap">${unitThumbnailSvg(def.id)}</span>
      <span class="recruit-icon-name">${name}</span>
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
        title: name,
        message: reason || t("recruit.dragInstruction"),
        iconId: "gold",
      });
    });
    button.addEventListener("focus", () => callbacks.onFocus(button));
    list.appendChild(button);
  }
}
