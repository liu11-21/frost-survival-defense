import { FURNACE } from "../data/FurnaceUpgradeConfig";
import { t } from "../localization";
import { costLine, costText } from "./CostLine";
import { costBreakdown } from "./PanelText";
import type { PanelDeps, PanelResult } from "./ActionPanels";

export function renderFurnacePanel(
  d: PanelDeps,
  onResult: (result: PanelResult) => void,
): HTMLButtonElement | null {
  const { run, furnace, heroStats, refs, store } = d;
  refs.recruitHeader.textContent = t("furnacePanel.header", { level: furnace.currentLevel });
  const list = refs.recruitList;

  if (!run.allowFurnaceUpgrade) {
    list.innerHTML =
      `<div class="panel-note">${t("furnacePanel.disabled")}</div>` +
      `<div class="entry static"><div class="entry-main">
        <div class="entry-desc">${t("furnacePanel.health", { health: Math.ceil(furnace.health), max: furnace.maxHealth })}</div>
      </div></div>`;
    return null;
  }

  const cost = run.furnaceUpgradeCost;
  const missing = costBreakdown(store, cost);
  const preview = run.previewNextLevel();
  const pct = (value: number) => Math.round((value - 1) * 100);
  const repairLine = t("furnacePanel.repair", {
    from: (preview.repairPercent * 100).toFixed(0),
    to: (preview.nextRepairPercent * 100).toFixed(0),
  });
  const fixedLine = t("furnacePanel.fixedRepair", { from: preview.fixedRepair, to: preview.nextFixedRepair });
  const allyLine = t("furnacePanel.allies", {
    hpFrom: pct(preview.allyHealthMultiplier),
    hpTo: pct(preview.nextAllyHealthMultiplier),
    atkFrom: pct(preview.allyAttackMultiplier),
    atkTo: pct(preview.nextAllyAttackMultiplier),
    spdFrom: pct(preview.allyAttackSpeedMultiplier),
    spdTo: pct(preview.nextAllyAttackSpeedMultiplier),
  });
  const facilityLine = t("furnacePanel.facilities", {
    hpFrom: pct(preview.facilityHealthMultiplier),
    hpTo: pct(preview.nextFacilityHealthMultiplier),
    atkFrom: pct(preview.facilityAttackMultiplier),
    atkTo: pct(preview.nextFacilityAttackMultiplier),
  });

  if (furnace.currentLevel >= FURNACE.maxLevel) {
    list.innerHTML = `
      <div class="entry static"><div class="entry-main">
        <div class="entry-name">${t("furnacePanel.max", { level: FURNACE.maxLevel })}</div>
        <div class="entry-desc">${repairLine}</div>
        <div class="entry-desc">${fixedLine}</div>
      </div></div>`;
    return null;
  }

  list.innerHTML = `
    <div class="entry static"><div class="entry-main">
      <div class="entry-name">${t("furnacePanel.effect", { from: furnace.currentLevel, to: furnace.currentLevel + 1 })}</div>
      <div class="entry-desc">${t("furnacePanel.heroHealth", { from: heroStats.maxHealth, to: preview.heroHealth })}</div>
      <div class="entry-desc">${t("furnacePanel.ranged", { from: Math.round(heroStats.rangedAttack), to: preview.ranged })}</div>
      <div class="entry-desc">${t("furnacePanel.melee", { from: Math.round(heroStats.meleeAttack), to: preview.melee })}</div>
      <div class="entry-desc">${t("furnacePanel.interval", { from: heroStats.attackInterval.toFixed(2), to: preview.interval.toFixed(2) })}</div>
      <div class="entry-desc">${t("furnacePanel.furnaceHealth", { from: furnace.maxHealth, to: preview.furnaceHealth })}</div>
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
    <div class="entry-main"><div class="entry-name">${t("furnacePanel.upgrade")}</div>
      <div class="entry-desc">${t("furnacePanel.currentHealth", { health: Math.ceil(furnace.health), max: furnace.maxHealth })}</div></div>
    <div class="entry-cost">${costLine(cost)}${missing ? `<span class="bad">${missing}</span>` : ""}</div>`;
  button.addEventListener("click", () => {
    const failure = run.tryUpgradeFurnace();
    if (failure) onResult({ ok: false, title: t("furnacePanel.failed"), message: failure, iconId: "gold" });
    else {
      onResult({
        ok: true,
        title: t("furnacePanel.success", { level: furnace.currentLevel }),
        message: t("furnacePanel.successBody", {
          cost: costText(cost),
          capacity: run.squadLimitPerLevel > 0 ? t("furnacePanel.capacityBonus") : "",
        }),
        iconId: "gold",
      });
    }
  });
  list.appendChild(button);
  return button;
}
