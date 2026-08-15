import { demolishRefund, DEMOLISH_REFUND } from "../buildings/Demolition";
import type { BuildingType } from "../data/BuildingDefinitions";
import type { ResourceCost } from "../data/CombatTypes";
import { entityName, t } from "../localization";
import type { ConfirmLine } from "../ui/ConfirmDialog";
import type { GameSystems } from "./GameSystems";

export function bindDemolition(s: GameSystems): void {
  s.panels.onDemolishRequest = (slot, building) => {
    const check = s.buildings.demolishCheck(slot.id);
    if (!check.ok) {
      s.hud.toast(check.reason ?? t("demolish.unavailable"), "failure");
      s.audio.play("buildFail", 0.8);
      return;
    }
    const name = entityName("building", building.def.id, building.def.name);
    s.confirm.open({
      title: t("demolish.title", { name }),
      message: buildDemolishMessage(s, building.type),
      lines: demolishLines(s, building.type, building),
      confirmLabel: t("demolish.confirm"),
      danger: true,
      onConfirm: () => {
        const result = s.buildings.demolish(slot.id);
        if (!result.ok) s.hud.toast(result.reason ?? t("demolish.failed"), "failure");
        else s.audio.play("uiConfirm", 0.8);
      },
    });
  };
}

export function buildDemolishMessage(s: GameSystems, type: BuildingType): string {
  switch (type) {
    case "warehouse": {
      const over = overflow(s);
      const lines = [t("demolish.warehouse.cap")];
      if (over.length > 0) lines.push(t("demolish.warehouse.overflow", { seconds: DEMOLISH_REFUND.overflowLifetime }));
      lines.push(t("demolish.warehouse.safe"));
      return lines.join("\n");
    }
    case "recruitHall": return t("demolish.recruitHall");
    case "autoCollector": return t("demolish.autoCollector");
    case "autoRebuilder": return t("demolish.autoRebuilder");
    case "wall": return t("demolish.wall");
    default: return t("demolish.default");
  }
}

export function demolishLines(
  s: GameSystems,
  type: BuildingType,
  building?: { constructionCost: ResourceCost },
): ConfirmLine[] {
  const refund = demolishRefund(type, building?.constructionCost);
  const lines: ConfirmLine[] = [
    { label: t("demolish.refundWood"), value: String(refund.wood ?? 0) },
    { label: t("demolish.refundStone"), value: String(refund.stone ?? 0) },
    { label: t("demolish.refundGold"), value: t("demolish.noGold") },
  ];
  if (type === "warehouse") {
    for (const [resource, amount] of overflow(s)) {
      lines.push({ label: t("demolish.overflowResource", { resource }), value: String(amount), warn: true });
    }
  }
  return lines;
}

function overflow(s: GameSystems): Array<[string, number]> {
  const cap = 100;
  const out: Array<[string, number]> = [];
  if (s.buildings.countOf("warehouse") - 1 > 0) return out;
  const check: Array<[string, number]> = [
    [t("resource.wood"), Math.floor(s.store.wood)],
    [t("resource.stone"), Math.floor(s.store.stone)],
    [t("resource.gold"), Math.floor(s.store.gold)],
  ];
  for (const [label, value] of check) if (value > cap) out.push([label, value - cap]);
  return out;
}
