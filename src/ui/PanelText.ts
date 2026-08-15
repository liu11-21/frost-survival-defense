import type { ResourceCost } from "../data/CombatTypes";
import type { ResourceStore } from "../economy/ResourceStore";
import { ASSAULT_RULES } from "../data/AssaultConfig";
import { entityName, t } from "../localization";

const SPEED_WORDS: Array<[number, string]> = [
  [0.4, "極高"], [0.55, "高"], [0.8, "中高"], [1.15, "中"], [1.5, "中低"], [99, "低"],
];

export function speedWord(interval: number): string {
  for (const [limit, word] of SPEED_WORDS) if (interval <= limit) return word;
  return "低";
}

/** Exact per-resource shortfall, localized for player-facing build UI. */
export function costBreakdown(store: ResourceStore, cost: ResourceCost): string {
  const missing: string[] = [];
  const wood = (cost.wood ?? 0) - store.wood;
  const stone = (cost.stone ?? 0) - store.stone;
  const gold = (cost.gold ?? 0) - store.gold;
  if (wood > 0) missing.push(`${Math.ceil(wood)} ${t("resource.wood")}`);
  if (stone > 0) missing.push(`${Math.ceil(stone)} ${t("resource.stone")}`);
  if (gold > 0) missing.push(`${Math.ceil(gold)} ${t("resource.gold")}`);
  return missing.length > 0 ? t("resource.missing", { items: missing.join(" · ") }) : "";
}

export function typeName(type: string): string {
  return entityName("building", type, type);
}

export { attackMethodName, effectiveAgainst } from "../data/BuildingPresentation";

const ROLE_TAGS: Record<string, string> = {
  warrior: "前排", shield: "坦克", archer: "遠程", medic: "治療", flagbearer: "增益",
  mage: "範圍輸出", assault: "刺客", engineer: "維修", musketeer: "剋制輸出", frostmage: "控場",
};

export function roleTag(id: string): string {
  return ROLE_TAGS[id] ?? "部隊";
}

// Deep Codex prose remains the V1 deferred surface. The runtime recruit cards
// use localized compact copy instead of these long-form descriptions.
const SPECIALS: Record<string, string> = {
  warrior: "三人近戰小隊，生命與輸出均衡。",
  shield: "高生命前排，嘲諷範圍 8 內的敵人會優先攻擊他。",
  archer: "三人高速遠程小隊，擅長單體輸出，會與敵人保持距離。",
  medic: "每 1 秒為生命比例最低的一支友方小隊全員各補 20 HP。",
  flagbearer: "1 人支援小隊，不會攻擊；半徑 8 內友軍攻擊、攻速各 +10%，每升 1 級火爐再各 +1%，多面旗幟不疊加。",
  mage: "生命較低，但每次施法造成半徑 2.5 的高額範圍傷害。",
  assault: `瞬移到最高等級敵人身旁；前 ${ASSAULT_RULES.invulnerableSeconds} 秒無敵，接著 ${ASSAULT_RULES.reducedDamageSeconds} 秒減傷 ${Math.round(ASSAULT_RULES.damageReduction * 100)}%，對 Lv.${ASSAULT_RULES.highTierMinLevel}+ 傷害 ×${ASSAULT_RULES.highTierDamageMultiplier}。`,
  engineer: "每 3 秒尋找最近的受損設施；抵達後非受擊狀態每 3 秒、受擊狀態每 6 秒一次回復該設施最大生命 10%。",
  musketeer: "高價遠程兵；對高階敵人與 Boss 有額外傷害，命中會疊加減速。",
  frostmage: "攻擊自帶範圍減速，每 10 秒額外施放凍結領域控場。",
};

export function describeSpecial(id: string): string {
  return SPECIALS[id] ?? "";
}
