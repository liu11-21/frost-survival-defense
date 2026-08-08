import type { BuildingType } from "../data/BuildingDefinitions";
import { buildingIconSvg } from "./ResourceIcons";

const ACCENT: Partial<Record<BuildingType, string>> = {
  mine: "ore",
  goldMine: "gold",
  lumberyard: "wood",
  warehouse: "supply",
  recruitHall: "recruit",
  autoCollector: "auto",
  autoRebuilder: "auto",
  tower: "defense",
  crossbowTower: "defense",
  frostTower: "frost",
  sniperTower: "defense",
  mortar: "defense",
  wall: "wall",
};

/**
 * Small scene-style thumbnails for the build command panel. The underlying
 * silhouette stays tied to the real facility identity, while the snow shelf,
 * cold rim light and role tint give every card one consistent commercial UI
 * treatment instead of presenting a naked utility glyph.
 */
export function buildingThumbnailHtml(type: BuildingType): string {
  const accent = ACCENT[type] ?? "supply";
  return `<span class="building-thumb-scene building-thumb-${accent}">
    <span class="building-thumb-haze"></span>
    ${buildingIconSvg(type, 46)}
    <span class="building-thumb-snow"></span>
  </span>`;
}
