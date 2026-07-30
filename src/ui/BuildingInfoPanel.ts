import type { Building } from "../buildings/Building";
import type { BuildingManager } from "../buildings/BuildingManager";
import { DEMOLISH_REFUND } from "../buildings/Demolition";
import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { CombatWorld } from "../combat/CombatWorld";
import type { WaveManager } from "../enemies/WaveManager";
import { LANES } from "../data/BuildSlotDefinitions";
import { computeLaneCoverage, laneCoverageText } from "../buildings/AttackRangeGeometry";
import { costText } from "./CostLine";
import { buildingIconSvg } from "./ResourceIcons";

export interface InfoActions {
  onDemolish(slot: BuildSlot, building: Building): void;
}

/**
 * The card shown for a slot that already holds something: what it is, how it is
 * doing, and the only action available on it — taking it down.
 */
export function renderBuildingInfo(
  list: HTMLElement,
  slot: BuildSlot,
  building: Building,
  buildings: BuildingManager,
  store: ResourceStore,
  world: CombatWorld,
  waves: WaveManager,
  actions: InfoActions,
): void {
  const def = building.def;
  const hp = def.canBeAttacked
    ? `生命 ${Math.ceil(building.health)} / ${building.maxHealth}`
    : "不可被攻擊";

  let status: string;
  if (building.isDemolishing) {
    const left = ((1 - building.demolishFraction) * 1.4).toFixed(1);
    status = `拆除中 ${(building.demolishFraction * 100).toFixed(0)}% · 剩餘 ${left} 秒`;
  } else if (!building.isComplete) {
    status = `建造中 ${(building.buildProgress * 100).toFixed(0)}% · 剩餘 ${building.buildRemaining.toFixed(1)} 秒`;
  } else if (def.produces) {
    status = `運作中 · 暫存 ${Math.floor(building.storedAmount)}`;
  } else if (def.attackKind) {
    status = `運作中 · 每 ${def.attackInterval} 秒攻擊一次 · 距離 ${def.attackRange ?? 0}`;
  } else {
    status = "運作中";
  }

  const queuePos = buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
  const extras: string[] = [];
  if (queuePos >= 0) extras.push(`自動重建佇列第 ${queuePos + 1} 位`);
  if (building.type === "wall") {
    const rebuilds = buildings.wallRebuildCount(slot.id);
    if (rebuilds > 1) extras.push(`本波已重建 ${rebuilds - 1} 次，強度 ${Math.round((building.maxHealth / def.maxHealth) * 100)}%`);
  }
  if (building.secondsSinceDamaged < DEMOLISH_REFUND.combatLockout) {
    extras.push(`${building.secondsSinceDamaged.toFixed(1)} 秒前受到攻擊`);
  }
  if (def.attackKind && building.isComplete) {
    const liveLanes = LANES.filter((l) => l.index < waves.activeLaneCount);
    const coverage = computeLaneCoverage(
      building.position.x,
      building.position.z,
      def.attackRange ?? 0,
      liveLanes,
      def.requiresLineOfSight === true,
      world,
    );
    extras.push(laneCoverageText(coverage));
  }

  const check = buildings.demolishCheck(slot.id);
  const refund = check.refund;

  list.innerHTML = `
    <div class="entry static">
      <div class="entry-icon">${buildingIconSvg(building.type, 30)}</div>
      <div class="entry-main">
        <div class="entry-name">${def.name}</div>
        <div class="entry-desc">${def.description}</div>
        <div class="entry-desc">${status} · ${hp}</div>
        ${extras.map((e) => `<div class="entry-desc">${e}</div>`).join("")}
      </div>
    </div>
    <button class="entry demolish" id="ui-demolish" ${check.ok ? "" : "disabled"}>
      <div class="entry-main">
        <div class="entry-name">拆除設施</div>
        <div class="entry-desc">返還 ${costText(refund)}（金幣不返還）</div>
        <div class="entry-desc">拆除後此點位可重新建造其他允許的設施。</div>
      </div>
      ${check.ok ? "" : `<div class="entry-cost"><span class="bad">${check.reason ?? ""}</span></div>`}
    </button>`;

  void store;
  const button = list.querySelector<HTMLButtonElement>("#ui-demolish");
  button?.addEventListener("click", () => actions.onDemolish(slot, building));
}
