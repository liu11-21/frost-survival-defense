import { LANES, MAP } from "../data/BuildSlotDefinitions";

/**
 * Presentation-only tuning. Every gameplay number lives under `src/data/`.
 */
export const CAMERA = {
  /** Tilted overhead rig. The distance itself comes from `localViewRadius` below,
   * not from this offset — this only fixes the rig's viewing angle. */
  baseOffset: { x: 0, y: 28.5, z: -24.0 },
  /**
   * A tactical local view, not a base overview: the radius the default
   * framing guarantees on screen is deliberately decoupled from the base's
   * own size (`MAP.wallRadius`, ~26.25) so the main viewport never shows the
   * whole perimeter. ~9 is roughly 45% of the base's 40-unit width — close
   * enough to read units, health bars and VFX clearly, while still showing
   * the immediate road and any nearby fighting. Full-base awareness comes
   * from the minimap and the full map (`M`), not from pulling this back.
   */
  localViewRadius: 9,
  minZoom: 0.75,
  maxZoom: 1.25,
  zoomStep: 0.06,
  followLerp: 5.0,
  lookAheadFactor: 0.25,
  cinematicLerp: 2.0,
  shakeDecay: 5.5,
  /** A small pull toward the furnace so a hero standing right at a wall still
   * has some inward context — never enough to reveal the far side of the
   * base. Kept intentionally low, unlike the old "always show the whole
   * base" bias. */
  centreBias: 0.06,
};

export const COLORS = {
  snow: [0.82, 0.85, 0.92] as const,
  snowShadow: [0.46, 0.53, 0.68] as const,
  dirt: [0.15, 0.12, 0.1] as const,
  wetDirt: [0.085, 0.07, 0.058] as const,
  road: [0.36, 0.32, 0.28] as const,
  fog: [0.55, 0.62, 0.74] as const,
  sun: [0.84, 0.87, 0.97] as const,
  warm: [1.0, 0.52, 0.18] as const,
  meshSnow: [0.82, 0.85, 0.92] as const,
};

export const FOG_DENSITY = 0.011;

/**
 * Minimap / full-map tuning. Both canvases share one low-frequency data feed
 * (`gatherMinimapSnapshot`) — this is presentation-only, never a second
 * simulation.
 */
export const MINIMAP = {
  /** How often the shared snapshot is rebuilt and both canvases redrawn. */
  updateHz: 8,
  /** World units a same-position cluster bucket spans, for both allies and enemies. */
  clusterCellSize: 5,
  /** Small always-on corner map, in CSS px. */
  miniSizePx: 176,
  /** Full-screen tactical map, in CSS px (square, clamped by CSS to the viewport). */
  fullSizePx: 640,
  /** World half-extent the small map frames — a little past the wall ring. */
  miniWorldExtent: MAP.wallRadius + 4,
  /** The full map always shows the whole battlefield, further out still. */
  fullWorldExtent: MAP.wallRadius + 9,
  /** Game speed while the full tactical map is open — never silent full-speed damage. */
  fullMapTimeScale: 0.25,
  /** How long a click-placed temporary marker survives, in seconds. */
  tempMarkerLifetime: 6,
  /** Wall health fraction at or below which its minimap segment flashes as critical. */
  breachWarnFraction: 0.25,
};

export const AUDIO = {
  masterVolume: 0.45,
  sfxVolume: 0.8,
  ambientVolume: 0.3,
};

export const WORLD = {
  groundSize: MAP.groundSize,
  groundSubdivisions: 110,
  playableRadius: MAP.playableRadius,
};

/**
 * The snow shader melts along the approach lanes, so the roads it draws are
 * exactly the paths the enemies walk.
 */
export const ROADS: ReadonlyArray<readonly [number, number, number, number]> = LANES.map(
  (lane) =>
    [
      Math.sin(lane.angle) * 2.5,
      Math.cos(lane.angle) * 2.5,
      Math.sin(lane.angle) * MAP.spawnRadius,
      Math.cos(lane.angle) * MAP.spawnRadius,
    ] as const,
);

export const ROAD_WIDTH = 3.2;
