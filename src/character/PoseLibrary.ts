import { CHOP } from "./AnimationConfig";
import { easeInOutCubic, easeOutCubic, smoothstep } from "../util/MathUtil";

/**
 * A pose is a flat bag of joint angles. Keeping it as plain numbers means the
 * animator can blend two poses with a single loop and never allocates.
 */
export interface Pose {
  bodyY: number;
  bodyPitch: number;
  bodyRoll: number;
  bodyYaw: number;
  pelvisPitch: number;
  chestPitch: number;
  chestYaw: number;
  headPitch: number;
  headYaw: number;
  shoulderLX: number;
  shoulderLZ: number;
  shoulderRX: number;
  shoulderRZ: number;
  elbowL: number;
  elbowR: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
}

export function blankPose(): Pose {
  return {
    bodyY: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    bodyYaw: 0,
    pelvisPitch: 0,
    chestPitch: 0,
    chestYaw: 0,
    headPitch: 0,
    headYaw: 0,
    shoulderLX: 0,
    shoulderLZ: 0.12,
    shoulderRX: 0,
    shoulderRZ: -0.12,
    elbowL: -0.18,
    elbowR: -0.28,
    hipL: 0,
    hipR: 0,
    kneeL: 0.05,
    kneeR: 0.05,
  };
}

const REST = blankPose();
export const POSE_KEYS = Object.keys(REST) as Array<keyof Pose>;

export function resetPose(target: Pose): void {
  for (const key of POSE_KEYS) target[key] = REST[key];
}

export function idlePose(p: Pose, phase: number, clock: number, carryRatio: number): void {
  resetPose(p);
  const breathe = Math.sin(phase) * 0.5 + 0.5;
  p.bodyY = breathe * 0.018;
  p.chestPitch = -0.03 + breathe * 0.03 - carryRatio * 0.1;
  p.bodyPitch = carryRatio * 0.09;
  p.headYaw = Math.sin(clock * 0.55) * 0.18;
  p.headPitch = Math.sin(clock * 0.9 + 1.2) * 0.05 - 0.02;
  p.shoulderLX = 0.03 + breathe * 0.04;
  p.shoulderRX = 0.03 + breathe * 0.04;
  p.shoulderLZ = 0.14 + carryRatio * 0.05;
  p.shoulderRZ = -0.14 - carryRatio * 0.05;
  p.elbowL = -0.2 - breathe * 0.05;
  p.elbowR = -0.32 - breathe * 0.05;
  p.kneeL = 0.06;
  p.kneeR = 0.06;
}

export function locomotionPose(
  p: Pose,
  phase: number,
  sprinting: boolean,
  carrying: boolean,
  carryRatio: number,
): void {
  resetPose(p);
  const swing = Math.sin(phase);
  const swing2 = Math.sin(phase * 2);
  const amp = sprinting ? 0.82 : carrying ? 0.5 : 0.62;
  const armAmp = sprinting ? 0.78 : carrying ? 0.2 : 0.56;

  p.bodyY = Math.abs(swing2) * (sprinting ? 0.075 : 0.045) - 0.02;
  p.bodyRoll = swing * (sprinting ? 0.06 : 0.035);
  p.bodyYaw = -swing * 0.07;
  // carrying tips the whole torso forward under the load
  p.bodyPitch = (sprinting ? 0.16 : 0.06) + (carrying ? 0.2 + carryRatio * 0.1 : 0);
  p.pelvisPitch = carrying ? -0.09 : -0.02;
  p.chestPitch = carrying ? 0.05 : -0.04 - (sprinting ? 0.06 : 0);
  p.chestYaw = swing * 0.11;
  p.headPitch = carrying ? -0.14 : -0.03;
  p.headYaw = -swing * 0.05;

  p.hipL = -swing * amp;
  p.hipR = swing * amp;
  p.kneeL = Math.max(0, swing) * amp * 1.05 + 0.05;
  p.kneeR = Math.max(0, -swing) * amp * 1.05 + 0.05;

  if (carrying) {
    // both hands grip the shoulder straps instead of swinging
    p.shoulderLX = -0.45 + swing * armAmp * 0.4;
    p.shoulderRX = -0.45 - swing * armAmp * 0.4;
    p.shoulderLZ = 0.42;
    p.shoulderRZ = -0.42;
    p.elbowL = -1.45;
    p.elbowR = -1.35;
  } else {
    p.shoulderLX = swing * armAmp;
    p.shoulderRX = -swing * armAmp;
    p.shoulderLZ = 0.12;
    p.shoulderRZ = -0.12;
    p.elbowL = -0.24 - Math.max(0, swing) * 0.5;
    p.elbowR = -0.34 - Math.max(0, -swing) * 0.45;
  }
}

