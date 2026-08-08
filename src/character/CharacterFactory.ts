import { AbstractMesh, AnimationGroup, Scene, TransformNode, Vector3 } from "@babylonjs/core";
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
  private authoredAttack: "MeleeAttack" | "RangedAttack" | null = null;
  private reviewAnimation: string | null = null;
  private reviewGroup: AnimationGroup | null = null;
  private reviewElapsed = 0;
  private reviewNormalized = 0;
  private reviewLod: 0 | 1 | 2 = 0;
  private reviewLodAuto = false;

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

  /** The visible source is exposed for the runtime verification panel and test API. */
  get modelSource(): "GLB" | "procedural" {
    return this.authored ? "GLB" : "procedural";
  }

  get authoredAnimationNames(): readonly string[] {
    return this.authored?.animationGroups.map((group) => group.name) ?? [];
  }

  /** Meshes from the authored runtime instance, including inactive LOD proxies. */
  get authoredMeshes(): readonly import("@babylonjs/core").AbstractMesh[] {
    return this.authored?.allMeshes ?? this.authored?.meshes ?? [];
  }

  get authoredVisibleMeshCount(): number {
    return this.authoredMeshes.filter((mesh) => mesh.isEnabled() && mesh.isVisible).length;
  }

  get proceduralVisibleMeshCount(): number {
    return this.rig.meshes.filter((mesh) => mesh.isEnabled() && mesh.isVisible).length;
  }

  get currentAuthoredAnimation(): string | null {
    if (this.reviewAnimation) return this.reviewAnimation;
    if (!this.authoredState) return null;
    return this.authoredState.split(":").slice(1).join(":") || null;
  }

  get currentReviewLod(): 0 | 1 | 2 {
    if (!this.reviewLodAuto) return this.reviewLod;
    const visible = this.authoredMeshes.find((mesh) => mesh.isEnabled() && mesh.isVisible);
    const name = visible?.name.split(":").pop() ?? "";
    return name.startsWith("LOD2_PROXY") || name.startsWith("LOD2_PROD") ? 2 : name.startsWith("LOD1_PROXY") || name.startsWith("LOD1_PROD") ? 1 : 0;
  }

  get currentReviewAnimationNormalized(): number {
    return this.reviewNormalized;
  }

  /**
   * A compact, deterministic pose sample for the Hero gameplay-art review.
   * The snapshot intentionally exposes only the existing production bones;
   * it is test evidence, not a second animation or IK system.
   */
  /**
   * How far each hand reaches in the character's OWN frame, forward positive.
   *
   * This exists because a gesture can be perfectly authored and still point
   * the wrong way. Two clips shipped that way -- the Hero's RangedAttack and
   * the roster's Cast -- with every arm key negative, so the whole aim was
   * assembled behind the back while the shot went forward. The GLB was valid,
   * the bounds were the right size, the animation played, and every suite
   * stayed green; it took someone looking at the screen.
   *
   * `forward` is along the rig root's local +Z, which is the gameplay heading,
   * so a strike or an aim must drive this positive at some point in its
   * timeline. Bone-local positions cannot show this -- they are relative to
   * the parent bone and say nothing about which way the body is pointing.
   */
  get reviewGestureReach(): Record<string, { right: number; up: number; forward: number }> {
    const out: Record<string, { right: number; up: number; forward: number }> = {};
    const skeleton = this.authored?.skeletons?.[0];
    const reference = this.authoredMeshes.find((mesh) => (mesh as AbstractMesh).skeleton === skeleton) as AbstractMesh | undefined;
    if (!skeleton || !reference) return out;
    const root = this.rig.root;
    root.computeWorldMatrix(true);
    const origin = root.getAbsolutePosition();
    const yaw = this._yaw;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const bone of skeleton.bones) {
      const name = bone.name.split(":").pop() ?? bone.name;
      if (name !== "hand.L" && name !== "hand.R") continue;
      const world = bone.getAbsolutePosition(reference);
      const dx = world.x - origin.x, dz = world.z - origin.z;
      out[name] = {
        right: roundReview(cos * dx - sin * dz),
        up: roundReview(world.y - origin.y),
        forward: roundReview(sin * dx + cos * dz),
      };
    }
    return out;
  }

  get reviewBoneSnapshot(): Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }> {
    const snapshot: Record<string, { position: [number, number, number]; rotation: [number, number, number, number] }> = {};
    const bones = this.authored?.skeletons?.[0]?.bones ?? [];
    const required = new Set([
      "root", "pelvis", "chest", "head",
      "upper_arm.L", "upper_arm.R", "lower_arm.L", "lower_arm.R",
      "hand.L", "hand.R", "thigh.L", "thigh.R", "shin.L", "shin.R",
      "foot.L", "foot.R",
    ]);
    for (const bone of bones) {
      const name = bone.name.split(":").pop() ?? bone.name;
      if (!required.has(name)) continue;
      const position = bone.position;
      const rotation = bone.rotationQuaternion;
      const euler = bone.rotation;
      snapshot[name] = {
        position: [roundReview(position.x), roundReview(position.y), roundReview(position.z)],
        rotation: rotation
          ? [roundReview(rotation.x), roundReview(rotation.y), roundReview(rotation.z), roundReview(rotation.w)]
          : [roundReview(euler.x), roundReview(euler.y), roundReview(euler.z), 1],
      };
    }
    return snapshot;
  }

  /**
   * Rigid-weapon evidence for units whose GLB exposes a `weapon_socket` node
   * and a `LOD{n}_PROD_axe` mesh (currently Warrior). `axeWorldCenter` is read
   * from the mesh's skeleton-applied bounding box, not the mesh's own local
   * transform, because a skinned weapon mesh's node transform stays static
   * while the skeleton deforms its vertices — the bounding box is the only
   * cheap signal that actually reflects the current pose. `handContactL/R`
   * approximate grip distance as hand-bone-to-axe-bounding-box-center; that is
   * a coarse proxy (the axe currently has no separate upper/lower grip
   * locator), not a precise per-grip measurement.
   */
  /**
   * Locator-based weapon evidence.
   *
   * The authored GLB exports `upper_grip`, `lower_grip` and `axe_tip` as
   * nodes bone-parented to `hand.R`, so they travel with the rigid weapon.
   * Grip contact is therefore measured hand-bone to actual grip point, and
   * the swing arc is measured at the cutting edge. The previous version
   * measured to the axe's bounding-box *centre*, which is why its numbers
   * could look acceptable while the left hand was nowhere near the haft.
   *
   * `handContactR` is expected to be ~0 by construction: the upper grip is
   * authored to coincide with hand.R's bind position and the whole axe is
   * skinned 100% to that bone, so the right-hand contact is a rigidity
   * check, not an animation check. `handContactL` is the number that
   * actually carries information about the pose.
   */
  get reviewWeaponEvidence(): {
    socket: { position: [number, number, number]; rotation: [number, number, number, number] } | null;
    upperGrip: [number, number, number] | null;
    lowerGrip: [number, number, number] | null;
    axeTip: [number, number, number] | null;
    axeWorldCenter: [number, number, number] | null;
    axeWorldExtents: [number, number, number] | null;
    handContactL: number | null;
    handContactR: number | null;
  } {
    const empty = {
      socket: null, upperGrip: null, lowerGrip: null, axeTip: null,
      axeWorldCenter: null, axeWorldExtents: null, handContactL: null, handContactR: null,
    };
    if (!this.authored) return empty;
    const stripped = (name: string) => name.split(":").pop() ?? name;
    const socketNode = this.authored.nodes.find((node) => stripped(node.name) === "weapon_socket") as TransformNode | undefined;
    const socket = socketNode
      ? {
          position: [roundReview(socketNode.position.x), roundReview(socketNode.position.y), roundReview(socketNode.position.z)] as [number, number, number],
          rotation: socketNode.rotationQuaternion
            ? [roundReview(socketNode.rotationQuaternion.x), roundReview(socketNode.rotationQuaternion.y), roundReview(socketNode.rotationQuaternion.z), roundReview(socketNode.rotationQuaternion.w)] as [number, number, number, number]
            : [roundReview(socketNode.rotation.x), roundReview(socketNode.rotation.y), roundReview(socketNode.rotation.z), 1] as [number, number, number, number],
        }
      : null;
    // The glTF loader splits a multi-primitive mesh into separate Babylon
    // meshes named `<name>_primitive0`, `<name>_primitive1`, ... — there is
    // no single Babylon mesh literally named `LOD{n}_PROD_axe` once a mesh
    // has more than one primitive, so match on the prefix and combine every
    // matching primitive's bounds.
    const axeName = `LOD${this.currentReviewLod}_PROD_axe`;
    const axeMeshes = this.authoredMeshes.filter((mesh) => {
      const name = stripped(mesh.name);
      return name === axeName || name.startsWith(`${axeName}_primitive`);
    }) as AbstractMesh[];
    let axeWorldCenter: [number, number, number] | null = null;
    let axeWorldExtents: [number, number, number] | null = null;
    if (axeMeshes.length > 0) {
      let min: Vector3 | null = null;
      let max: Vector3 | null = null;
      for (const mesh of axeMeshes) {
        mesh.refreshBoundingInfo({ applySkeleton: true });
        const box = mesh.getBoundingInfo().boundingBox;
        min = min ? Vector3.Minimize(min, box.minimumWorld) : box.minimumWorld.clone();
        max = max ? Vector3.Maximize(max, box.maximumWorld) : box.maximumWorld.clone();
      }
      const center = min!.add(max!).scale(0.5);
      const extents = max!.subtract(min!).scale(0.5);
      axeWorldCenter = [roundReview(center.x), roundReview(center.y), roundReview(center.z)];
      axeWorldExtents = [roundReview(extents.x), roundReview(extents.y), roundReview(extents.z)];
    }

    const locator = (name: string): Vector3 | null => {
      const node = this.authored?.nodes.find((candidate) => stripped(candidate.name) === name) as TransformNode | undefined;
      if (!node) return null;
      node.computeWorldMatrix(true);
      return node.getAbsolutePosition();
    };
    const upper = locator("upper_grip");
    const lower = locator("lower_grip");
    const tip = locator("axe_tip");

    let handContactL: number | null = null;
    let handContactR: number | null = null;
    const skeleton = this.authored.skeletons?.[0];
    const referenceMesh = this.authoredMeshes.find((mesh) => (mesh as AbstractMesh).skeleton === skeleton) as AbstractMesh | undefined;
    if (skeleton && referenceMesh) {
      const handL = skeleton.bones.find((bone) => stripped(bone.name) === "hand.L");
      const handR = skeleton.bones.find((bone) => stripped(bone.name) === "hand.R");
      if (handL && lower) handContactL = roundReview(Vector3.Distance(handL.getAbsolutePosition(referenceMesh), lower));
      if (handR && upper) handContactR = roundReview(Vector3.Distance(handR.getAbsolutePosition(referenceMesh), upper));
    }

    const asArray = (value: Vector3 | null): [number, number, number] | null =>
      value ? [roundReview(value.x), roundReview(value.y), roundReview(value.z)] : null;
    return {
      socket,
      upperGrip: asArray(upper),
      lowerGrip: asArray(lower),
      axeTip: asArray(tip),
      axeWorldCenter,
      axeWorldExtents,
      handContactL,
      handContactR,
    };
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
    this.authoredAttack = null;
    this.reviewAnimation = null;
    this.reviewGroup = null;
    this.reviewElapsed = 0;
    this.reviewNormalized = 0;
    this.reviewLod = 0;
    this.reviewLodAuto = false;
    this.applyLodVisibility();
  }

  /** Starts one authored attack clip while the shared procedural pose drives timing. */
  playAuthoredAttack(name: "MeleeAttack" | "RangedAttack"): void {
    if (!this.authored) return;
    this.reviewAnimation = null;
    this.authoredAttack = name;
    this.authoredState = "";
    this.updateAuthoredAnimation();
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

  /**
   * Review-only animation selector. Babylon advances the selected group during
   * scene rendering, so no gameplay animator state is changed in this mode.
   */
  setReviewAnimation(name: string): void {
    if (!this.authored) return;
    const group = this.authored.animationGroups.find(
      (candidate) => candidate.name === name || candidate.name.endsWith(`:${name}`),
    );
    if (!group) return;
    this.reviewAnimation = name;
    this.reviewGroup = group;
    this.reviewElapsed = 0;
    this.reviewNormalized = 0;
    this.authoredState = `review:${name}`;
    this.authoredAttack = null;
    for (const candidate of this.authored.animationGroups) candidate.stop();
    group.start(name === "Idle" || name === "Walk" || name === "Run", 1);
    // The review harness seeks exact frames; Babylon must not advance the
    // group between the seek and the single manual render.
    group.pause();
    group.goToFrame(group.from);
  }

  /** Advances the isolated review clip deterministically when the render loop is paused. */
  advanceReview(dt: number): void {
    if (!this.reviewGroup) return;
    const group = this.reviewGroup;
    const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 24;
    const frameSpan = Math.max(1, group.to - group.from);
    this.reviewElapsed += Math.max(0, dt) * group.speedRatio;
    const offset = this.reviewElapsed * frameRate;
    const frame = group.from + (group.loopAnimation ? offset % frameSpan : Math.min(offset, frameSpan));
    this.reviewNormalized = Math.max(0, Math.min(1, (frame - group.from) / frameSpan));
    group.goToFrame(frame);
  }

  /** Seeks the selected authored clip to an exact normalized timeline value. */
  seekReviewAnimation(normalized: number): void {
    if (!this.reviewGroup) return;
    const group = this.reviewGroup;
    const clamped = Math.max(0, Math.min(1, normalized));
    const frameSpan = Math.max(1, group.to - group.from);
    const frameRate = group.targetedAnimations[0]?.animation.framePerSecond ?? 24;
    this.reviewNormalized = clamped;
    this.reviewElapsed = (clamped * frameSpan) / frameRate;
    group.pause();
    group.goToFrame(group.from + clamped * frameSpan);
  }

  /** Selects the authored LOD mesh tier for the isolated review scene. */
  setReviewLod(lod: 0 | 1 | 2): void {
    this.reviewLodAuto = false;
    this.reviewLod = lod;
    this.authored?.setLodTier?.(lod);
    this.applyLodVisibility();
  }

  /** Restores the production distance-based LOD observer for gameplay review. */
  setReviewLodAuto(): void {
    this.reviewLodAuto = true;
    this.authored?.setLodTier?.(null);
    this.applyLodVisibility();
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
    if (this.reviewAnimation) return;
    const state = this.animator.currentState;
    if (state !== "chop") this.authoredAttack = null;
    const name = this.authoredAttack ?? (state === "sprint" ? "Run" : state === "walk" || state === "carryWalk" ? "Walk" : state === "chop" ? "MeleeAttack" : state === "frozen" ? "Hit" : state === "wakeUp" ? "Idle" : "Idle");
    const stateKey = `${state}:${name}`;
    if (stateKey === this.authoredState) return;
    this.authoredState = stateKey;
    for (const group of this.authored.animationGroups) group.stop();
    const group = this.authored.animationGroups.find((candidate) => candidate.name === name || candidate.name.endsWith(`:${name}`));
    group?.start(name === "Idle" || name === "Walk" || name === "Run", 1);
  }

  private applyLodVisibility(): void {
    if (!this.authored) return;
    for (const mesh of this.authored.meshes) {
      const name = mesh.name.split(":").pop() ?? mesh.name;
      if (name === "__root__") {
        mesh.isVisible = false;
        mesh.setEnabled(true);
        continue;
      }
      const tier = name.startsWith("LOD1_PROXY") || name.startsWith("LOD1_PROD") ? 1 : name.startsWith("LOD2_PROXY") || name.startsWith("LOD2_PROD") ? 2 : 0;
      const enabled = tier === this.reviewLod;
      mesh.isVisible = enabled;
      mesh.setEnabled(enabled);
    }
    // The exported proxy meshes sit below explicit LOD1/LOD2 transform
    // groups. Those groups are disabled by the glTF scene default, so the
    // review override must activate the selected group as well as its meshes.
    for (const mesh of this.authoredMeshes) {
      const name = mesh.name.split(":").pop() ?? mesh.name;
      const tier = name.startsWith("LOD1_PROXY") || name.startsWith("LOD1_PROD") ? 1 : name.startsWith("LOD2_PROXY") || name.startsWith("LOD2_PROD") ? 2 : 0;
      if (tier === 0) continue;
      let parent = mesh.parent;
      while (parent && parent !== this.rig.root) {
        const parentName = parent.name.split(":").pop() ?? parent.name;
        if (parentName === "LOD1" || parentName === "LOD2") {
          parent.setEnabled(tier === this.reviewLod);
          break;
        }
        parent = parent.parent;
      }
    }
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

function roundReview(value: number): number {
  return Number(value.toFixed(4));
}

