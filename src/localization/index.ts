import { en } from "./locales/en";
import { ja } from "./locales/ja";
import { v1Extra } from "./locales/v1-extra";
import { zhTW } from "./locales/zh-TW";
import type { SupportedLocale, TranslationDictionary, TranslationParams } from "./types";

export type { SupportedLocale, TranslationParams } from "./types";

export const FALLBACK_LOCALE: SupportedLocale = "en";
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["zh-TW", "en", "ja"];
export const LOCALE_STORAGE_KEY = "frostbound.locale";

const DICTIONARIES: Record<SupportedLocale, TranslationDictionary> = { "zh-TW": zhTW, en, ja };
const listeners = new Set<(locale: SupportedLocale) => void>();
let currentLocale = detectInitialLocale();
let boundRoot: HTMLElement | null = null;
let rootObserver: MutationObserver | null = null;

if (typeof document !== "undefined") document.documentElement.lang = currentLocale;

export function getLocale(): SupportedLocale { return currentLocale; }

export function setLocale(locale: SupportedLocale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  const changed = currentLocale !== locale;
  currentLocale = locale;
  writeStorage(locale);
  document.documentElement.lang = locale;
  if (boundRoot) applyStaticUiTranslations(boundRoot);
  if (changed) for (const listener of [...listeners]) listener(locale);
}

export function subscribeLocale(listener: (locale: SupportedLocale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: string, params: TranslationParams = {}): string {
  const value = lookup(currentLocale, key) ?? lookup(FALLBACK_LOCALE, key);
  if (value === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing translation key: ${key}`);
    return key;
  }
  return interpolate(value, params);
}

export function translatedOr(key: string, fallback: string, params: TranslationParams = {}): string {
  const value = lookup(currentLocale, key) ?? lookup(FALLBACK_LOCALE, key);
  return value === undefined ? fallback : interpolate(value, params);
}

export function entityName(kind: "building" | "unit", id: string, fallback: string): string {
  return translatedOr(`${kind}.${id}.name`, fallback);
}

export function entityDescription(kind: "building" | "unit", id: string, fallback: string): string {
  return translatedOr(`${kind}.${id}.description`, fallback);
}

export function levelName(id: string, fallback: string): string { return translatedOr(`level.${id}.name`, fallback); }
export function levelDescription(id: string, fallback: string): string { return translatedOr(`level.${id}.description`, fallback); }
export function laneName(index: number, fallback: string): string { return translatedOr(`lane.${index}.name`, fallback); }
export function laneShortName(index: number, fallback: string): string { return translatedOr(`lane.${index}.short`, fallback); }
export function localeDisplayName(locale: SupportedLocale): string { return DICTIONARIES[locale]["locale.name"] ?? locale; }

export function bindStaticUiLocalization(root: HTMLElement): void {
  boundRoot = root;
  document.documentElement.lang = currentLocale;
  applyStaticUiTranslations(root);
  rootObserver?.disconnect();
  rootObserver = new MutationObserver(() => applyStaticUiTranslations(root));
  rootObserver.observe(root, { childList: true, subtree: true });
}

export function detectBrowserLocale(languages: readonly string[]): SupportedLocale {
  for (const raw of languages) {
    const value = raw.toLowerCase();
    if (value.startsWith("zh-tw") || value.startsWith("zh-hant")) return "zh-TW";
    if (value.startsWith("ja")) return "ja";
  }
  return "en";
}

function detectInitialLocale(): SupportedLocale {
  const saved = readStorage();
  if (saved && SUPPORTED_LOCALES.includes(saved as SupportedLocale)) return saved as SupportedLocale;
  const languages = typeof navigator === "undefined"
    ? ["en"]
    : navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
  return detectBrowserLocale(languages);
}

function lookup(locale: SupportedLocale, key: string): string | undefined {
  return v1Extra[locale][key] ?? DICTIONARIES[locale][key];
}

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

function readStorage(): string | null {
  try { return localStorage.getItem(LOCALE_STORAGE_KEY); } catch { return null; }
}
function writeStorage(locale: SupportedLocale): void {
  try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* current-page switching still works */ }
}
function setText(element: Element | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}
function setLeadingText(parent: Element | null, value: string): void {
  if (!parent) return;
  const first = parent.firstChild;
  const text = `${value} `;
  if (first?.nodeType === Node.TEXT_NODE) {
    if (first.textContent !== text) first.textContent = text;
  } else parent.insertBefore(document.createTextNode(text), first ?? null);
}
function setTextBeforeChild(parent: Element | null, child: Element | null, value: string): void {
  if (!parent || !child) return;
  const nodes = [...parent.childNodes];
  const childIndex = nodes.indexOf(child);
  if (childIndex <= 0) return;
  const previous = nodes[childIndex - 1];
  if (previous?.nodeType === Node.TEXT_NODE) {
    if (previous.textContent !== value) previous.textContent = value;
  } else parent.insertBefore(document.createTextNode(value), child);
}
function resourceName(root: HTMLElement, valueId: string, key: string): void {
  const value = root.querySelector(`#${valueId}`);
  setText(value?.parentElement?.querySelector(".res-name") ?? null, t(key));
}

function applyStaticUiTranslations(root: HTMLElement): void {
  resourceName(root, "ui-wood", "resource.wood");
  resourceName(root, "ui-stone", "resource.stone");
  resourceName(root, "ui-gold", "resource.gold");
  setLeadingText(root.querySelector("#ui-hero-text")?.parentElement ?? null, t("hud.hero"));
  setLeadingText(root.querySelector("#ui-furnace-level")?.parentElement ?? null, t("hud.furnace"));
  setLeadingText(root.querySelector("#ui-squads")?.parentElement ?? null, t("hud.squads"));
  const enemyCount = root.querySelector("#ui-enemies");
  setTextBeforeChild(enemyCount?.parentElement ?? null, enemyCount, ` · ${t("hud.enemies")} `);
  setText(root.querySelector("#ui-rebuild-box .bar-label"), t("hud.autoRebuilder"));
  setText(root.querySelector("#ui-squad-hud .squad-foot"), t("hud.squadFoot"));
  setText(root.querySelector("#ui-minimap .minimap-hint"), t("hud.minimapHint"));
  setText(root.querySelector("#ui-map-overlay .map-overlay-head > span:first-child"), t("hud.map"));
  setText(root.querySelector("#ui-map-overlay .map-overlay-hint"), t("hud.mapHint"));
  setText(root.querySelector("#ui-recruit-toggle"), t("hud.recruitClose"));
  setText(root.querySelector("#ui-lane-hud .lane-title"), t("hud.lanes"));
  setText(root.querySelector("#ui-hint"), t("hud.hint"));
  applyAudioTranslations(root);
}

function applyAudioTranslations(root: HTMLElement): void {
  const section = root.querySelector<HTMLElement>("#music-settings-audio");
  if (!section) return;
  setText(section.querySelector("h2"), t("settings.audio.music"));
  setText(section.querySelector("p.muted"), t("settings.audio.musicDesc"));
  const label = section.querySelector<HTMLLabelElement>('label[for="music-volume"]');
  if (label) setLeadingText(label, "BGM");
  section.querySelector<HTMLInputElement>("#music-volume")?.setAttribute("aria-label", t("settings.audio.volumeAria"));
  const mute = section.querySelector<HTMLButtonElement>("#music-mute");
  if (mute) {
    let muted = false;
    try { muted = localStorage.getItem("frostbound.music.muted") === "1"; } catch { muted = false; }
    setText(mute, t(muted ? "settings.audio.unmute" : "settings.audio.mute"));
  }
}
