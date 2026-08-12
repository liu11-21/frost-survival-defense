const MAIN_TITLE = "寒霜火爐";
const MENU_CLASS = "menu-main-v2";
const SECONDARY_CLASS = "menu-secondary-v2";
const TRANSITION_CLASS = "menu-v2-transitioning";

let observer: MutationObserver | null = null;
let syncQueued = false;

/**
 * Commercial main-menu presentation adapter.
 *
 * GameMenus remains the behavior/router owner. This adapter moves its already
 * wired controls into an invisible legacy-actions container and presents a new
 * visual shell that forwards clicks to those same controls. That keeps stage,
 * endless, resume, codex, settings, tutorial and help routing unchanged while
 * allowing a full presentation pass without touching GameFlow.
 */
export function installMainMenuV2(): void {
  const root = document.getElementById("uiRoot");
  const screen = document.getElementById("ui-screen");
  const body = document.getElementById("ui-screen-body");
  if (!root || !screen || !body || observer) return;

  const queueSync = () => {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      syncScreen(root, screen, body);
    });
  };

  observer = new MutationObserver(queueSync);
  observer.observe(body, { childList: true, subtree: true });
  queueSync();
}

function syncScreen(root: HTMLElement, screen: HTMLElement, body: HTMLElement): void {
  if (!screen.classList.contains("show")) {
    clearVariant(root, screen);
    return;
  }

  if (body.querySelector("[data-main-menu-v2]")) {
    root.classList.add("menu-v2-active");
    screen.classList.add(MENU_CLASS);
    return;
  }

  const heading = body.querySelector("h1")?.textContent?.trim() ?? "";
  if (heading.includes(MAIN_TITLE)) {
    enhanceMainMenu(root, screen, body);
    return;
  }

  screen.classList.remove(MENU_CLASS, TRANSITION_CLASS);
  if (heading.startsWith("設定") || heading.startsWith("操作說明")) {
    root.classList.add("menu-v2-active");
    screen.classList.add(SECONDARY_CLASS);
  } else {
    root.classList.remove("menu-v2-active");
    screen.classList.remove(SECONDARY_CLASS);
  }
}

function clearVariant(root: HTMLElement, screen: HTMLElement): void {
  root.classList.remove("menu-v2-active");
  screen.classList.remove(MENU_CLASS, SECONDARY_CLASS, TRANSITION_CLASS);
  screen.removeAttribute("aria-busy");
}

