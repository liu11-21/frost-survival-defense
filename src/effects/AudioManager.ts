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
  | "buildComplete"
  | "uiConfirm"
  | "uiError"
  | "footstep"
  | "enemyAttack"
  | "healing"
  | "teleport"
  | "waveStart"
  | "bossSpawn"
  | "furnaceUpgrade"
  | "victory"
  | "defeat"
  | "gatherWood"
  | "gatherStone"
  | "bossWindup"
  | "bossSlam"
  | "commanderHorn"
  | "heroSkillFrost"
  | "heroSkillBarrage"
  | "heroSkillRally"
  | "heroDown"
  | "heroRevive";

export type SfxName = CoreSfxName
  | "heroRanged"
  | "heroMelee"
  | "allyAttack"
  | "medicHeal"
  | "assaultTeleport"
  | "towerFire"
  | "wallHit"
  | "buildingDestroyed"
  | "coinPickup"
  | "furnaceDamaged"
  | "furnaceHeal"
  | "buildStage"
  | "buildFail"
  | "engineerRepair"
  | "musketFire"
  | "frostCast"
  | "bossSlamWindup"
  | "freezeZoneSlam"
  | "armorBreak"
  | "bomberWarn"
  | "bomberBlast";

type RecipeKind =
  | "whoosh"
  | "impact"
  | "shot"
  | "death"
  | "magic"
  | "explosion"
  | "build"
  | "complete"
  | "confirm"
  | "error"
  | "step"
  | "enemyAttack"
  | "heal"
  | "teleport"
  | "wave"
  | "boss"
  | "upgrade"
  | "victory"
  | "defeat"
  | "wood"
  | "stone"
  | "windup"
  | "slam"
  | "horn"
  | "frostSkill"
  | "barrageSkill"
  | "rallySkill"
  | "down"
  | "revive";

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
  buildComplete: {
    variations: [V("complete", 392, 1500, 0.62), V("complete", 440, 1800, 0.58)],
    cooldown: 0.12, concurrency: 2, priority: 82, positional: false, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  uiConfirm: {
    variations: [V("confirm", 587, 0, 0.2)],
    cooldown: 0.04, concurrency: 2, priority: 85, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  uiError: {
    variations: [V("error", 240, 0, 0.2)],
    cooldown: 0.05, concurrency: 2, priority: 88, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  footstep: {
    variations: [V("step", 0, 780, 0.085), V("step", 0, 920, 0.075), V("step", 0, 680, 0.095)],
    cooldown: 0.065, concurrency: 2, priority: 28, positional: false, pitchJitter: 0.025, volumeJitter: 0.04,
  },
  enemyAttack: {
    variations: [V("enemyAttack", 170, 980, 0.13), V("enemyAttack", 205, 1160, 0.12)],
    cooldown: 0.03, concurrency: 4, priority: 44, positional: true, pitchJitter: 0.035, volumeJitter: 0.045,
  },
  healing: {
    variations: [V("heal", 659, 0, 0.32), V("heal", 740, 0, 0.29)],
    cooldown: 0.05, concurrency: 3, priority: 62, positional: true, pitchJitter: 0.02, volumeJitter: 0.035,
  },
  teleport: {
    variations: [V("teleport", 1380, 3200, 0.3), V("teleport", 1180, 2800, 0.34)],
    cooldown: 0.08, concurrency: 2, priority: 68, positional: true, pitchJitter: 0.025, volumeJitter: 0.04,
  },
  waveStart: {
    variations: [V("wave", 220, 500, 0.85)],
    cooldown: 0.35, concurrency: 1, priority: 76, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  bossSpawn: {
    variations: [V("boss", 60, 380, 1.8)],
    cooldown: 0.8, concurrency: 1, priority: 100, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  furnaceUpgrade: {
    variations: [V("upgrade", 120, 900, 1.05), V("upgrade", 145, 1150, 0.95)],
    cooldown: 0.3, concurrency: 1, priority: 86, positional: false, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  victory: {
    variations: [V("victory", 523, 0, 1.2)],
    cooldown: 0.8, concurrency: 1, priority: 96, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  defeat: {
    variations: [V("defeat", 220, 0, 1.45)],
    cooldown: 0.8, concurrency: 1, priority: 96, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  gatherWood: {
    variations: [V("wood", 260, 1400, 0.12), V("wood", 235, 1220, 0.14)],
    cooldown: 0.055, concurrency: 2, priority: 35, positional: false, pitchJitter: 0.03, volumeJitter: 0.04,
  },
  gatherStone: {
    variations: [V("stone", 180, 900, 0.13), V("stone", 205, 1040, 0.12)],
    cooldown: 0.055, concurrency: 2, priority: 35, positional: false, pitchJitter: 0.025, volumeJitter: 0.04,
  },
  bossWindup: {
    variations: [V("windup", 70, 0, 0.9)],
    cooldown: 0.15, concurrency: 1, priority: 92, positional: true, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  bossSlam: {
    variations: [V("slam", 58, 420, 0.82), V("slam", 66, 520, 0.76)],
    cooldown: 0.12, concurrency: 2, priority: 98, positional: false, pitchJitter: 0.018, volumeJitter: 0.03,
  },
  commanderHorn: {
    variations: [V("horn", 220, 0, 0.55), V("horn", 196, 0, 0.62)],
    cooldown: 0.2, concurrency: 2, priority: 82, positional: true, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  heroSkillFrost: {
    variations: [V("frostSkill", 880, 3600, 0.78), V("frostSkill", 990, 4200, 0.72)],
    cooldown: 0.16, concurrency: 1, priority: 95, positional: false, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  heroSkillBarrage: {
    variations: [V("barrageSkill", 160, 1900, 0.72), V("barrageSkill", 185, 2250, 0.66)],
    cooldown: 0.12, concurrency: 2, priority: 94, positional: false, pitchJitter: 0.018, volumeJitter: 0.03,
  },
  heroSkillRally: {
    variations: [V("rallySkill", 220, 900, 0.88), V("rallySkill", 196, 1100, 0.82)],
    cooldown: 0.18, concurrency: 1, priority: 94, positional: false, pitchJitter: 0.015, volumeJitter: 0.025,
  },
  heroDown: {
    variations: [V("down", 220, 0, 0.68)],
    cooldown: 0.4, concurrency: 1, priority: 96, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
  heroRevive: {
    variations: [V("revive", 392, 0, 0.5)],
    cooldown: 0.4, concurrency: 1, priority: 96, positional: false, pitchJitter: 0, volumeJitter: 0,
  },
};

type LegacyAliasName = Exclude<SfxName, CoreSfxName>;

/**
 * Exhaustive compatibility map for pre-V1 call sites. Only genuinely related
 * sound families are aliased; high-salience legacy events have their own
 * semantic definition above. Adding a new legacy name without auditing it is a
 * TypeScript error instead of silently falling back to a random combat sound.
 */
const ALIASES: Record<LegacyAliasName, CoreSfxName> = {
  heroMelee: "heroMeleeSwing",
  heroRanged: "heroRangedShot",
  allyAttack: "squadMelee",
  medicHeal: "healing",
  assaultTeleport: "teleport",
  towerFire: "squadGunshot",
  wallHit: "enemyHit",
  buildingDestroyed: "artilleryExplosion",
  coinPickup: "uiConfirm",
  furnaceDamaged: "enemyHit",
  furnaceHeal: "healing",
  buildStage: "buildPlace",
  buildFail: "uiError",
  engineerRepair: "buildPlace",
  musketFire: "squadGunshot",
  frostCast: "magicAttack",
  bossSlamWindup: "bossWindup",
  freezeZoneSlam: "artilleryExplosion",
  armorBreak: "enemyHit",
  bomberWarn: "uiError",
  bomberBlast: "artilleryExplosion",
};

const VARIATION_COUNTS = Object.fromEntries(
  Object.entries(SFX).map(([name, def]) => [name, def.variations.length]),
) as Record<CoreSfxName, number>;

/**
 * Gameplay SFX V1. One reusable WebAudio graph owns SFX, ambience and a reserved
 * voice bus. Semantic events use bounded variation pools, priority/concurrency,
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
    this.unsubscribeMix();
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
    return ALIASES[name as LegacyAliasName];
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
    const addTone = (type: OscillatorType, start: number, end: number, d: number, level: number, offset = 0): void => {
      const tone = this.makeTone(destination, at + offset, type, start, end, d, level);
      sources.push(tone.source); nodes.push(tone.gain);
    };
    const addNoise = (d: number, level: number, frequency: number, type: BiquadFilterType, offset = 0): void => {
      const noise = this.makeNoise(destination, at + offset, d, level, frequency, type);
      sources.push(noise.source); nodes.push(noise.filter, noise.gain);
    };

    switch (recipe.kind) {
      case "whoosh":
        addNoise(duration, 0.22, recipe.colour * pitch, "bandpass");
        addTone("triangle", recipe.tone * pitch, Math.max(45, recipe.tone * 0.35 * pitch), duration, 0.09);
        break;
      case "impact":
        addNoise(duration, 0.28, recipe.colour * pitch, "lowpass");
        addTone("sine", recipe.tone * pitch, Math.max(30, recipe.tone * 0.45 * pitch), duration, 0.22);
        break;
      case "shot":
        addNoise(duration, 0.3, recipe.colour * pitch, "highpass");
        addTone("square", recipe.tone * pitch, Math.max(55, recipe.tone * 0.3 * pitch), duration * 0.75, 0.18);
        break;
      case "death":
        addNoise(duration, 0.2, recipe.colour * pitch, "bandpass");
        addTone("triangle", recipe.tone * pitch, 70 * pitch, duration, 0.12);
        break;
      case "magic":
        addTone("sine", recipe.tone * pitch, recipe.tone * 0.55 * pitch, duration, 0.11);
        addTone("triangle", recipe.tone * 1.5 * pitch, recipe.tone * 0.8 * pitch, duration * 0.8, 0.06, 0.035);
        addNoise(duration * 0.8, 0.08, recipe.colour * pitch, "highpass");
        break;
      case "explosion":
        addNoise(duration, 0.42, recipe.colour * pitch, "lowpass");
        addTone("sine", recipe.tone * pitch, 28 * pitch, duration, 0.34);
        break;
      case "build":
        addTone("square", recipe.tone * pitch, recipe.tone * 1.25 * pitch, duration, 0.09);
        addNoise(duration * 0.7, 0.16, recipe.colour, "bandpass");
        break;
      case "complete":
        addTone("square", recipe.tone * 0.55 * pitch, recipe.tone * 0.34 * pitch, 0.18, 0.1);
        addNoise(0.18, 0.14, recipe.colour * pitch, "bandpass");
        addTone("sine", recipe.tone * pitch, recipe.tone * pitch, 0.34, 0.07, 0.12);
        addTone("sine", recipe.tone * 1.5 * pitch, recipe.tone * 1.5 * pitch, 0.24, 0.055, 0.24);
        break;
      case "confirm":
        addTone("sine", recipe.tone, recipe.tone, duration * 0.7, 0.07);
        addTone("sine", recipe.tone * 1.33, recipe.tone * 1.33, duration * 0.55, 0.06, 0.07);
        break;
      case "error":
        addTone("square", recipe.tone, recipe.tone * 0.62, duration, 0.09);
        break;
      case "step":
        addNoise(duration, 0.085, recipe.colour * pitch, "lowpass");
        break;
      case "enemyAttack":
        addNoise(duration, 0.14, recipe.colour * pitch, "bandpass");
        addTone("triangle", recipe.tone * pitch, recipe.tone * 0.58 * pitch, duration, 0.07);
        break;
      case "heal":
        addTone("sine", recipe.tone * pitch, recipe.tone * 1.05 * pitch, duration, 0.055);
        addTone("sine", recipe.tone * 1.34 * pitch, recipe.tone * 1.4 * pitch, duration * 0.72, 0.045, 0.055);
        break;
      case "teleport":
        addTone("sawtooth", recipe.tone * pitch, 220 * pitch, duration, 0.1);
        addNoise(duration * 0.8, 0.11, recipe.colour * pitch, "highpass");
        break;
      case "wave":
        addTone("sine", recipe.tone, recipe.tone, duration, 0.075);
        addTone("sine", recipe.tone * 1.26, recipe.tone * 1.26, duration * 0.9, 0.065, 0.06);
        addTone("sine", recipe.tone * 1.5, recipe.tone * 1.5, duration * 0.8, 0.055, 0.12);
        addNoise(duration, 0.07, recipe.colour, "lowpass");
        break;
      case "boss":
        addTone("sine", recipe.tone, 38, duration, 0.42);
        addTone("sawtooth", recipe.tone * 2.15, 46, duration * 0.8, 0.12);
        addNoise(duration, 0.16, recipe.colour, "lowpass");
        break;
      case "upgrade":
        addTone("sine", 52, 38, duration, 0.22);
        addTone("triangle", recipe.tone, recipe.tone * 2.25, duration * 0.72, 0.09, 0.08);
        addNoise(duration * 0.75, 0.1, recipe.colour, "bandpass");
        break;
      case "victory":
        addTone("sine", recipe.tone, recipe.tone, duration * 0.78, 0.08);
        addTone("sine", recipe.tone * 1.26, recipe.tone * 1.26, duration * 0.68, 0.075, 0.12);
        addTone("sine", recipe.tone * 1.5, recipe.tone * 1.5, duration * 0.58, 0.07, 0.24);
        addTone("sine", recipe.tone * 2, recipe.tone * 2, duration * 0.48, 0.06, 0.36);
        break;
      case "defeat":
        addTone("triangle", recipe.tone, recipe.tone * 0.72, duration, 0.11);
        addTone("sine", recipe.tone * 1.19, recipe.tone * 0.55, duration * 0.82, 0.07, 0.1);
        break;
      case "wood":
        addTone("triangle", recipe.tone * pitch, recipe.tone * 0.46 * pitch, duration, 0.12);
        addNoise(duration * 0.8, 0.12, recipe.colour * pitch, "bandpass");
        break;
      case "stone":
        addTone("square", recipe.tone * pitch, recipe.tone * 0.5 * pitch, duration * 0.75, 0.08);
        addNoise(duration, 0.18, recipe.colour * pitch, "bandpass");
        break;
      case "windup":
        addTone("sawtooth", recipe.tone * pitch, recipe.tone * 2.2 * pitch, duration, 0.13);
        break;
      case "slam":
        addNoise(duration * 0.9, 0.48, recipe.colour * pitch, "lowpass");
        addTone("sine", recipe.tone * pitch, 24 * pitch, duration, 0.42);
        addTone("square", recipe.tone * 3 * pitch, recipe.tone * 0.9 * pitch, 0.14, 0.12);
        addNoise(0.18, 0.18, recipe.colour * 2 * pitch, "bandpass", 0.035);
        break;
      case "horn":
        addTone("sawtooth", recipe.tone * pitch, recipe.tone * 1.18 * pitch, duration, 0.1);
        addTone("sine", recipe.tone * 0.5 * pitch, recipe.tone * 0.55 * pitch, duration * 0.9, 0.055);
        break;
      case "frostSkill":
        addNoise(duration * 0.75, 0.12, recipe.colour * pitch, "highpass");
        addTone("sine", recipe.tone * 1.6 * pitch, recipe.tone * 0.8 * pitch, duration * 0.72, 0.085);
        addTone("triangle", recipe.tone * 2.15 * pitch, recipe.tone * 1.2 * pitch, duration * 0.55, 0.065, 0.08);
        addTone("sine", recipe.tone * 0.5 * pitch, recipe.tone * 1.1 * pitch, duration * 0.5, 0.06, 0.18);
        break;
      case "barrageSkill":
        addTone("sine", recipe.tone * 0.55 * pitch, 34 * pitch, duration, 0.22);
        addNoise(0.16, 0.22, recipe.colour * pitch, "highpass");
        addNoise(0.16, 0.2, recipe.colour * 1.1 * pitch, "highpass", 0.12);
        addNoise(0.16, 0.18, recipe.colour * 1.2 * pitch, "highpass", 0.24);
        addTone("square", recipe.tone * 4 * pitch, recipe.tone * 1.2 * pitch, 0.15, 0.1);
        addTone("square", recipe.tone * 4.4 * pitch, recipe.tone * 1.3 * pitch, 0.15, 0.09, 0.12);
        addTone("square", recipe.tone * 4.8 * pitch, recipe.tone * 1.4 * pitch, 0.15, 0.08, 0.24);
        break;
      case "rallySkill":
        addTone("sawtooth", recipe.tone * pitch, recipe.tone * 1.12 * pitch, duration * 0.72, 0.11);
        addTone("sine", recipe.tone * 0.5 * pitch, recipe.tone * 0.58 * pitch, duration * 0.7, 0.06);
        addTone("sine", recipe.tone * 1.5 * pitch, recipe.tone * 1.5 * pitch, 0.35, 0.06, 0.18);
        addNoise(duration * 0.62, 0.07, recipe.colour * pitch, "bandpass");
        break;
      case "down":
        addTone("sawtooth", recipe.tone, 60, duration, 0.15);
        break;
      case "revive":
        addTone("sine", recipe.tone, recipe.tone, duration, 0.055);
        addTone("sine", recipe.tone * 1.33, recipe.tone * 1.33, duration * 0.85, 0.05, 0.06);
        addTone("sine", recipe.tone * 1.68, recipe.tone * 1.68, duration * 0.7, 0.045, 0.12);
        break;
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
