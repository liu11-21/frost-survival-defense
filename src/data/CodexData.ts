import { BUILDINGS } from "./BuildingDefinitions";
import { attackMethodName, effectiveAgainst } from "./BuildingPresentation";
import { ENEMY_UNITS } from "./EnemyDefinitions";
import { ALLY_UNITS, HERO, HERO_MELEE, MEDIC_RULES } from "./UnitDefinitions";
import { WALL_REBUILD_DECAY } from "./BuildingDefinitions";
import { MECHANIC_ENTRIES } from "./CodexMechanics";
import { ASSAULT_RULES } from "./AssaultConfig";
import { STANDOFF } from "../ai/AIConfig";
import { FURNACE_UPGRADE } from "./FurnaceUpgradeConfig";
import { ENGINEER_RULES } from "./EngineerConfig";
import { GATHER, RESPAWN, STONE_CAPACITY, TREE_CAPACITY } from "./ResourceNodeConfig";
import { WAREHOUSE_LOSS } from "./BuildingDefinitions";
import { ENDLESS_ECONOMY } from "./EndlessEconomyConfig";
import { HERO_REVIVE } from "./UnitDefinitions";
import {
  AIR_SUPPORT,
  GROUND_SUPPORT,
  HERO_SKILLS,
  INFINITE_FIREPOWER,
  SEISMIC_WAVE,
} from "../hero/HeroSkillDefinitions";

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
  flagbearer: "全軍跟隨／攻擊與攻速光環",
  mage: "高爆發範圍法術",
  assault: "Lv.4+ 爆發刺客",
  engineer: "建築維修",
  musketeer: "高價遠程剋制輸出",
  frostmage: "範圍控場",
};

const ALLY_SPECIAL: Record<string, string> = {
  warrior: `一次揮擊可命中範圍內最多 ${ALLY_UNITS.find((u) => u.id === "warrior")?.maxAreaTargets ?? 5} 名敵人。`,
  shield: `半徑 ${ALLY_UNITS.find((u) => u.id === "shield")?.tauntRadius ?? 0} 內的同路線敵人會轉而攻擊它；跨路線不會被嘲諷硬拉走。`,
  archer: `會自動維持 ${STANDOFF.archer.min} 至 ${STANDOFF.archer.max} 的射擊距離，不會貼到前線。`,
  medic: `每 ${MEDIC_RULES.interval.toFixed(2)} 秒替最虛弱的小隊治療 ${MEDIC_RULES.healPerMember}，整隊只觸發一次。`,
  flagbearer: `不會攻擊；半徑 ${ALLY_UNITS.find((u) => u.id === "flagbearer")?.supportAura?.radius ?? 0} 內友軍取最強一面旗幟，獲得攻擊與攻速增益。`,
  mage: `半徑 ${ALLY_UNITS.find((u) => u.id === "mage")?.areaRadius ?? 0} 的爆炸，一次最多命中 ${ALLY_UNITS.find((u) => u.id === "mage")?.maxAreaTargets ?? 0} 名敵人。`,
  assault: `拖曳部署後留在指定路線。前 ${ASSAULT_RULES.invulnerableSeconds} 秒完全無敵，接著 ${ASSAULT_RULES.reducedDamageSeconds} 秒減傷 ${Math.round(ASSAULT_RULES.damageReduction * 100)}%，之後歸零；對 Lv.${ASSAULT_RULES.highTierMinLevel}+ 傷害 ×${ASSAULT_RULES.highTierDamageMultiplier}。`,
  engineer: `1 人獨立小隊、基礎 100 生命、沒有攻擊。每 ${ENGINEER_RULES.scanInterval} 秒尋找最近且未被其他工程兵預約的受損設施；非受擊狀態完整倒數 ${ENGINEER_RULES.safeRepairInterval} 秒、受擊狀態完整倒數 ${ENGINEER_RULES.underAttackRepairInterval} 秒後，一次回復該設施最大生命 ${Math.round(ENGINEER_RULES.repairFraction * 100)}%。不能修復中央火爐或已被擊破的設施。`,
  musketeer: `對 Lv.4-5 敵人 +40% 傷害、對 Boss +20% 傷害；每次命中疊加 5% 減速（Boss 2%），最多 3 層。`,
  frostmage: `攻擊附帶 25% 範圍減速；每 10 秒施放凍結領域。Boss 只承受較弱減速且不會被暈眩。`,
};

