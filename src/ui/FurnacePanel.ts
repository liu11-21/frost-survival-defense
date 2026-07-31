import { costLine, costText } from "./CostLine";
import { costBreakdown } from "./PanelText";
import type { PanelDeps, PanelResult } from "./ActionPanels";
import { FURNACE } from "../data/FurnaceUpgradeConfig";

/**
 * The furnace upgrade panel: exact before/after numbers, the full cost, and —
 * when it is unaffordable — precisely which resources are short.
 */
export function renderFurnacePanel(
  d: PanelDeps,
  onResult: (result: PanelResult) => void,
): HTMLButtonElement | null {
  const { run, furnace, heroStats, refs, store } = d;
  refs.recruitHeader.textContent = `中央火爐 · Lv.${furnace.currentLevel}`;
  const list = refs.recruitList;

  if (!run.allowFurnaceUpgrade) {
    list.innerHTML =
      '<div class="panel-note">本關卡禁止升級火爐。</div>' +
      `<div class="entry static"><div class="entry-main">
        <div class="entry-desc">火爐生命 ${Math.ceil(furnace.health)} / ${furnace.maxHealth}</div>
      </div></div>`;
    return null;
  }

  const cost = run.furnaceUpgradeCost;
  const missing = costBreakdown(store, cost);
  const preview = run.previewNextLevel();
  const repairLine =
    `設施持續自修：每秒 ${(preview.repairPercent * 100).toFixed(0)}% → ` +
    `${(preview.nextRepairPercent * 100).toFixed(0)}%（未受擊 15 秒後）`;
  const fixedLine =
    `8 秒一次性修復：${preview.fixedRepair} → ${preview.nextFixedRepair} HP（每次受擊後重置）`;
  const allyLine =
    `全我方兵種：生命 +${Math.round((preview.allyHealthMultiplier - 1) * 100)}% → +${Math.round((preview.nextAllyHealthMultiplier - 1) * 100)}%` +
    `、攻擊 +${Math.round((preview.allyAttackMultiplier - 1) * 100)}% → +${Math.round((preview.nextAllyAttackMultiplier - 1) * 100)}%` +
    `、攻速 +${Math.round((preview.allyAttackSpeedMultiplier - 1) * 100)}% → +${Math.round((preview.nextAllyAttackSpeedMultiplier - 1) * 100)}%`;
  const facilityLine =
    `所有設施：生命 +${Math.round((preview.facilityHealthMultiplier - 1) * 100)}% → +${Math.round((preview.nextFacilityHealthMultiplier - 1) * 100)}%` +
    `、攻擊 +${Math.round((preview.facilityAttackMultiplier - 1) * 100)}% → +${Math.round((preview.nextFacilityAttackMultiplier - 1) * 100)}%`;

  if (furnace.currentLevel >= FURNACE.maxLevel) {
    list.innerHTML = `
      <div class="entry static"><div class="entry-main">
        <div class="entry-name">火爐已達最高等級 Lv.${FURNACE.maxLevel}</div>
        <div class="entry-desc">設施持續自修：每秒 ${(preview.repairPercent * 100).toFixed(0)}%（未受擊 15 秒後）</div>
        <div class="entry-desc">8 秒一次性修復：${preview.fixedRepair} HP（每次受擊後重置）</div>
      </div></div>`;
    return null;
  }

  list.innerHTML = `
    <div class="entry static"><div class="entry-main">
      <div class="entry-name">升級效果（Lv.${furnace.currentLevel} → Lv.${furnace.currentLevel + 1}）</div>
      <div class="entry-desc">主角最大生命：${heroStats.maxHealth} → ${preview.heroHealth}</div>
      <div class="entry-desc">遠程攻擊：${Math.round(heroStats.rangedAttack)} → ${preview.ranged}</div>
      <div class="entry-desc">近戰攻擊：${Math.round(heroStats.meleeAttack)} → ${preview.melee}</div>
      <div class="entry-desc">攻擊間隔：${heroStats.attackInterval.toFixed(2)} 秒 → ${preview.interval.toFixed(2)} 秒</div>
      <div class="entry-desc">火爐最大生命：${furnace.maxHealth} → ${preview.furnaceHealth}</div>
      <div class="entry-desc">${allyLine}</div>
      <div class="entry-desc">${facilityLine}</div>
      <div class="entry-desc">${repairLine}</div>
      <div class="entry-desc">${fixedLine}</div>
      <div class="entry-desc">${preview.squadLimitNote}</div>
    </div></div>`;

  const button = document.createElement("button");
  button.className = "entry";
  button.disabled = missing !== "";
  button.innerHTML = `
    <div class="entry-main"><div class="entry-name">升級火爐</div>
      <div class="entry-desc">目前生命 ${Math.ceil(furnace.health)} / ${furnace.maxHealth}</div></div>
    <div class="entry-cost">${costLine(cost)}${missing ? `<span class="bad">${missing}</span>` : ""}</div>`;
  button.addEventListener("click", () => {
    const failure = run.tryUpgradeFurnace();
    if (failure) onResult({ ok: false, title: "無法升級火爐", message: failure, iconId: "gold" });
    else {
      onResult({
        ok: true,
        title: `火爐升級至 Lv.${furnace.currentLevel}`,
        message: `消耗 ${costText(cost)}。主角、全我方兵種與所有設施立即同步升級${run.squadLimitPerLevel > 0 ? "，小隊上限 +2" : ""}。`,
        iconId: "gold",
      });
    }
  });
  list.appendChild(button);
  return button;
}
