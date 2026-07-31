import { Mesh, MeshBuilder, Scene, Vector3 } from "@babylonjs/core";
import { ECONOMY, type ResourceKind } from "../data/EconomyConfig";
import { MaterialFactory } from "../scene/MaterialFactory";
import { randRange } from "../util/MathUtil";

interface Pickup {
  mesh: Mesh;
  kind: ResourceKind;
  amount: number;
  active: boolean;
  life: number;
  vy: number;
  spin: number;
  homing: boolean;
}

/**
 * Coins from kills and the resources a destroyed warehouse spills. Pooled, so a
 * boss wave never allocates a mesh mid-fight.
 */
export class PickupPool {
  private readonly pools: Record<ResourceKind, Pickup[]> = { wood: [], stone: [], gold: [] };
  private readonly target = new Vector3();

  constructor(scene: Scene, materials: MaterialFactory, perKind = 90) {
    const shapes: Record<ResourceKind, () => Mesh> = {
      gold: () => MeshBuilder.CreateCylinder("pk.gold", { height: 0.09, diameter: 0.36, tessellation: 8 }, scene),
      wood: () => MeshBuilder.CreateCylinder("pk.wood", { height: 0.42, diameter: 0.2, tessellation: 6 }, scene),
      stone: () => MeshBuilder.CreateSphere("pk.stone", { diameter: 0.32, segments: 2 }, scene),
    };
    const colors: Record<ResourceKind, [number, number, number]> = {
      gold: [1.0, 0.82, 0.28],
      wood: [0.6, 0.42, 0.24],
      stone: [0.66, 0.68, 0.72],
    };

    for (const kind of ["gold", "wood", "stone"] as ResourceKind[]) {
      const mat = materials.pbr(`mat.pickup.${kind}`, {
        color: colors[kind],
        roughness: kind === "gold" ? 0.25 : 0.8,
        metallic: kind === "gold" ? 0.9 : 0,
        emissive: kind === "gold" ? [0.5, 0.35, 0.05] : undefined,
      });
      const count = kind === "gold" ? perKind : Math.floor(perKind * 0.6);
      for (let i = 0; i < count; i++) {
        const mesh = shapes[kind]();
        mesh.name = `pickup.${kind}${i}`;
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        this.pools[kind].push({
          mesh,
          kind,
          amount: 1,
          active: false,
          life: 0,
          vy: 0,
          spin: 0,
          homing: false,
        });
      }
    }
  }

  /** How many pickups are currently lying on the ground. */
  get activeCount(): number {
    let n = 0;
    for (const kind of ["gold", "wood", "stone"] as ResourceKind[]) {
      for (const p of this.pools[kind]) if (p.active) n++;
    }
    return n;
  }

  spawn(kind: ResourceKind, x: number, z: number, amount: number, lifetime?: number): void {
    const pool = this.pools[kind];
    const p = pool.find((item) => !item.active);
    if (!p) return;
    p.active = true;
    p.amount = amount;
    p.life = lifetime ?? (kind === "gold" ? ECONOMY.coinLifetime : ECONOMY.pickupLifetime);
    p.vy = randRange(2.2, 3.6);
    p.spin = randRange(-6, 6);
    p.homing = false;
    p.mesh.position.set(x + randRange(-0.5, 0.5), 0.6, z + randRange(-0.5, 0.5));
    p.mesh.rotation.set(randRange(0, 3), randRange(0, 3), randRange(0, 3));
    p.mesh.setEnabled(true);
  }

  /**
   * Advances every pickup and reports what the hero walked over.
   * `collect` is called with the kind and amount for each one gathered.
   */
  update(
    dt: number,
    heroX: number,
    heroZ: number,
    collect: (kind: ResourceKind, amount: number) => void,
    /** The Auto Collector also vacuums enemy coin drops, but deliberately
     * leaves spilled wood and stone for the player to recover. */
    autoCollectGold = false,
  ): void {
    this.target.set(heroX, 0.5, heroZ);
    for (const kind of ["gold", "wood", "stone"] as ResourceKind[]) {
      const pool = this.pools[kind];
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) continue;

        p.life -= dt;
        if (p.life <= 0) {
          this.retire(p);
          continue;
        }

        if (autoCollectGold && p.kind === "gold") {
          collect(p.kind, p.amount);
          this.retire(p);
          continue;
        }

        const dx = heroX - p.mesh.position.x;
        const dz = heroZ - p.mesh.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < ECONOMY.pickupMagnetRange) p.homing = true;

        if (p.homing) {
          if (dist < 0.55) {
            collect(p.kind, p.amount);
            this.retire(p);
            continue;
          }
          const pull = 9 * dt;
          p.mesh.position.x += (dx / Math.max(dist, 0.001)) * pull;
          p.mesh.position.z += (dz / Math.max(dist, 0.001)) * pull;
          p.mesh.position.y += (0.7 - p.mesh.position.y) * Math.min(1, dt * 6);
        } else {
          p.vy -= 12 * dt;
          p.mesh.position.y += p.vy * dt;
          if (p.mesh.position.y < 0.22) {
            p.mesh.position.y = 0.22;
            p.vy = 0;
          }
        }
        p.mesh.rotation.y += p.spin * dt;
      }
    }
  }

  /** Debug/read-only aid for verifying the Auto Collector only drains coins. */
  activeByKind(kind: ResourceKind): number {
    let count = 0;
    for (const pickup of this.pools[kind]) if (pickup.active) count++;
    return count;
  }

  private retire(p: Pickup): void {
    p.active = false;
    p.homing = false;
    p.mesh.setEnabled(false);
  }

  clear(): void {
    for (const kind of ["gold", "wood", "stone"] as ResourceKind[]) {
      for (const p of this.pools[kind]) this.retire(p);
    }
  }

  dispose(): void {
    for (const kind of ["gold", "wood", "stone"] as ResourceKind[]) {
      for (const p of this.pools[kind]) p.mesh.dispose();
      this.pools[kind].length = 0;
    }
  }
}
