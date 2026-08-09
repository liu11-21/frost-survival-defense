import type { GameEvents } from "../game/GameEvents";
import {
  DEFAULT_MUSIC_VOLUME,
  MUSIC_CROSSFADE_SECONDS,
  MUSIC_TRACKS,
  resolveMusicAssetPath,
  type MusicState,
} from "./MusicCatalog";

const VOLUME_KEY = "frostbound.music.volume";
const MUTED_KEY = "frostbound.music.muted";
const CHANNEL_COUNT = 2;

interface MusicChannel {
  readonly element: HTMLAudioElement;
  readonly source: MediaElementAudioSourceNode;
  readonly gain: GainNode;
  state: MusicState | null;
  generation: number;
}

interface MusicSnapshotChannel {
  readonly state: MusicState | null;
  readonly paused: boolean;
  readonly src: string;
  readonly gain: number;
}

export interface MusicSnapshot {
  readonly requestedState: MusicState | null;
  readonly activeState: MusicState | null;
  readonly unlocked: boolean;
  readonly volumePercent: number;
  readonly muted: boolean;
  readonly transitionCount: number;
  readonly crossfadeSeconds: number;
  readonly tracks: Record<MusicState, string>;
  readonly channels: MusicSnapshotChannel[];
}

/**
 * Central BGM owner. Gameplay only sends semantic music states; this class owns
 * media elements, Web Audio routing, persistence and crossfade lifecycle.
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private readonly channels: MusicChannel[] = [];
  private activeChannel = -1;
  private requestedState: MusicState | null = null;
  private activeState: MusicState | null = null;
  private unlocked = false;
  private volume = this.loadVolume();
  private muted = this.loadMuted();
  private transitionCount = 0;
  private readonly cleanupTimers = new Set<number>();
  private boundEvents: GameEvents | null = null;
  private eventUnsubscribers: Array<() => void> = [];

  constructor() {
    this.installVerificationApi();
    window.addEventListener("pagehide", () => this.dispose(), { once: true });
  }

  /** Must run from a real user gesture. Creates/resumes the music AudioContext. */
  unlock(): void {
    if (!this.ctx) this.createGraph();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.unlocked = true;
    this.applyVolume();
    if (this.requestedState !== null && this.activeState !== this.requestedState) {
      this.transitionTo(this.requestedState);
    }
  }

  /** Idempotently attaches only to existing reliable gameplay events. */
  attachGameplayEvents(events: GameEvents): void {
    if (this.boundEvents === events) return;
    for (const unsubscribe of this.eventUnsubscribers) unsubscribe();
    this.eventUnsubscribers = [];
    this.boundEvents = events;

    this.eventUnsubscribers.push(
      events.on("wavePreview", () => this.setState("WARNING")),
      events.on("waveStarted", (payload) => this.setState(payload.boss ? "INTENSE" : "COMBAT")),
      events.on("bossSpawned", () => this.setState("INTENSE")),
      events.on("bossPhaseChanged", () => this.setState("INTENSE")),
      events.on("waveCleared", () => this.setState("WAVE_CLEAR")),
    );
  }

  /** Semantic state API. Repeating the current state never restarts the track. */
  setState(state: MusicState): void {
    if (this.requestedState === state) return;
    this.requestedState = state;
    if (!this.unlocked) return;
    this.transitionTo(state);
  }

  get state(): MusicState | null {
    return this.requestedState;
  }

  get volumePercent(): number {
    return Math.round(this.volume * 100);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setVolumePercent(percent: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.volume = clamped / 100;
    this.writeStorage(VOLUME_KEY, String(this.volume));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.writeStorage(MUTED_KEY, muted ? "1" : "0");
    this.applyVolume();
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  /** Adds only the required music controls to the existing settings screen. */
  mountSettingsControls(container: HTMLElement): void {
    container.querySelector("#music-settings-audio")?.remove();

    const section = document.createElement("section");
    section.id = "music-settings-audio";
    section.innerHTML = `
      <h2>音樂</h2>
      <p class="muted">背景音樂音量會儲存在這台瀏覽器。</p>
      <div class="menu-buttons center">
        <label for="music-volume" class="muted">BGM <b id="music-volume-value">${this.volumePercent}%</b></label>
        <input id="music-volume" type="range" min="0" max="100" step="1" value="${this.volumePercent}" aria-label="背景音樂音量" style="width:min(420px,70vw)" />
        <button class="big-btn tight" id="music-mute" type="button">${this.muted ? "解除靜音" : "靜音"}</button>
      </div>
    `;

    const backButton = container.querySelector("[data-back]");
    const backRow = backButton?.parentElement;
    if (backRow?.parentElement === container) container.insertBefore(section, backRow);
    else container.appendChild(section);

    const slider = section.querySelector<HTMLInputElement>("#music-volume");
    const label = section.querySelector<HTMLElement>("#music-volume-value");
    const mute = section.querySelector<HTMLButtonElement>("#music-mute");
    slider?.addEventListener("input", () => {
      const value = Number(slider.value);
      this.setVolumePercent(value);
      if (label) label.textContent = `${this.volumePercent}%`;
    });
    mute?.addEventListener("click", () => {
      this.toggleMuted();
      mute.textContent = this.muted ? "解除靜音" : "靜音";
    });
  }

  resolveForBase(state: MusicState, basePath: string): string {
    return resolveMusicAssetPath(state, basePath);
  }

  snapshot(): MusicSnapshot {
    return {
      requestedState: this.requestedState,
      activeState: this.activeState,
      unlocked: this.unlocked,
      volumePercent: this.volumePercent,
      muted: this.muted,
      transitionCount: this.transitionCount,
      crossfadeSeconds: MUSIC_CROSSFADE_SECONDS,
      tracks: {
        MENU: resolveMusicAssetPath("MENU"),
        PREPARATION: resolveMusicAssetPath("PREPARATION"),
        WARNING: resolveMusicAssetPath("WARNING"),
        COMBAT: resolveMusicAssetPath("COMBAT"),
        INTENSE: resolveMusicAssetPath("INTENSE"),
        WAVE_CLEAR: resolveMusicAssetPath("WAVE_CLEAR"),
      },
      channels: this.channels.map((channel) => ({
        state: channel.state,
        paused: channel.element.paused,
        src: channel.element.src,
        gain: Number(channel.gain.gain.value.toFixed(3)),
      })),
    };
  }

  dispose(): void {
    for (const unsubscribe of this.eventUnsubscribers) unsubscribe();
    this.eventUnsubscribers = [];
    this.boundEvents = null;
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const channel of this.channels) {
      channel.generation++;
      channel.element.pause();
      channel.element.removeAttribute("src");
      channel.source.disconnect();
      channel.gain.disconnect();
    }
    this.channels.length = 0;
    this.musicGain?.disconnect();
    this.musicGain = null;
    void this.ctx?.close();
    this.ctx = null;
    this.activeChannel = -1;
    this.activeState = null;
    this.unlocked = false;
  }

  private createGraph(): void {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const musicGain = ctx.createGain();
    musicGain.gain.value = this.muted ? 0 : this.volume;
    musicGain.connect(ctx.destination);
    this.ctx = ctx;
    this.musicGain = musicGain;

    for (let index = 0; index < CHANNEL_COUNT; index++) {
      const element = document.createElement("audio");
      element.preload = "auto";
      const source = ctx.createMediaElementSource(element);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain);
      gain.connect(musicGain);
      this.channels.push({ element, source, gain, state: null, generation: 0 });
    }
  }

  private transitionTo(state: MusicState): void {
    const ctx = this.ctx;
    if (!ctx || this.channels.length !== CHANNEL_COUNT) return;
    if (this.activeState === state && this.activeChannel >= 0) return;

    const incomingIndex = this.activeChannel === 0 ? 1 : 0;
    const incoming = this.channels[incomingIndex];
    const outgoing = this.activeChannel >= 0 ? this.channels[this.activeChannel] : null;
    const now = ctx.currentTime;
    const end = now + MUSIC_CROSSFADE_SECONDS;

    this.prepareIncoming(incoming, state, now, end);
    if (outgoing && outgoing !== incoming && outgoing.state !== null) {
      const generation = outgoing.generation;
      outgoing.gain.gain.cancelScheduledValues(now);
      outgoing.gain.gain.setValueAtTime(outgoing.gain.gain.value, now);
      outgoing.gain.gain.linearRampToValueAtTime(0, end);
      this.scheduleCleanup(outgoing, generation);
    }

    this.activeChannel = incomingIndex;
    this.activeState = state;
    this.transitionCount++;
  }

  private prepareIncoming(channel: MusicChannel, state: MusicState, now: number, end: number): void {
    channel.generation++;
    channel.element.pause();
    channel.gain.gain.cancelScheduledValues(now);
    channel.gain.gain.setValueAtTime(0, now);
    channel.element.src = new URL(resolveMusicAssetPath(state), document.baseURI).href;
    channel.element.loop = MUSIC_TRACKS[state].loop;
    channel.element.currentTime = 0;
    channel.state = state;
    channel.element.load();
    channel.gain.gain.linearRampToValueAtTime(1, end);
    void channel.element.play().catch((error: unknown) => {
      console.warn(`[audio] failed to play ${state}`, error);
    });
  }

  private scheduleCleanup(channel: MusicChannel, generation: number): void {
    const timer = window.setTimeout(() => {
      this.cleanupTimers.delete(timer);
      if (channel.generation !== generation) return;
      channel.element.pause();
      channel.element.removeAttribute("src");
      channel.element.load();
      channel.state = null;
      channel.gain.gain.value = 0;
    }, Math.ceil(MUSIC_CROSSFADE_SECONDS * 1000) + 80);
    this.cleanupTimers.add(timer);
  }

  private applyVolume(): void {
    const ctx = this.ctx;
    const gain = this.musicGain;
    if (!ctx || !gain) return;
    gain.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.04);
  }

  private loadVolume(): number {
    const raw = this.readStorage(VOLUME_KEY);
    if (raw === null) return DEFAULT_MUSIC_VOLUME;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : DEFAULT_MUSIC_VOLUME;
  }

  private loadMuted(): boolean {
    return this.readStorage(MUTED_KEY) === "1";
  }

  private readStorage(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage may be disabled; audio still works for the current page.
    }
  }

  private installVerificationApi(): void {
    if (new URLSearchParams(window.location.search).get("audioVerification") !== "1") return;
    const target = window as unknown as {
      frostboundAudio?: {
        unlock(): void;
        setState(state: MusicState): void;
        setVolumePercent(percent: number): void;
        setMuted(muted: boolean): void;
        snapshot(): MusicSnapshot;
        resolveForBase(state: MusicState, basePath: string): string;
      };
    };
    target.frostboundAudio = {
      unlock: () => this.unlock(),
      setState: (state) => this.setState(state),
      setVolumePercent: (percent) => this.setVolumePercent(percent),
      setMuted: (muted) => this.setMuted(muted),
      snapshot: () => this.snapshot(),
      resolveForBase: (state, basePath) => this.resolveForBase(state, basePath),
    };
  }
}

export const audioDirector = new AudioDirector();
