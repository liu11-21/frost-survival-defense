import type { Engine, Scene } from "@babylonjs/core";
import { detectGpu, glFromEngine, type GpuInfo } from "./GpuDetector";
import {
  emptySnapshot,
  type PerformanceReport,
  type PerformanceSnapshot,
} from "./PerformanceSnapshot";

/** Rolling history length in frames (~30 s at 60 fps). */
const HISTORY = 1800;

export interface SceneCounts {
  allies: number;
  enemies: number;
  projectiles: number;
  pickups: number;
}

/**
 * Measures what the browser actually does, frame by frame.
 *
 * Simulation and render cost are timed separately with `performance.now()`
 * around the two halves of the frame, so a slow GPU and a slow update loop are
 * never confused for each other.
 */
export class PerformanceMonitor {
  readonly gpu: GpuInfo;
  private readonly frameTimes: number[] = [];
  private readonly simTimes: number[] = [];
  private readonly renderTimes: number[] = [];
  private readonly drawCallSamples: number[] = [];
  private readonly meshSamples: number[] = [];

  private simStart = 0;
  private renderStart = 0;
  private lastSim = 0;
  private lastRender = 0;
  private lastFrame = 0;

  private recording = false;
  private recordStart = 0;
  private recordDuration = 0;
  private maxUnits = 0;
  private maxProjectiles = 0;
  private stressTagged = false;

  private readonly snap: PerformanceSnapshot = emptySnapshot();

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
  ) {
    this.gpu = detectGpu(glFromEngine(engine as never));
  }

  get snapshot(): PerformanceSnapshot {
    return this.snap;
  }

  get isRecording(): boolean {
    return this.recording;
  }

  /** Marks the whole session as test-tainted; results must not be ranked. */
  tagStressTest(): void {
    this.stressTagged = true;
  }

  get isStressTagged(): boolean {
    return this.stressTagged;
  }

  beginSimulation(): void {
    this.simStart = performance.now();
  }

  endSimulation(): void {
    this.lastSim = performance.now() - this.simStart;
  }

  beginRender(): void {
    this.renderStart = performance.now();
  }

  endRender(): void {
    this.lastRender = performance.now() - this.renderStart;
    this.lastFrame = this.lastSim + this.lastRender;
    push(this.frameTimes, this.lastFrame);
    push(this.simTimes, this.lastSim);
    push(this.renderTimes, this.lastRender);
  }

  /** Refreshes the public snapshot. Called once per frame after rendering. */
  sample(counts: SceneCounts, quality: string): void {
    const s = this.snap;
    s.fps = this.engine.getFps();
    s.simulationMs = this.lastSim;
    s.renderMs = this.lastRender;
    s.frameMs = this.lastFrame;
    s.avgFps5s = fpsOverLastSeconds(this.frameTimes, 5);
    s.avgFps30s = fpsOverLastSeconds(this.frameTimes, 30);
    s.lowFps1pct = onePercentLowFps(this.frameTimes);

    s.allies = counts.allies;
    s.enemies = counts.enemies;
    s.totalUnits = counts.allies + counts.enemies;
    s.projectiles = counts.projectiles;
    s.pickups = counts.pickups;
    s.particles = countParticles(this.scene);

    // `drawCalls` is a PerfCounter on the engine; read its current value.
    s.drawCalls = readCounter(this.engine, "_drawCalls");
    s.activeMeshes = this.scene.getActiveMeshes().length;
    s.totalVertices = this.scene.getTotalVertices();

    s.hardwareScaling = this.engine.getHardwareScalingLevel();
    s.qualityLevel = quality;
    s.canvasWidth = this.engine.getRenderWidth();
    s.canvasHeight = this.engine.getRenderHeight();
    const canvas = this.engine.getRenderingCanvas();
    s.cssWidth = canvas ? Math.round(canvas.clientWidth) : 0;
    s.cssHeight = canvas ? Math.round(canvas.clientHeight) : 0;

    push(this.drawCallSamples, s.drawCalls);
    push(this.meshSamples, s.activeMeshes);

    if (this.recording) {
      this.maxUnits = Math.max(this.maxUnits, s.totalUnits);
      this.maxProjectiles = Math.max(this.maxProjectiles, s.projectiles);
      this.recordDuration = (performance.now() - this.recordStart) / 1000;
    }
  }

  startRecording(): void {
    this.recording = true;
    this.recordStart = performance.now();
    this.recordDuration = 0;
    this.maxUnits = 0;
    this.maxProjectiles = 0;
    this.frameTimes.length = 0;
    this.simTimes.length = 0;
    this.renderTimes.length = 0;
    this.drawCallSamples.length = 0;
    this.meshSamples.length = 0;
  }

  stopRecording(): void {
    this.recording = false;
  }

  buildReport(quality: string, notes: string[] = []): PerformanceReport {
    const s = this.snap;
    const extra = [...notes];
    if (this.gpu.softwareRendering) {
      extra.push("偵測到軟體渲染，此數字不代表獨立顯示卡的實際效能。");
    }
    if (!this.gpu.detailAvailable) {
      extra.push("瀏覽器未提供完整 GPU 名稱，renderer 欄位可能不精確。");
    }
    return {
      date: new Date().toISOString(),
      browser: navigator.userAgent,
      gpu: this.gpu,
      displayResolution: `${s.cssWidth} x ${s.cssHeight}`,
      canvasResolution: `${s.canvasWidth} x ${s.canvasHeight}`,
      quality,
      hardwareScaling: s.hardwareScaling,
      durationSeconds: this.recordDuration || elapsedSeconds(this.frameTimes),
      avgFps: fpsOverLastSeconds(this.frameTimes, 1e6),
      lowFps1pct: onePercentLowFps(this.frameTimes),
      avgSimulationMs: average(this.simTimes),
      avgRenderMs: average(this.renderTimes),
      avgFrameMs: average(this.frameTimes),
      maxUnits: this.maxUnits || s.totalUnits,
      maxProjectiles: this.maxProjectiles || s.projectiles,
      avgDrawCalls: average(this.drawCallSamples),
      avgActiveMeshes: average(this.meshSamples),
      stressTest: this.stressTagged,
      notes: extra,
    };
  }
}

