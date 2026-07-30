import { ALLY_UNITS } from "../data/UnitDefinitions";
import { resourceIcon } from "./ResourceIcons";
import { describeSpecial, roleTag, speedWord } from "./PanelText";
import type { PanelDeps, PanelResult } from "./ActionPanels";

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
export function renderRecruitList(d: PanelDeps, callbacks: RecruitMenuCallbacks): void {
  const { buildings, squads, run, store, refs } = d;
  const hasHall = buildings.hasRecruitHall;
  const count = squads.allySquadCount;
  const limit = run.squadLimit;
  refs.recruitHeader.textContent = hasHall
    ? `招募所 · 小隊 ${count} / ${limit} · 金幣 ${Math.floor(store.gold)}`
    : "招募所尚未完成";

  const list = refs.recruitList;
  list.innerHTML = hasHall ? "" : '<div class="panel-note">先在內圈槽位建造招募所，才能招募小隊。</div>';

  for (const def of ALLY_UNITS) {
    const cost = run.recruitCost(def.id);
    let reason = "";
    if (!hasHall) reason = "招募所未完成";
    else if (count >= limit) reason = `小隊已達上限 ${limit}`;
    else if (store.gold < cost) reason = `金幣不足，還差 ${Math.ceil(cost - store.gold)}`;

    const isHeal = def.attackType === "heal";
    const power = isHeal ? `治療 ${def.attackPower}` : `攻擊 ${def.attackPower}`;
    const entry = document.createElement("button");
    entry.className = "entry";
    entry.disabled = reason !== "";
    entry.innerHTML = `
      <div class="entry-main">
        <div class="entry-name">${def.name}
          <span class="tag">${roleTag(def.id)}</span>
          <span class="tag">${def.squadSize} 人小隊</span></div>
        <div class="entry-desc">每名成員 生命 ${def.maxHealth} · ${power}</div>
        <div class="entry-desc">攻速 ${speedWord(def.attackInterval)}（${def.attackInterval.toFixed(2)} 秒）
          · 距離 ${def.attackRange} · ${attackTypeName(def.attackType)}</div>
        <div class="entry-desc special">${describeSpecial(def.id)}</div>
      </div>
      <div class="entry-cost">${resourceIcon("gold", 16)} ${cost}
        ${reason ? `<span class="bad">${reason}</span>` : ""}</div>`;
    entry.addEventListener("click", () => {
      const failure = run.tryRecruit(def.id);
      if (failure) {
        callbacks.onResult({ ok: false, title: `無法招募：${def.name}`, message: failure, iconId: "gold" });
      } else {
        callbacks.onResult({
          ok: true,
          title: `已招募：${def.name}`,
          message: `${def.squadSize} 人小隊，消耗 ${cost} 金幣。目前小隊 ${squads.allySquadCount} / ${run.squadLimit}。`,
          iconId: "gold",
        });
      }
      callbacks.onRerender();
    });
    entry.addEventListener("focus", () => callbacks.onFocus(entry));
    list.appendChild(entry);
  }
}
