import { BUILDINGS } from "./BuildingDefinitions";
import { attackMethodName, effectiveAgainst } from "./BuildingPresentation";
import { ENEMY_UNITS } from "./EnemyDefinitions";
import { ALLY_UNITS, HERO, HERO_MELEE, MEDIC_RULES } from "./UnitDefinitions";
import { WALL_REBUILD_DECAY } from "./BuildingDefinitions";
import { MECHANIC_ENTRIES } from "./CodexMechanics";

export type CodexCategory = "ally" | "enemy" | "building" | "resource" | "mechanic";

export interface CodexField {
  label: string;
  value: string;
}

export interface CodexEntry {
  id: string;
  category: CodexCategory;
  name: string;
  /** One-line role, shown under the name. */
  role: string;
  /** Key used by the thumbnail renderer; empty for non-unit entries. */
  visual: string;
  /** Icon id for buildings and resources; empty otherwise. */
  icon: string;
  fields: CodexField[];
  /** How to use it, or how to beat it. */
  advice: string;
  /**
   * Always true today. The field exists so a future build can show a silhouette
   * until the entry has been encountered, without reshaping the data.
   */
  unlocked: boolean;
  /** Lower-cased haystack for the search box. */
  search: string;
}

export const CODEX_CATEGORIES: Array<{ id: CodexCategory; name: string }> = [
  { id: "ally", name: "友方兵種" },
  { id: "enemy", name: "敵方單位" },
  { id: "building", name: "建築設施" },
  { id: "resource", name: "資源" },
  { id: "mechanic", name: "戰鬥機制" },
];

const ALLY_ROLE: Record<string, string> = {
  warrior: "前排範圍輸出",
  shield: "承傷與嘲諷",
  archer: "後排持續輸出",
  medic: "全隊治療",
  mage: "高爆發範圍法術",
  assault: "切入高階目標",
  engineer: "建築維修",
  musketeer: "高階剋制輸出",
  frostmage: "範圍控場",
};

const ALLY_SPECIAL: Record<string, string> = {
  warrior: `一次揮擊可命中範圍內最多 5 名敵人。`,
  shield: `半徑 8 內的敵人會轉而攻擊它，並且能替建築吸引火力。`,
  archer: `會自動維持 4 至 11 的射擊距離，不會貼到前線。`,
  medic: `每 ${MEDIC_RULES.interval.toFixed(2)} 秒替最虛弱的小隊治療 ${MEDIC_RULES.healPerMember}，整隊只觸發一次。`,
  mage: `半徑 2.5 的爆炸，一次最多命中 8 名敵人。`,
  assault: `登場時瞬移到場上等級最高的敵人旁，並獲得 2 秒 50% 減傷。`,
  engineer: `優先修復範圍內生命比例最低的可攻擊建築，一次修復 20 × 存活人數，站在興建中的自動重建建築附近可縮短最多 20% 工時。`,
  musketeer: `對 Lv.4-5 敵人 +40% 傷害、對 Boss +20% 傷害；每次命中疊加 5% 減速（Boss 2%），最多 3 層。`,
  frostmage: `攻擊附帶範圍減速，每 10 秒額外施放凍結領域造成暈眩後減速，對 Boss 效果減半且絕不暈眩。`,
};

const ALLY_ADVICE: Record<string, string> = {
  warrior: "便宜且穩定，適合當第一支小隊填滿前排。",
  shield: "適合吸引敵人火力並保護遠程單位，但傷害較低。",
  archer: "輸出高但很脆，一定要有前排擋在前面。",
  medic: "本身不會攻擊，價值完全來自延長其他小隊的存活時間。",
  mage: "對成群的小兵效率極高，對單一高血量目標則不划算。",
  assault: "用來點掉重裝壁壘或轟擊者，不要拿來清小兵。",
  engineer: "城牆與砲塔快被打穿時派他們駐守，能大幅拉長防線壽命。",
  musketeer: "專門克制重裝壁壘、轟擊者與 Boss 等高階目標，清小兵效率普通。",
  frostmage: "面對密集敵潮或破城者這類重裝單位時，減速能替其他小隊爭取輸出時間。",
};

