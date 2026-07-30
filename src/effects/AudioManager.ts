import { AUDIO } from "../game/GameConfig";

export type SfxName =
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
  | "enemyDeath"
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
  | "uiConfirm"
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

/**
 * All audio is synthesised with the Web Audio API — no external assets, no
 * network fetches. Every sound is a short function of oscillators and filtered
 * noise, so replacing this with sample playback later only means swapping the
 * body of `play()`.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private furnaceGain: GainNode | null = null;
  private furnaceFilter: BiquadFilterNode | null = null;
  private muted = false;
  private lastPlayed = new Map<SfxName, number>();

  /** Must be called from a user gesture so browsers allow playback. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.masterVolume;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = AUDIO.sfxVolume;
    this.sfxBus.connect(this.master);

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = AUDIO.ambientVolume;
    this.ambientBus.connect(this.master);

    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    this.noiseBuffer = buffer;

    this.startFurnaceLoop();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.masterVolume, this.ctx.currentTime, 0.08);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Furnace hum gets louder and lower after the upgrade. */
  setFurnaceLevel(level: number): void {
    if (!this.ctx || !this.furnaceGain || !this.furnaceFilter) return;
    const t = this.ctx.currentTime;
    this.furnaceGain.gain.setTargetAtTime(level >= 2 ? 0.9 : 0.45, t, 0.6);
    this.furnaceFilter.frequency.setTargetAtTime(level >= 2 ? 520 : 320, t, 0.6);
  }

  play(name: SfxName, volume = 1, pitch = 1): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus || this.muted) return;

    // simple retrigger guard so rapid events never stack into a click storm
    const now = ctx.currentTime;
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.035) return;
    this.lastPlayed.set(name, now);

    switch (name) {
      case "footstep":
        this.noise(bus, now, 0.09, volume * 0.14, 900 * pitch, "lowpass", 0.004);
        break;
      case "heroRanged":
        this.tone(bus, now, "triangle", 720 * pitch, 340 * pitch, 0.1, volume * 0.09);
        this.noise(bus, now, 0.07, volume * 0.1, 2600, "highpass", 0.002);
        break;
      case "heroMelee":
        this.tone(bus, now, "triangle", 240 * pitch, 90 * pitch, 0.16, volume * 0.22);
        this.noise(bus, now, 0.12, volume * 0.22, 1500, "bandpass", 0.003);
        break;
      case "heroDown":
        this.tone(bus, now, "sawtooth", 220, 60, 0.7, volume * 0.22);
        break;
      case "heroRevive":
        this.chord(bus, now, [392, 523, 659], 0.5, volume * 0.12);
        break;
      case "allyAttack":
        this.noise(bus, now, 0.08, volume * 0.1, 1800 * pitch, "bandpass", 0.002);
        break;
      case "enemyAttack":
        this.noise(bus, now, 0.09, volume * 0.09, 900 * pitch, "bandpass", 0.002);
        break;
      case "medicHeal":
        this.chord(bus, now, [659, 880], 0.34, volume * 0.07);
        break;
      case "assaultTeleport":
        this.tone(bus, now, "sawtooth", 1400, 220, 0.3, volume * 0.12);
        this.noise(bus, now, 0.24, volume * 0.14, 3200, "highpass", 0.002);
        break;
      case "towerFire":
        this.tone(bus, now, "square", 180 * pitch, 62 * pitch, 0.22, volume * 0.2);
        this.noise(bus, now, 0.2, volume * 0.2, 700, "lowpass", 0.003);
        break;
      case "wallHit":
        this.noise(bus, now, 0.16, volume * 0.2, 640, "lowpass", 0.003);
        break;
      case "buildingDestroyed":
        this.tone(bus, now, "sawtooth", 140, 44, 0.8, volume * 0.3);
        this.noise(bus, now, 0.9, volume * 0.28, 520, "lowpass", 0.01);
        break;
      case "enemyDeath":
        this.noise(bus, now, 0.2, volume * 0.14, 1300 * pitch, "bandpass", 0.003);
        this.tone(bus, now, "triangle", 300 * pitch, 110 * pitch, 0.2, volume * 0.08);
        break;
      case "coinPickup":
        this.chord(bus, now, [988, 1319], 0.16, volume * 0.06);
        break;
      case "waveStart":
        this.chord(bus, now, [220, 277, 330], 0.9, volume * 0.14);
        this.noise(bus, now, 1.0, volume * 0.1, 500, "lowpass", 0.06);
        break;
      case "bossSpawn":
        this.tone(bus, now, "sine", 60, 38, 2.2, volume * 0.5);
        this.tone(bus, now, "sawtooth", 130, 46, 1.6, volume * 0.16);
        this.noise(bus, now, 1.8, volume * 0.2, 380, "lowpass", 0.05);
        break;
      case "furnaceDamaged":
        this.tone(bus, now, "square", 150, 70, 0.3, volume * 0.2);
        this.noise(bus, now, 0.3, volume * 0.2, 900, "lowpass", 0.004);
        break;
      case "furnaceHeal":
        this.chord(bus, now, [330, 494], 0.4, volume * 0.05);
        break;
      case "furnaceUpgrade":
        this.tone(bus, now, "sine", 52, 34, 1.9, volume * 0.5);
        this.tone(bus, now, "sawtooth", 120, 42, 1.3, volume * 0.14);
        this.noise(bus, now, 1.2, volume * 0.2, 420, "lowpass", 0.02);
        break;
      case "buildStage":
        this.tone(bus, now, "square", 300 * pitch, 460 * pitch, 0.14, volume * 0.11);
        this.noise(bus, now, 0.18, volume * 0.15, 1200, "bandpass", 0.004);
        break;
      case "buildComplete":
        this.chord(bus, now, [392, 523, 659], 0.5, volume * 0.12);
        break;
      case "defeat":
        this.chord(bus, now, [220, 262, 311], 2.4, volume * 0.2);
        break;
      case "victory":
        this.chord(bus, now, [523, 659, 784, 1047], 1.6, volume * 0.16);
        break;
      case "gatherWood":
        this.tone(bus, now, "triangle", 260 * pitch, 120 * pitch, 0.12, volume * 0.16);
        this.noise(bus, now, 0.1, volume * 0.18, 1400, "bandpass", 0.002);
        break;
      case "gatherStone":
        this.noise(bus, now, 0.13, volume * 0.22, 900 * pitch, "bandpass", 0.002);
        this.tone(bus, now, "square", 180 * pitch, 90 * pitch, 0.1, volume * 0.1);
        break;
      case "bossSlamWindup":
        this.tone(bus, now, "sawtooth", 70, 150, 1.1, volume * 0.22);
        break;
      case "bossSlam":
        this.tone(bus, now, "sine", 90, 30, 1.0, volume * 0.6);
        this.noise(bus, now, 0.7, volume * 0.35, 500, "lowpass", 0.004);
        break;
      case "buildFail":
        this.tone(bus, now, "square", 220, 150, 0.18, volume * 0.12);
        break;
      case "uiConfirm":
        this.chord(bus, now, [587, 784], 0.24, volume * 0.08);
        break;
      case "engineerRepair":
        this.tone(bus, now, "square", 520 * pitch, 780 * pitch, 0.12, volume * 0.1);
        this.noise(bus, now, 0.1, volume * 0.08, 2400, "bandpass", 0.002);
        break;
      case "musketFire":
        this.tone(bus, now, "square", 200 * pitch, 60 * pitch, 0.14, volume * 0.24);
        this.noise(bus, now, 0.16, volume * 0.26, 1100, "lowpass", 0.001);
        break;
      case "frostCast":
        this.tone(bus, now, "sine", 900 * pitch, 400 * pitch, 0.3, volume * 0.12);
        this.noise(bus, now, 0.24, volume * 0.1, 3400, "highpass", 0.004);
        break;
      case "freezeZoneSlam":
        this.tone(bus, now, "sine", 160, 40, 0.6, volume * 0.3);
        this.noise(bus, now, 0.5, volume * 0.2, 2600, "highpass", 0.006);
        break;
      case "armorBreak":
        this.noise(bus, now, 0.4, volume * 0.28, 2200, "highpass", 0.003);
        this.tone(bus, now, "square", 340, 90, 0.35, volume * 0.2);
        break;
      case "commanderHorn":
        this.tone(bus, now, "sawtooth", 220, 260, 0.6, volume * 0.18);
        break;
      case "bomberWarn":
        this.tone(bus, now, "square", 620 * pitch, 900 * pitch, 0.08, volume * 0.1);
        break;
      case "bomberBlast":
        this.tone(bus, now, "sine", 100, 28, 0.8, volume * 0.4);
        this.noise(bus, now, 0.6, volume * 0.3, 460, "lowpass", 0.004);
        break;
      case "heroSkillFrost":
        this.tone(bus, now, "sine", 1200 * pitch, 260 * pitch, 0.5, volume * 0.22);
        this.noise(bus, now, 0.4, volume * 0.18, 3600, "highpass", 0.003);
        break;
      case "heroSkillBarrage":
        this.tone(bus, now, "square", 260 * pitch, 90 * pitch, 0.16, volume * 0.2);
        this.noise(bus, now, 0.18, volume * 0.2, 1600, "bandpass", 0.001);
        break;
      case "heroSkillRally":
        this.chord(bus, now, [440, 554, 659, 880], 0.6, volume * 0.14);
        break;
    }
  }

  private tone(
    dest: AudioNode,
    at: number,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    duration: number,
    gain: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), at + duration);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + duration * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private chord(dest: AudioNode, at: number, freqs: number[], duration: number, gain: number): void {
    freqs.forEach((f, i) => {
      this.tone(dest, at + i * 0.045, "sine", f, f * 1.005, duration, gain);
    });
  }

  private noise(
    dest: AudioNode,
    at: number,
    duration: number,
    gain: number,
    frequency: number,
    filterType: BiquadFilterType,
    attack: number,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(frequency, at);
    filter.Q.value = filterType === "bandpass" ? 1.6 : 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + Math.max(0.002, attack));
    g.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(at, Math.random() * 1.5);
    src.stop(at + duration + 0.02);
  }

  private startFurnaceLoop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambientBus || !this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 320;
    filter.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.value = 0.45;

    // slow flicker so the fire never sounds like static
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.37;
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ambientBus);
    src.start();
    lfo.start();

    this.furnaceGain = gain;
    this.furnaceFilter = filter;
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
