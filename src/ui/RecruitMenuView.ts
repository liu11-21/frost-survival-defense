import { ALLY_UNITS } from "../data/UnitDefinitions";
import { resourceIcon } from "./ResourceIcons";
import { describeSpecial, roleTag, speedWord } from "./PanelText";
import type { PanelDeps, PanelResult } from "./ActionPanels";

export type RecruitMenuTab = "melee" | "ranged" | "support" | "engineer";

export const RECRUIT_MENU_TABS: readonly RecruitMenuTab[] = [
  "melee",
  "ranged",
  "support",
  "engineer",
];

const RECRUIT_TAB_LABELS: Record<RecruitMenuTab, string> = {
  melee: "近戰",
  ranged: "遠程",
  support: "支援",
  engineer: "工程",
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

function attackTypeName(kind: string): string {
  switch (kind) {
    case "meleeArea":
      return "近戰範圍";
    case "meleeSingle":
      return "近戰單體";
    case "rangedSingle":
      return "遠程單體";
    case "rangedArea":
      return "遠程範圍";
    case "heal":
      return "治療";
    default:
      return "無";
  }
}

export interface RecruitMenuCallbacks {
  onResult(result: PanelResult): void;
  onFocus(button: HTMLButtonElement): void;
  /** Re-renders after a recruit attempt, so cost/limit state stays current. */
  onRerender(): void;
}

/** The recruit-hall roster: one card per ally type, cost, per-member stats,
 * and — when unavailable — exactly why (hall unbuilt, squad cap, gold short). */
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
    ? `招募所 · 小隊 ${count}/${limit} · 工程兵 ${squads.engineerSquadsUsed}/${run.engineerLimit} · 金幣 ${Math.floor(store.gold)}`
    : "招募所尚未完成";

  const list = refs.recruitList;
  list.innerHTML = hasHall ? "" : '<div class="panel-note">先在內圈槽位建造招募所，才能招募小隊。</div>';

  const visible = ALLY_UNITS.filter((def) => recruitCategory(def.id) === activeTab);

  for (const def of visible) {
    const cost = run.recruitCost(def.id);
    const engineer = def.canRepair === true;
    let reason = "";
    if (!hasHall) reason = "招募所未完成";
    else if (engineer && squads.engineerSquadsUsed >= run.engineerLimit) reason = `工程兵已達上限 ${run.engineerLimit}`;
    else if (!engineer && count >= limit) reason = `小隊已達上限 ${limit}`;
    else if (store.gold < cost) reason = `金幣不足，還差 ${Math.ceil(cost - store.gold)}`;

    const isHeal = def.attackType === "heal";
    const isBanner = def.supportAura !== undefined;
    const stats = run.allyFurnaceStats(def.id);
    const power = isBanner
      ? "無攻擊 · 範圍增益"
      : isHeal
        ? `治療 ${stats?.power ?? def.attackPower}`
        : def.attackType === "none" ? "無攻擊" : `攻擊 ${stats?.power ?? def.attackPower}`;
    const entry = document.createElement("div");
    entry.className = "entry static recruit-card";
    entry.innerHTML = `
      <div class="entry-main">
        <div class="entry-name recruit-name">${def.name}
          <span class="tag">${roleTag(def.id)}</span>
          <span class="tag">${def.squadSize} 人小隊</span>
          ${engineer ? '<span class="tag warn">獨立額度</span>' : `<span class="tag ok">火爐 Lv.${stats?.level ?? 1}</span>`}</div>
        <div class="entry-desc compact-stat">生命 ${stats?.health ?? def.maxHealth} · ${power} · ${attackTypeName(def.attackType)}</div>
        <div class="entry-desc">攻速 ${speedWord(stats?.interval ?? def.attackInterval)}（${(stats?.interval ?? def.attackInterval).toFixed(2)} 秒）
          · 距離 ${def.attackRange}</div>
        <div class="entry-desc special">${describeSpecial(def.id)}</div>
      </div>
      <div class="recruit-actions">
        <button class="mini-btn recruit-action recruit-buy" data-recruit="${def.id}" ${reason ? "disabled" : ""}>
          <span>招募</span> <strong>${resourceIcon("gold", 18)} ${cost}</strong>
          ${reason ? `<span class="bad">${reason}</span>` : ""}
        </button>
      </div>`;
    const recruitButton = entry.querySelector<HTMLButtonElement>("[data-recruit]");
    recruitButton?.addEventListener("click", () => {
      const failure = run.tryRecruit(def.id);
      if (failure) {
        callbacks.onResult({ ok: false, title: `無法招募：${def.name}`, message: failure, iconId: "gold" });
      } else {
        callbacks.onResult({
          ok: true,
          title: `已招募：${def.name}`,
          message: engineer
            ? `工程兵從中央火爐旁出發，消耗 ${cost} 金幣。目前 ${squads.engineerSquadsUsed} / ${run.engineerLimit}。`
            : `${def.squadSize} 人小隊，消耗 ${cost} 金幣。目前小隊 ${squads.allySquadSlotsUsed} / ${run.squadLimit}。`,
          iconId: "gold",
        });
      }
      callbacks.onRerender();
    });
    recruitButton?.addEventListener("focus", () => callbacks.onFocus(recruitButton));
    list.appendChild(entry);
  }
}