/** Babylon exposes draw calls as a PerfCounter; read it without a hard dep. */
function readCounter(engine: unknown, key: string): number {
  const counter = (engine as Record<string, { current?: number } | undefined>)[key];
  return typeof counter?.current === "number" ? counter.current : 0;
}

function push(list: number[], value: number): void {
  list.push(value);
  if (list.length > HISTORY) list.shift();
}

function average(list: number[]): number {
  if (list.length === 0) return 0;
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i];
  return total / list.length;
}

function elapsedSeconds(frameTimes: number[]): number {
  let total = 0;
  for (let i = 0; i < frameTimes.length; i++) total += frameTimes[i];
  return total / 1000;
}

/** Mean FPS over the most recent `seconds` of retained frame times. */
function fpsOverLastSeconds(frameTimes: number[], seconds: number): number {
  if (frameTimes.length === 0) return 0;
  let budget = seconds * 1000;
  let total = 0;
  let count = 0;
  for (let i = frameTimes.length - 1; i >= 0 && budget > 0; i--) {
    total += frameTimes[i];
    budget -= frameTimes[i];
    count++;
  }
  return count > 0 && total > 0 ? (count * 1000) / total : 0;
}

/** The worst 1% of frames, expressed as FPS. */
function onePercentLowFps(frameTimes: number[]): number {
  if (frameTimes.length < 20) return 0;
  const sorted = [...frameTimes].sort((a, b) => b - a);
  const slice = Math.max(1, Math.floor(sorted.length * 0.01));
  let total = 0;
  for (let i = 0; i < slice; i++) total += sorted[i];
  const meanWorst = total / slice;
  return meanWorst > 0 ? 1000 / meanWorst : 0;
}

function countParticles(scene: Scene): number {
  let n = 0;
  for (const system of scene.particleSystems) n += system.getActiveCount?.() ?? 0;
  return n;
}
