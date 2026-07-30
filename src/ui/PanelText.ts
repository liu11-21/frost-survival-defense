import type { ResourceCost } from "../data/CombatTypes";
import type { ResourceStore } from "../economy/ResourceStore";

const SPEED_WORDS: Array<[number, string]> = [
  [0.4, "極高"],
  [0.55, "高"],
  [0.8, "中高"],
  [1.15, "中"],
  [1.5, "中低"],
  [99, "低"],
];

export function speedWord(interval: number): string {
  for (const [limit, word] of SPEED_WORDS) if (interval <= limit) return word;
  return "低";
}

/**
 * Exactly what is missing, per resource.
 *
 * "資源不足" is useless to a player mid-wave; "缺少 18 石頭、5 金幣" tells them
 * what to go and do.
 */
export function costBreakdown(store: ResourceStore, cost: ResourceCost): string {
  const missing: string[] = [];
  const wood = (cost.wood ?? 0) - store.wood;
  const stone = (cost.stone ?? 0) - store.stone;
  const gold = (cost.gold ?? 0) - store.gold;
  if (wood > 0) missing.push(`${Math.ceil(wood)} 木材`);
  if (stone > 0) missing.push(`${Math.ceil(stone)} 石頭`);
  if (gold > 0) missing.push(`${Math.ceil(gold)} 金幣`);
  return missing.length > 0 ? `缺少 ${missing.join("、")}` : "";
}

const BUILDING_NAMES: Record<string, string> = {
  mine: "礦場",
  lumberyard: "伐木場",
  warehouse: "倉庫",
  recruitHall: "招募所",
  autoCollector: "自動收取設施",
  autoRebuilder: "自動重建站",
  tower: "砲塔",
  crossbowTower: "弩箭塔",
  frostTower: "冰霜塔",
  sniperTower: "狙擊塔",
  mortar: "火焰迫擊砲",
  wall: "城牆",
};

export function typeName(type: string): string {
  return BUILDING_NAMES[type] ?? type;
}

export { attackMethodName, effectiveAgainst } from "../data/BuildingPresentation";

const ROLE_TAGS: Record<string, string> = {
  warrior: "前排",
  shield: "坦克",
  archer: "遠程",
  medic: "治療",
  mage: "範圍輸出",
  assault: "刺客",
  engineer: "維修",
  musketeer: "剋制輸出",
  frostmage: "控場",
};

export function roleTag(id: string): string {
  return ROLE_TAGS[id] ?? "部隊";
}

const SPECIALS: Record<string, string> = {
  warrior: "三人近戰小隊，生命與輸出均衡。",
  shield: "高生命前排，嘲諷範圍 8 內的敵人會優先攻擊他。",
  archer: "三人高速遠程小隊，擅長單體輸出，會與敵人保持距離。",
  medic: "每 1 秒為生命比例最低的一支友方小隊全員各補 20 HP。",
  mage: "生命較低，但每次施法造成半徑 2.5 的高額範圍傷害。",
  assault: "招募後立刻瞬移到最高等級敵人身旁，並獲得 2 秒 50% 減傷。",
  engineer: "每 3 秒尋找最近的受損設施；抵達後非受擊狀態每 3 秒、受擊狀態每 6 秒一次回復該設施最大生命 10%。",
  musketeer: "對高階敵人與 Boss 有額外傷害，命中會疊加減速。",
  frostmage: "攻擊自帶範圍減速，每 10 秒額外施放凍結領域控場。",
};

export function describeSpecial(id: string): string {
  return SPECIALS[id] ?? "";
}
