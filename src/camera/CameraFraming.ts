import { MAP } from "../data/BuildSlotDefinitions";

export interface FramingResult {
  /** Height and depth of the camera offset from its focus point. */
  height: number;
  depth: number;
  /** The world radius the framing guarantees on screen. */
  coveredRadius: number;
}

/**
 * Fraction of the viewport kept clear of the base on every side, so the wall
 * ring never touches the screen edge or sits under the HUD.
 */
const SAFE_MARGIN = 0.09;

/**
 * Works out how far back the camera must sit to guarantee `radiusOverride`
 * (or, failing that, the whole base) stays on screen.
 *
 * Derived from the required radius, the viewport aspect and the camera FOV
 * rather than a hard-coded distance, so the framing still holds if the
 * required radius, the map layout, or the window shape changes.
 * `GameCamera.refit()` always passes `CAMERA.localViewRadius` in normal play —
 * the `MAP.wallRadius` default only matters if a caller ever wants the old
 * whole-base framing back.
 */
export function computeFraming(
  aspect: number,
  fovRadians: number,
  tiltRatio: number,
  radiusOverride?: number,
): FramingResult {
  const required = (radiusOverride ?? MAP.wallRadius) + 1.2;

  // Vertical FOV is the given one; horizontal follows from the aspect ratio.
  const halfV = fovRadians / 2;
  const tanV = Math.tan(halfV);
  const tanH = tanV * Math.max(0.1, aspect);

  const usable = 1 - SAFE_MARGIN * 2;

  // At distance D the view covers D * tan(half) perpendicular to the view axis.
  // A tilted camera stretches that across the ground along the depth axis by
  // 1 / sin(tilt), so the vertical requirement needs *less* distance, not more.
  const tilt = Math.atan2(1, tiltRatio);
  const groundStretch = 1 / Math.max(0.35, Math.sin(tilt));

  const distV = required / (tanV * usable * groundStretch);
  const distH = required / (tanH * usable);
  const distance = Math.max(distV, distH);

  // Split the distance into the rig's height and depth using the same tilt.
  const norm = Math.hypot(1, tiltRatio);
  return {
    height: (distance / norm) * 1,
    depth: (distance / norm) * tiltRatio,
    coveredRadius: required,
  };
}
