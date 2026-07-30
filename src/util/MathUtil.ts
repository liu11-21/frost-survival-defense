import { Vector3 } from "@babylonjs/core";

export const TWO_PI = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function dampVector(current: Vector3, target: Vector3, rate: number, dt: number): void {
  const t = 1 - Math.exp(-rate * dt);
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
}

export function shortestAngle(from: number, to: number): number {
  let delta = (to - from) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

export function dampAngle(current: number, target: number, rate: number, dt: number): number {
  return current + shortestAngle(current, target) * (1 - Math.exp(-rate * dt));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-5, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function distanceXZ(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Yaw (Y rotation) that makes a character face the given XZ direction. */
export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}