const ALLY_ADVICE: Record<string, string> = {
  warrior: "便宜且穩定，適合放在需要近戰攔截的路線前段。",
  shield: "適合在自己的路線吸引敵人火力並保護遠程單位，但傷害較低。",
  archer: "輸出高但很脆；同路線沒有目標時，可在實際射程內跨線補一發後繼續沿原路線移動。",
  medic: "本身不會攻擊，價值完全來自延長同一戰區其他小隊的存活時間。",
  flagbearer: "放在主力交戰圈後方覆蓋輸出小隊；多面旗幟不疊加，適合分守不同戰線。",
  mage: "對成群的小兵效率極高，對單一高血量目標則不划算。",
  assault: "基礎攻擊很低，專門切高階目標；現在由玩家拖曳選擇要守的進攻路線。",
  engineer: `不占一般小隊額度且不跟隨主角；主角倒下前敵人不會攻擊工程兵。上限為 2 隊，火爐 Lv.20／50／80 時依序提高到 3／4／5 隊。`,
  musketeer: "招募價格較高，專門以遠程射擊克制重裝壁壘、轟擊者與 Boss，命中還會累積減速。",
  frostmage: "面對密集敵潮或破城者這類重裝單位時，減速能替其他小隊爭取輸出時間。",
};

const ENEMY_ADVICE: Record<string, string> = {
  grunt: "數量取勝；普通近戰只鎖自己路線，沒有同線目標時會繼續朝火爐前進。",
  slinger: "同路線沒有可攻擊目標時，才會在實際射程內跨線補射；之後仍沿自己的路線推進。",
  bruiser: "血厚傷害低，可以用同路線盾兵拖住。",
  marksman: "傷害不低且射程遠；同線無目標時具備跨線補射能力。",
  juggernaut: "重裝高血量並能吸引防禦火力；Lv.5 以下普通敵人不再主動尋找一般設施，但擋路城牆仍是路徑障礙。",
  bombardier: "會遠距離範圍轟擊；Lv.5 以下普通單位的範圍傷害不會順帶破壞一般設施。",
  boss: "Lv.6 Boss 保留全局受擊／優先順序，並分三階段；第二階段起會震地，第三階段會逐漸免疫同一座砲塔。",
  breacher: "特殊破城兵種：無視一般設施規則也要先拆自己路線的城牆，對城牆傷害 ×3。",
  icearmor: "低於 25 點的攻擊會被減半，集中高傷害單體反而更有效率；血量過半後護甲碎裂並加速。",
  commander: "會給附近敵人加攻速與移速，友軍會優先攻擊他，出現時應優先集火解除。",
  bomber: "特殊自爆兵種：接近合法目標後倒數 2 秒自爆，聽到警告音就該後退或搶先擊殺。",
  flyingMelee: "飛行近戰小兵，能越過城牆；近戰、盾兵、工程兵與掌旗者不能攻擊它，優先交給遠程單位。",
  flyingEliteArcher: "飛行精銳射手，會在空中遠程點名地面單位；用弓箭手、魔法師或攻擊設施處理。",
  flyingBomber: "飛行轟炸者，生命較低但能越過城牆進行範圍轟擊；遠程火力應優先集火。",
  flyingColossus: "飛行空中巨像，只在五的倍數波次登場；只能由遠程火力、主角與攻擊設施鎖定。",
};

const BUILDING_ADVICE: Record<string, string> = {
  mine: "每 0.25 秒產出 1 石頭；越早建造，越早脫離有限的天然礦點。",
  goldMine: "不可被敵人摧毀，每 0.75 秒產出 1 金幣；沒有自動收取設施時需靠近收取。",
  lumberyard: "每 0.25 秒產出 1 木材；木材是多數設施的主要成本。",
  warehouse: "沒有倉庫時三種資源都卡在 100，城牆與自動收取都買不起。",
  recruitHall: "解鎖全部兵種；招募後由選單把兵種圖示拖曳到要防守的進攻路線。",
  autoCollector: "自動收取所有生產設施的緩衝資源，也會自動收取敵人掉落的金幣。",
  autoRebuilder: "依摧毀順序自動重建，第 10 波前很值得投資。",
  tower: "中距離範圍轟擊；沿道路旁分散佈署，讓相鄰塔的短射程互相重疊。",
  crossbowTower: "低成本高速單體防禦，適合前期負責一小段路線。",
  frostTower: "短中距離減速，適合放在兩座輸出塔的重疊區。",
  sniperTower: "地面最長射程的高傷害設施，優先攻擊 Boss 與高階敵人；天空平台可再獲得射程強化。",
  mortar: "高成本大範圍防禦，能在地面留下持續燃燒區域；有近距離死角，需與其他塔交疊。",
  wall: "北、東、南、西四面固定防線只包住火爐與四個核心建造位。每面牆中央有我方專用門，敵人必須突破自己路線對應的牆。",
};

