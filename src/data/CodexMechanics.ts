import { STRUCTURE_SELF_REPAIR } from "../combat/StructureSelfRepair";
import { BOSS_RULES } from "../enemies/BossController";
import { HERO_SKILLS } from "../hero/HeroSkillDefinitions";
import { ALLY_PROGRESSION } from "./AllyProgressionConfig";
import { MAP } from "./BuildSlotDefinitions";
import { WALL_REBUILD_DECAY } from "./BuildingDefinitions";
import type { CodexEntry } from "./CodexData";
import { ENGINEER_RULES } from "./EngineerConfig";
import { ENDLESS_SCALING } from "./GameModeRules";

/**
 * Rules pages. Numeric statements read the same configs as gameplay so the
 * codex cannot silently retain an older balance version.
 */
export const MECHANIC_ENTRIES: CodexEntry[] = [
  mechanic("faction", "陣營標示", [
    ["我方", "腳下藍色雙弧，血條左側藍色方形標記"],
    ["敵方", "腳下紅色斷裂尖角環，血條左側紅色菱形標記"],
    ["色弱", "形狀本身就不同，不需要只靠顏色分辨"],
    ["設定", "主選單設定可切換關閉／簡潔／明顯，預設為明顯"],
  ], "被主角鎖定的目標會多一圈更亮的標記。"),
  mechanic("healthbar", "血條顯示", [
    ["一般單位", "所有存活的我方與敵方單位都常駐顯示血條與陣營形狀"],
    ["可攻擊設施", "完成建造後立即常駐顯示，不必先受傷或靠近"],
    ["文字標籤", "靠近時顯示名稱與 Lv.，遠處保留容易辨認的生命比例"],
    ["Boss", "只使用畫面上方大型血條，避免重複顯示"],
  ], "血條會在死亡、拆除或回收模型時立即解除，不會殘留在下一個單位上。"),
  mechanic("taunt", "嘲諷", [
    ["我方盾兵", "半徑 8，可以替建築吸引火力"],
    ["敵方重裝近戰兵", "半徑 5，不能嘲諷建築"],
    ["敵方重裝壁壘", "半徑 8，可以嘲諷建築"],
    ["城牆阻隔", "嘲諷來源在城牆內側時，敵人必須先破壞城牆"],
  ], "嘲諷只提高注意力，永遠不會讓敵人穿過牆。"),
  mechanic("wall", "城牆封路", [
    ["點位", `北、東、南、西共 ${MAP.wallSlots} 面固定城牆，每面封住該側所有路線`],
    ["我方通行", "每面中央都有我方專用門，我方與主角可自由進出"],
    ["敵方通行", "敵人不能使用我方門，必須先摧毀整面城牆"],
    ["同波重建", `同一波生命依序為 ${WALL_REBUILD_DECAY.factors.map((f) => `${Math.round(f * 100)}%`).join(" → ")}，之後維持 ${Math.round(WALL_REBUILD_DECAY.minimum * 100)}%`],
  ], "城牆採長方形實體碰撞並覆蓋整面，沒有舊版分段牆的側邊縫隙。"),
  mechanic("area", "範圍傷害", [
    ["戰士", "半徑 2.0，最多 5 名"],
    ["突擊手", "半徑 2.0，最多 5 名；只有 Lv.4+ 才吃到高額倍率"],
    ["魔法師", "半徑 2.5，最多 8 名"],
    ["冰霜術士", "半徑 2.5，最多 6 名並附帶減速"],
    ["砲塔／迫擊砲", "砲塔半徑 2.5、最多 6 名；迫擊砲半徑 4、最多 8 名"],
    ["Boss 震地", `半徑 ${BOSS_RULES.slam.radius}，傷害上限為每個目標最大生命的 ${Math.round(BOSS_RULES.slam.maxHealthFraction * 100)}%`],
  ], "範圍攻擊仍受每次最大目標數限制，不會無上限命中整張地圖。"),
  mechanic("furnace", "火爐與治療", [
    ["失敗條件", "火爐被摧毀立刻結束"],
    ["百分比自修", `火爐與可受擊設施未受擊 ${STRUCTURE_SELF_REPAIR.percentDelay} 秒後，每秒回復火爐等級 × 1% 最大生命，Lv.${STRUCTURE_SELF_REPAIR.percentLevelCap} 封頂 10%`],
    ["額外自修", `Lv.${STRUCTURE_SELF_REPAIR.fixedBurstStartLevel} 未受擊 ${STRUCTURE_SELF_REPAIR.fixedBurstDelay} 秒後一次性回復最大生命 10%；之後每級固定增加 ${STRUCTURE_SELF_REPAIR.fixedBurstPerExtraLevel.toLocaleString()} HP`],
    ["升級", "最高 Lv.100，提升主角能力與火爐生命"],
    ["一般小隊上限", "闖關固定 8；無限模式每升 1 級火爐增加 2 隊"],
    ["工程兵上限", "基礎 2 隊，火爐 Lv.20／50／80 時提高到 3／4／5 隊"],
  ], "火爐是唯一不能拆除、也不能由工程兵修復的建築。"),
  mechanic("rebuild", "自動重建 FIFO", [
    ["順序", "嚴格依摧毀先後，隊首買不起時整個佇列一起等"],
    ["類型", "重建該點位最後一次完成的建築"],
    ["手動拆除", "不會進入佇列，也不會被自動蓋回"],
    ["改建", "改建後若新設施被摧毀，重建的是新設施"],
  ], "拆除自動重建站時佇列會保留，重新蓋好後繼續。"),
  mechanic("mode", "模式差異", [
    ["闖關", "三關各 10 波，難度來自路線數與敵人組成"],
    ["無限", `生命每波 +${Math.round(ENDLESS_SCALING.healthPerWave * 100)}%、攻擊每波 +${Math.round(ENDLESS_SCALING.attackPerWave * 100)}%，每 10 波增加一條路線；首隻 Boss 在第 20 波`],
    ["天然資源", "闖關不重生，無限會重生"],
    ["Lv.5／Lv.6", "只會在 5 的倍數波次出現；有 Lv.4+ 的下一波會提高提早叫波金幣"],
    ["排行榜", "只有無限模式記錄，且僅存在這台瀏覽器"],
  ], "使用任何測試工具或教學關卡的該局都不會寫入排行榜。"),
  mechanic("ally-upgrade", "兵種升級", [
    ["位置", "在招募面板直接升級同一兵種"],
    ["每級能力", `最大生命、攻擊力、攻擊速度各 +${Math.round(ALLY_PROGRESSION.statPerLevel * 100)}%`],
    ["價格", `第一次為招募價的 ${Math.round(ALLY_PROGRESSION.startingCostFactor * 100)}%，之後每級再增加招募價的 ${Math.round(ALLY_PROGRESSION.costGrowthPerLevel * 100)}%`],
    ["適用範圍", "場上既有小隊與之後新招募的小隊立即同步；每局重新開始歸零"],
    ["例外", "工程兵不可升級，也不占一般小隊額度"],
  ], "升級價格依各兵種招募價不同，高價兵種的升級也會更貴。"),
  mechanic("engineer", "工程兵修復", [
    ["偵測", `招募後立即偵測，之後每 ${ENGINEER_RULES.scanInterval} 秒尋找距離最近的受損設施`],
    ["安全設施", `完整倒數 ${ENGINEER_RULES.safeRepairInterval} 秒後，一次回復該設施最大生命 ${Math.round(ENGINEER_RULES.repairFraction * 100)}%`],
    ["受擊設施", `完整倒數 ${ENGINEER_RULES.underAttackRepairInterval} 秒後，一次回復該設施最大生命 ${Math.round(ENGINEER_RULES.repairFraction * 100)}%`],
    ["限制", "兩名工程兵不能同修一座；不能修火爐或已被擊破的設施"],
    ["受擊順序", "主角倒下前不會成為敵方合法目標，主角倒下後排在設施之前"],
  ], "工程兵修復是倒數完成後跳一次 10%，不是把 10% 平均拆成每秒回復。"),
  mechanic("enemy-priority", "敵方攻擊順序", [
    ["一般敵人", "城牆 → 盾兵 → 其餘最近我方單位 → 主角 → 工程兵 → 最近可攻擊設施 → 火爐"],
    ["重新鎖定", "較前順位目標重新出現時，敵人會放棄後順位目標並回頭鎖定"],
    ["特殊兵種", "破城者、自爆怪等專攻型敵人使用各自規則，不套用一般順序"],
  ], "城牆、盾兵或主角重新出現都會重新取得其應有的優先順位。"),
  mechanic("hero-skills", "主角主動技能", [
    ...HERO_SKILLS.map((skill) => [
      `按鍵 ${skill.keyLabel}`,
      `${skill.name}：${skill.shortDescription}，初始冷卻 ${skill.initialCooldown} 秒、施放冷卻 ${skill.cooldown} 秒`,
    ] as [string, string]),
  ], "技能不消耗資源；按 1／2／3 施放。震地波會在主角攻擊且前方扇形範圍內有敵人時自動施放。地面支援在護駕撤退後才開始計算 30 秒冷卻。"),
];

function mechanic(id: string, name: string, rows: Array<[string, string]>, advice: string): CodexEntry {
  return {
    id: `mechanic.${id}`,
    category: "mechanic",
    name,
    role: "戰鬥機制",
    visual: "",
    icon: "",
    fields: rows.map(([label, value]) => ({ label, value })),
    advice,
    unlocked: true,
    search: `${name}${id}`.toLowerCase(),
  };
}
