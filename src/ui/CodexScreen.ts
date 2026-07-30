import {
  CODEX_CATEGORIES,
  CODEX_ENTRIES,
  type CodexCategory,
  type CodexEntry,
} from "../data/CodexData";
import { buildingIconSvg, type IconId } from "./ResourceIcons";
import { unitThumb } from "./UnitThumbs";

/**
 * The reference book: every ally, enemy, building, resource and rule the game
 * runs on, generated straight from the definition tables so it can never drift
 * out of date with the numbers that are actually used.
 *
 * Thumbnails are flat portraits rather than live 3D previews, so opening this
 * from the main menu costs nothing and there is no model to release on the way
 * out.
 */
export class CodexScreen {
  private category: CodexCategory = "ally";
  private selectedId: string | null = null;
  private query = "";
  onClose: (() => void) | null = null;

  constructor(private readonly body: HTMLElement) {}

  open(): void {
    this.category = "ally";
    this.selectedId = null;
    this.query = "";
    this.render();
  }

  /** Esc goes back to wherever the codex was opened from. */
  handleEscape(): boolean {
    this.onClose?.();
    return true;
  }

  private visible(): CodexEntry[] {
    const q = this.query.trim().toLowerCase();
    if (q) return CODEX_ENTRIES.filter((e) => e.search.includes(q) || e.name.includes(this.query.trim()));
    return CODEX_ENTRIES.filter((e) => e.category === this.category);
  }

  private current(list: CodexEntry[]): CodexEntry | null {
    if (list.length === 0) return null;
    return list.find((e) => e.id === this.selectedId) ?? list[0];
  }

  private render(): void {
    const list = this.visible();
    const entry = this.current(list);
    this.selectedId = entry?.id ?? null;

    this.body.innerHTML = `
      <h1>圖鑑 <small>CODEX</small></h1>
      <p class="lede">查看友方兵種、敵方怪物、建築、資源與特殊能力。</p>
      <div class="codex-tabs" id="codex-tabs"></div>
      <div class="codex-search">
        <input id="codex-q" placeholder="搜尋名稱或關鍵字" value="${escapeAttr(this.query)}" />
      </div>
      <div class="codex-body">
        <div class="codex-list" id="codex-list"></div>
        <div class="codex-detail" id="codex-detail"></div>
      </div>
      <div class="menu-buttons center codex-foot">
        <button class="big-btn tight" data-prev="1">上一項</button>
        <button class="big-btn tight" data-next="1">下一項</button>
        <button class="big-btn tight" data-menu="1">返回主選單 (Esc)</button>
      </div>`;

    this.renderTabs();
    this.renderList(list);
    this.renderDetail(entry);
    this.bind(list);
  }

  private renderTabs(): void {
    const host = this.body.querySelector("#codex-tabs");
    if (!host) return;
    host.innerHTML = CODEX_CATEGORIES.map(
      (c) =>
        `<button class="codex-tab${c.id === this.category && !this.query ? " on" : ""}" data-cat="${c.id}">${c.name}</button>`,
    ).join("");
  }

  private renderList(list: CodexEntry[]): void {
    const host = this.body.querySelector("#codex-list");
    if (!host) return;
    if (list.length === 0) {
      host.innerHTML = '<div class="codex-empty">沒有符合的條目</div>';
      return;
    }
    host.innerHTML = list
      .map(
        (e) => `<button class="codex-item${e.id === this.selectedId ? " on" : ""}" data-entry="${e.id}">
          <span class="codex-thumb">${thumbFor(e)}</span>
          <span class="codex-item-text"><b>${e.name}</b><i>${e.role}</i></span>
        </button>`,
      )
      .join("");
  }

  private renderDetail(entry: CodexEntry | null): void {
    const host = this.body.querySelector("#codex-detail");
    if (!host) return;
    if (!entry) {
      host.innerHTML = "";
      return;
    }
    const rows = entry.fields
      .map((f) => `<div class="codex-field"><span>${f.label}</span><b>${f.value}</b></div>`)
      .join("");
    host.innerHTML = `
      <div class="codex-head">
        <div class="codex-portrait">${thumbFor(entry, 64)}</div>
        <div>
          <h2>${entry.name}</h2>
          <p class="muted">${entry.role}</p>
        </div>
      </div>
      <div class="codex-fields">${rows}</div>
      ${entry.advice ? `<p class="codex-advice">${entry.advice}</p>` : ""}`;
  }

  private bind(list: CodexEntry[]): void {
    for (const tab of this.body.querySelectorAll<HTMLElement>("[data-cat]")) {
      tab.addEventListener("click", () => {
        this.category = tab.dataset.cat as CodexCategory;
        this.query = "";
        this.selectedId = null;
        this.render();
      });
    }
    for (const item of this.body.querySelectorAll<HTMLElement>("[data-entry]")) {
      item.addEventListener("click", () => {
        this.selectedId = item.dataset.entry ?? null;
        this.render();
      });
    }
    const input = this.body.querySelector<HTMLInputElement>("#codex-q");
    input?.addEventListener("input", () => {
      this.query = input.value;
      this.selectedId = null;
      this.render();
      this.body.querySelector<HTMLInputElement>("#codex-q")?.focus();
    });

    const step = (delta: number): void => {
      if (list.length === 0) return;
      const at = Math.max(0, list.findIndex((e) => e.id === this.selectedId));
      const next = (at + delta + list.length) % list.length;
      this.selectedId = list[next].id;
      this.render();
    };
    this.body.querySelector("[data-prev]")?.addEventListener("click", () => step(-1));
    this.body.querySelector("[data-next]")?.addEventListener("click", () => step(1));
    this.body.querySelector("[data-menu]")?.addEventListener("click", () => this.onClose?.());
  }
}

function thumbFor(entry: CodexEntry, size = 30): string {
  if (entry.visual) return unitThumb(entry.visual, size);
  if (entry.icon) return buildingIconSvg(entry.icon as IconId, size);
  return `<span class="codex-glyph">✦</span>`;
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
