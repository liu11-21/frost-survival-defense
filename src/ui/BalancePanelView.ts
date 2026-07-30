import {
  bossDamageMultiplier,
  bossHealthMultiplier,
  ENDLESS_DIFFICULTY,
  endlessFieldCapTarget,
  endlessHighTierShare,
  isLevel6BossWave,
} from "../data/EndlessDifficultyConfig";
import type { DebugDeps, BalanceKnobs } from "./DebugPanels";

/** Level → a representative existing enemy id, for the "spawn arbitrary level" control. */
const LEVEL_SAMPLE_ENEMY: Record<number, string> = {
  1: "grunt",
  2: "bruiser",
  3: "marksman",
  4: "juggernaut",
  5: "bombardier",
  6: "boss",
};

const KNOBS: Array<[keyof BalanceKnobs, string]> = [
  ["enemyHealth", "敵人 HP"],
  ["enemyAttack", "敵人攻擊"],
  ["enemyCount", "敵人數量"],
  ["goldDrop", "金幣掉落"],
  ["production", "生產速度"],
  ["wallHealth", "城牆 HP"],
  ["towerDamage", "砲塔傷害"],
  ["squadHealth", "小隊生命"],
  ["squadDamage", "小隊傷害"],
  ["bossHealth", "Boss HP"],
  ["bossSlamCooldown", "Boss 震地冷卻"],
];

const ACTIONS = [
  "skipWave",
  "spawnBoss",
  "clearEnemies",
  "fillResources",
  "healAllies",
  "resetLevel",
  "jumpWave10",
  "jumpWave15",
  "jumpWave20",
  "prepShort",
  "callWaveEarly",
  "unlockAttackBuildings",
];

/** Renders the whole F9 balance panel — pulled out of `DebugPanels` purely to
 * keep that file's own line count under the project's convention. */
export function renderBalancePanel(el: HTMLElement, deps: DebugDeps, rerender: () => void): void {
  const k = deps.balance;
  const wave = deps.waves.currentWave;
  const upcomingWave = wave + 1;
  const reward = deps.run.previewEarlyWaveReward();

  el.innerHTML = `
    <div class="dbg-title">平衡工具 (F9)</div>
    <div class="dbg-warn">使用後本局不寫入排行榜。</div>
    <div id="dbg-knobs"></div>
    <div class="dbg-row">
      <button data-act="skipWave">跳下一波</button>
      <button data-act="spawnBoss">生成 Boss</button>
      <button data-act="clearEnemies">清除敵人</button>
    </div>
    <div class="dbg-row">
      <button data-act="fillResources">補滿資源</button>
      <button data-act="healAllies">補滿友軍</button>
      <button data-act="resetLevel">重置關卡</button>
    </div>
    <div class="dbg-title">無限模式節奏</div>
    <div class="dbg-grid">
      <span>目前波次</span><b>${wave}</b>
      <span>下一波可生成 6 級 Boss</span><b>${isLevel6BossWave(upcomingWave) ? "是" : "否"}（首見第 ${ENDLESS_DIFFICULTY.firstBossWave} 波）</b>
      <span>Boss HP / 傷害倍率</span><b>×${bossHealthMultiplier(upcomingWave).toFixed(2)} / ×${bossDamageMultiplier(upcomingWave).toFixed(2)}</b>
      <span>本波敵人數量目標</span><b>${endlessFieldCapTarget(upcomingWave)}</b>
      <span>高階敵人比例上限</span><b>${(endlessHighTierShare(upcomingWave) * 100).toFixed(0)}%</b>
      <span>立即開波預計獎勵</span><b>+${reward} 金幣</b>
    </div>
    <div class="dbg-row">
      <button data-act="jumpWave10">跳至第10波</button>
      <button data-act="jumpWave15">跳至第15波</button>
      <button data-act="jumpWave20">跳至第20波（首次Boss）</button>
    </div>
    <div class="dbg-row">
      <button data-act="prepShort">準備倒數設為3秒</button>
      <button data-act="callWaveEarly">模擬立即下一波</button>
      <button data-act="unlockAttackBuildings">解鎖所有攻擊設施（補足材料）</button>
    </div>
    <div class="dbg-row">
      <span>生成任意等級敵人</span>
      <select id="dbg-level-select">
        ${[1, 2, 3, 4, 5, 6].map((l) => `<option value="${l}">Lv.${l}</option>`).join("")}
      </select>
      <button data-act="spawnLevel">生成</button>
    </div>
  `;

  const box = el.querySelector("#dbg-knobs");
  if (box) {
    for (const [key, label] of KNOBS) {
      const row = document.createElement("div");
      row.className = "dbg-knob";
      const value = k[key] as number;
      row.innerHTML = `<span>${label}</span><input type="range" min="0.25" max="3" step="0.05" value="${value}"><b>${value.toFixed(2)}</b>`;
      const input = row.querySelector("input");
      const readout = row.querySelector("b");
      input?.addEventListener("input", () => {
        const v = Number(input.value);
        (k[key] as number) = v;
        k.dirty = true;
        if (readout) readout.textContent = v.toFixed(2);
      });
      box.appendChild(row);
    }
  }

  for (const act of ACTIONS) {
    el.querySelector(`[data-act="${act}"]`)?.addEventListener("click", () => {
      k.dirty = true;
      deps.onBalanceAction(act);
      rerender();
    });
  }

  el.querySelector('[data-act="spawnLevel"]')?.addEventListener("click", () => {
    const select = el.querySelector<HTMLSelectElement>("#dbg-level-select");
    const level = Number(select?.value ?? 1);
    const enemyId = LEVEL_SAMPLE_ENEMY[level] ?? "grunt";
    k.dirty = true;
    deps.squads.spawnEnemy(enemyId, 0, 24, 0);
  });
}
