import { Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { MaterialFactory } from "../scene/MaterialFactory";
import { CharacterAnimator } from "./CharacterAnimator";
import { createHumanoid, type HumanoidPalette, type HumanoidRig } from "./ProceduralHumanoid";
import { dampAngle } from "../util/MathUtil";
import type { AssetInstance } from "../assets/AssetTypes";

export const PALETTES: Record<string, HumanoidPalette> = {
  player: {
    id: "player",
    coat: [0.78, 0.29, 0.16],
    coatDark: [0.55, 0.2, 0.12],
    trousers: [0.2, 0.19, 0.22],
    skin: [0.83, 0.66, 0.52],
    hood: [0.9, 0.63, 0.25],
    boots: [0.16, 0.13, 0.12],
    accent: [0.95, 0.84, 0.6],
  },
  workerA: {
    id: "workerA",
    coat: [0.24, 0.42, 0.5],
    coatDark: [0.17, 0.31, 0.38],
    trousers: [0.24, 0.24, 0.27],
    skin: [0.76, 0.6, 0.47],
    hood: [0.36, 0.55, 0.6],
    boots: [0.15, 0.14, 0.16],
    accent: [0.62, 0.74, 0.72],
  },
  workerB: {
    id: "workerB",
    coat: [0.31, 0.35, 0.55],
    coatDark: [0.21, 0.24, 0.4],
    trousers: [0.22, 0.21, 0.25],
    skin: [0.7, 0.55, 0.44],
    hood: [0.42, 0.46, 0.66],
    boots: [0.17, 0.15, 0.15],
    accent: [0.68, 0.72, 0.82],
  },
};

/**
 * An avatar bundles the mesh rig, the procedural animator and the visible
 * carry stack. The player controller and the worker AI both drive one of these
 * through the exact same surface.
 */
export class CharacterAvatar {
  readonly rig: HumanoidRig;
  readonly animator: CharacterAnimator;
  readonly position: Vector3;
  private _yaw = 0;
  private readonly velocity = new Vector3();
  private authored: AssetInstance | null = null;
  private authoredState = "";

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    palette: HumanoidPalette,
    name: string,
  ) {
    this.rig = createHumanoid(scene, materials, palette, name);
    this.animator = new CharacterAnimator(this.rig);
    this.position = this.rig.root.position;
  }

  get root(): TransformNode {
    return this.rig.root;
  }

  get renderMeshes(): readonly import("@babylonjs/core").AbstractMesh[] {
    return this.authored?.meshes ?? this.rig.meshes;
  }

  /** Replaces only the visible body; movement/collision still use the rig root. */
  attachAuthored(instance: AssetInstance): void {
    this.authored?.dispose();
    this.authored = instance;
    instance.root.parent = this.rig.root;
    instance.root.position.set(0, 0, 0);
    instance.root.rotation.setAll(0);
    for (const mesh of this.rig.meshes) {
      mesh.isVisible = false;
      mesh.setEnabled(false);
    }
    this.authoredState = "";
  }

  get yaw(): number {
    return this._yaw;
  }

  setYawImmediate(yaw: number): void {
    this._yaw = yaw;
    this.rig.root.rotation.y = yaw;
  }

  turnTowards(yaw: number, rate: number, dt: number): void {
    this._yaw = dampAngle(this._yaw, yaw, rate, dt);
    this.rig.root.rotation.y = this._yaw;
  }

  setVelocity(v: Vector3): void {
    this.velocity.copyFrom(v);
  }

  update(dt: number, speed: number, carryRatio: number): void {
    this.animator.update(dt, speed, carryRatio);
    this.updateAuthoredAnimation();
  }

  setEnabled(enabled: boolean): void {
    this.rig.root.setEnabled(enabled);
    this.authored?.root.setEnabled(enabled);
  }

  dispose(): void {
    this.authored?.dispose();
    this.authored = null;
    this.rig.root.dispose(false, true);
  }

  private updateAuthoredAnimation(): void {
    if (!this.authored) return;
    const state = this.animator.currentState;
    if (state === this.authoredState) return;
    this.authoredState = state;
    for (const group of this.authored.animationGroups) group.stop();
    const name = state === "sprint" ? "Run" : state === "walk" || state === "carryWalk" ? "Walk" : state === "chop" ? "MeleeAttack" : state === "frozen" ? "Hit" : state === "wakeUp" ? "Idle" : "Idle";
    const group = this.authored.animationGroups.find((candidate) => candidate.name === name || candidate.name.endsWith(`:${name}`));
    group?.start(name === "Idle" || name === "Walk" || name === "Run", 1);
  }
}

export function createPlayerAvatar(scene: Scene, materials: MaterialFactory): CharacterAvatar {
  return new CharacterAvatar(scene, materials, PALETTES.player, "player");
}

export function createWorkerAvatar(
  scene: Scene,
  materials: MaterialFactory,
  index: number,
): CharacterAvatar {
  const palette = index % 2 === 0 ? PALETTES.workerA : PALETTES.workerB;
  return new CharacterAvatar(scene, materials, palette, `worker${index}`);
}

