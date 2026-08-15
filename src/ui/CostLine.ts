import type { ResourceCost } from "../data/CombatTypes";
import { t } from "../localization";
import { resourceIcon } from "./ResourceIcons";

/** Icon cost for panel innerHTML. */
export function costLine(cost: ResourceCost): string {
  const parts: string[] = [];
  if (cost.wood) parts.push(`${resourceIcon("wood", 14)}${cost.wood}`);
  if (cost.stone) parts.push(`${resourceIcon("stone", 14)}${cost.stone}`);
  if (cost.gold) parts.push(`${resourceIcon("gold", 14)}${cost.gold}`);
  return parts.length > 0 ? parts.join(" ") : t("common.free");
}

/** Plain-text cost for notifications, dialogs and prompts. */
export function costText(cost: ResourceCost): string {
  const parts: string[] = [];
  if (cost.wood) parts.push(`${cost.wood} ${t("resource.wood")}`);
  if (cost.stone) parts.push(`${cost.stone} ${t("resource.stone")}`);
  if (cost.gold) parts.push(`${cost.gold} ${t("resource.gold")}`);
  return parts.length > 0 ? parts.join(" · ") : t("common.free");
}
