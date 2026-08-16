import type { GameEvents } from "../game/GameEvents";
import { audioMixSettings } from "./AudioMixSettings";
import {
  MUSIC_CROSSFADE_SECONDS,
  MUSIC_TRACKS,
  resolveMusicAssetPath,
  type MusicState,
} from "./MusicCatalog";

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
  readonly currentTime: number;
}

export interface MusicSnapshot {
  readonly requestedState: MusicState | null;
  readonly activeState: MusicState | null;
  readonly unlocked: boolean;
  /** Backward-compatible alias for musicPercent. */
  readonly volumePercent: number;
  readonly masterVolumePercent: number;
  readonly musicVolumePercent: number;
  readonly sfxVolumePercent: number;
  readonly muted: boolean;
  readonly transitionCount: number;
  readonly crossfadeSeconds: number;
  readonly tracks: Record<MusicState, string>;
  readonly channels: MusicSnapshotChannel[];
  readonly contextState: AudioContextState | "none";
  readonly lifecycleSuspended: boolean;
  readonly contextCreateCount: number;
  readonly lifecycleListenerInstallCount: number;
  readonly disposeCount: number;
}

/**
 * Central BGM owner. Gameplay only sends semantic music states; this class owns
 * media elements, Web Audio routing, lifecycle and crossfades. Master/Music/SFX
 * preferences live in AudioMixSettings so the BGM and SFX contexts share one
 * logical mixer without forcing the stable BGM runtime into an SFX refactor.
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private readonly channels: MusicChannel[] = [];
  private activeChannel = -1;
  private requestedState: MusicState | null = null;
  private activeState: MusicState | null = null;
  private unlocked = false;
  private transitionCount = 0;
  private readonly cleanupTimers = new Set<number>();
  private boundEvents: GameEvents | null = null;
  private eventUnsubscribers: Array<() => void> = [];

  private lifecycleSuspended = false;
  private lifecycleListenersInstalled = false;
  private contextCreateCount = 0;
  private lifecycleListenerInstallCount = 0;
  private disposeCount = 0;

  private readonly onPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      // BFCache keeps this exact JS realm alive. Suspend, but deliberately keep
      // the graph and listeners so pageshow can resume without a second context.
      this.suspendForLifecycle();
      return;
    }
    // A terminal navigation must stop media immediately and release Web Audio.
    this.dispose();
  };

  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted || this.lifecycleSuspended) this.resumeFromLifecycle();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.suspendForLifecycle();
    else this.resumeFromLifecycle();
  };

  constructor() {
    audioMixSettings.subscribe(() => this.applyVolume());
    this.installVerificationApi();
    this.installLifecycleListeners();
  }

  /** Must run from a real user gesture. Creates/resumes the music AudioContext. */
  unlock(): void {
    this.installLifecycleListeners();
    if (!this.ctx) this.createGraph();
    const ctx = this.ctx;
    if (!ctx) return;
    this.unlocked = true;
    this.applyVolume();

    if (!this.lifecycleSuspended && ctx.state === "suspended") {
      void ctx.resume().catch((error: unknown) => {
        console.warn("[audio] failed to resume AudioContext", error);
      });
    }
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
    return audioMixSettings.snapshot().musicPercent;
  }

  get masterVolumePercent(): number {
    return audioMixSettings.snapshot().masterPercent;
  }

  get sfxVolumePercent(): number {
    return audioMixSettings.snapshot().sfxPercent;
  }

  get isMuted(): boolean {
    return audioMixSettings.isMuted;
  }

  /** Backward-compatible BGM setter. */
  setVolumePercent(percent: number): void {
    audioMixSettings.setMusicPercent(percent);
  }

  setMasterVolumePercent(percent: number): void {
    audioMixSettings.setMasterPercent(percent);
  }

  setSfxVolumePercent(percent: number): void {
    audioMixSettings.setSfxPercent(percent);
  }

  setMuted(muted: boolean): void {
    audioMixSettings.setMuted(muted);
  }

  toggleMuted(): void {
    this.setMuted(!this.isMuted);
  }

  /** Adds only the required audio controls to the existing settings screen. */
  mountSettingsControls(container: HTMLElement): void {
    container.querySelector("#music-settings-audio")?.remove();
    const mix = audioMixSettings.snapshot();

    const section = document.createElement("section");
    section.id = "music-settings-audio";
    section.innerHTML = `
      <h2>音訊</h2>
      <p class="muted">主音量、背景音樂與音效音量會儲存在這台瀏覽器。</p>
      <div class="menu-buttons center">
        <label for="master-volume" class="muted">Master <b id="master-volume-value">${mix.masterPercent}%</b></label>
        <input id="master-volume" type="range" min="0" max="100" step="1" value="${mix.masterPercent}" aria-label="主音量" style="width:min(420px,70vw)" />
        <label for="music-volume" class="muted">BGM <b id="music-volume-value">${mix.musicPercent}%</b></label>
        <input id="music-volume" type="range" min="0" max="100" step="1" value="${mix.musicPercent}" aria-label="背景音樂音量" style="width:min(420px,70vw)" />
        <label for="sfx-volume" class="muted">SFX <b id="sfx-volume-value">${mix.sfxPercent}%</b></label>
        <input id="sfx-volume" type="range" min="0" max="100" step="1" value="${mix.sfxPercent}" aria-label="音效音量" style="width:min(420px,70vw)" />
        <button class="big-btn tight" id="music-mute" type="button">${mix.muted ? "解除靜音" : "靜音"}</button>
      </div>
    `;

    const backButton = container.querySelector("[data-back]");
    const backRow = backButton?.parentElement;
    if (backRow?.parentElement === container) container.insertBefore(section, backRow);
    else container.appendChild(section);

    const masterSlider = section.querySelector<HTMLInputElement>("#master-volume");
    const masterLabel = section.querySelector<HTMLElement>("#master-volume-value");
    masterSlider?.addEventListener("input", () => {
      this.setMasterVolumePercent(Number(masterSlider.value));
      if (masterLabel) masterLabel.textContent = `${this.masterVolumePercent}%`;
    });

    const musicSlider = section.querySelector<HTMLInputElement>("#music-volume");
    const musicLabel = section.querySelector<HTMLElement>("#music-volume-value");
    musicSlider?.addEventListener("input", () => {
      this.setVolumePercent(Number(musicSlider.value));
      if (musicLabel) musicLabel.textContent = `${this.volumePercent}%`;
    });

    const sfxSlider = section.querySelector<HTMLInputElement>("#sfx-volume");
    const sfxLabel = section.querySelector<HTMLElement>("#sfx-volume-value");
    sfxSlider?.addEventListener("input", () => {
      this.setSfxVolumePercent(Number(sfxSlider.value));
      if (sfxLabel) sfxLabel.textContent = `${this.sfxVolumePercent}%`;
    });

    const mute = section.querySelector<HTMLButtonElement>("#music-mute");
    mute?.addEventListener("click", () => {
      this.toggleMuted();
      mute.textContent = this.isMuted ? "解除靜音" : "靜音";
    });
  }

  resolveForBase(state: MusicState, basePath: string): string {
    return resolveMusicAssetPath(state, basePath);
  }

  snapshot(): MusicSnapshot {
    const mix = audioMixSettings.snapshot();
    return {
      requestedState: this.requestedState,
      activeState: this.activeState,
      unlocked: this.unlocked,
      volumePercent: mix.musicPercent,
      masterVolumePercent: mix.masterPercent,
      musicVolumePercent: mix.musicPercent,
      sfxVolumePercent: mix.sfxPercent,
      muted: mix.muted,
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
        currentTime: Number(channel.element.currentTime.toFixed(3)),
      })),
      contextState: this.ctx?.state ?? "none",
      lifecycleSuspended: this.lifecycleSuspended,
      contextCreateCount: this.contextCreateCount,
      lifecycleListenerInstallCount: this.lifecycleListenerInstallCount,
      disposeCount: this.disposeCount,
    };
  }

  dispose(): void {
    const hadRuntime =
      this.lifecycleListenersInstalled ||
      this.ctx !== null ||
      this.channels.length > 0 ||
      this.boundEvents !== null ||
      this.eventUnsubscribers.length > 0;
    if (!hadRuntime) return;

    this.disposeCount++;
    this.removeLifecycleListeners();
    for (const unsubscribe of this.eventUnsubscribers) unsubscribe();
    this.eventUnsubscribers = [];
    this.boundEvents = null;
    for (const timer of this.cleanupTimers) window.clearTimeout(timer);
    this.cleanupTimers.clear();
    for (const channel of this.channels) {
      channel.generation++;
      channel.element.pause();
      channel.element.removeAttribute("src");
      channel.element.load();
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
    this.lifecycleSuspended = false;
  }

  private installLifecycleListeners(): void {
    if (this.lifecycleListenersInstalled) return;
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.lifecycleListenersInstalled = true;
    this.lifecycleListenerInstallCount++;
  }

  private removeLifecycleListeners(): void {
    if (!this.lifecycleListenersInstalled) return;
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.lifecycleListenersInstalled = false;
  }

  private suspendForLifecycle(): void {
    if (this.lifecycleSuspended) return;
    this.lifecycleSuspended = true;
    for (const channel of this.channels) {
      if (channel.state !== null && !channel.element.paused) channel.element.pause();
    }
    if (this.ctx?.state === "running") {
      void this.ctx.suspend().catch((error: unknown) => {
        console.warn("[audio] failed to suspend AudioContext", error);
      });
    }
  }

  private resumeFromLifecycle(): void {
    if (!this.lifecycleSuspended || document.hidden) return;
    this.lifecycleSuspended = false;
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || ctx.state === "closed") return;

    const resumeChannels = (): void => {
      for (const channel of this.channels) {
        if (channel.state !== null && channel.element.paused) this.playChannel(channel);
      }
    };

    if (ctx.state === "suspended") {
      void ctx
        .resume()
        .then(resumeChannels)
        .catch((error: unknown) => console.warn("[audio] failed to resume after lifecycle suspension", error));
      return;
    }
    resumeChannels();
  }

  private createGraph(): void {
    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();
    const musicGain = ctx.createGain();
    const mix = audioMixSettings.snapshot();
    musicGain.gain.value = mix.muted ? 0 : (mix.masterPercent / 100) * (mix.musicPercent / 100);
    musicGain.connect(ctx.destination);
    this.ctx = ctx;
    this.musicGain = musicGain;
    this.contextCreateCount++;

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
    if (!this.lifecycleSuspended) this.playChannel(channel);
  }

  private playChannel(channel: MusicChannel): void {
    void channel.element.play().catch((error: unknown) => {
      console.warn(`[audio] failed to play ${channel.state ?? "track"}`, error);
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
    const mix = audioMixSettings.snapshot();
    const value = mix.muted ? 0 : (mix.masterPercent / 100) * (mix.musicPercent / 100);
    gain.gain.setTargetAtTime(value, ctx.currentTime, 0.04);
  }

  private installVerificationApi(): void {
    if (new URLSearchParams(window.location.search).get("audioVerification") !== "1") return;
    const target = window as unknown as {
      frostboundAudio?: {
        unlock(): void;
        setState(state: MusicState): void;
        setVolumePercent(percent: number): void;
        setMasterVolumePercent(percent: number): void;
        setSfxVolumePercent(percent: number): void;
        setMuted(muted: boolean): void;
        snapshot(): MusicSnapshot;
        resolveForBase(state: MusicState, basePath: string): string;
      };
    };
    target.frostboundAudio = {
      unlock: () => this.unlock(),
      setState: (state) => this.setState(state),
      setVolumePercent: (percent) => this.setVolumePercent(percent),
      setMasterVolumePercent: (percent) => this.setMasterVolumePercent(percent),
      setSfxVolumePercent: (percent) => this.setSfxVolumePercent(percent),
      setMuted: (muted) => this.setMuted(muted),
      snapshot: () => this.snapshot(),
      resolveForBase: (state, basePath) => this.resolveForBase(state, basePath),
    };
  }
}

export const audioDirector = new AudioDirector();
