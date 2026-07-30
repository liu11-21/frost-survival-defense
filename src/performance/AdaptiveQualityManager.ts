import type { Engine, Scene } from "@babylonjs/core";
import type { DefaultRenderingPipeline } from "@babylonjs/core";

export type QualityLevel = "low" | "medium" | "high";
export type QualitySetting = QualityLevel | "auto";

export interface QualityProfile {
  hardwareScaling: number;
  /** Multiplier applied to every particle system's emit rate. */
  particleScale: number;
  /** fbm octaves the snow shader evaluates. */
  snowOctaves: number;
  bloom: boolean;
  fxaa: boolean;
  shadows: boolean;
  /** Beyond this distance, non-essential effects are skipped. */
  effectDistance: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  high: {
    hardwareScaling: 1.0,
    particleScale: 1.0,
    snowOctaves: 3,
    bloom: true,
    fxaa: true,
    shadows: true,
    effectDistance: 45,
  },
  medium: {
    hardwareScaling: 1.25,
    particleScale: 0.7,
    snowOctaves: 2,
    bloom: true,
    fxaa: true,
    shadows: true,
    effectDistance: 32,
  },
  low: {
    hardwareScaling: 1.6,
    particleScale: 0.4,
    snowOctaves: 1,
    bloom: false,
    fxaa: false,
    shadows: false,
    effectDistance: 22,
  },
};

const STORAGE_KEY = "frostbound.quality.v1";
/** Auto mode watches this long before committing to a level. */
const SAMPLE_SECONDS = 8;

/**
 * Applies a quality profile and, in auto mode, picks one from measured FPS.
 *
 * A manual choice is sticky: once the player picks a level, auto never
 * overrides it for the rest of the session or on any later visit.
 */
export class AdaptiveQualityManager {
  private setting: QualitySetting = "auto";
  private applied: QualityLevel = "high";
  private sampleTime = 0;
  private sampleFrames = 0;
  private sampleFpsTotal = 0;
  private decided = false;

  onChanged: ((level: QualityLevel, profile: QualityProfile) => void) | null = null;

  constructor(
    private readonly engine: Engine,
    private readonly scene: Scene,
    private readonly pipeline: DefaultRenderingPipeline,
  ) {
    this.setting = loadSetting();
    if (this.setting !== "auto") {
      this.decided = true;
      this.apply(this.setting);
    } else {
      this.apply("high");
    }
  }

  get current(): QualityLevel {
    return this.applied;
  }
  get currentSetting(): QualitySetting {
    return this.setting;
  }
  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.applied];
  }

  /** A manual pick. Disables auto for good. */
  setSetting(setting: QualitySetting): void {
    this.setting = setting;
    saveSetting(setting);
    if (setting === "auto") {
      this.decided = false;
      this.sampleTime = 0;
      this.sampleFrames = 0;
      this.sampleFpsTotal = 0;
      return;
    }
    this.decided = true;
    this.apply(setting);
  }

  /** Restarts the auto sampling window, e.g. when a run begins. */
  restartSampling(): void {
    if (this.setting !== "auto" || this.decided) return;
    this.sampleTime = 0;
    this.sampleFrames = 0;
    this.sampleFpsTotal = 0;
  }

  update(dt: number, fps: number): void {
    if (this.setting !== "auto" || this.decided) return;
    if (fps <= 0) return;
    this.sampleTime += dt;
    this.sampleFrames++;
    this.sampleFpsTotal += fps;
    if (this.sampleTime < SAMPLE_SECONDS) return;

    const avg = this.sampleFpsTotal / Math.max(1, this.sampleFrames);
    const level: QualityLevel = avg >= 55 ? "high" : avg >= 35 ? "medium" : "low";
    this.decided = true;
    this.apply(level);
  }

  private apply(level: QualityLevel): void {
    this.applied = level;
    const p = QUALITY_PROFILES[level];
    this.engine.setHardwareScalingLevel(p.hardwareScaling);
    this.pipeline.bloomEnabled = p.bloom;
    this.pipeline.fxaaEnabled = p.fxaa;
    this.scene.shadowsEnabled = p.shadows;
    this.onChanged?.(level, p);
  }
}

function loadSetting(): QualitySetting {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "low" || raw === "medium" || raw === "high" || raw === "auto") return raw;
  } catch {
    // Blocked storage simply means the default.
  }
  return "auto";
}

function saveSetting(setting: QualitySetting): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, setting);
  } catch {
    // Private mode; the choice just does not persist.
  }
}
