import type { SquadManager } from "../combat/SquadManager";
import { LANES, laneSpawnPoint } from "../data/BuildSlotDefinitions";
import type { GameEvents } from "../game/GameEvents";
import { buildEndlessWave, ENEMY_INTRO, type SpawnGroup, type WaveDefinition } from "../data/WaveDefinitions";
import { previewWave, type LaneWarning } from "./WavePreview";
import { randRange } from "../util/MathUtil";

/** How long before a wave lands the lane warning goes up. */
export const PREVIEW_LEAD = 4;

export type WavePhase = "prep" | "active" | "intermission" | "finished";

export interface WaveSchedule {
  /** Hand-authored list, or null to generate endlessly. */
  waves: WaveDefinition[] | null;
  laneCount: number;
  prepTime: number;
  waveInterval: number;
  /** Endless mode recomputes the lane count as waves go up. */
  laneCountForWave?: (wave: number) => number;
}

interface PendingSpawn {
  group: SpawnGroup;
  at: number;
}

/**
 * Drives the wave clock: preparation, spawning on per-group delays, and the
 * gap before the next wave once the field is clear.
 */
export class WaveManager {
  private schedule: WaveSchedule | null = null;
  private phase: WavePhase = "prep";
  private timer = 0;
  private waveIndex = 0;
  private pending: PendingSpawn[] = [];
  private waveClock = 0;
  private spawnedThisWave = 0;
  private laneCount = 2;
  private preview: LaneWarning[] = [];
  private activeLanes: LaneWarning[] = [];
  private introduced = new Set<string>();

  constructor(
    private readonly squads: SquadManager,
    private readonly events: GameEvents,
  ) {}

  get currentWave(): number {
    return this.waveIndex;
  }
  get currentPhase(): WavePhase {
    return this.phase;
  }
  get timeToNextWave(): number {
    return Math.max(0, this.timer);
  }
  get totalWaves(): number {
    return this.schedule?.waves?.length ?? 0;
  }
  get isEndless(): boolean {
    return this.schedule?.waves === null;
  }
  get activeLaneCount(): number {
    return this.laneCount;
  }
  /** Lanes the wave that is currently running came down. */
  get currentLanes(): ReadonlyArray<LaneWarning> {
    return this.activeLanes;
  }

  start(schedule: WaveSchedule): void {
    this.schedule = schedule;
    this.phase = "prep";
    this.timer = schedule.prepTime;
    this.waveIndex = 0;
    this.pending = [];
    this.waveClock = 0;
    this.spawnedThisWave = 0;
    this.laneCount = schedule.laneCount;
  }

  /** Lets the player call the next wave early. */
  callNextWaveNow(): void {
    if (this.phase === "prep" || this.phase === "intermission") this.timer = 0;
  }

  /**
   * Starts the next wave immediately from any phase. Used by the balance tool's
   * "jump to wave" and by the endurance test.
   */
  forceNextWave(): void {
    if (this.phase === "finished") return;
    this.pending = [];
    this.beginWave(this.waveIndex + 1);
  }

  /** Balance-tool only: jumps straight to an arbitrary wave number. */
  jumpToWave(index: number): void {
    this.pending = [];
    this.beginWave(Math.max(1, index));
  }

  /** Balance-tool only: overrides the prep/intermission countdown directly. */
  setPrepCountdown(seconds: number): void {
    if (this.phase === "prep" || this.phase === "intermission") this.timer = Math.max(0, seconds);
  }

  /** Lanes the next wave will use, published `PREVIEW_LEAD` seconds early. */
  get pendingPreview(): ReadonlyArray<LaneWarning> {
    return this.preview;
  }

  update(dt: number): void {
    if (!this.schedule || this.phase === "finished") return;

    if (this.phase === "prep" || this.phase === "intermission") {
      const before = this.timer;
      this.timer -= dt;
      if (before > PREVIEW_LEAD && this.timer <= PREVIEW_LEAD) this.announceNext();
      if (this.timer <= 0) this.beginWave(this.waveIndex + 1);
      return;
    }

    this.waveClock += dt;
    while (this.pending.length > 0 && this.pending[0].at <= this.waveClock) {
      const next = this.pending.shift();
      if (next) this.spawnGroup(next.group);
    }

    if (this.pending.length === 0 && this.squads.livingEnemyUnits === 0 && this.spawnedThisWave > 0) {
      this.finishWave();
    }
  }

