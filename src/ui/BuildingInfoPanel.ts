import type { Building } from "../buildings/Building";
import type { BuildingManager } from "../buildings/BuildingManager";
import { DEMOLISH_REFUND } from "../buildings/Demolition";
import type { BuildSlot } from "../buildings/BuildSlot";
import type { ResourceStore } from "../economy/ResourceStore";
import type { CombatWorld } from "../combat/CombatWorld";
import type { WaveManager } from "../enemies/WaveManager";
import { LANES } from "../data/BuildSlotDefinitions";
import { computeLaneCoverage, laneCoverageText } from "../buildings/AttackRangeGeometry";
import { entityDescription, entityName, t } from "../localization";
import { costText } from "./CostLine";
import { buildingIconSvg } from "./ResourceIcons";

export interface InfoActions {
  onDemolish(slot: BuildSlot, building: Building): void;
}

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
  const name = entityName("building", def.id, def.name);
  const description = entityDescription("building", def.id, def.description);
  const hp = def.canBeAttacked
    ? t("buildingInfo.hp", { health: Math.ceil(building.health), max: building.maxHealth })
    : t("buildingInfo.invulnerable");

  let status: string;
  if (building.isDemolishing) {
    const left = ((1 - building.demolishFraction) * 1.4).toFixed(1);
    status = t("buildingInfo.demolishing", {
      progress: (building.demolishFraction * 100).toFixed(0),
      seconds: left,
    });
  } else if (!building.isComplete) {
    status = t("buildingInfo.building", {
      progress: (building.buildProgress * 100).toFixed(0),
      seconds: building.buildRemaining.toFixed(1),
    });
  } else if (def.produces) {
    status = t("buildingInfo.producing", { amount: Math.floor(building.storedAmount) });
  } else if (def.attackKind) {
    status = t("buildingInfo.attacking", {
      attack: Math.round(building.attackPower),
      interval: def.attackInterval ?? 0,
      range: def.attackRange ?? 0,
    });
  } else {
    status = t("buildingInfo.operating");
  }

  const queuePos = buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
  const extras: string[] = [];
  if (queuePos >= 0) extras.push(t("buildingInfo.rebuildQueue", { position: queuePos + 1 }));
  if (building.type === "wall") {
    const rebuilds = buildings.wallRebuildCount(slot.id);
    if (rebuilds > 1) {
      extras.push(t("buildingInfo.wallRebuild", {
        count: rebuilds - 1,
        strength: Math.round((building.maxHealth / def.maxHealth) * 100),
      }));
    }
  }
  if (building.secondsSinceDamaged < DEMOLISH_REFUND.combatLockout) {
    extras.push(t("buildingInfo.damagedAgo", { seconds: building.secondsSinceDamaged.toFixed(1) }));
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
        <div class="entry-name">${name}<span class="tag ok">${t("buildingInfo.level", { level: building.level })}</span></div>
        <div class="entry-desc">${description}</div>
        <div class="entry-desc">${status} · ${hp}</div>
        ${extras.map((e) => `<div class="entry-desc">${e}</div>`).join("")}
      </div>
    </div>
    <button class="entry demolish" id="ui-demolish" ${check.ok ? "" : "disabled"}>
      <div class="entry-main">
        <div class="entry-name">${t("buildingInfo.demolish")}</div>
        <div class="entry-desc">${t("buildingInfo.refund", { cost: costText(refund) })}</div>
        <div class="entry-desc">${t("buildingInfo.demolishDesc")}</div>
      </div>
      ${check.ok ? "" : `<div class="entry-cost"><span class="bad">${check.reason ?? ""}</span></div>`}
    </button>`;

  void store;
  const button = list.querySelector<HTMLButtonElement>("#ui-demolish");
  button?.addEventListener("click", () => actions.onDemolish(slot, building));
}
