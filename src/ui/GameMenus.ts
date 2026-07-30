import { LEVELS } from "../data/GameModeRules";
import type { UpgradeDefinition } from "../data/UpgradeDefinitions";
import { Leaderboard } from "../modes/Leaderboard";
import type { UIRefs } from "./UIRoot";

/** Every main-menu action, with the one-line purpose the spec requires. */
export const MENU_DESCRIPTIONS = {
  stage: "每一關重新開始，在指定波次內守住中央火爐。",
  endless: "持續抵抗逐漸增強的敵人，升級火爐並挑戰最高波次。",
  tutorial: "學習採集、建造、招募、火爐升級與防守操作。",
  settings: "調整畫質與陣營標示強度。",
  help: "查看移動、互動、建造、招募與戰鬥規則。",
  resume: "回到尚未結束的對局。",
  codex: "查看友方兵種、敵方怪物、建築、資源與特殊能力。",
} as const;

export type MenuChoice =
  | { kind: "stage"; levelId: string }
  | { kind: "endless" }
  | { kind: "upgrade"; id: string }
  | { kind: "resume" }
  | { kind: "menu" }
  | { kind: "tutorial" }
  | { kind: "help" }
  | { kind: "settings"; from?: "pause" }
  | { kind: "codex" }
  | { kind: "quality"; level: string }
  | { kind: "markerStrength"; level: string }
  | { kind: "fpsHud"; level: string }
  | { kind: "damageNumbers"; level: string }
  | { kind: "screenShake"; level: string }
  | { kind: "flashIntensity"; level: string };

/** Full-screen overlays: the main menu, pause, upgrade picks and results. */
export class GameMenus {
  private open = false;
  /** Where the settings screen's "back" button returns to — remembered across
   * re-renders (toggling a setting redraws the same screen) so only the call
   * that first opens it needs to say which menu it came from. */
  private settingsOrigin: "main" | "pause" = "main";
  onChoice: ((choice: MenuChoice) => void) | null = null;

  constructor(
    private readonly refs: UIRefs,
    private readonly leaderboard: Leaderboard,
  ) {}

  get isOpen(): boolean {
    return this.open;
  }

  hide(): void {
    this.open = false;
    this.refs.screen.classList.remove("show");
    this.refs.screenBody.innerHTML = "";
  }

  showMainMenu(canResume = false): void {
    const board = this.leaderboardHtml();
    this.render(`
      <h1>寒霜火爐 <small>FROSTBOUND FURNACE</small></h1>
      <p class="lede">守住地圖中央唯一的火爐。火爐被摧毀即失敗。</p>
      <div class="menu-cols">
        <div class="menu-col">
          <h2>闖關模式</h2>
          <p class="muted">${MENU_DESCRIPTIONS.stage}</p>
          <div class="menu-buttons" id="menu-stages"></div>
        </div>
        <div class="menu-col">
          <h2>無限模式</h2>
          <p class="muted">${MENU_DESCRIPTIONS.endless}</p>
          <div class="menu-buttons">
            <button class="big-btn" data-endless="1">開始無限模式<span class="sub">${MENU_DESCRIPTIONS.endless}</span></button>
          </div>
          ${board}
        </div>
        <div class="menu-col">
          <h2>入門與說明</h2>
          <div class="menu-buttons">
            ${canResume ? '<button class="big-btn" data-resume="1">繼續遊戲<span class="sub">' + MENU_DESCRIPTIONS.resume + '</span></button>' : ""}
            <button class="big-btn" data-tutorial="1">教學關卡<span class="sub">${MENU_DESCRIPTIONS.tutorial}</span></button>
            <button class="big-btn" data-codex="1">圖鑑<span class="sub">${MENU_DESCRIPTIONS.codex}</span></button>
            <button class="big-btn" data-help="1">操作說明<span class="sub">${MENU_DESCRIPTIONS.help}</span></button>
            <button class="big-btn" data-settings="1">設定<span class="sub">${MENU_DESCRIPTIONS.settings}</span></button>
          </div>
        </div>
      </div>
      <p class="foot">WASD 移動 · Shift 加速 · B 建造 · G 招募 · U 升級火爐 · N 催下一波 · T 自動重建開關 · 1/2/3/4 技能 · Esc 暫停</p>
    `);

    const stageBox = this.refs.screenBody.querySelector("#menu-stages");
    if (stageBox) {
      for (const level of LEVELS) {
        const btn = document.createElement("button");
        btn.className = "big-btn";
        btn.innerHTML = `${level.name}<span class="sub">${level.description}</span>`;
        btn.addEventListener("click", () => this.onChoice?.({ kind: "stage", levelId: level.id }));
        stageBox.appendChild(btn);
      }
    }
    this.bind("[data-endless]", { kind: "endless" });
    this.bind("[data-tutorial]", { kind: "tutorial" });
    this.bind("[data-codex]", { kind: "codex" });
    this.bind("[data-help]", { kind: "help" });
    this.bind("[data-settings]", { kind: "settings" });
    this.bind("[data-resume]", { kind: "resume" });
  }

