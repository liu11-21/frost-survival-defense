import type { AIWatchdog } from "../ai/AIWatchdog";
import type { DeathResidueGuard } from "../ai/DeathResidueGuard";
import type { SquadManager } from "../combat/SquadManager";
import { WATCHDOG } from "../ai/AIConfig";
import { validateTarget } from "../ai/TargetValidator";

export type AiFilterTab = "all" | "normal" | "stall" | "residue" | "unregistered" | "targetInvalid" | "pathInvalid";

const TAB_LABELS: Record<AiFilterTab, string> = {
  all: "全部",
  normal: "正常",
  stall: "疑似呆滯",
  residue: "死亡殘留",
  unregistered: "未註冊AI",
  targetInvalid: "目標失效",
  pathInvalid: "路徑失效",
};
export const AI_TABS: AiFilterTab[] = ["all", "normal", "stall", "residue", "unregistered", "targetInvalid", "pathInvalid"];

interface Row {
  html: string;
  categories: Set<AiFilterTab>;
}

/** Builds every living ally's row plus its category memberships, so the tab
 * bar filters the same computed rows rather than re-deriving state per tab. */
function buildRows(squads: SquadManager, watchdog: AIWatchdog): Row[] {
  const unregistered = new Set(watchdog.unregistered);
  const rows: Row[] = [];
  squads.eachAlly((unit) => {
    const brain = unit.aiBrain;
    if (!brain) return;
    const categories = new Set<AiFilterTab>();
    const idle = brain.sinceLastAction;
    const isStalled = idle >= WATCHDOG.reportThreshold;
    if (isStalled) categories.add("stall");
    const isUnregistered = unregistered.has(unit.damageId);
    if (isUnregistered) categories.add("unregistered");
    const target = unit.currentTarget;
    const validity = target ? validateTarget(unit, target) : "null";
    const targetInvalid = target !== null && validity !== "ok";
    if (targetInvalid) categories.add("targetInvalid");
    const pathInvalid = brain.state === "stuckRecovery";
    if (pathInvalid) categories.add("pathInvalid");
    if (!isStalled && !isUnregistered && !targetInvalid && !pathInvalid) categories.add("normal");
    categories.add("all");

    const hb = brain.aiHeartbeat;
    rows.push({
      categories,
      html:
        `<tr class="${isStalled ? "dbg-warn-row" : ""}">` +
        `<td>${unit.damageId}</td><td>${unit.squadId}</td><td>${unit.def.name}</td>` +
        `<td>${Math.ceil(unit.health)}/${unit.maxHealth}</td>` +
        `<td>${brain.state}</td><td>${target ? target.kind : "無"}</td><td>${validity}</td>` +
        `<td>${hb.lastUpdateAt.toFixed(1)}</td><td>${idle.toFixed(1)}</td><td>${hb.lastMovementAt.toFixed(1)}</td>` +
        `<td>${isUnregistered ? "遺失" : "已註冊"}</td><td>${isStalled ? "呆滯" : "正常"}</td>` +
        `<td>${brain.stuckInfo.lastRecovery}</td>` +
        `<td><button data-reset-unit="${unit.damageId}">重置</button></td>` +
        `</tr>`,
    });
  });
  return rows;
}

export interface AiPanelResult {
  html: string;
  attach(root: HTMLElement, onResetUnit: (unitId: number) => void): void;
}

export function renderAiDebugPanel(
  squads: SquadManager,
  watchdog: AIWatchdog,
  residue: DeathResidueGuard,
  activeTab: AiFilterTab,
): AiPanelResult {
  const rows = buildRows(squads, watchdog);
  const counts = new Map<AiFilterTab, number>(AI_TABS.map((t) => [t, 0]));
  for (const row of rows) for (const c of row.categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const visible = rows.filter((r) => r.categories.has(activeTab));

  const residueRows = residue.report
    .map(
      (r) =>
        `<tr><td>${r.unitId}</td><td>${r.squadId}</td><td>${r.unitType}</td><td>${r.deathAge}s</td><td>${r.meshEnabled ? "是" : "否"}</td></tr>`,
    )
    .join("");

  const tabsHtml = AI_TABS.map(
    (t) => `<button class="dbg-tab${t === activeTab ? " on" : ""}" data-ai-tab="${t}">${TAB_LABELS[t]}<b>${counts.get(t) ?? 0}</b></button>`,
  ).join("");

  const html = `
    <div class="dbg-title">AI 診斷 (F7)</div>
    <div class="dbg-note">看門狗復原 ${watchdog.recoveries} 次 · 呆滯定義(&gt;${WATCHDOG.reportThreshold}s) 命中 ${watchdog.stallsSeen} 次 · 死亡殘留強制清理 ${residue.forceCleaned} 次</div>
    <div class="dbg-ai-tabs">${tabsHtml}</div>
    <div class="dbg-table-wrap">
      <table class="dbg-table">
        <thead><tr>
          <th>ID</th><th>隊</th><th>兵種</th><th>HP</th><th>狀態</th><th>目標</th><th>目標有效性</th>
          <th>末次更新</th><th>末次行動</th><th>末次移動</th><th>註冊</th><th>看門狗</th><th>最近復原</th><th>操作</th>
        </tr></thead>
        <tbody>${visible.map((r) => r.html).join("") || `<tr><td colspan="14" class="dbg-note">此分類目前無單位</td></tr>`}</tbody>
      </table>
    </div>
    ${
      activeTab === "residue"
        ? `<div class="dbg-title">死亡殘留安全網紀錄</div>
           <table class="dbg-table">
             <thead><tr><th>ID</th><th>隊</th><th>兵種</th><th>死亡經過</th><th>模型仍啟用</th></tr></thead>
             <tbody>${residueRows || `<tr><td colspan="5" class="dbg-note">尚無需要強制清理的紀錄</td></tr>`}</tbody>
           </table>`
        : ""
    }
    <div class="dbg-row">
      <button data-act="reacquireAll">重新搜尋全部（重啟 AI）</button>
      <button data-act="formationAll">全部返回編隊</button>
      <button data-act="recheckRegistration">重新檢查註冊</button>
      <button data-act="cleanResidue">強制清理死亡殘留</button>
    </div>
  `;

  return {
    html,
    attach(root, onResetUnit) {
      root.querySelectorAll<HTMLButtonElement>("button[data-reset-unit]").forEach((btn) => {
        btn.addEventListener("click", () => onResetUnit(Number(btn.dataset.resetUnit)));
      });
    },
  };
}