function allyEntry(index: number): CodexEntry {
  const def = ALLY_UNITS[index];
  const heal = def.attackType === "heal";
  const fields: CodexField[] = [
    { label: "小隊人數", value: `${def.squadSize} 人` },
    { label: "每名成員生命", value: String(def.maxHealth) },
    { label: heal ? "治療力" : "攻擊力", value: String(def.attackPower) },
    { label: "攻擊間隔", value: `${def.attackInterval.toFixed(2)} 秒` },
    { label: "攻擊範圍", value: String(def.attackRange) },
    { label: "移動速度", value: `${def.moveSpeed.toFixed(2)} / 秒` },
    { label: "招募成本", value: `${def.recruitCost ?? 0} 金幣` },
    {
      label: "路線規則",
      value: def.attackType === "rangedSingle" || def.attackType === "rangedArea"
        ? "部署後綁定路線；同線無可攻擊目標時，僅能在實際射程內跨線補射"
        : "部署後綁定路線；普通近戰不跨線追擊",
    },
    {
      label: "火爐同步",
      value: `每級火爐：生命、攻擊、攻速各 +${Math.round(FURNACE_UPGRADE.allyMaxHealthPct * 100)}%`,
    },
  ];
  if (def.supportAura) {
    fields.push({
      label: "旗幟光環",
      value: `半徑 ${def.supportAura.radius}：攻擊、攻速各 +${Math.round(def.supportAura.attackBonus * 100)}%；每級火爐再各 +${Math.round(def.supportAura.attackBonusPerFurnaceLevel * 100)}%`,
    });
  }
  return {
    id: `ally.${def.id}`,
    category: "ally",
    name: def.name,
    role: ALLY_ROLE[def.id] ?? "",
    visual: def.visual,
    icon: "",
    fields,
    advice: `${ALLY_SPECIAL[def.id] ?? ""}${ALLY_ADVICE[def.id] ?? ""}`,
    unlocked: true,
    search: `${def.name}${def.id}${ALLY_ROLE[def.id] ?? ""}`.toLowerCase(),
  };
}

