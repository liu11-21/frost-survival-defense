import { Mesh, MeshBuilder, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import type { NodeSize } from "../data/ResourceNodeConfig";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { CollisionWorld, Obstacle } from "../util/Collision";
import { clamp01, easeOutCubic, randRange } from "../util/MathUtil";

const SIZE_SCALE: Record<NodeSize, number> = { small: 0.78, medium: 1.0, large: 1.28 };

/**
 * The visual half of a resource node: a tree that loses its canopy tier by tier
 * as it is cut, or a rock that visibly chips away, plus the stump / rubble left
 * behind. Kept separate from the node's rules so the two can be reasoned about
 * independently.
 */
export class ResourceNodeView {
  readonly position: Vector3;
  readonly meshes: Mesh[] = [];

  private readonly root: TransformNode;
  private readonly shake: TransformNode;
  private readonly tiers: Mesh[] = [];
  private readonly caps: Mesh[] = [];
  private readonly chunks: Mesh[] = [];
  private readonly trunk: Mesh | null = null;
  private readonly remains: Mesh;
  private readonly obstacle: Obstacle;
  private readonly baseScale: number;

  private shakeTime = 0;
  private regrowing = false;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    collision: CollisionWorld,
    readonly kind: "wood" | "stone",
    x: number,
    z: number,
    size: NodeSize,
  ) {
    this.position = new Vector3(x, 0, z);
    this.baseScale = SIZE_SCALE[size];
    this.root = new TransformNode(`node.${kind}.${x.toFixed(1)}_${z.toFixed(1)}`, scene);
    this.root.position.copyFrom(this.position);
    this.root.rotation.y = randRange(0, Math.PI * 2);
    this.root.scaling.setAll(this.baseScale);

    this.shake = new TransformNode(`${this.root.name}.shake`, scene);
    this.shake.parent = this.root;

    if (kind === "wood") {
      this.trunk = this.buildTree(scene, materials);
      this.remains = this.buildStump(scene, materials);
    } else {
      this.buildRock(scene, materials);
      this.remains = this.buildRubble(scene, materials);
    }
    this.remains.setEnabled(false);

    this.obstacle = collision.add(x, z, 0.75 * this.baseScale);
  }

  private buildTree(scene: Scene, materials: MaterialFactory): Mesh {
    const bark = materials.pbr("mat.node.bark", { color: [0.32, 0.24, 0.18], roughness: 0.92, texture: "bark" });
    const needle = materials.pbr("mat.node.needle", { color: [0.14, 0.29, 0.22], roughness: 0.95 });
    const cap = materials.pbr("mat.node.cap", { color: [0.8, 0.84, 0.9], roughness: 0.6 });

    const trunk = MeshBuilder.CreateCylinder(
      "node.trunk",
      { height: 1.5, diameterTop: 0.26, diameterBottom: 0.44, tessellation: 6 },
      scene,
    );
    trunk.parent = this.shake;
    trunk.position.y = 0.75;
    trunk.material = bark;
    this.meshes.push(trunk);

    const tiers = [
      { y: 1.2, d: 1.9, h: 1.1 },
      { y: 1.9, d: 1.35, h: 0.95 },
      { y: 2.5, d: 0.8, h: 0.75 },
    ];
    tiers.forEach((tier, i) => {
      const cone = MeshBuilder.CreateCylinder(
        `node.tier${i}`,
        { height: tier.h, diameterTop: 0, diameterBottom: tier.d, tessellation: 6 },
        scene,
      );
      cone.parent = this.shake;
      cone.position.y = tier.y;
      cone.rotation.y = i * 0.5;
      cone.material = needle;
      this.tiers.push(cone);
      this.meshes.push(cone);

      const snow = MeshBuilder.CreateCylinder(
        `node.cap${i}`,
        { height: tier.h * 0.4, diameterTop: 0, diameterBottom: tier.d * 0.78, tessellation: 6 },
        scene,
      );
      snow.parent = this.shake;
      snow.position.y = tier.y + tier.h * 0.3;
      snow.rotation.y = i * 0.5 + 0.2;
      snow.material = cap;
      this.caps.push(snow);
      this.meshes.push(snow);
    });
    return trunk;
  }

  private buildStump(scene: Scene, materials: MaterialFactory): Mesh {
    const stump = MeshBuilder.CreateCylinder(
      "node.stump",
      { height: 0.42, diameterTop: 0.5, diameterBottom: 0.6, tessellation: 6 },
      scene,
    );
    stump.parent = this.root;
    stump.position.y = 0.21;
    stump.material = materials.pbr("mat.node.stump", {
      color: [0.4, 0.3, 0.21],
      roughness: 0.94,
      texture: "bark",
    });
    return stump;
  }

  private buildRock(scene: Scene, materials: MaterialFactory): void {
    const rock = materials.pbr("mat.node.rock", { color: [0.44, 0.46, 0.52], roughness: 0.95, texture: "rock" });
    const ore = materials.unlit("mat.node.ore", [0.55, 0.78, 0.95], 1);
    for (let i = 0; i < 4; i++) {
      const chunk = MeshBuilder.CreateCylinder(
        `node.rock${i}`,
        {
          height: randRange(0.5, 1.2),
          diameterTop: randRange(0.3, 0.7),
          diameterBottom: randRange(0.7, 1.2),
          tessellation: 5,
        },
        scene,
      );
      chunk.parent = this.shake;
      chunk.position.set(randRange(-0.45, 0.45), randRange(0.25, 0.55), randRange(-0.45, 0.45));
      chunk.rotation.set(randRange(-0.2, 0.2), randRange(0, 3), randRange(-0.2, 0.2));
      chunk.material = rock;
      this.chunks.push(chunk);
      this.meshes.push(chunk);
    }
    for (let i = 0; i < 3; i++) {
      const vein = MeshBuilder.CreateBox(`node.ore${i}`, { size: 0.16 }, scene);
      vein.parent = this.shake;
      vein.position.set(randRange(-0.4, 0.4), randRange(0.5, 0.95), randRange(-0.4, 0.4));
      vein.material = ore;
      this.chunks.push(vein);
      this.meshes.push(vein);
    }
  }

  private buildRubble(scene: Scene, materials: MaterialFactory): Mesh {
    const rubble = MeshBuilder.CreateCylinder(
      "node.rubble",
      { height: 0.22, diameterTop: 1.1, diameterBottom: 1.5, tessellation: 6 },
      scene,
    );
    rubble.parent = this.root;
    rubble.position.y = 0.1;
    rubble.material = materials.pbr("mat.node.rubble", {
      color: [0.38, 0.39, 0.43],
      roughness: 0.96,
      texture: "rock",
    });
    return rubble;
  }

  /**
   * Reflects how much is left. Trees shed a canopy tier at a time, rocks shrink
   * — so remaining yield is legible from the model alone.
   */
  setStage(ratio: number): void {
    const t = clamp01(ratio);
    if (this.kind === "wood") {
      const visible = t > 0.66 ? 3 : t > 0.33 ? 2 : t > 0 ? 1 : 0;
      for (let i = 0; i < this.tiers.length; i++) {
        const on = i < visible;
        if (this.tiers[i].isEnabled() !== on) this.tiers[i].setEnabled(on);
        // Snow goes first, then the branches themselves.
        const capOn = on && t > 0.5 - i * 0.15;
        if (this.caps[i].isEnabled() !== capOn) this.caps[i].setEnabled(capOn);
      }
      if (this.trunk) this.trunk.scaling.y = 0.55 + t * 0.45;
    } else {
      const scale = 0.45 + t * 0.55;
      for (const chunk of this.chunks) chunk.scaling.setAll(scale);
    }
  }

  playHitReaction(): void {
    this.shakeTime = 0.32;
  }

  showDepleted(): void {
    this.shake.setEnabled(false);
    this.remains.setEnabled(true);
    // A spent node must never block or be targeted again.
    this.obstacle.active = false;
  }

  beginRegrow(): void {
    this.regrowing = true;
    this.remains.setEnabled(false);
    this.shake.setEnabled(true);
    this.root.scaling.setAll(0.001);
  }

  setRegrowProgress(t: number): void {
    if (!this.regrowing) return;
    this.root.scaling.setAll(Math.max(0.05, this.baseScale * easeOutCubic(t)));
  }

  finishRegrow(): void {
    this.regrowing = false;
    this.root.scaling.setAll(this.baseScale);
    this.obstacle.active = true;
    this.setStage(1);
  }

  /** Puts the node back to its untouched state for a new run. */
  restore(): void {
    this.regrowing = false;
    this.remains.setEnabled(false);
    this.shake.setEnabled(true);
    this.root.scaling.setAll(this.baseScale);
    this.obstacle.active = true;
  }

  update(dt: number): void {
    if (this.shakeTime <= 0) return;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const decay = this.shakeTime / 0.32;
    const wobble = Math.sin(this.shakeTime * 52) * 0.07 * decay * decay;
    this.shake.rotation.z = wobble;
    this.shake.rotation.x = wobble * 0.6;
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}