function enhanceMainMenu(root: HTMLElement, screen: HTMLElement, body: HTMLElement): void {
  const legacy = document.createElement("div");
  legacy.className = "menu-v2-legacy-actions";
  legacy.setAttribute("aria-hidden", "true");
  while (body.firstChild) legacy.appendChild(body.firstChild);

  const stageButtons = Array.from(legacy.querySelectorAll<HTMLButtonElement>("#menu-stages button"));
  if (stageButtons.length === 0) {
    while (legacy.firstChild) body.appendChild(legacy.firstChild);
    return;
  }

  const resume = legacy.querySelector<HTMLButtonElement>("[data-resume]");
  const endless = legacy.querySelector<HTMLButtonElement>("[data-endless]");
  const codex = legacy.querySelector<HTMLButtonElement>("[data-codex]");
  const settings = legacy.querySelector<HTMLButtonElement>("[data-settings]");
  const tutorial = legacy.querySelector<HTMLButtonElement>("[data-tutorial]");
  const help = legacy.querySelector<HTMLButtonElement>("[data-help]");

  const shell = document.createElement("section");
  shell.className = "menu-v2-shell";
  shell.dataset.mainMenuV2 = "1";
  shell.innerHTML = `
    <div class="menu-v2-ambient" aria-hidden="true">
      <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
    </div>
    <div class="menu-v2-brand">
      <div class="menu-v2-kicker">LAST EMBER // SURVIVAL DEFENSE</div>
      <div class="menu-v2-logo-mark" aria-hidden="true"><span></span></div>
      <h1><span class="menu-v2-title-zh">寒霜火爐</span><span class="menu-v2-title-en">FROSTBOUND FURNACE</span></h1>
      <p class="menu-v2-tagline">守住最後火種，直到黎明再次穿過暴雪。</p>
      <div class="menu-v2-status"><span class="menu-v2-status-dot"></span><span>最後據點仍在燃燒</span></div>
    </div>
    <div class="menu-v2-panel" aria-label="主選單">
      <div class="menu-v2-panel-head">
        <span>生存紀錄</span>
        <small>選擇下一步</small>
      </div>
      <button class="menu-v2-primary" data-v2-start type="button">
        <span class="menu-v2-primary-copy"><b>開始遊戲</b><small>進入戰役 · 守住中央火爐</small></span>
        <span class="menu-v2-arrow" aria-hidden="true">→</span>
      </button>
      <div class="menu-v2-secondary-grid">
        <button data-v2-resume type="button"><span>繼續</span><small>${resume ? "返回未結束的防守" : "目前沒有可繼續的防守"}</small></button>
        <button data-v2-endless type="button"><span>無限模式</span><small>挑戰持續升高的寒潮</small></button>
        <button data-v2-codex type="button"><span>圖鑑</span><small>兵種 · 敵人 · 建築資料</small></button>
        <button data-v2-settings type="button"><span>設定</span><small>畫質與遊戲體驗</small></button>
      </div>
      <button class="menu-v2-stage-toggle" data-v2-stages type="button" aria-expanded="false">選擇關卡 <span>＋</span></button>
      <div class="menu-v2-stage-list" data-v2-stage-list hidden></div>
      <div class="menu-v2-utility-row">
        <button data-v2-tutorial type="button">新手教學</button>
        <span></span>
        <button data-v2-help type="button">操作說明</button>
      </div>
      <div class="menu-v2-panel-foot"><span>WASD 移動</span><span>滑鼠操作</span><span>ESC 暫停</span></div>
    </div>
  `;

  const stageList = shell.querySelector<HTMLElement>("[data-v2-stage-list]")!;
  for (const [index, original] of stageButtons.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-v2-stage-entry";
    const title = original.childNodes[0]?.textContent?.trim() || `第 ${index + 1} 關`;
    const description = original.querySelector(".sub")?.textContent?.trim() || "進入防守任務";
    button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small>`;
    button.addEventListener("click", () => transitionTo(screen, shell, original));
    stageList.appendChild(button);
  }

  const start = shell.querySelector<HTMLButtonElement>("[data-v2-start]")!;
  start.addEventListener("click", () => transitionTo(screen, shell, stageButtons[0]));

  const resumeButton = shell.querySelector<HTMLButtonElement>("[data-v2-resume]")!;
  resumeButton.disabled = !resume;
  if (resume) resumeButton.addEventListener("click", () => transitionTo(screen, shell, resume));

  bindForward(shell, "[data-v2-endless]", endless, screen);
  bindForward(shell, "[data-v2-codex]", codex, screen, false);
  bindForward(shell, "[data-v2-settings]", settings, screen, false);
  bindForward(shell, "[data-v2-tutorial]", tutorial, screen);
  bindForward(shell, "[data-v2-help]", help, screen, false);

  const stageToggle = shell.querySelector<HTMLButtonElement>("[data-v2-stages]")!;
  stageToggle.addEventListener("click", () => {
    const open = stageList.hidden;
    stageList.hidden = !open;
    stageToggle.setAttribute("aria-expanded", String(open));
    stageToggle.classList.toggle("open", open);
    stageToggle.querySelector("span")!.textContent = open ? "−" : "＋";
  });

  body.append(shell, legacy);
  root.classList.add("menu-v2-active");
  screen.classList.remove(SECONDARY_CLASS, TRANSITION_CLASS);
  screen.classList.add(MENU_CLASS);
  screen.removeAttribute("aria-busy");

  requestAnimationFrame(() => shell.classList.add("is-ready"));
}

function bindForward(
  shell: HTMLElement,
  selector: string,
  target: HTMLButtonElement | null,
  screen: HTMLElement,
  transition = true,
): void {
  const button = shell.querySelector<HTMLButtonElement>(selector);
  if (!button) return;
  button.disabled = !target;
  if (!target) return;
  button.addEventListener("click", () => {
    if (transition) transitionTo(screen, shell, target);
    else target.click();
  });
}

function transitionTo(screen: HTMLElement, shell: HTMLElement, target: HTMLButtonElement): void {
  if (screen.classList.contains(TRANSITION_CLASS)) return;
  screen.classList.add(TRANSITION_CLASS);
  screen.setAttribute("aria-busy", "true");
  for (const button of shell.querySelectorAll<HTMLButtonElement>("button")) button.disabled = true;
  window.setTimeout(() => target.click(), 960);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}