  showPause(): void {
    this.render(`
      <h1>已暫停</h1>
      <div class="menu-buttons center">
        <button class="big-btn" data-resume="1">繼續遊戲 (Esc)</button>
        <button class="big-btn ghost" data-settings="1">設定</button>
        <button class="big-btn ghost" data-help="1">操作說明</button>
        <button class="big-btn ghost" data-menu="1">回到主選單</button>
      </div>
    `);
    this.refs.screenBody.querySelector("[data-resume]")?.addEventListener("click", () => {
      this.onChoice?.({ kind: "resume" });
    });
    this.bind("[data-menu]", { kind: "menu" });
    this.bind("[data-help]", { kind: "help" });
    this.bind("[data-settings]", { kind: "settings", from: "pause" });
  }

  showUpgradeChoice(choices: UpgradeDefinition[]): void {
    this.render(`
      <h1>火爐之力</h1>
      <p class="lede">選擇一項本局強化。</p>
      <div class="menu-cols upgrade" id="upgrade-list"></div>
    `);
    const list = this.refs.screenBody.querySelector("#upgrade-list");
    if (!list) return;
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.className = "big-btn upgrade-card";
      btn.innerHTML = `${choice.name}<span class="sub">${choice.description}</span>`;
      btn.addEventListener("click", () => this.onChoice?.({ kind: "upgrade", id: choice.id }));
      list.appendChild(btn);
    }
  }

  showResult(
    victory: boolean,
    mode: "stage" | "endless",
    wave: number,
    kills: number,
    seconds: number,
    untracked: boolean,
  ): void {
    const time = `${Math.floor(seconds / 60)} 分 ${Math.floor(seconds % 60)} 秒`;
    const scoreRow =
      mode !== "endless"
        ? ""
        : untracked
          ? `<p class="lede">分數 <b>${Leaderboard.score(wave, kills, seconds)}</b></p>
             <p class="muted">本局使用過測試或教學工具，依規則不會寫入排行榜。</p>`
          : `<p class="lede">分數 <b>${Leaderboard.score(wave, kills, seconds)}</b></p>
           <div class="name-row">
             <input id="score-name" maxlength="16" placeholder="輸入名稱" />
             <button class="big-btn tight" data-submit="1">記錄成績</button>
           </div>
           <p class="muted">本機排行榜，僅儲存在這台瀏覽器，無法作為公開可信排名。</p>`;

    this.render(`
      <h1 class="${victory ? "win" : "lose"}">${victory ? "防守成功" : "火爐熄滅"}</h1>
      <p class="lede">波次 <b>${wave}</b> · 擊殺 <b>${kills}</b> · 時間 <b>${time}</b></p>
      ${scoreRow}
      <div class="menu-buttons center">
        <button class="big-btn" data-menu="1">回到主選單</button>
      </div>
    `);

    this.refs.screenBody.querySelector("[data-submit]")?.addEventListener("click", () => {
      const input = this.refs.screenBody.querySelector<HTMLInputElement>("#score-name");
      this.leaderboard.submit(input?.value ?? "", wave, kills, seconds);
      const btn = this.refs.screenBody.querySelector<HTMLButtonElement>("[data-submit]");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "已記錄";
      }
    });
    this.refs.screenBody.querySelector("[data-menu]")?.addEventListener("click", () => {
      this.onChoice?.({ kind: "menu" });
    });
  }

  private bind(selector: string, choice: MenuChoice): void {
    this.refs.screenBody.querySelector(selector)?.addEventListener("click", () => {
      this.onChoice?.(choice);
    });
  }

  /** The full control reference, reachable from the menu and from pause. */
  showHelp(): void {
    this.render(`
      <h1>操作說明</h1>
      <div class="menu-cols help">
        <div class="menu-col">
          <h2>移動</h2>
          <p class="muted">W / A / S / D：移動主角<br>Shift：加速<br>滑鼠滾輪：縮放鏡頭</p>
          <h2>互動</h2>
          <p class="muted">E：建造、招募、升級、收取與查看設施<br>Esc：關閉面板或暫停<br>Enter：確認<br>滑鼠左鍵：選擇</p>
          <h2>戰鬥</h2>
          <p class="muted">主角會自動攻擊：距離大於 2.2 使用遠程，靠近後自動切換近戰。<br><b>火爐被摧毀即失敗。</b></p>
          <h2>主角技能</h2>
          <p class="muted">1 空中火力支援：轟炸中央火爐周圍並留下火海。<br>2 無限火力：攻擊設施攻速 ×2，持續 5 秒。<br>3 地面支援：召喚特殊護駕 10 秒。<br>4 震地波：向前方造成傷害、震退與易傷。<br>四者皆不消耗資源。</p>
        </div>
        <div class="menu-col">
          <h2>建造</h2>
          <p class="muted">靠近固定槽位按 E 打開建造選單，選擇建築並確認成本。<br>自動重建站只會重建「本局曾經完成過」的設施，並依摧毀先後順序處理。</p>
          <h2>招募</h2>
          <p class="muted">先建造招募所，按 G 隨時打開招募選單（不需要靠近）。<br>一般兵種可在同一面板使用少量金幣強化，每級生命、攻擊、攻速各 +10%。工程兵不能升級且使用獨立額度。</p>
          <h2>拆除</h2>
          <p class="muted">靠近任何非核心設施按 E 開啟設施資訊面板，面板內有「拆除設施」。<br>返還 50% 木材與石頭，金幣不返還，二次確認後才會真正拆除。</p>
          <h2>火爐升級</h2>
          <p class="muted">靠近中央火爐按 E，可以看到升級前後的實際數值，最高 Lv.100。<br>火爐與可受擊設施未受擊 15 秒後，依火爐等級每秒回復 1%～10% 最大生命；Lv.11 另有 8 秒一次性 10% 修復，之後每級固定增加 5,000 HP。無限模式升級還會增加小隊上限。</p>
          <h2>開發者工具</h2>
          <p class="muted">F3 效能面板 · F6 強制視覺驗證 · F7 AI 診斷 · F8 壓力測試 · F9 平衡工具<br>使用任一測試工具後，該局不會寫入排行榜。</p>
        </div>
      </div>
      <div class="menu-buttons center"><button class="big-btn" data-menu="1">返回</button></div>
    `);
    this.bind("[data-menu]", { kind: "menu" });
  }

  /** Marks the screen as owned by another view, e.g. the codex. */
  markOpen(): void {
    this.open = true;
    this.refs.screen.classList.add("show");
  }

  /** Quality, faction-marker, FPS-readout and effect settings. `from` is only
   * needed the first time this screen opens; a toggle click re-renders the
   * same screen without repeating it. */
  showSettings(
    current: string,
    markerStrength: string,
    fpsHudVisible: boolean,
    damageNumbers: boolean,
    screenShake: boolean,
    flashIntensity: string,
    from?: "pause",
  ): void {
    if (from) this.settingsOrigin = from;
    this.render(`
      <h1>設定</h1>
      <h2>畫質</h2>
      <p class="muted">畫質會存在這台瀏覽器，手動選擇後不會被自動模式覆蓋；也一併決定特效粒子數量與可視距離。</p>
      <div class="menu-buttons center" id="quality-buttons"></div>
      <p class="muted">Auto 會在開始遊戲後取樣約 8 秒，依實際 FPS 選擇畫質。<br>
        網頁無法強制指定顯示卡；若要使用獨立顯示卡，請在瀏覽器與作業系統的圖形設定中調整。</p>
      <h2>陣營標示強度</h2>
      <p class="muted">我方為藍色雙弧＋頭頂標記，敵方為紅色斷裂尖角環＋頭頂標記。形狀本身就不同，色弱狀態下也能分辨。</p>
      <div class="menu-buttons center" id="marker-buttons"></div>
      <h2>顯示 FPS</h2>
      <p class="muted">在一般 HUD 常駐顯示即時幀率，與 F3 效能面板共用同一組量測資料。</p>
      <div class="menu-buttons center" id="fps-buttons"></div>
      <h2>傷害數字</h2>
      <p class="muted">攻擊、治療、修復命中時飄出的數字。</p>
      <div class="menu-buttons center" id="dmgnum-buttons"></div>
      <h2>畫面震動</h2>
      <p class="muted">受到重擊、Boss 蓄力攻擊等時的鏡頭晃動。</p>
      <div class="menu-buttons center" id="shake-buttons"></div>
      <h2>受擊閃光強度</h2>
      <p class="muted">單位與建築受到攻擊時的閃光亮度。</p>
      <div class="menu-buttons center" id="flash-buttons"></div>
      <div class="menu-buttons center"><button class="big-btn" data-back="1">返回</button></div>
    `);
    this.optionRow("#quality-buttons", ["auto", "low", "medium", "high"], current, (level) =>
      this.onChoice?.({ kind: "quality", level }),
    );
    this.optionRow(
      "#marker-buttons",
      ["off", "subtle", "clear"],
      markerStrength,
      (level) => this.onChoice?.({ kind: "markerStrength", level }),
      { off: "關閉", subtle: "簡潔", clear: "明顯" },
    );
    this.optionRow(
      "#fps-buttons",
      ["on", "off"],
      fpsHudVisible ? "on" : "off",
      (level) => this.onChoice?.({ kind: "fpsHud", level }),
      { on: "開啟", off: "關閉" },
    );
    this.optionRow(
      "#dmgnum-buttons",
      ["on", "off"],
      damageNumbers ? "on" : "off",
      (level) => this.onChoice?.({ kind: "damageNumbers", level }),
      { on: "開啟", off: "關閉" },
    );
    this.optionRow(
      "#shake-buttons",
      ["on", "off"],
      screenShake ? "on" : "off",
      (level) => this.onChoice?.({ kind: "screenShake", level }),
      { on: "開啟", off: "關閉" },
    );
    this.optionRow(
      "#flash-buttons",
      ["low", "medium", "high"],
      flashIntensity,
      (level) => this.onChoice?.({ kind: "flashIntensity", level }),
      { low: "低", medium: "中", high: "高" },
    );
    // Returns to whichever screen actually opened settings — the pause menu,
    // if that is where the player was, never the main menu (which abandons
    // the run) just because they wanted to toggle a setting mid-game.
    this.bind("[data-back]", this.settingsOrigin === "pause" ? { kind: "resume" } : { kind: "menu" });
  }

  private optionRow(
    selector: string,
    values: string[],
    current: string,
    onPick: (value: string) => void,
    labels?: Record<string, string>,
  ): void {
    const box = this.refs.screenBody.querySelector(selector);
    if (!box) return;
    for (const value of values) {
      const btn = document.createElement("button");
      btn.className = "big-btn tight" + (value === current ? " on" : "");
      btn.textContent = labels?.[value] ?? value;
      btn.addEventListener("click", () => onPick(value));
      box.appendChild(btn);
    }
  }

  private leaderboardHtml(): string {
    const entries = this.leaderboard.all;
    if (entries.length === 0) return `<p class="muted">本機排行榜還沒有紀錄。</p>`;
    const rows = entries
      .map(
        (e, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${e.wave}</td><td>${e.kills}</td><td>${e.score}</td></tr>`,
      )
      .join("");
    return `<table class="board"><thead><tr><th>#</th><th>名稱</th><th>波次</th><th>擊殺</th><th>分數</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted">本機排行榜（localStorage），不是全球排名。</p>`;
  }

  private render(html: string): void {
    this.open = true;
    this.refs.screenBody.innerHTML = html;
    this.refs.screen.classList.add("show");
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