  /** Resolves the wave that is about to start, without committing to it. */
  private lookAhead(index: number): { wave: WaveDefinition; laneCount: number } | null {
    const schedule = this.schedule;
    if (!schedule) return null;
    if (schedule.waves) {
      const wave = schedule.waves[index - 1];
      return wave ? { wave, laneCount: schedule.laneCount } : null;
    }
    const laneCount = schedule.laneCountForWave?.(index) ?? schedule.laneCount;
    return { wave: buildEndlessWave(index, laneCount), laneCount };
  }

  /** Publishes the incoming lanes so the player can move before it lands. */
  private announceNext(): void {
    const next = this.lookAhead(this.waveIndex + 1);
    if (!next) return;
    this.preview = previewWave(next.wave, next.laneCount);
    this.events.emit("wavePreview", {
      wave: this.waveIndex + 1,
      name: next.wave.name,
      boss: next.wave.boss === true,
      lanes: this.preview,
      seconds: PREVIEW_LEAD,
    });
  }

  private beginWave(index: number): void {
    const schedule = this.schedule;
    if (!schedule) return;

    let wave: WaveDefinition | undefined;
    if (schedule.waves) {
      wave = schedule.waves[index - 1];
      if (!wave) {
        this.phase = "finished";
        this.events.emit("allWavesCleared", {});
        return;
      }
    } else {
      this.laneCount = schedule.laneCountForWave?.(index) ?? schedule.laneCount;
      wave = buildEndlessWave(index, this.laneCount);
    }

    this.activeLanes = previewWave(wave, this.laneCount);
    this.preview = [];
    this.waveIndex = index;
    this.phase = "active";
    this.waveClock = 0;
    this.spawnedThisWave = 0;
    this.pending = wave.groups
      .map((group) => ({ group, at: group.delay }))
      .sort((a, b) => a.at - b.at);

    this.events.emit("waveStarted", {
      wave: index,
      name: wave.name,
      boss: wave.boss === true,
      total: this.totalWaves,
    });
  }

  private finishWave(): void {
    const schedule = this.schedule;
    if (!schedule) return;
    this.events.emit("waveCleared", { wave: this.waveIndex });

    if (schedule.waves && this.waveIndex >= schedule.waves.length) {
      this.phase = "finished";
      this.events.emit("allWavesCleared", {});
      return;
    }
    this.phase = "intermission";
    this.timer = schedule.waveInterval;
  }

  private spawnGroup(group: SpawnGroup): void {
    const intro = ENEMY_INTRO[group.enemyId];
    if (intro && !this.introduced.has(group.enemyId)) {
      this.introduced.add(group.enemyId);
      this.events.emit("notify", { title: intro.title, body: intro.body });
    }
    const laneIndex = group.lane % Math.max(1, this.laneCount);
    const lane = LANES[laneIndex] ?? LANES[0];
    const origin = laneSpawnPoint(lane);
    for (let i = 0; i < group.squads; i++) {
      const spread = i * 1.9 - (group.squads - 1) * 0.95;
      const px = origin.x + Math.cos(lane.angle) * spread + randRange(-0.6, 0.6);
      const pz = origin.z - Math.sin(lane.angle) * spread + randRange(-0.6, 0.6);
      const squad = this.squads.spawnEnemy(group.enemyId, px, pz, laneIndex, group.extraHealthMul ?? 1, group.extraAttackMul ?? 1);
      if (squad) this.spawnedThisWave += squad.members.length;
    }
  }

  reset(): void {
    this.schedule = null;
    this.phase = "prep";
    this.pending = [];
    this.waveIndex = 0;
    this.timer = 0;
    this.spawnedThisWave = 0;
    this.preview = [];
    this.activeLanes = [];
    this.introduced.clear();
  }
}
