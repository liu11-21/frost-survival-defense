import type { BuildingType } from "./BuildingDefinitions";

/**
 * The build-menu's top tabs. Independent of `BuildingDefinition.role` (which
 * is free-text flavour for the card) and of `slotCategory` (which governs
 * where a building may legally be placed) — this is purely "which tab does
 * this building live under", and every building lives under exactly one.
 */
export type BuildMenuCategory = "production" | "support" | "defense" | "automation";

export const BUILD_MENU_CATEGORY_NAMES: Record<BuildMenuCategory, string> = {
  production: "生產",
  support: "支援",
  defense: "防禦",
  automation: "自動化",
};

const CATEGORY_BY_TYPE: Record<BuildingType, BuildMenuCategory> = {
  mine: "production",
  goldMine: "production",
  lumberyard: "production",
  warehouse: "support",
  recruitHall: "support",
  autoCollector: "automation",
  autoRebuilder: "automation",
  tower: "defense",
  crossbowTower: "defense",
  frostTower: "defense",
  sniperTower: "defense",
  mortar: "defense",
  // The wall itself only ever appears on wall-category slots, shown under its
  // own dedicated tab rather than any of the four universal ones.
  wall: "defense",
};

export function buildMenuCategoryOf(type: BuildingType): BuildMenuCategory {
  return CATEGORY_BY_TYPE[type];
}
