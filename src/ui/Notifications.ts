import { buildingIconSvg, resourceIcon, type IconId } from "./ResourceIcons";

export type ToastType = "info" | "success" | "failure" | "danger";

export interface ToastOptions {
  title: string;
  /** Plain text only. Markup here is a bug, and is treated as one. */
  message?: string;
  iconId?: IconId;
  type?: ToastType;
  durationMs?: number;
}

/**
 * Detects a string that was meant for `innerHTML` being passed as a message.
 *
 * This is the exact defect this module exists to close: `costLine()` returns
 * inline SVG for the build panel's `innerHTML`, and the build-result path handed
 * that same string to the banner, which renders its body with `textContent`. The
 * player therefore saw `<svg ...><rect .../></svg>` as literal text. Splitting
 * icons out into their own field makes the mistake impossible to repeat, and
 * this guard makes it loud rather than silent if anyone tries.
 */
const MARKUP = /<\s*(svg|path|rect|ellipse|circle|g|div|span|b|i)\b|viewBox|stroke-width|&lt;|\[object /i;

export function isPlainText(value: string): boolean {
  return !MARKUP.test(value);
}

/**
 * Strips markup out of a message rather than printing it. In development it
 * also reports the offender so the real call site gets fixed.
 */
export function sanitiseMessage(value: string, where: string): string {
  if (isPlainText(value)) return value;
  if (import.meta.env.DEV) {
    console.warn(`[notify] markup passed as plain text from ${where}: ${value.slice(0, 80)}`);
  }
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

const TYPE_CLASS: Record<ToastType, string> = {
  info: "",
  success: "ok",
  failure: "bad",
  danger: "danger",
};

/**
 * The single place notifications are rendered.
 *
 * Title and message are written with `textContent`, so no caller can ever put
 * markup on screen by accident. Icons are looked up by id and inserted as their
 * own element — the only route by which SVG reaches the DOM.
 */
export class Notifications {
  private bannerTimer = 0;
  private toastTimer = 0;

  constructor(
    private readonly banner: HTMLElement,
    private readonly bannerTitle: HTMLElement,
    private readonly bannerBody: HTMLElement,
    private readonly bannerIcon: HTMLElement,
    private readonly toastEl: HTMLElement,
  ) {}

  /** The prominent centre-top card: build results, wave announcements. */
  show(options: ToastOptions): void {
    const type = options.type ?? "info";
    this.bannerTitle.textContent = sanitiseMessage(options.title, "banner title");
    this.bannerBody.textContent = options.message
      ? sanitiseMessage(options.message, "banner message")
      : "";
    this.bannerBody.classList.toggle("hidden", !options.message);

    const icon = options.iconId ? iconMarkup(options.iconId) : "";
    this.bannerIcon.innerHTML = icon;
    this.bannerIcon.classList.toggle("hidden", icon === "");

    this.banner.className = `banner show ${TYPE_CLASS[type]}`.trim();
    this.bannerTimer = (options.durationMs ?? 2800) / 1000;
  }

  /** The small bottom strip: transient confirmations. */
  toast(text: string, type: ToastType = "info"): void {
    this.toastEl.textContent = sanitiseMessage(text, "toast");
    this.toastEl.className = `toast show ${TYPE_CLASS[type]}`.trim();
    this.toastTimer = 2.4;
  }

  update(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove("show");
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove("show");
    }
  }

  hide(): void {
    this.banner.classList.remove("show");
    this.toastEl.classList.remove("show");
    this.bannerTimer = 0;
    this.toastTimer = 0;
  }
}

function iconMarkup(id: IconId): string {
  if (id === "wood" || id === "stone" || id === "gold") return resourceIcon(id, 26);
  return buildingIconSvg(id, 26);
}
