import type { WavePhase } from "../enemies/WaveManager";
import type { GameSystems } from "../game/GameSystems";
import { audioDirector } from "./AudioDirector";

const WAVE_CLEAR_STINGER_SECONDS = 2.4;
const PRESSURE_ENTER_THRESHOLD = 0.72;
const PRESSURE_EXIT_THRESHOLD = 0.42;
const PRESSURE_ENTER_DWELL_SECONDS = 1.25;
const PRESSURE_EXIT_DWELL_SECONDS = 2.5;
const INTENSE_MIN_HOLD_SECONDS = 6;
const INTENSE_REENTRY_COOLDOWN_SECONDS = 4;
const CORE_PRESSURE_RADIUS = 16;
const CORE_PRESSURE_BUDGET = 8;

export interface AudioGameplaySnapshot {
  readonly phase: WavePhase | null;
  readonly pressure: number;
  readonly enterDwell: number;
  readonly exitDwell: number;
  readonly intenseHold: number;
  readonly reentryCooldown: number;
  readonly intermissionElapsed: number;
}

/**
 * Read-only bridge from gameplay runtime state to semantic BGM states.
 *
 * It never changes WaveManager, combat stats, targeting or spawning. The only
 * writes are AudioDirector state requests. This keeps dynamic intensity an
 * audio concern while using the real gameplay phase and live combat field.
 */
export class AudioGameplayAdapter {
  private phase: WavePhase | null = null;
  private pressure = 0;
  private enterDwell = 0;
  private exitDwell = 0;
  private intenseHold = 0;
  private reentryCooldown = 0;
  private intermissionElapsed = 0;

  constructor() {
    this.installVerificationApi();
  }

  reset(): void {
    this.phase = null;
    this.pressure = 0;
    this.enterDwell = 0;
    this.exitDwell = 0;
    this.intenseHold = 0;
    this.reentryCooldown = 0;
    this.intermissionElapsed = 0;
  }

  update(s: GameSystems, dt: number): void {
    const phase = s.waves.currentPhase;
    if (phase !== this.phase) {
      this.phase = phase;
      this.onPhaseChanged(phase);
    }

    if (phase === "intermission") {
      this.updateIntermission(dt);
      return;
    }
    if (phase === "active") {
      this.updateCombatPressure(s, dt);
      return;
    }

    this.pressure = 0;
  }

  snapshot(): AudioGameplaySnapshot {
    return {
      phase: this.phase,
      pressure: Number(this.pressure.toFixed(3)),
      enterDwell: Number(this.enterDwell.toFixed(3)),
      exitDwell: Number(this.exitDwell.toFixed(3)),
      intenseHold: Number(this.intenseHold.toFixed(3)),
      reentryCooldown: Number(this.reentryCooldown.toFixed(3)),
      intermissionElapsed: Number(this.intermissionElapsed.toFixed(3)),
    };
  }

  private onPhaseChanged(phase: WavePhase): void {
    this.enterDwell = 0;
    this.exitDwell = 0;
    this.intenseHold = 0;
    this.reentryCooldown = 0;
    this.intermissionElapsed = 0;

    if (phase === "prep") {
      audioDirector.setState("PREPARATION");
      return;
    }

    if (phase === "intermission") {
      // waveCleared has already requested WAVE_CLEAR in the same WaveManager
      // update. Keep that stinger audible briefly, then return to PREPARATION
      // only while gameplay still reports intermission.
      if (audioDirector.state !== "WAVE_CLEAR" && audioDirector.state !== "WARNING") {
        audioDirector.setState("PREPARATION");
      }
    }
  }

  private updateIntermission(dt: number): void {
    this.intermissionElapsed += dt;
    this.pressure = 0;
    if (
      audioDirector.state === "WAVE_CLEAR" &&
      this.intermissionElapsed >= WAVE_CLEAR_STINGER_SECONDS
    ) {
      audioDirector.setState("PREPARATION");
    }
  }

  private updateCombatPressure(s: GameSystems, dt: number): void {
    this.pressure = this.computePressure(s);
    this.reentryCooldown = Math.max(0, this.reentryCooldown - dt);
    this.intenseHold = Math.max(0, this.intenseHold - dt);

    // Existing boss runtime is authoritative. Pressure never downgrades a boss.
    if (s.boss.active) {
      this.enterDwell = 0;
      this.exitDwell = 0;
      this.intenseHold = INTENSE_MIN_HOLD_SECONDS;
      audioDirector.setState("INTENSE");
      return;
    }

    if (audioDirector.state === "COMBAT") {
      this.exitDwell = 0;
      if (this.reentryCooldown > 0 || this.pressure < PRESSURE_ENTER_THRESHOLD) {
        this.enterDwell = 0;
        return;
      }
      this.enterDwell += dt;
      if (this.enterDwell >= PRESSURE_ENTER_DWELL_SECONDS) {
        this.enterDwell = 0;
        this.intenseHold = INTENSE_MIN_HOLD_SECONDS;
        audioDirector.setState("INTENSE");
      }
      return;
    }

    if (audioDirector.state !== "INTENSE") {
      this.enterDwell = 0;
      this.exitDwell = 0;
      return;
    }

    if (this.intenseHold > 0 || this.pressure > PRESSURE_EXIT_THRESHOLD) {
      this.exitDwell = 0;
      return;
    }

    this.exitDwell += dt;
    if (this.exitDwell >= PRESSURE_EXIT_DWELL_SECONDS) {
      this.exitDwell = 0;
      this.reentryCooldown = INTENSE_REENTRY_COOLDOWN_SECONDS;
      audioDirector.setState("COMBAT");
    }
  }

  private computePressure(s: GameSystems): number {
    let coreLoad = 0;
    for (const enemy of s.world.enemies) {
      if (!enemy.alive) continue;
      const distance = Math.hypot(enemy.position.x, enemy.position.z);
      if (distance >= CORE_PRESSURE_RADIUS) continue;
      const proximity = 1 - distance / CORE_PRESSURE_RADIUS;
      const levelWeight = 1 + Math.max(0, enemy.level - 1) * 0.12;
      coreLoad += proximity * levelWeight;
    }

    const corePressure = Math.min(1, coreLoad / CORE_PRESSURE_BUDGET);
    const furnaceHealth = s.furnace.maxHealth > 0 ? s.furnace.health / s.furnace.maxHealth : 1;
    const furnaceRisk = Math.max(0, Math.min(1, 1 - furnaceHealth));

    // Either a genuine breach near the furnace or a badly damaged core can
    // raise intensity. Enemy stats and combat outcomes are never modified.
    return Math.max(corePressure, Math.min(1, furnaceRisk * 1.15));
  }

  private installVerificationApi(): void {
    if (new URLSearchParams(window.location.search).get("audioVerification") !== "1") return;
    const target = window as unknown as {
      frostboundAudioGameplay?: { snapshot(): AudioGameplaySnapshot };
    };
    target.frostboundAudioGameplay = { snapshot: () => this.snapshot() };
  }
}

export const audioGameplayAdapter = new AudioGameplayAdapter();
