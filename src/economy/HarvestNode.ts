import { Mesh, MeshBuilder, Scene, TransformNode } from "@babylonjs/core";
import { HARVEST_NODE, type ResourceKind } from "../data/EconomyConfig";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { CollisionWorld } from "../util/Collision";
import { randRange } from "../util/MathUtil";

/**
 * A tree or rock the hero can work by standing next to it. Nodes never run dry
 * — the early game must not be able to dead-lock — but they visibly shrink
 * while worked and recover when left alone.
 */
export class HarvestNode {
  readonly root: TransformNode;
  readonly x: number;
  readonly z: number;
  readonly kind: ResourceKind;
  readonly meshes: Mesh[] = [];
  private fullness = 1;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    collision: CollisionWorld,
    kind: "wood" | "stone",
    x: number,
    z: number,
  ) {
    this.kind = kind;
    this.x = x;
    this.z = z;
    this.root = new TransformNode(`node.${kind}.${x.toFixed(1)}`, scene);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = randRange(0, Math.PI * 2);

    if (kind === "wood") this.buildTree(scene, materials);
    else this.buildRock(scene, materials);

    collision.add(x, z, 0.8);
  }

  private buildTree(scene: Scene, materials: MaterialFactory): void {
    const bark = materials.pbr("mat.node.bark", { color: [0.32, 0.24, 0.18], roughness: 0.92, texture: "bark" });
    const needle = materials.pbr("mat.node.needle", { color: [0.14, 0.29, 0.22], roughness: 0.95 });
    const cap = materials.pbr("mat.node.cap", { color: [0.8, 0.84, 0.9], roughness: 0.6 });

    const trunk = MeshBuilder.CreateCylinder(
      "node.trunk",
      { height: 1.5, diameterTop: 0.26, diameterBottom: 0.44, tessellation: 6 },
      scene,
    );
    trunk.parent = this.root;
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
      cone.parent = this.root;
      cone.position.y = tier.y;
      cone.rotation.y = i * 0.5;
      cone.material = needle;
      this.meshes.push(cone);

      const snow = MeshBuilder.CreateCylinder(
        `node.cap${i}`,
        { height: tier.h * 0.4, diameterTop: 0, diameterBottom: tier.d * 0.78, tessellation: 6 },
        scene,
      );
      snow.parent = this.root;
      snow.position.y = tier.y + tier.h * 0.3;
      snow.rotation.y = i * 0.5 + 0.2;
      snow.material = cap;
      this.meshes.push(snow);
    });
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
      chunk.parent = this.root;
      chunk.position.set(randRange(-0.45, 0.45), randRange(0.25, 0.55), randRange(-0.45, 0.45));
      chunk.rotation.set(randRange(-0.2, 0.2), randRange(0, 3), randRange(-0.2, 0.2));
      chunk.material = rock;
      this.meshes.push(chunk);
    }
    for (let i = 0; i < 3; i++) {
      const vein = MeshBuilder.CreateBox(`node.ore${i}`, { width: 0.16, height: 0.16, depth: 0.16 }, scene);
      vein.parent = this.root;
      vein.position.set(randRange(-0.4, 0.4), randRange(0.5, 0.95), randRange(-0.4, 0.4));
      vein.material = ore;
      this.meshes.push(vein);
    }
  }

  /** Called each time the hero pulls a unit out of this node. */
  registerGather(): void {
    this.fullness = Math.max(0.55, this.fullness - HARVEST_NODE.visualDrainPerGather);
    this.root.scaling.setAll(this.fullness);
  }

  update(dt: number): void {
    if (this.fullness >= 1) return;
    this.fullness = Math.min(1, this.fullness + HARVEST_NODE.visualRecoverPerSecond * dt);
    this.root.scaling.setAll(this.fullness);
  }

  distanceSqTo(x: number, z: number): number {
    const dx = this.x - x;
    const dz = this.z - z;
    return dx * dx + dz * dz;
  }
}