const ENEMY_ADVICE: Record<string, string> = {
  grunt: "數量取勝，交給戰士與砲塔的範圍傷害處理。",
  slinger: "會在遠處點名脆皮，優先用突擊手或弓箭手清掉。",
  bruiser: "血厚傷害低，可以放著讓盾兵拖住。",
  marksman: "傷害不低且射程遠，不要讓它自由射擊。",
  juggernaut: "對建築有 1.5 倍傷害且會嘲諷建築，必須集火。",
  bombardier: "會遠距離範圍轟擊，靠近它比躲它有效。",
  boss: "分三階段，第二階段起會震地，第三階段會逐漸免疫同一座砲塔。",
  breacher: "無視嘲諷也要先拆城牆，對城牆傷害 ×3，城牆前必須有足夠火力。",
  icearmor: "低於 25 點的攻擊會被減半，集中高傷害單體反而更有效率；血量過半後護甲碎裂並加速。",
  commander: "會給附近敵人加攻速與移速，友軍會優先攻擊他，出現時應優先集火解除。",
  bomber: "接近任何目標後會倒數 2 秒自爆，聽到警告音就該後退或搶先擊殺。",
};

const BUILDING_ADVICE: Record<string, string> = {
  mine: "越早蓋越好，產量約為手採的 4.7 倍。",
  lumberyard: "與礦場成對建造，木材是多數設施的主要成本。",
  warehouse: "沒有倉庫時三種資源都卡在 100，城牆與自動收取都買不起。",
  recruitHall: "解鎖全部兵種，開局金幣剛好夠蓋一座。",
  autoCollector: "省下來回跑動的時間，中期以後幾乎必備。",
  autoRebuilder: "依摧毀順序自動重建，第 10 波前很值得投資。",
  tower: "範圍轟擊，放在敵人必經之地效益最高，任何一般建造槽位都能蓋。",
  crossbowTower: "低成本高速單體防禦，適合前期處理低階敵人。",
  frostTower: "降低敵人移動速度，適合搭配其他輸出設施拖延敵人。",
  sniperTower: "超遠距離高傷害設施，優先攻擊 Boss 與高階敵人，多座狙擊塔不會重複集火同一個快死的目標。",
  mortar: "高成本大範圍防禦，能在地面留下持續燃燒區域，適合後期密集敵群。",
  wall: "北、東、南、西四面各一座固定建造點，合力封閉整個基地。每面牆中央都有一座我方專用門——我方單位可自由進出，敵人絕對無法通過，必須先摧毀整面牆。同一波內重複重建會變弱。",
};

function allyEntry(index: number): CodexEntry {
  const def = ALLY_UNITS[index];
  const heal = def.attackType === "heal";
  return {
    id: `ally.${def.id}`,
    category: "ally",
    name: def.name,
    role: ALLY_ROLE[def.id] ?? "",
    visual: def.visual,
    icon: "",
    fields: [
      { label: "小隊人數", value: `${def.squadSize} 人` },
      { label: "每名成員生命", value: String(def.maxHealth) },
      { label: heal ? "治療力" : "攻擊力", value: String(def.attackPower) },
      { label: "攻擊間隔", value: `${def.attackInterval.toFixed(2)} 秒` },
      { label: "攻擊範圍", value: String(def.attackRange) },
      { label: "招募成本", value: `${def.recruitCost ?? 0} 金幣` },
    ],
    advice: `${ALLY_SPECIAL[def.id] ?? ""}${ALLY_ADVICE[def.id] ?? ""}`,
    unlocked: true,
    search: `${def.name}${def.id}${ALLY_ROLE[def.id] ?? ""}`.toLowerCase(),
  };
}

