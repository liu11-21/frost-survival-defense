import type { ResourceCost } from "../data/CombatTypes";
import { resourceIcon } from "./ResourceIcons";

/**
 * Renders a cost as icon + number, so it reads without a legend.
 *
 * This returns **HTML** and is only ever safe to assign to `innerHTML`. Passing
 * it anywhere that renders with `textContent` prints the raw SVG on screen —
 * which is exactly the bug that put `<svg ...><rect .../></svg>` in the build
 * notification. Use `costText` for anything that is a message.
 */
export function costLine(cost: ResourceCost): string {
  const parts: string[] = [];
  if (cost.wood) parts.push(`${resourceIcon("wood", 14)}${cost.wood}`);
  if (cost.stone) parts.push(`${resourceIcon("stone", 14)}${cost.stone}`);
  if (cost.gold) parts.push(`${resourceIcon("gold", 14)}${cost.gold}`);
  return parts.length > 0 ? parts.join(" ") : "免費";
}

/** The same cost as plain words, for notifications, dialogs and prompts. */
export function costText(cost: ResourceCost): string {
  const parts: string[] = [];
  if (cost.wood) parts.push(`${cost.wood} 木材`);
  if (cost.stone) parts.push(`${cost.stone} 石頭`);
  if (cost.gold) parts.push(`${cost.gold} 金幣`);
  return parts.length > 0 ? parts.join("、") : "免費";
}