/** `local` is the normalised position inside one full chop cycle. */
export function chopPose(p: Pose, local: number, carryRatio: number): void {
  resetPose(p);

  let raise: number;
  let twist: number;
  if (local < CHOP.hitFrame) {
    // wind-up: lift the axe up and behind the shoulder
    const w = easeInOutCubic(local / CHOP.hitFrame);
    raise = w;
    twist = w;
  } else if (local < CHOP.hitFrame + 0.14) {
    // strike: snap down through the trunk
    const s = (local - CHOP.hitFrame) / 0.14;
    raise = 1 - easeOutCubic(s) * 1.45;
    twist = 1 - s * 1.6;
  } else {
    // recover back to a ready stance
    const r = (local - CHOP.hitFrame - 0.14) / (1 - CHOP.hitFrame - 0.14);
    raise = -0.45 + easeInOutCubic(r) * 0.45;
    twist = -0.6 + easeInOutCubic(r) * 0.6;
  }

  p.bodyPitch = 0.1 - raise * 0.16 + Math.max(0, -raise) * 0.42 + carryRatio * 0.06;
  p.bodyYaw = twist * 0.34;
  p.bodyRoll = twist * 0.1;
  p.bodyY = -0.02 - Math.max(0, -raise) * 0.06;
  p.pelvisPitch = -0.06;
  p.chestPitch = -raise * 0.2 + Math.max(0, -raise) * 0.3;
  p.chestYaw = twist * 0.42;
  p.headPitch = 0.18 + Math.max(0, -raise) * 0.18;
  p.headYaw = twist * 0.16;

  // both arms drive the swing, the right one holds the axe
  p.shoulderRX = 0.35 + raise * 2.05;
  p.shoulderLX = 0.25 + raise * 1.85;
  p.shoulderRZ = -0.34 - raise * 0.18;
  p.shoulderLZ = 0.3 + raise * 0.2;
  p.elbowR = -0.35 - raise * 0.85;
  p.elbowL = -0.42 - raise * 0.95;

  p.hipL = -0.16;
  p.hipR = 0.12;
  p.kneeL = 0.24;
  p.kneeR = 0.18;
}

export function depositPose(p: Pose, t: number, carryRatio: number): void {
  resetPose(p);
  const reach = Math.sin(t * Math.PI);
  p.bodyPitch = 0.14 + reach * 0.16 + carryRatio * 0.08;
  p.bodyY = -0.03 - reach * 0.03;
  p.chestPitch = 0.06 + reach * 0.1;
  p.chestYaw = -reach * 0.22;
  p.headPitch = 0.12;
  p.shoulderLX = -0.9 - reach * 0.85;
  p.shoulderRX = -0.85 - reach * 0.9;
  p.shoulderLZ = 0.3;
  p.shoulderRZ = -0.3;
  p.elbowL = -0.95 + reach * 0.72;
  p.elbowR = -1.0 + reach * 0.78;
  p.hipL = -0.1;
  p.hipR = 0.08;
  p.kneeL = 0.3;
  p.kneeR = 0.26;
}

export function frozenPose(p: Pose, clock: number, shiverAmount: number): void {
  resetPose(p);
  const jitter = shiverAmount * 0.045;
  const s = Math.sin(clock * 34) * jitter;
  const s2 = Math.cos(clock * 41) * jitter;

  p.bodyY = -0.34;
  p.bodyPitch = 0.52 + s;
  p.bodyRoll = 0.07 + s2;
  p.pelvisPitch = 0.2;
  p.chestPitch = 0.34 + s;
  p.headPitch = 0.62 + s2 * 1.4;
  p.headYaw = 0.1;
  p.shoulderLX = -0.6;
  p.shoulderRX = -0.55;
  p.shoulderLZ = 0.66;
  p.shoulderRZ = -0.7;
  p.elbowL = -1.75;
  p.elbowR = -1.68;
  p.hipL = -0.95;
  p.hipR = -0.88;
  p.kneeL = 1.55;
  p.kneeR = 1.48;
}

/** Blends the frozen crouch into a standing stance as `riseProgress` grows. */
export function wakeUpPose(p: Pose, clock: number, riseProgress: number): void {
  resetPose(p);
  const rise = easeInOutCubic(riseProgress);
  const look = smoothstep(0.7, 1, riseProgress);

  p.bodyY = -0.34 * (1 - rise);
  p.bodyPitch = 0.52 * (1 - rise) + 0.02;
  p.bodyRoll = 0.07 * (1 - rise);
  p.pelvisPitch = 0.2 * (1 - rise);
  p.chestPitch = 0.34 * (1 - rise) - 0.04 * rise;
  p.headPitch = 0.62 * (1 - rise) - 0.05 * rise;
  p.headYaw = Math.sin(clock * 1.9) * 0.42 * look;
  p.shoulderLX = -0.6 * (1 - rise) + 0.06 * rise;
  p.shoulderRX = -0.55 * (1 - rise) + 0.06 * rise;
  p.shoulderLZ = 0.66 * (1 - rise) + 0.14 * rise;
  p.shoulderRZ = -0.7 * (1 - rise) - 0.14 * rise;
  p.elbowL = -1.75 * (1 - rise) - 0.22 * rise;
  p.elbowR = -1.68 * (1 - rise) - 0.32 * rise;
  p.hipL = -0.95 * (1 - rise);
  p.hipR = -0.88 * (1 - rise);
  p.kneeL = 1.55 * (1 - rise) + 0.06 * rise;
  p.kneeR = 1.48 * (1 - rise) + 0.06 * rise;
}