function enemyEntry(index: number): CodexEntry {
  const def = ENEMY_UNITS[index];
  const fields: CodexField[] = [
    { label: "等級", value: `Lv.${def.level ?? 0}` },
    { label: "小隊人數", value: `${def.squadSize} 人` },
    { label: "每名成員生命", value: String(def.maxHealth) },
    { label: "攻擊力", value: String(def.attackPower) },
    { label: "攻擊間隔", value: `${def.attackInterval.toFixed(2)} 秒` },
    { label: "攻擊方式", value: attackTypeName(def.attackType) },
    { label: "掉落金幣", value: `${def.goldValue ?? 0} / 名` },
    { label: "對建築倍率", value: `×${(def.siegeMultiplier ?? 1).toFixed(1)}` },
  ];
  if (def.tauntRadius) fields.push({ label: "嘲諷半徑", value: String(def.tauntRadius) });
  if (def.armor) {
    fields.push({
      label: "護甲",
      value: `低於 ${def.armor.threshold} 的傷害減半，血量 ${Math.round(def.armor.breakAtPercent * 100)}% 時碎裂並 +${Math.round(def.armor.moveBonusAfterBreak * 100)}% 移速`,
    });
  }
  if (def.aura) {
    fields.push({
      label: "光環",
      value: `半徑 ${def.aura.radius}，附近敵人 +${Math.round(def.aura.moveBonus * 100)}% 移速、+${Math.round(def.aura.attackSpeedBonus * 100)}% 攻速（不可疊加）`,
    });
  }
  if (def.selfDestruct) {
    fields.push({
      label: "自爆",
      value: `進入 ${def.selfDestruct.triggerRange} 距離後倒數 ${def.selfDestruct.armDelay} 秒，半徑 ${def.selfDestruct.radius} 範圍爆炸`,
    });
  }
  if (def.id === "boss") {
    fields.push(
      { label: "第一階段", value: "100–70%：沿路線推進，優先拆擋路的城牆" },
      { label: "第二階段", value: "70–35%：震地，1.2 秒預告，傷害上限為目標最大生命的 35%" },
      { label: "第三階段", value: "低於 35%：攻速 +30%、移速 +15%、對砲塔減傷 40% 並逐漸適應" },
    );
  }
  return {
    id: `enemy.${def.id}`,
    category: "enemy",
    name: def.name,
    role: `Lv.${def.level ?? 0}`,
    visual: def.visual,
    icon: "",
    fields,
    advice: ENEMY_ADVICE[def.id] ?? "",
    unlocked: true,
    search: `${def.name}${def.id}`.toLowerCase(),
  };
}

function buildingEntry(index: number): CodexEntry {
  const def = BUILDINGS[index];
  const fields: CodexField[] = [
    { label: "功能", value: def.description },
    { label: "建造成本", value: costWords(def.cost.wood, def.cost.stone, def.cost.gold) },
    { label: "建造時間", value: `${def.buildTime.toFixed(1)} 秒` },
    { label: "生命值", value: def.canBeAttacked ? String(def.maxHealth) : "不可被攻擊" },
    { label: "自動重建", value: def.canBeRebuilt ? "可以" : "不可以" },
    { label: "可拆除", value: "可以，返還 50% 木材與石頭" },
  ];
  if (def.id === "wall") {
    fields.push({
      label: "同波重建衰減",
      value: WALL_REBUILD_DECAY.factors.map((f) => `${Math.round(f * 100)}%`).join(" → "),
    });
  }
  if (def.attackKind) {
    fields.push(
      { label: "攻擊方式", value: attackMethodName(def.attackKind) },
      { label: "傷害 / 攻速 / 距離", value: `${def.attackPower} / ${(def.attackInterval ?? 0).toFixed(2)}s / ${def.attackRange ?? 0}` },
      { label: "剋制對象", value: effectiveAgainst(def.id) },
    );
  }
  return {
    id: `building.${def.id}`,
    category: "building",
    name: def.name,
    role: def.role,
    visual: "",
    icon: def.id,
    fields,
    advice: BUILDING_ADVICE[def.id] ?? "",
    unlocked: true,
    search: `${def.name}${def.id}`.toLowerCase(),
  };
}

