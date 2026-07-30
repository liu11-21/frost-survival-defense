import type { AttackKind, BuildingType } from "./BuildingDefinitions";

const ATTACK_METHOD_NAMES: Record<AttackKind, string> = {
  areaShell: "範圍轟擊",
  singleBolt: "單體速射",
  slowBolt: "單體減速",
  snipe: "超遠距離狙擊",
  burstMortar: "範圍燃燒",
};

/** Attack-building method label for the build card and codex, e.g. "範圍轟擊". */
export function attackMethodName(attackKind: AttackKind | undefined): string {
  return attackKind ? (ATTACK_METHOD_NAMES[attackKind] ?? "攻擊") : "";
}

const EFFECTIVE_AGAINST: Partial<Record<BuildingType, string>> = {
  tower: "分散的中型敵群",
  crossbowTower: "前期低階小兵，性價比高",
  frostTower: "需要拖延、替其他火力爭取輸出時間的目標",
  sniperTower: "Boss 與破城者等高階單體",
  mortar: "後期密集敵群，能留下持續燃燒的地面",
};

/** One-line "effective against" blurb for the build card and codex. */
export function effectiveAgainst(id: BuildingType): string {
  return EFFECTIVE_AGAINST[id] ?? "";
}
