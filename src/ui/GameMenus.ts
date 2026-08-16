import { LEVELS } from "../data/GameModeRules";
import type { UpgradeDefinition } from "../data/UpgradeDefinitions";
import {
  SUPPORTED_LOCALES,
  getLocale,
  levelDescription,
  levelName,
  localeDisplayName,
  t,
  type SupportedLocale,
} from "../localization";
import { Leaderboard } from "../modes/Leaderboard";
import type { UIRefs } from "./UIRoot";

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
  | { kind: "locale"; locale: SupportedLocale; from: "main" | "settings" }
  | { kind: "quality"; level: string }
  | { kind: "markerStrength"; level: string }
  | { kind: "fpsHud"; level: string }
  | { kind: "damageNumbers"; level: string }
  | { kind: "screenShake"; level: string }
  | { kind: "flashIntensity"; level: string };

/** Full-screen overlays: the main menu, pause, upgrade picks and results. */
export class GameMenus {
  private open = false;
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
      <h1>${t("menu.title")} <small>${t("menu.subtitle")}</small></h1>
      <p class="lede">${t("menu.lede")}</p>
      <div class="menu-cols">
        <div class="menu-col">
          <h2>${t("menu.stage")}</h2>
          <p class="muted">${t("menu.stage.desc")}</p>
          <div class="menu-buttons" id="menu-stages"></div>
        </div>
        <div class="menu-col">
          <h2>${t("menu.endless")}</h2>
          <p class="muted">${t("menu.endless.desc")}</p>
          <div class="menu-buttons">
            <button class="big-btn" data-endless="1">${t("menu.startEndless")}<span class="sub">${t("menu.endless.desc")}</span></button>
          </div>
          ${board}
        </div>
        <div class="menu-col">
          <h2>${t("menu.guide")}</h2>
          <div class="menu-buttons">
            ${canResume ? `<button class="big-btn" data-resume="1">${t("menu.continue")}<span class="sub">${t("menu.resume.desc")}</span></button>` : ""}
            <button class="big-btn" data-tutorial="1">${t("menu.tutorial")}<span class="sub">${t("menu.tutorial.desc")}</span></button>
            <button class="big-btn" data-codex="1">${t("menu.codex")}<span class="sub">${t("menu.codex.desc")}</span></button>
            <button class="big-btn" data-help="1">${t("menu.help")}<span class="sub">${t("menu.help.desc")}</span></button>
            <button class="big-btn" data-settings="1">${t("menu.settings")}<span class="sub">${t("menu.settings.desc")}</span></button>
          </div>
        </div>
      </div>
      <section class="locale-section" aria-label="${t("menu.language")}">
        <h2>${t("menu.language")}</h2>
        <p class="muted">${t("menu.language.desc")}</p>
        <div class="menu-buttons center" id="menu-locale-buttons">${this.localeButtonsHtml("main")}</div>
      </section>
      <p class="foot">${t("menu.footer")}</p>
    `);

    const stageBox = this.refs.screenBody.querySelector("#menu-stages");
    if (stageBox) {
      for (const level of LEVELS) {
        const btn = document.createElement("button");
        btn.className = "big-btn";
        btn.dataset.stage = level.id;
        btn.innerHTML = `${levelName(level.id, level.name)}<span class="sub">${levelDescription(level.id, level.description)}</span>`;
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
    this.bindLocaleButtons("main");
  }

  showPause(): void {
    this.render(`
      <h1>${t("pause.title")}</h1>
      <div class="menu-buttons center">
        <button class="big-btn" data-resume="1">${t("pause.continue")}</button>
        <button class="big-btn ghost" data-settings="1">${t("menu.settings")}</button>
        <button class="big-btn ghost" data-help="1">${t("menu.help")}</button>
        <button class="big-btn ghost" data-menu="1">${t("pause.mainMenu")}</button>
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
      <h1>${t("upgrade.title")}</h1>
      <p class="lede">${t("upgrade.lede")}</p>
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
    const time = t("result.time", { minutes: Math.floor(seconds / 60), seconds: Math.floor(seconds % 60) });
    const score = Leaderboard.score(wave, kills, seconds);
    const scoreRow = mode !== "endless"
      ? ""
      : untracked
        ? `<p class="lede">${t("result.score", { score })}</p><p class="muted">${t("result.untracked")}</p>`
        : `<p class="lede">${t("result.score", { score })}</p>
           <div class="name-row">
             <input id="score-name" maxlength="16" placeholder="${t("result.namePlaceholder")}" />
             <button class="big-btn tight" data-submit="1">${t("result.submit")}</button>
           </div>
           <p class="muted">${t("result.localBoardNote")}</p>`;

    this.render(`
      <h1 class="${victory ? "win" : "lose"}">${t(victory ? "result.victory" : "result.defeat")}</h1>
      <p class="lede">${t("result.summary", { wave, kills, time })}</p>
      ${scoreRow}
      <div class="menu-buttons center"><button class="big-btn" data-menu="1">${t("pause.mainMenu")}</button></div>
    `);