function enemyEntry(index: number): CodexEntry {
  const def = ENEMY_UNITS[index];
  const ordinaryLowTier = (def.level ?? 0) <= 5 && !def.siegeFocus && !def.selfDestruct;
  const fields: CodexField[] = [
    { label: "等級", value: `Lv.${def.level ?? 0}` },
    { label: "小隊人數", value: `${def.squadSize} 人` },
    { label: "每名成員生命", value: String(def.maxHealth) },
    { label: "攻擊力", value: String(def.attackPower) },
    { label: "攻擊間隔", value: `${def.attackInterval.toFixed(2)} 秒` },
    { label: "攻擊範圍", value: String(def.attackRange) },
    { label: "移動速度", value: `${def.moveSpeed.toFixed(2)} / 秒` },
    { label: "攻擊方式", value: attackTypeName(def.attackType) },
    { label: "掉落金幣", value: `${def.goldValue ?? 0} / 名` },
    { label: "結構傷害倍率", value: `×${(def.siegeMultiplier ?? 1).toFixed(1)}` },
    {
      label: "設施鎖定",
      value: ordinaryLowTier
        ? "不主動鎖定一般設施；擋路城牆與中央火爐依路徑／終點規則處理"
        : (def.level ?? 0) >= 6
          ? "Boss／高階規則：沿用全局優先順序"
          : "特殊兵種：依自身技能規則",
    },
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
  if (def.isFlying) {
    fields.push({
      label: "空中規則",
      value: "可越過城牆；只有遠程我方兵種、主角與攻擊型設施能鎖定",
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
    {
      label: "火爐同步",
      value: def.canBeAttacked
        ? `每級火爐：生命、攻擊各 +${Math.round(FURNACE_UPGRADE.facilityMaxHealthPct * 100)}%`
        : "不可被攻擊的設施不需生命同步",
    },
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
      { label: "天空平台", value: "Lv.15／20／25／30／35 依序解鎖；成本 ×1.25、傷害 ×1.5，並套用該設施專屬強化" },
    );
  }
  if (def.canBeAttacked) {
    fields.push({
      label: "自動修復",
      value: "依火爐等級套用 15 秒後百分比自修；工程兵也可在受損時修復（中央火爐除外）",
    });
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
      { label: "手動取得", value: `靠近樹木自動採集，每 ${GATHER.woodInterval.toFixed(2)} 秒 1 個` },
      { label: "自動取得", value: "伐木場每 0.25 秒 1 個" },
      { label: "天然存量", value: `小樹 ${TREE_CAPACITY.small}、中樹 ${TREE_CAPACITY.medium}、大樹 ${TREE_CAPACITY.large}，採完變成樹樁` },
      { label: "主要用途", value: "礦場、倉庫、招募所、砲塔、城牆" },
      { label: "容量", value: "沒有倉庫時上限 100" },
    ],
    advice: `闖關模式的樹木不會重生，無限模式 ${RESPAWN.treeSeconds} 秒後開始長回。`,
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
      { label: "手動取得", value: `靠近礦點自動採集，每 ${GATHER.stoneInterval.toFixed(2)} 秒 1 個` },
      { label: "自動取得", value: "礦場每 0.25 秒 1 個" },
      { label: "天然存量", value: `小礦 ${STONE_CAPACITY.small}、中礦 ${STONE_CAPACITY.medium}、大礦 ${STONE_CAPACITY.large}，採完變成碎石` },
      { label: "主要用途", value: "城牆、伐木場、砲塔、自動設施" },
      { label: "容量", value: "沒有倉庫時上限 100" },
    ],
    advice: `無限模式的礦點 ${RESPAWN.stoneSeconds} 秒後開始重生，闖關模式不會。`,
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
      { label: "取得方式", value: `擊殺敵人、金礦每 0.75 秒產出 1；無限模式提早叫波會依剩餘秒數給金幣（基礎每 10 波 +${ENDLESS_ECONOMY.goldPerSecondPerTenWaves}/秒，Lv.4+ 波次加倍）` },
      { label: "主要用途", value: "招募小隊、升級兵種、建造設施與火爐升級" },
      { label: "容量", value: "沒有倉庫時上限 100" },
      { label: "倉庫被摧毀", value: `木材與石頭損失 ${Math.round(WAREHOUSE_LOSS.wood * 100)}%，金幣損失 ${Math.round(WAREHOUSE_LOSS.gold * 100)}%，其餘散落在地面` },
    ],
    advice: "闖關 1 開局給 15 金，剛好只夠蓋招募所；完成後才能花後續金幣招募或升級兵種。",
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
    case "meleeArea": return "近戰範圍";
    case "meleeSingle": return "近戰單體";
    case "rangedSingle": return "遠程單體";
    case "rangedArea": return "遠程範圍";
    case "heal": return "治療";
    default: return "無";
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
    { label: "移動速度", value: `${HERO.moveSpeed.toFixed(2)} / 秒` },
    { label: "路線規則", value: "主角不綁定路線，可自由跨線移動與攻擊" },
    { label: "倒地", value: `${HERO_REVIVE.downTime} 秒後在火爐旁以 ${Math.round(HERO_REVIVE.healthFraction * 100)}% 生命復活` },
    { label: "主動技能", value: HERO_SKILLS.map((skill) => `${skill.keyLabel} ${skill.name}`).join("／") },
    { label: "空中火力支援", value: `${AIR_SUPPORT.strikes} 次 × ${AIR_SUPPORT.strikeDamage}，火焰 ${AIR_SUPPORT.flameDps}/秒、${AIR_SUPPORT.flameDuration} 秒` },
    { label: "無限火力", value: `攻擊設施攻速 ×${INFINITE_FIREPOWER.attackSpeedMultiplier}，${INFINITE_FIREPOWER.duration} 秒` },
    { label: "地面支援", value: `3 人共用 ${GROUND_SUPPORT.sharedHealth} HP，攻擊 ${GROUND_SUPPORT.attack}，持續 ${GROUND_SUPPORT.duration} 秒` },
    { label: "震地波", value: `自動施放：主角攻擊且前方有敵人時造成 ${SEISMIC_WAVE.damage} 傷害、震退，易傷 ${Math.round(SEISMIC_WAVE.vulnerability * 100)}% 持續 ${SEISMIC_WAVE.vulnerabilityDuration} 秒` },
  ],
  advice: `距離大於 ${HERO_MELEE.threshold} 時射擊，靠近後自動改為範圍揮擊；主角是唯一不受路線綁定的常駐角色。`,
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