const RESOURCE_ENTRIES: CodexEntry[] = [
  {
    id: "resource.wood",
    category: "resource",
    name: "木材",
    role: "基礎建材",
    visual: "",
    icon: "wood",
    fields: [
      { label: "手動取得", value: "靠近樹木自動採集，每 0.55 秒 1 個" },
      { label: "自動取得", value: "伐木場每 0.25 秒 1 個" },
      { label: "天然存量", value: "小樹 6、中樹 10、大樹 16，採完變成樹樁" },
      { label: "主要用途", value: "礦場、倉庫、招募所、砲塔、城牆" },
      { label: "容量", value: "沒有倉庫時上限 100" },
    ],
    advice: "闖關模式的樹木不會重生，無限模式 90 秒後長回。",
    unlocked: true,
    search: "木材 wood",
  },
  {
    id: "resource.stone",
    category: "resource",
    name: "石頭",
    role: "防禦建材",
    visual: "",
    icon: "stone",
    fields: [
      { label: "手動取得", value: "靠近礦點自動採集，每 0.70 秒 1 個" },
      { label: "自動取得", value: "礦場每 0.25 秒 1 個" },
      { label: "天然存量", value: "小礦 8、中礦 14、大礦 22，採完變成碎石" },
      { label: "主要用途", value: "城牆 250、伐木場、砲塔、自動設施" },
      { label: "容量", value: "沒有倉庫時上限 100" },
    ],
    advice: "無限模式的礦點 120 秒後重生，闖關模式不會。",
    unlocked: true,
    search: "石頭 石材 stone",
  },
  {
    id: "resource.gold",
    category: "resource",
    name: "金幣",
    role: "招募與升級",
    visual: "",
    icon: "gold",
    fields: [
      { label: "取得方式", value: "只能由擊殺敵人取得，沒有任何建築會產金" },
      { label: "主要用途", value: "招募小隊、倉庫與招募所、火爐升級" },
      { label: "容量", value: "沒有倉庫時上限 100" },
      { label: "倉庫被摧毀", value: "損失 70%，其餘散落在地面" },
    ],
    advice: "闖關 1 開局給 15 金，剛好等於招募所，第一個決策是先招募還是先蓋塔。",
    unlocked: true,
    search: "金幣 gold",
  },
];

function costWords(wood?: number, stone?: number, gold?: number): string {
  const parts: string[] = [];
  if (wood) parts.push(`${wood} 木材`);
  if (stone) parts.push(`${stone} 石頭`);
  if (gold) parts.push(`${gold} 金幣`);
  return parts.length > 0 ? parts.join("、") : "免費";
}

function attackTypeName(kind: string): string {
  switch (kind) {
    case "meleeArea":
      return "近戰範圍";
    case "meleeSingle":
      return "近戰單體";
    case "rangedSingle":
      return "遠程單體";
    case "rangedArea":
      return "遠程範圍";
    case "heal":
      return "治療";
    default:
      return "無";
  }
}

const HERO_ENTRY: CodexEntry = {
  id: "ally.hero",
  category: "ally",
  name: HERO.name,
  role: "遠近自動切換的主戰力",
  visual: "hero",
  icon: "",
  fields: [
    { label: "生命值", value: String(HERO.maxHealth) },
    { label: "遠程攻擊", value: String(HERO.attackPower) },
    { label: "近戰攻擊", value: `${HERO_MELEE.power}，半徑 ${HERO_MELEE.radius}` },
    { label: "攻擊間隔", value: `${HERO.attackInterval.toFixed(2)} 秒` },
    { label: "射程", value: String(HERO.attackRange) },
    { label: "倒地", value: "8 秒後在火爐旁復活" },
  ],
  advice: `距離大於 ${HERO_MELEE.threshold} 時射擊，靠近後自動改為範圍揮擊，全程自動選擇場上等級最高的敵人。`,
  unlocked: true,
  search: "主角 hero",
};

/** Every codex entry, in display order. */
export const CODEX_ENTRIES: CodexEntry[] = [
  HERO_ENTRY,
  ...ALLY_UNITS.map((_, i) => allyEntry(i)),
  ...ENEMY_UNITS.map((_, i) => enemyEntry(i)),
  ...BUILDINGS.map((_, i) => buildingEntry(i)),
  ...RESOURCE_ENTRIES,
  ...MECHANIC_ENTRIES,
];

export function codexEntriesFor(category: CodexCategory): CodexEntry[] {
  return CODEX_ENTRIES.filter((e) => e.category === category);
}
