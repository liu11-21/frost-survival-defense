import type { SquadManager } from "../combat/SquadManager";
import { MAP } from "../data/BuildSlotDefinitions";
import type { PerformanceMonitor } from "./PerformanceMonitor";

export const STRESS_PRESETS = [50, 100, 150, 250, 400] as const;
export type StressPreset = (typeof STRESS_PRESETS)[number];

/** Auto-recording length, per the spec. */
const RECORD_SECONDS = 30;

/** Composition kept representative: melee, ranged, tanks and support all fight. */
const ENEMY_MIX = ["grunt", "slinger", "bruiser", "marksman"];
const ALLY_MIX = ["warrior", "archer", "shield", "medic"];

/**
 * Spawns a controlled load of units that genuinely fight.
 *
 * The point is to measure the real cost of the simulation — targeting, steering,
 * projectiles, healing and taunts all run exactly as in a normal wave, because
 * a field of stationary models would prove nothing.
 */
export class StressTestController {
  private running = false;
  private target = 0;
  private elapsed = 0;
  private autoStop = true;

  onFinished: (() => void) | null = null;

  constructor(
    private readonly squads: SquadManager,
    private readonly monitor: PerformanceMonitor,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }
  get targetUnits(): number {
    return this.target;
  }
  get recordingElapsed(): number {
    return this.elapsed;
  }

  /** Spawns `count` fighting units split between the two sides. */
  start(count: StressPreset | number, autoStop = true): void {
    this.stop();
    this.target = count;
    this.autoStop = autoStop;
    this.elapsed = 0;
    this.running = true;
    // Any run that has seen a stress test can never be ranked.
    this.monitor.tagStressTest();
    this.monitor.startRecording();

    // Two thirds hostile so the defenders have plenty to do.
    const enemyCount = Math.round(count * 0.65);
    const allyCount = count - enemyCount;
    this.spawnEnemies(enemyCount);
    this.spawnAllies(allyCount);
  }

  private spawnEnemies(count: number): void {
    let spawned = 0;
    let i = 0;
    while (spawned < count && i < count * 4) {
      const id = ENEMY_MIX[i % ENEMY_MIX.length];
      const angle = (i / 12) * Math.PI * 2 + i * 0.11;
      const radius = MAP.wallRadius + 2 + (i % 5) * 1.4;
      const squad = this.squads.spawnEnemy(
        id,
        Math.sin(angle) * radius,
        Math.cos(angle) * radius,
        i % 4,
      );
      spawned += squad ? squad.members.length : 0;
      i++;
    }
  }

  private spawnAllies(count: number): void {
    let spawned = 0;
    let i = 0;
    while (spawned < count && i < count * 4) {
      const id = ALLY_MIX[i % ALLY_MIX.length];
      const angle = (i / 8) * Math.PI * 2;
      const radius = 3 + (i % 4) * 1.5;
      const squad = this.squads.recruit(id, Math.sin(angle) * radius, Math.cos(angle) * radius);
      spawned += squad ? squad.members.length : 0;
      i++;
    }
  }

  update(dt: number): void {
    if (!this.running) return;
    this.elapsed += dt;
    if (this.autoStop && this.elapsed >= RECORD_SECONDS) {
      this.monitor.stopRecording();
      this.running = false;
      this.onFinished?.();
    }
  }

  stop(): void {
    if (this.running) this.monitor.stopRecording();
    this.running = false;
    this.elapsed = 0;
  }

  /** Removes every unit the test created, leaving the run playable. */
  clearUnits(): void {
    this.stop();
    this.squads.clearAll();
  }
}
