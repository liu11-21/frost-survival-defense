import { demolishRefund, DEMOLISH_REFUND } from "../buildings/Demolition";
import type { BuildingType } from "../data/BuildingDefinitions";
import type { ConfirmLine } from "../ui/ConfirmDialog";
import type { GameSystems } from "./GameSystems";

/**
 * The prose and the numbers on the demolition confirmation.
 *
 * Kept apart from `Game` because several building types have consequences the
 * player must be told about *before* they agree — most importantly the
 * warehouse, whose removal drops the resource cap back to 100.
 */
/**
 * Wires the demolish button to the rule check and the confirmation card. A
 * demolition frees the plot and fixes the refund at 50%, so it always goes
 * through a second confirmation rather than a single click.
 */
export function bindDemolition(s: GameSystems): void {
  s.panels.onDemolishRequest = (slot, building) => {
    const check = s.buildings.demolishCheck(slot.id);
    if (!check.ok) {
      s.hud.toast(check.reason ?? "此設施無法拆除", "failure");
      s.audio.play("buildFail", 0.8);
      return;
    }
    s.confirm.open({
      title: `確定拆除「${building.def.name}」？`,
      message: buildDemolishMessage(s, building.type),
      lines: demolishLines(s, building.type),
      confirmLabel: "確認拆除",
      danger: true,
      onConfirm: () => {
        const result = s.buildings.demolish(slot.id);
        if (!result.ok) s.hud.toast(result.reason ?? "無法拆除", "failure");
        else s.audio.play("uiConfirm", 0.8);
      },
    });
  };
}

export function buildDemolishMessage(s: GameSystems, type: BuildingType): string {
  switch (type) {
    case "warehouse": {
      const over = overflow(s);
      const lines = ["拆除倉庫後，資源容量將降為 100。"];
      if (over.length > 0) {
        lines.push(`超額資源將掉落在地面並保留 ${DEMOLISH_REFUND.overflowLifetime} 秒。`);
      }
      lines.push("這不是被敵人摧毀，因此不會觸發資源損失懲罰。");
      return lines.join("\n");
    }
    case "recruitHall":
      return "拆除後既有小隊會保留，但無法再招募新小隊。\n重新建造招募所即可恢復。";
    case "autoCollector":
      return "拆除後礦場與伐木場會回到本地暫存，需要玩家自行收取。\n已在庫存中的資源不受影響。";
    case "autoRebuilder":
      return "拆除後自動重建會停止，但重建佇列會保留。\n重新建造後會從原本的順序繼續。";
    case "wall":
      return "拆除後這條路線會恢復未設防狀態，敵人可以直接進入。";
    default:
      return "拆除後此點位可重新建造其他允許的設施。";
  }
}

export function demolishLines(s: GameSystems, type: BuildingType): ConfirmLine[] {
  const refund = demolishRefund(type);
  const lines: ConfirmLine[] = [
    { label: "返還木材", value: String(refund.wood ?? 0) },
    { label: "返還石頭", value: String(refund.stone ?? 0) },
    { label: "返還金幣", value: "0（金幣不返還）" },
  ];
  if (type === "warehouse") {
    for (const [label, amount] of overflow(s)) {
      lines.push({ label: `超額${label}`, value: String(amount), warn: true });
    }
  }
  return lines;
}

/** What currently sits above the no-warehouse cap of 100. */
function overflow(s: GameSystems): Array<[string, number]> {
  const cap = 100;
  const out: Array<[string, number]> = [];
  const remaining = s.buildings.countOf("warehouse") - 1;
  if (remaining > 0) return out;
  const check: Array<[string, number]> = [
    ["木材", Math.floor(s.store.wood)],
    ["石頭", Math.floor(s.store.stone)],
    ["金幣", Math.floor(s.store.gold)],
  ];
  for (const [label, value] of check) {
    if (value > cap) out.push([label, value - cap]);
  }
  return out;
}
