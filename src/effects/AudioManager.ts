import { audioMixSettings, type AudioMixSnapshot } from "../audio/AudioMixSettings";

export type CoreSfxName =
  | "heroMeleeSwing"
  | "heroMeleeHit"
  | "heroRangedShot"
  | "enemyHit"
  | "enemyDeath"
  | "squadMelee"
  | "squadGunshot"
  | "magicAttack"
  | "artilleryExplosion"
  | "buildPlace"
  | "uiConfirm"
  | "uiError";

export type SfxName = CoreSfxName
  | "footstep"
  | "heroRanged"
  | "heroMelee"
  | "heroDown"
  | "heroRevive"
  | "allyAttack"
  | "enemyAttack"
  | "medicHeal"
  | "assaultTeleport"
  | "towerFire"
  | "wallHit"
  | "buildingDestroyed"
  | "coinPickup"
  | "waveStart"
  | "bossSpawn"
  | "furnaceDamaged"
  | "furnaceHeal"
  | "furnaceUpgrade"
  | "buildStage"
  | "buildComplete"
  | "defeat"
  | "victory"
  | "gatherWood"
  | "gatherStone"
  | "bossSlamWindup"
  | "bossSlam"
  | "buildFail"
  | "engineerRepair"
  | "musketFire"
  | "frostCast"
  | "freezeZoneSlam"
  | "armorBreak"
  | "commanderHorn"
  | "bomberWarn"
  | "bomberBlast"
  | "heroSkillFrost"
  | "heroSkillBarrage"
  | "heroSkillRally";

type RecipeKind =
  | "whoosh"
  | "impact"
  | "shot"
  | "death"
  | "magic"
  | "explosion"
  | "build"
  | "confirm"
  | "error"
  | "step";

interface VariationRecipe {
  readonly kind: RecipeKind;
  readonly tone: number;
  readonly colour: number;
  readonly duration: number;
}

interface SfxDefinition {
  readonly variations: readonly VariationRecipe[];
  readonly cooldown: number;
  readonly concurrency: number;
  readonly priority: number;
  readonly positional: boolean;
  readonly pitchJitter: number;
  readonly volumeJitter: number;
}

interface ActiveVoice {
  readonly id: number;
  readonly event: CoreSfxName;
  readonly requestedName: SfxName;
  readonly variation: number;
  readonly priority: number;
  readonly positional: boolean;
  readonly startedAt: number;
  readonly endsAt: number;
  readonly gain: number;
  readonly pitch: number;
  readonly x: number | null;
  readonly z: number | null;
  readonly sources: AudioScheduledSourceNode[];
  readonly nodes: AudioNode[];
}

export interface SfxVoiceSnapshot {
  readonly id: number;
  readonly event: string;
  readonly requestedName: SfxName;
  readonly variation: number;
  readonly positional: boolean;
  readonly priority: number;
  readonly gain: number;
  readonly pitch: number;
  readonly x: number | null;
  readonly z: number | null;
  readonly sourceState: "playing" | "ended";
}

export interface SfxRuntimeSnapshot {
  readonly unlocked: boolean;
  readonly contextState: AudioContextState | "none";
  readonly contextCreateCount: number;
  readonly lifecycleListenerInstallCount: number;
  readonly disposeCount: number;
  readonly lifecycleSuspended: boolean;
  readonly transientMuted: boolean;
  readonly mix: AudioMixSnapshot;
  readonly listener: { x: number; z: number };
  readonly activeCount: number;
  readonly totalConcurrencyCap: number;
  readonly droppedByCooldown: number;
  readonly droppedByConcurrency: number;
  readonly variationCounts: Record<CoreSfxName, number>;
  readonly activeVoices: SfxVoiceSnapshot[];
  readonly ambientLoops: string[];
  readonly voiceBusReserved: boolean;
}

const TOTAL_CONCURRENCY_CAP = 16;
const POSITION_REF_DISTANCE = 4;
const POSITION_MAX_DISTANCE = 44;
const POSITION_ROLLOFF = 1.2;

const V = (kind: RecipeKind, tone: number, colour: number, duration: number): VariationRecipe => ({
  kind, tone, colour, duration,
});

