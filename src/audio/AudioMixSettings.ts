export interface AudioMixSnapshot {
  readonly masterPercent: number;
  readonly musicPercent: number;
  readonly sfxPercent: number;
  readonly muted: boolean;
}

const MASTER_KEY = "frostbound.audio.master";
const MUSIC_KEY = "frostbound.music.volume";
const SFX_KEY = "frostbound.audio.sfx";
const MUTED_KEY = "frostbound.audio.muted";
const LEGACY_MUTED_KEY = "frostbound.music.muted";

const DEFAULT_MASTER = 1;
const DEFAULT_MUSIC = 0.4;
const DEFAULT_SFX = 0.72;

type Listener = (snapshot: AudioMixSnapshot) => void;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function readNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clamp01(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1" || window.localStorage.getItem(LEGACY_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled; runtime audio still works for this page.
  }
}

class AudioMixSettings {
  private master = readNumber(MASTER_KEY, DEFAULT_MASTER);
  private music = readNumber(MUSIC_KEY, DEFAULT_MUSIC);
  private sfx = readNumber(SFX_KEY, DEFAULT_SFX);
  private muted = readMuted();
  private readonly listeners = new Set<Listener>();

  snapshot(): AudioMixSnapshot {
    return {
      masterPercent: Math.round(this.master * 100),
      musicPercent: Math.round(this.music * 100),
      sfxPercent: Math.round(this.sfx * 100),
      muted: this.muted,
    };
  }

  get masterGain(): number { return this.master; }
  get musicGain(): number { return this.music; }
  get sfxGain(): number { return this.sfx; }
  get isMuted(): boolean { return this.muted; }

  setMasterPercent(percent: number): void {
    this.master = clamp01(Math.round(percent) / 100);
    write(MASTER_KEY, String(this.master));
    this.emit();
  }

  setMusicPercent(percent: number): void {
    this.music = clamp01(Math.round(percent) / 100);
    write(MUSIC_KEY, String(this.music));
    this.emit();
  }

  setSfxPercent(percent: number): void {
    this.sfx = clamp01(Math.round(percent) / 100);
    write(SFX_KEY, String(this.sfx));
    this.emit();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    write(MUTED_KEY, muted ? "1" : "0");
    // Keep V1 compatibility so an existing browser profile does not disagree.
    write(LEGACY_MUTED_KEY, muted ? "1" : "0");
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const audioMixSettings = new AudioMixSettings();
