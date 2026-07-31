import type { BuildingType } from "../data/BuildingDefinitions";
import { buildingIcon } from "./BuildingIcons";

export type IconKind = "wood" | "stone" | "gold";
/** Anything the notification layer can be asked to draw next to a message. */
export type IconId = IconKind | BuildingType;

/** Resolves an icon id to markup. The only route by which SVG reaches the DOM. */
export function buildingIconSvg(id: IconId, size = 26): string {
  if (id === "wood" || id === "stone" || id === "gold") return resourceIcon(id, size);
  return buildingIcon(id, size);
}

/**
 * Inline SVG resource icons.
 *
 * Deliberately literal rather than abstract: wood is bundled logs with visible
 * growth rings, stone is a cluster of irregular grey rocks with highlights, and
 * gold is a struck coin with thickness — so each reads at a glance without a
 * label. Generated in code, no external or paid assets.
 */
export function resourceIcon(kind: IconKind, size = 18): string {
  const s = `width="${size}" height="${size}" viewBox="0 0 32 32"`;
  switch (kind) {
    case "wood":
      return `<svg ${s} class="ricon" aria-hidden="true">
        <g stroke="#4a2f18" stroke-width="1.4">
          <rect x="3" y="8" width="24" height="8" rx="4" fill="#9a6b3c"/>
          <rect x="6" y="17" width="22" height="8" rx="4" fill="#8a5e33"/>
        </g>
        <g stroke="#4a2f18" stroke-width="1.2">
          <ellipse cx="6.5" cy="12" rx="3" ry="3.6" fill="#c99a63"/>
          <ellipse cx="9.5" cy="21" rx="3" ry="3.6" fill="#c99a63"/>
        </g>
        <ellipse cx="6.5" cy="12" rx="1.4" ry="1.8" fill="none" stroke="#7a5028" stroke-width="0.9"/>
        <ellipse cx="9.5" cy="21" rx="1.4" ry="1.8" fill="none" stroke="#7a5028" stroke-width="0.9"/>
        <path d="M18 9.5 L18 14.5" stroke="#6d451f" stroke-width="0.8" opacity="0.7"/>
        <path d="M22 18.5 L22 23.5" stroke="#6d451f" stroke-width="0.8" opacity="0.7"/>
      </svg>`;

    case "stone":
      return `<svg ${s} class="ricon" aria-hidden="true">
        <path d="M4 22 L8 12 L16 10 L20 16 L17 24 L7 25 Z" fill="#8c949f" stroke="#4d545d" stroke-width="1.4"/>
        <path d="M8 12 L16 10 L14 15 Z" fill="#b3bcc7"/>
        <path d="M17 8 L24 6 L28 12 L24 17 L19 15 Z" fill="#78808b" stroke="#4d545d" stroke-width="1.3"/>
        <path d="M17 8 L24 6 L22 10 Z" fill="#a4adb8"/>
        <path d="M19 20 L26 19 L27 25 L20 26 Z" fill="#6a727c" stroke="#4d545d" stroke-width="1.2"/>
        <path d="M19 20 L26 19 L24 22 Z" fill="#99a1ab"/>
      </svg>`;

    case "gold":
      return `<svg ${s} class="ricon" aria-hidden="true">
        <ellipse cx="16" cy="21" rx="11" ry="7" fill="#a97418" stroke="#6d4a0d" stroke-width="1.3"/>
        <ellipse cx="16" cy="17" rx="11" ry="7.5" fill="#f0bc3f" stroke="#8a5f11" stroke-width="1.4"/>
        <ellipse cx="16" cy="17" rx="7.5" ry="4.8" fill="none" stroke="#c2901f" stroke-width="1"/>
        <path d="M16 12.6 L17.6 15.8 L21 16.2 L18.5 18.4 L19.2 21.6 L16 20 L12.8 21.6 L13.5 18.4 L11 16.2 L14.4 15.8 Z"
              fill="#fff0b8" stroke="#a97418" stroke-width="0.6"/>
      </svg>`;
  }
}

export const RESOURCE_TOOLTIP: Record<IconKind, string> = {
  wood: "由天然樹木或伐木場取得，用於建造多數設施。",
  stone: "由天然礦點或礦場取得，用於城牆與防禦設施。",
  gold: "由擊殺敵人或金礦取得；自動收取設施也會自動收取敵人掉落的金幣，用於招募、建築與火爐升級。",
};