const SFX: Record<CoreSfxName, SfxDefinition> = {
  heroMeleeSwing: {
    variations: [V("whoosh", 260, 1600, 0.17), V("whoosh", 300, 1900, 0.15), V("whoosh", 230, 1350, 0.19)],
    cooldown: 0.045, concurrency: 2, priority: 90, positional: false, pitchJitter: 0.035, volumeJitter: 0.045,
  },
  heroMeleeHit: {
    variations: [V("impact", 105, 680, 0.18), V("impact", 125, 820, 0.16), V("impact", 92, 560, 0.2)],
    cooldown: 0.035, concurrency: 3, priority: 95, positional: true, pitchJitter: 0.03, volumeJitter: 0.04,
  },
  heroRangedShot: {
    variations: [V("shot", 720, 2800, 0.11), V("shot", 790, 3300, 0.1), V("shot", 660, 2450, 0.12)],
    cooldown: 0.035, concurrency: 3, priority: 90, positional: false, pitchJitter: 0.035, volumeJitter: 0.04,
  },
  enemyHit: {
    variations: [V("impact", 135, 1150, 0.13), V("impact", 155, 1450, 0.12), V("impact", 118, 900, 0.15), V("impact", 175, 1700, 0.11)],
    cooldown: 0.018, concurrency: 5, priority: 55, positional: true, pitchJitter: 0.045, volumeJitter: 0.055,
  },
  enemyDeath: {
    variations: [V("death", 280, 1100, 0.3), V("death", 330, 1450, 0.27), V("death", 235, 850, 0.34), V("death", 365, 1750, 0.25)],
    cooldown: 0.035, concurrency: 4, priority: 62, positional: true, pitchJitter: 0.045, volumeJitter: 0.055,
  },
  squadMelee: {
    variations: [V("whoosh", 215, 1350, 0.14), V("whoosh", 245, 1550, 0.13), V("whoosh", 190, 1150, 0.16)],
    cooldown: 0.025, concurrency: 4, priority: 48, positional: true, pitchJitter: 0.04, volumeJitter: 0.05,
  },
  squadGunshot: {
    variations: [V("shot", 205, 1550, 0.15), V("shot", 235, 1850, 0.14), V("shot", 180, 1250, 0.17)],
    cooldown: 0.018, concurrency: 5, priority: 58, positional: true, pitchJitter: 0.035, volumeJitter: 0.045,
  },
  magicAttack: {
    variations: [V("magic", 720, 2800, 0.34), V("magic", 840, 3450, 0.31), V("magic", 620, 2350, 0.37)],
    cooldown: 0.045, concurrency: 4, priority: 65, positional: true, pitchJitter: 0.025, volumeJitter: 0.04,
  },
  artilleryExplosion: {
    variations: [V("explosion", 82, 520, 0.62), V("explosion", 96, 640, 0.56), V("explosion", 68, 430, 0.7)],
    cooldown: 0.065, concurrency: 3, priority: 78, positional: true, pitchJitter: 0.025, volumeJitter: 0.04,
  },
  buildPlace: {
    variations: [V("build", 330, 1450, 0.22), V("build", 390, 1750, 0.2)],
    cooldown: 0.04, concurrency: 2, priority: 72, positional: false, pitchJitter: 0.02, volumeJitter: 0.035,
  },
  uiConfirm: {
    variations: [V("confirm", 587, 0, 0.2)],
    cooldown: 0.04, concurrency: 2, priority: 85, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  uiError: {
    variations: [V("error", 240, 0, 0.2)],
    cooldown: 0.05, concurrency: 2, priority: 88, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
};

const ALIASES: Partial<Record<SfxName, CoreSfxName>> = {
  heroMelee: "heroMeleeSwing",
  heroRanged: "heroRangedShot",
  allyAttack: "squadMelee",
  enemyAttack: "squadMelee",
  musketFire: "squadGunshot",
  frostCast: "magicAttack",
  medicHeal: "magicAttack",
  assaultTeleport: "magicAttack",
  towerFire: "squadGunshot",
  wallHit: "enemyHit",
  buildingDestroyed: "artilleryExplosion",
  coinPickup: "uiConfirm",
  waveStart: "uiConfirm",
  bossSpawn: "artilleryExplosion",
  furnaceDamaged: "enemyHit",
  furnaceHeal: "magicAttack",
  furnaceUpgrade: "magicAttack",
  buildStage: "buildPlace",
  buildComplete: "buildPlace",
  buildFail: "uiError",
  engineerRepair: "buildPlace",
  gatherWood: "buildPlace",
  gatherStone: "buildPlace",
  bossSlamWindup: "magicAttack",
  bossSlam: "artilleryExplosion",
  freezeZoneSlam: "artilleryExplosion",
  armorBreak: "enemyHit",
  commanderHorn: "magicAttack",
  bomberWarn: "uiError",
  bomberBlast: "artilleryExplosion",
  heroSkillFrost: "magicAttack",
  heroSkillBarrage: "artilleryExplosion",
  heroSkillRally: "magicAttack",
  heroDown: "enemyHit",
  heroRevive: "uiConfirm",
  defeat: "uiError",
  victory: "uiConfirm",
};

const VARIATION_COUNTS = Object.fromEntries(
  Object.entries(SFX).map(([name, def]) => [name, def.variations.length]),
) as Record<CoreSfxName, number>;

/**
 * Gameplay SFX V1. One reusable WebAudio graph owns SFX, ambience and a reserved
 * voice bus. Core events use bounded variation pools, priority/concurrency,
 * cooldowns and PannerNode positioning. Placeholder sounds are procedural and
 * intentionally asset-free until commercially cleared samples replace them.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private furnaceGain: GainNode | null = null;
  private furnaceFilter: BiquadFilterNode | null = null;
  private readonly ambienceSources: AudioScheduledSourceNode[] = [];
  private readonly activeVoices: ActiveVoice[] = [];
  private readonly lastPlayed = new Map<CoreSfxName, number>();
  private readonly lastVariation = new Map<CoreSfxName, number>();
  private nextVoiceId = 1;
  private listenerX = 0;
  private listenerZ = 0;
  private transientMuted = false;
  private unlocked = false;
  private lifecycleSuspended = false;
  private lifecycleListenersInstalled = false;
  private contextCreateCount = 0;
  private lifecycleListenerInstallCount = 0;
  private disposeCount = 0;
  private droppedByCooldown = 0;
  private droppedByConcurrency = 0;
  private furnaceLevel = 1;

  private readonly unsubscribeMix = audioMixSettings.subscribe(() => this.applyMix());

  private readonly onPageHide = (event: PageTransitionEvent): void => {
    if (event.persisted) this.suspendForLifecycle();
    else this.dispose();
  };
  private readonly onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted || this.lifecycleSuspended) this.resumeFromLifecycle();
  };
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.suspendForLifecycle();
    else this.resumeFromLifecycle();
  };

  constructor() {
    this.installLifecycleListeners();
    this.installVerificationApi();
  }

  unlock(): void {
    this.installLifecycleListeners();
    if (!this.ctx) this.createGraph();
    const ctx = this.ctx;
    if (!ctx) return;
    this.unlocked = true;
    this.applyMix();
    if (!this.lifecycleSuspended && ctx.state === "suspended") void ctx.resume();
    if (this.ambienceSources.length === 0) this.startAmbienceLoops();
  }

  /** Game pause compatibility: transient only, never persisted as the user's mute choice. */
  setMuted(muted: boolean): void {
    this.transientMuted = muted;
    this.applyMix();
  }

  get isMuted(): boolean {
    return this.transientMuted || audioMixSettings.isMuted;
  }

  setMasterVolumePercent(percent: number): void { audioMixSettings.setMasterPercent(percent); }
  setSfxVolumePercent(percent: number): void { audioMixSettings.setSfxPercent(percent); }
  setUserMuted(muted: boolean): void { audioMixSettings.setMuted(muted); }

  setListenerPosition(x: number, z: number): void {
    this.listenerX = x;
    this.listenerZ = z;
    const listener = this.ctx?.listener;
    if (!listener) return;
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = 0;
      listener.positionZ.value = z;
    } else {
      listener.setPosition(x, 0, z);
    }
  }

  /** Furnace ambience changes timbre with the existing furnace level only. */
  setFurnaceLevel(level: number): void {
    this.furnaceLevel = Math.max(1, Math.floor(level));
    if (!this.ctx || !this.furnaceGain || !this.furnaceFilter) return;
    const t = this.ctx.currentTime;
    this.furnaceGain.gain.setTargetAtTime(this.furnaceLevel >= 2 ? 0.048 : 0.032, t, 0.5);
    this.furnaceFilter.frequency.setTargetAtTime(this.furnaceLevel >= 2 ? 430 : 300, t, 0.5);
  }

  play(name: SfxName, volume = 1, pitch = 1): void {
    this.trigger(name, volume, pitch, null, null, false);
  }

  playAt(name: SfxName, x: number, z: number, volume = 1, pitch = 1, priorityBoost = 0): void {
    this.trigger(name, volume, pitch, x, z, true, priorityBoost);
  }

  attenuationForDistance(distance: number): number {
    const d = Math.max(0, distance);
    if (d <= POSITION_REF_DISTANCE) return 1;
    if (d >= POSITION_MAX_DISTANCE) return 0;
    return Math.max(0, Math.min(1, POSITION_REF_DISTANCE / (
      POSITION_REF_DISTANCE + POSITION_ROLLOFF * (d - POSITION_REF_DISTANCE)
    )));
  }

  snapshot(): SfxRuntimeSnapshot {
    this.trimVoices();
    const now = this.ctx?.currentTime ?? 0;
    return {
      unlocked: this.unlocked,
      contextState: this.ctx?.state ?? "none",
      contextCreateCount: this.contextCreateCount,
      lifecycleListenerInstallCount: this.lifecycleListenerInstallCount,
      disposeCount: this.disposeCount,
      lifecycleSuspended: this.lifecycleSuspended,
      transientMuted: this.transientMuted,
      mix: audioMixSettings.snapshot(),
      listener: { x: this.listenerX, z: this.listenerZ },
      activeCount: this.activeVoices.length,
      totalConcurrencyCap: TOTAL_CONCURRENCY_CAP,
      droppedByCooldown: this.droppedByCooldown,
      droppedByConcurrency: this.droppedByConcurrency,
      variationCounts: { ...VARIATION_COUNTS },
      activeVoices: this.activeVoices.map((voice) => ({
        id: voice.id,
        event: voice.event,
        requestedName: voice.requestedName,
        variation: voice.variation,
        positional: voice.positional,
        priority: voice.priority,
        gain: Number(voice.gain.toFixed(3)),
        pitch: Number(voice.pitch.toFixed(3)),
        x: voice.x,
        z: voice.z,
        sourceState: now < voice.endsAt ? "playing" : "ended",
      })),
      ambientLoops: this.ambienceSources.length > 0 ? ["furnace", "coldWind"] : [],
      voiceBusReserved: this.voiceBus !== null,
    };
  }

  dispose(): void {
    const hadRuntime = this.ctx !== null || this.lifecycleListenersInstalled || this.ambienceSources.length > 0 || this.activeVoices.length > 0;
    if (!hadRuntime) return;
    this.disposeCount++;
    this.removeLifecycleListeners();
    for (const voice of [...this.activeVoices]) this.stopVoice(voice);
    this.activeVoices.length = 0;
    for (const source of this.ambienceSources.splice(0)) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.furnaceGain?.disconnect();
    this.furnaceFilter?.disconnect();
    this.voiceBus?.disconnect();
    this.ambienceBus?.disconnect();
    this.sfxBus?.disconnect();
    this.master?.disconnect();
    this.furnaceGain = null;
    this.furnaceFilter = null;
    this.voiceBus = null;
    this.ambienceBus = null;
    this.sfxBus = null;
    this.master = null;
    this.noiseBuffer = null;
    void this.ctx?.close();
    this.ctx = null;
    this.unlocked = false;
    this.lifecycleSuspended = false;
  }

  private trigger(
    requestedName: SfxName,
    volume: number,
    pitch: number,
    x: number | null,
    z: number | null,
    positionalRequested: boolean,
    priorityBoost = 0,
  ): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.isMuted || this.lifecycleSuspended) return;
    const semantic = this.semanticName(requestedName);
    const def = SFX[semantic];
    const now = ctx.currentTime;
    this.trimVoices();

    const last = this.lastPlayed.get(semantic) ?? -Infinity;
    if (now - last < def.cooldown) {
      this.droppedByCooldown++;
      return;
    }
    const sameEvent = this.activeVoices.filter((voice) => voice.event === semantic).length;
    if (sameEvent >= def.concurrency) {
      this.droppedByConcurrency++;
      return;
    }

    const priority = def.priority + priorityBoost;
    if (this.activeVoices.length >= TOTAL_CONCURRENCY_CAP) {
      let victim: ActiveVoice | null = null;
      for (const voice of this.activeVoices) {
        if (voice.priority >= priority) continue;
        if (!victim || voice.priority < victim.priority || (voice.priority === victim.priority && voice.startedAt < victim.startedAt)) {
          victim = voice;
        }
      }
      if (!victim) {
        this.droppedByConcurrency++;
        return;
      }
      this.stopVoice(victim);
    }

    const variation = this.selectVariation(semantic, def.variations.length);
    const recipe = def.variations[variation];
    const randomPitch = pitch * (1 + (Math.random() * 2 - 1) * def.pitchJitter);
    const randomVolume = Math.max(0, volume * (1 + (Math.random() * 2 - 1) * def.volumeJitter));
    const positional = positionalRequested && def.positional && x !== null && z !== null;
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = randomVolume;
    const nodes: AudioNode[] = [voiceGain];

    if (positional) {
      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = POSITION_REF_DISTANCE;
      panner.maxDistance = POSITION_MAX_DISTANCE;
      panner.rolloffFactor = POSITION_ROLLOFF;
      panner.positionX.value = x;
      panner.positionY.value = 0;
      panner.positionZ.value = z;
      voiceGain.connect(panner);
      panner.connect(bus);
      nodes.push(panner);
    } else {
      voiceGain.connect(bus);
    }

    const rendered = this.renderRecipe(recipe, voiceGain, now, randomPitch);
    const voice: ActiveVoice = {
      id: this.nextVoiceId++,
      event: semantic,
      requestedName,
      variation,
      priority,
      positional,
      startedAt: now,
      endsAt: now + rendered.duration,
      gain: randomVolume,
      pitch: randomPitch,
      x: positional ? x : null,
      z: positional ? z : null,
      sources: rendered.sources,
      nodes: [...nodes, ...rendered.nodes],
    };
    this.activeVoices.push(voice);
    this.lastPlayed.set(semantic, now);
  }

  private semanticName(name: SfxName): CoreSfxName {
    if (name in SFX) return name as CoreSfxName;
    if (name === "footstep") return "squadMelee";
    return ALIASES[name] ?? "enemyHit";
  }

  private selectVariation(name: CoreSfxName, count: number): number {
    if (count <= 1) return 0;
    const previous = this.lastVariation.get(name) ?? -1;
    let pick = Math.floor(Math.random() * (count - 1));
    if (pick >= previous) pick++;
    pick %= count;
    this.lastVariation.set(name, pick);
    return pick;
  }

  private renderRecipe(
    recipe: VariationRecipe,
    destination: AudioNode,
    at: number,
    pitch: number,
  ): { sources: AudioScheduledSourceNode[]; nodes: AudioNode[]; duration: number } {
    const sources: AudioScheduledSourceNode[] = [];
    const nodes: AudioNode[] = [];
    const duration = recipe.duration;

    switch (recipe.kind) {
      case "whoosh": {
        const noise = this.makeNoise(destination, at, duration, 0.22, recipe.colour * pitch, "bandpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        const tone = this.makeTone(destination, at, "triangle", recipe.tone * pitch, Math.max(45, recipe.tone * 0.35 * pitch), duration, 0.09);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "impact": {
        const noise = this.makeNoise(destination, at, duration, 0.28, recipe.colour * pitch, "lowpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        const tone = this.makeTone(destination, at, "sine", recipe.tone * pitch, Math.max(30, recipe.tone * 0.45 * pitch), duration, 0.22);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "shot": {
        const noise = this.makeNoise(destination, at, duration, 0.3, recipe.colour * pitch, "highpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        const tone = this.makeTone(destination, at, "square", recipe.tone * pitch, Math.max(55, recipe.tone * 0.3 * pitch), duration * 0.75, 0.18);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "death": {
        const noise = this.makeNoise(destination, at, duration, 0.2, recipe.colour * pitch, "bandpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        const tone = this.makeTone(destination, at, "triangle", recipe.tone * pitch, 70 * pitch, duration, 0.12);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "magic": {
        const a = this.makeTone(destination, at, "sine", recipe.tone * pitch, recipe.tone * 0.55 * pitch, duration, 0.11);
        const b = this.makeTone(destination, at + 0.035, "triangle", recipe.tone * 1.5 * pitch, recipe.tone * 0.8 * pitch, duration * 0.8, 0.06);
        sources.push(a.source, b.source); nodes.push(a.gain, b.gain);
        const noise = this.makeNoise(destination, at, duration * 0.8, 0.08, recipe.colour * pitch, "highpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        break;
      }
      case "explosion": {
        const noise = this.makeNoise(destination, at, duration, 0.42, recipe.colour * pitch, "lowpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        const tone = this.makeTone(destination, at, "sine", recipe.tone * pitch, 28 * pitch, duration, 0.34);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "build": {
        const tone = this.makeTone(destination, at, "square", recipe.tone * pitch, recipe.tone * 1.25 * pitch, duration, 0.09);
        const noise = this.makeNoise(destination, at, duration * 0.7, 0.16, recipe.colour, "bandpass");
        sources.push(tone.source, noise.source); nodes.push(tone.gain, noise.filter, noise.gain);
        break;
      }
      case "confirm": {
        const a = this.makeTone(destination, at, "sine", recipe.tone, recipe.tone, duration * 0.7, 0.07);
        const b = this.makeTone(destination, at + 0.07, "sine", recipe.tone * 1.33, recipe.tone * 1.33, duration * 0.55, 0.06);
        sources.push(a.source, b.source); nodes.push(a.gain, b.gain);
        break;
      }
      case "error": {
        const tone = this.makeTone(destination, at, "square", recipe.tone, recipe.tone * 0.62, duration, 0.09);
        sources.push(tone.source); nodes.push(tone.gain);
        break;
      }
      case "step": {
        const noise = this.makeNoise(destination, at, duration, 0.08, recipe.colour, "lowpass");
        sources.push(noise.source); nodes.push(noise.filter, noise.gain);
        break;
      }
    }
    return { sources, nodes, duration };
  }

  private makeTone(
    destination: AudioNode,
    at: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    level: number,
  ): { source: OscillatorNode; gain: GainNode } {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), at + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, level), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(destination);
    osc.start(at);
    osc.stop(at + duration + 0.01);
    return { source: osc, gain };
  }

  private makeNoise(
    destination: AudioNode,
    at: number,
    duration: number,
    level: number,
    frequency: number,
    filterType: BiquadFilterType,
  ): { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = Math.max(80, frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, level), at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start(at, Math.random() * 0.8);
    source.stop(at + duration + 0.01);
    return { source, filter, gain };
  }

  private trimVoices(): void {
    const now = this.ctx?.currentTime ?? Infinity;
    for (let i = this.activeVoices.length - 1; i >= 0; i--) {
      const voice = this.activeVoices[i];
      if (voice.endsAt > now) continue;
      this.disconnectVoice(voice);
      this.activeVoices.splice(i, 1);
    }
  }

  private stopVoice(voice: ActiveVoice): void {
    for (const source of voice.sources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.disconnectVoice(voice);
    const index = this.activeVoices.indexOf(voice);
    if (index >= 0) this.activeVoices.splice(index, 1);
  }

  private disconnectVoice(voice: ActiveVoice): void {
    for (const node of voice.nodes) {
      try { node.disconnect(); } catch { /* already disconnected */ }
    }
  }

  private createGraph(): void {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.contextCreateCount++;

    this.master = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.ambienceBus = ctx.createGain();
    this.voiceBus = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfxBus.connect(this.master);
    this.ambienceBus.connect(this.sfxBus);
    this.voiceBus.connect(this.master);
    this.ambienceBus.gain.value = 0.18;
    this.voiceBus.gain.value = 1;

    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.025 * white) / 1.025;
      data[i] = Math.max(-1, Math.min(1, brown * 3.2));
    }
    this.noiseBuffer = buffer;
    this.setListenerPosition(this.listenerX, this.listenerZ);
    this.applyMix();
  }

  private startAmbienceLoops(): void {
    const ctx = this.ctx;
    const bus = this.ambienceBus;
    if (!ctx || !bus || !this.noiseBuffer || this.ambienceSources.length > 0) return;

    const furnaceGain = ctx.createGain();
    furnaceGain.gain.value = this.furnaceLevel >= 2 ? 0.048 : 0.032;
    furnaceGain.connect(bus);
    const furnaceFilter = ctx.createBiquadFilter();
    furnaceFilter.type = "lowpass";
    furnaceFilter.frequency.value = this.furnaceLevel >= 2 ? 430 : 300;
    furnaceFilter.connect(furnaceGain);
    this.furnaceGain = furnaceGain;
    this.furnaceFilter = furnaceFilter;

    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = this.furnaceLevel >= 2 ? 58 : 48;
    hum.connect(furnaceFilter);
    hum.start();
    this.ambienceSources.push(hum);

    const crackle = ctx.createBufferSource();
    crackle.buffer = this.noiseBuffer;
    crackle.loop = true;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "bandpass";
    crackleFilter.frequency.value = 720;
    crackleFilter.Q.value = 0.7;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.055;
    crackle.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    crackleGain.connect(furnaceFilter);
    crackle.start();
    this.ambienceSources.push(crackle);

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 980;
    windFilter.Q.value = 0.45;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.065;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(bus);
    wind.start(0, 0.6);
    this.ambienceSources.push(wind);
  }

  private applyMix(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus) return;
    const t = ctx.currentTime;
    const silent = audioMixSettings.isMuted || this.transientMuted;
    this.master.gain.setTargetAtTime(silent ? 0 : audioMixSettings.masterGain, t, 0.04);
    this.sfxBus.gain.setTargetAtTime(audioMixSettings.sfxGain, t, 0.04);
  }

  private suspendForLifecycle(): void {
    if (this.lifecycleSuspended) return;
    this.lifecycleSuspended = true;
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  private resumeFromLifecycle(): void {
    if (!this.lifecycleSuspended || document.hidden) return;
    this.lifecycleSuspended = false;
    if (this.ctx && this.unlocked && this.ctx.state === "suspended") void this.ctx.resume();
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

  private installVerificationApi(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get("audioVerification") !== "1" && params.get("sfxVerification") !== "1") return;
    const target = window as unknown as {
      frostboundSfx?: {
        unlock(): void;
        play(name: SfxName, volume?: number, pitch?: number): void;
        playAt(name: SfxName, x: number, z: number, volume?: number, pitch?: number, priorityBoost?: number): void;
        setListenerPosition(x: number, z: number): void;
        setMasterVolumePercent(percent: number): void;
        setSfxVolumePercent(percent: number): void;
        setUserMuted(muted: boolean): void;
        attenuationForDistance(distance: number): number;
        snapshot(): SfxRuntimeSnapshot;
        dispose(): void;
      };
    };
    target.frostboundSfx = {
      unlock: () => this.unlock(),
      play: (name, volume, pitch) => this.play(name, volume, pitch),
      playAt: (name, x, z, volume, pitch, priorityBoost) => this.playAt(name, x, z, volume, pitch, priorityBoost),
      setListenerPosition: (x, z) => this.setListenerPosition(x, z),
      setMasterVolumePercent: (percent) => this.setMasterVolumePercent(percent),
      setSfxVolumePercent: (percent) => this.setSfxVolumePercent(percent),
      setUserMuted: (muted) => this.setUserMuted(muted),
      attenuationForDistance: (distance) => this.attenuationForDistance(distance),
      snapshot: () => this.snapshot(),
      dispose: () => this.dispose(),
    };
  }
}
