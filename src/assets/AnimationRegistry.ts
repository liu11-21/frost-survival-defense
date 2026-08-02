import type { AnimationGroup } from "@babylonjs/core";

export const ANIMATION_NAMES = {
  hero: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
  turret_basic: ["Idle", "Aim", "Fire", "Recoil", "Reload"],
  wall_gate: ["GateOpen", "GateClose", "Damaged", "Destroyed"],
} as const;

export function findAnimationGroup(groups: readonly AnimationGroup[], name: string): AnimationGroup | null {
  return groups.find((group) => group.name === name || group.name.endsWith(`:${name}`)) ?? null;
}
