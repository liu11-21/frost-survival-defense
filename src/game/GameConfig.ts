import { LANES, MAP } from "../data/BuildSlotDefinitions";

/**
 * Presentation-only tuning. Every gameplay number lives under `src/data/`.
 */
export const CAMERA = {
  /** Tilted overhead rig. The distance itself comes from `localViewRadius` below,
   * not from this offset — this only fixes the rig's viewing angle. */
  baseOffset: { x: 0, y: 28.5, z: -24.0 },
  /**
   * A tactical local view, not a battlefield overview.  The G1 roads are much
   * longer than the original radial approaches, but the normal camera stays
   * close enough to read units and VFX; global awareness belongs to the minimap
   * and the M tactical map.
   */
  localViewRadius: 9,
  minZoom: 0.75,
  maxZoom: 1.25,
  zoomStep: 0.06,
  followLerp: 5.0,
  lookAheadFactor: 0.25,
  cinematicLerp: 2.0,
  shakeDecay: 5.5,
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
 * simulation.  Both extents include the new remote spawn mouths so the player
 * can read an incoming lane before it reaches the compact wall perimeter.
 */
export const MINIMAP = {
  updateHz: 8,
  clusterCellSize: 5,
  miniSizePx: 176,
  fullSizePx: 640,
  miniWorldExtent: MAP.playableRadius,
  fullWorldExtent: MAP.playableRadius + 4,
  fullMapTimeScale: 0.25,
  tempMarkerLifetime: 6,
  breachWarnFraction: 0.25,
};

export const AUDIO = {
  masterVolume: 0.45,
  sfxVolume: 0.8,
  ambientVolume: 0.3,
};

export const WORLD = {
  groundSize: MAP.groundSize,
  groundSubdivisions: 130,
  playableRadius: MAP.playableRadius,
};

/**
 * Every segment of every lane is uploaded to the ground shader.  The previous
 * build supplied one centre-to-spawn segment per lane, which guaranteed a
 * cross-shaped road even when gameplay wanted a curve.  Flattening the real
 * polyline makes the visible thawed road and the navigation contract identical.
 */
export const ROADS: ReadonlyArray<readonly [number, number, number, number]> = LANES.flatMap(
  (lane) => lane.path.slice(0, -1).map((from, index) => {
    const to = lane.path[index + 1];
    return [from.x, from.z, to.x, to.z] as const;
  }),
);

export const ROAD_WIDTH = 3.2;
