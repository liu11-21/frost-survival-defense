import type { MarkerStrength } from "../effects/FactionMarkers";

/** Persisted per-browser UI preferences, all independent of any run's state. */

const MARKER_KEY = "frostbound.markers.v1";

/** Faction badges default to the strongest setting; the brief asks for it. */
export function loadMarkerStrength(): MarkerStrength {
  try {
    const raw = window.localStorage.getItem(MARKER_KEY);
    if (raw === "off" || raw === "subtle" || raw === "clear") return raw;
  } catch {
    // Blocked storage simply means the default.
  }
  return "clear";
}

export function saveMarkerStrength(strength: MarkerStrength): void {
  try {
    window.localStorage.setItem(MARKER_KEY, strength);
  } catch {
    // Private mode; the choice just does not persist.
  }
}

const FPS_HUD_KEY = "frostbound.fpsHud.v1";

/** The general HUD's FPS readout defaults to on, per the brief. */
export function loadFpsHudSetting(): boolean {
  try {
    const raw = window.localStorage.getItem(FPS_HUD_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    // Blocked storage simply means the default.
  }
  return true;
}

export function saveFpsHudSetting(visible: boolean): void {
  try {
    window.localStorage.setItem(FPS_HUD_KEY, visible ? "1" : "0");
  } catch {
    // Private mode; the choice just does not persist.
  }
}

const DAMAGE_NUMBERS_KEY = "frostbound.damageNumbers.v1";

export function loadDamageNumbersSetting(): boolean {
  try {
    const raw = window.localStorage.getItem(DAMAGE_NUMBERS_KEY);
    if (raw === "0") return false;
  } catch {
    // Blocked storage simply means the default.
  }
  return true;
}

export function saveDamageNumbersSetting(visible: boolean): void {
  try {
    window.localStorage.setItem(DAMAGE_NUMBERS_KEY, visible ? "1" : "0");
  } catch {
    // Private mode; the choice just does not persist.
  }
}

const SCREEN_SHAKE_KEY = "frostbound.screenShake.v1";

export function loadScreenShakeSetting(): boolean {
  try {
    const raw = window.localStorage.getItem(SCREEN_SHAKE_KEY);
    if (raw === "0") return false;
  } catch {
    // Blocked storage simply means the default.
  }
  return true;
}

export function saveScreenShakeSetting(enabled: boolean): void {
  try {
    window.localStorage.setItem(SCREEN_SHAKE_KEY, enabled ? "1" : "0");
  } catch {
    // Private mode; the choice just does not persist.
  }
}

export type FlashIntensity = "low" | "medium" | "high";
const FLASH_INTENSITY_KEY = "frostbound.flashIntensity.v1";

export function loadFlashIntensitySetting(): FlashIntensity {
  try {
    const raw = window.localStorage.getItem(FLASH_INTENSITY_KEY);
    if (raw === "low" || raw === "medium" || raw === "high") return raw;
  } catch {
    // Blocked storage simply means the default.
  }
  return "medium";
}

export function saveFlashIntensitySetting(level: FlashIntensity): void {
  try {
    window.localStorage.setItem(FLASH_INTENSITY_KEY, level);
  } catch {
    // Private mode; the choice just does not persist.
  }
}