    this.refs.screenBody.querySelector("[data-submit]")?.addEventListener("click", () => {
      const input = this.refs.screenBody.querySelector<HTMLInputElement>("#score-name");
      this.leaderboard.submit(input?.value ?? "", wave, kills, seconds);
      const btn = this.refs.screenBody.querySelector<HTMLButtonElement>("[data-submit]");
      if (btn) {
        btn.disabled = true;
        btn.textContent = t("result.recorded");
      }
    });
    this.bind("[data-menu]", { kind: "menu" });
  }

  private bind(selector: string, choice: MenuChoice): void {
    this.refs.screenBody.querySelector(selector)?.addEventListener("click", () => this.onChoice?.(choice));
  }

  showHelp(): void {
    this.render(`
      <h1>${t("help.title")}</h1>
      <div class="menu-cols help">
        <div class="menu-col">
          ${helpBlock("help.movement")}
          ${helpBlock("help.interaction")}
          ${helpBlock("help.combat")}
          ${helpBlock("help.heroSkills")}
        </div>
        <div class="menu-col">
          ${helpBlock("help.building")}
          ${helpBlock("help.recruiting")}
          ${helpBlock("help.demolition")}
          ${helpBlock("help.furnace")}
          ${helpBlock("help.devTools")}
        </div>
      </div>
      <div class="menu-buttons center"><button class="big-btn" data-menu="1">${t("common.back")}</button></div>
    `);
    this.bind("[data-menu]", { kind: "menu" });
  }

  markOpen(): void {
    this.open = true;
    this.refs.screen.classList.add("show");
  }

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
      <h1>${t("settings.title")}</h1>
      <h2>${t("settings.language")}</h2>
      <p class="muted">${t("settings.language.desc")}</p>
      <div class="menu-buttons center" id="settings-locale-buttons">${this.localeButtonsHtml("settings")}</div>
      <h2>${t("settings.quality")}</h2>
      <p class="muted">${t("settings.quality.desc")}</p>
      <div class="menu-buttons center" id="quality-buttons"></div>
      <p class="muted">${t("settings.quality.autoDesc")}</p>
      <h2>${t("settings.marker")}</h2>
      <p class="muted">${t("settings.marker.desc")}</p>
      <div class="menu-buttons center" id="marker-buttons"></div>
      <h2>${t("settings.fps")}</h2>
      <p class="muted">${t("settings.fps.desc")}</p>
      <div class="menu-buttons center" id="fps-buttons"></div>
      <h2>${t("settings.damage")}</h2>
      <p class="muted">${t("settings.damage.desc")}</p>
      <div class="menu-buttons center" id="dmgnum-buttons"></div>
      <h2>${t("settings.shake")}</h2>
      <p class="muted">${t("settings.shake.desc")}</p>
      <div class="menu-buttons center" id="shake-buttons"></div>
      <h2>${t("settings.flash")}</h2>
      <p class="muted">${t("settings.flash.desc")}</p>
      <div class="menu-buttons center" id="flash-buttons"></div>
      <div class="menu-buttons center"><button class="big-btn" data-back="1">${t("common.back")}</button></div>
    `);
    this.bindLocaleButtons("settings");
    this.optionRow("#quality-buttons", ["auto", "low", "medium", "high"], current, (level) =>
      this.onChoice?.({ kind: "quality", level }),
      { auto: t("common.auto"), low: t("common.low"), medium: t("common.medium"), high: t("common.high") },
    );
    this.optionRow("#marker-buttons", ["off", "subtle", "clear"], markerStrength, (level) =>
      this.onChoice?.({ kind: "markerStrength", level }),
      { off: t("settings.marker.off"), subtle: t("settings.marker.subtle"), clear: t("settings.marker.clear") },
    );
    this.optionRow("#fps-buttons", ["on", "off"], fpsHudVisible ? "on" : "off", (level) =>
      this.onChoice?.({ kind: "fpsHud", level }),
      { on: t("common.on"), off: t("common.off") },
    );
    this.optionRow("#dmgnum-buttons", ["on", "off"], damageNumbers ? "on" : "off", (level) =>
      this.onChoice?.({ kind: "damageNumbers", level }),
      { on: t("common.on"), off: t("common.off") },
    );
    this.optionRow("#shake-buttons", ["on", "off"], screenShake ? "on" : "off", (level) =>
      this.onChoice?.({ kind: "screenShake", level }),
      { on: t("common.on"), off: t("common.off") },
    );
    this.optionRow("#flash-buttons", ["low", "medium", "high"], flashIntensity, (level) =>
      this.onChoice?.({ kind: "flashIntensity", level }),
      { low: t("common.low"), medium: t("common.medium"), high: t("common.high") },
    );
    this.bind("[data-back]", this.settingsOrigin === "pause" ? { kind: "resume" } : { kind: "menu" });
  }

  private localeButtonsHtml(from: "main" | "settings"): string {
    const current = getLocale();
    return SUPPORTED_LOCALES.map((locale) =>
      `<button type="button" class="big-btn tight${locale === current ? " on" : ""}" data-locale="${locale}" data-locale-from="${from}" aria-pressed="${locale === current}">${localeDisplayName(locale)}</button>`,
    ).join("");
  }

  private bindLocaleButtons(from: "main" | "settings"): void {
    for (const button of Array.from(this.refs.screenBody.querySelectorAll<HTMLButtonElement>("button[data-locale]"))) {
      button.addEventListener("click", () => {
        const locale = button.dataset.locale as SupportedLocale;
        if (!SUPPORTED_LOCALES.includes(locale)) return;
        this.onChoice?.({ kind: "locale", locale, from });
      });
    }
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
    if (entries.length === 0) return `<p class="muted">${t("result.boardEmpty")}</p>`;
    const rows = entries
      .map((e, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(e.name)}</td><td>${e.wave}</td><td>${e.kills}</td><td>${e.score}</td></tr>`)
      .join("");
    return `<table class="board"><thead><tr><th>#</th><th>${t("result.board.name")}</th><th>${t("result.board.wave")}</th><th>${t("result.board.kills")}</th><th>${t("result.board.score")}</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted">${t("result.board.local")}</p>`;
  }

  private render(html: string): void {
    this.open = true;
    this.refs.screenBody.innerHTML = html;
    this.refs.screen.classList.add("show");
  }
}

function helpBlock(key: string): string {
  return `<h2>${t(key)}</h2><p class="muted">${t(`${key}.body`).replace(/\n/g, "<br>")}</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
