import { Mesh, MeshBuilder, Scene, Vector3 } from "@babylonjs/core";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { Damageable } from "./Damageable";

export type ProjectileKind =
  | "arrow"
  | "bolt"
  | "orb"
  | "shell"
  | "musketBall"
  | "crossbowBolt"
  | "frostShard"
  | "sniperRound"
  | "mortarShell";

interface Projectile {
  mesh: Mesh;
  active: boolean;
  kind: ProjectileKind;
  target: Damageable | null;
  tx: number;
  ty: number;
  tz: number;
  speed: number;
  life: number;
  onHit: ((x: number, z: number) => void) | null;
}

const SPEEDS: Record<ProjectileKind, number> = {
  arrow: 26,
  bolt: 22,
  orb: 15,
  shell: 18,
  musketBall: 38,
  crossbowBolt: 30,
  frostShard: 20,
  sniperRound: 46,
  mortarShell: 14,
};

/**
 * Pooled flying shots. Every ranged attack in the game is a visible object with
 * travel time, and the damage lands when the projectile arrives.
 */
export class ProjectilePool {
  private readonly pools = new Map<ProjectileKind, Projectile[]>();
  private readonly dir = new Vector3();

  constructor(scene: Scene, materials: MaterialFactory, perKind = 40) {
    const build = (kind: ProjectileKind, index: number): Mesh => {
      switch (kind) {
        case "arrow":
          return MeshBuilder.CreateCylinder(
            `proj.arrow${index}`,
            { height: 0.62, diameterTop: 0.02, diameterBottom: 0.07, tessellation: 4 },
            scene,
          );
        case "bolt":
          return MeshBuilder.CreateBox(`proj.bolt${index}`, { width: 0.09, height: 0.09, depth: 0.42 }, scene);
        case "orb":
          return MeshBuilder.CreateSphere(`proj.orb${index}`, { diameter: 0.42, segments: 4 }, scene);
        case "shell":
          return MeshBuilder.CreateSphere(`proj.shell${index}`, { diameter: 0.3, segments: 4 }, scene);
        case "musketBall":
          return MeshBuilder.CreateCylinder(
            `proj.musketBall${index}`,
            { height: 0.16, diameterTop: 0.06, diameterBottom: 0.06, tessellation: 5 },
            scene,
          );
        case "crossbowBolt":
          return MeshBuilder.CreateBox(`proj.crossbowBolt${index}`, { width: 0.07, height: 0.07, depth: 0.5 }, scene);
        case "frostShard":
          return MeshBuilder.CreateCylinder(
            `proj.frostShard${index}`,
            { height: 0.4, diameterTop: 0, diameterBottom: 0.18, tessellation: 5 },
            scene,
          );
        case "sniperRound":
          return MeshBuilder.CreateCylinder(
            `proj.sniperRound${index}`,
            { height: 0.5, diameterTop: 0.03, diameterBottom: 0.05, tessellation: 4 },
            scene,
          );
        case "mortarShell":
          return MeshBuilder.CreateSphere(`proj.mortarShell${index}`, { diameter: 0.44, segments: 4 }, scene);
      }
    };

    const colors: Record<ProjectileKind, [number, number, number]> = {
      arrow: [0.85, 0.8, 0.62],
      bolt: [0.75, 0.55, 1.0],
      orb: [0.7, 0.6, 1.0],
      shell: [1.0, 0.72, 0.35],
      musketBall: [1.0, 0.72, 0.25],
      crossbowBolt: [0.6, 0.42, 0.28],
      frostShard: [0.65, 0.9, 1.0],
      sniperRound: [0.85, 0.85, 0.9],
      mortarShell: [0.95, 0.4, 0.15],
    };

    for (const kind of [
      "arrow",
      "bolt",
      "orb",
      "shell",
      "musketBall",
      "crossbowBolt",
      "frostShard",
      "sniperRound",
      "mortarShell",
    ] as ProjectileKind[]) {
      const mat = materials.unlit(`mat.proj.${kind}`, colors[kind], 1);
      const list: Projectile[] = [];
      for (let i = 0; i < perKind; i++) {
        const mesh = build(kind, i);
        mesh.material = mat;
        mesh.isPickable = false;
        mesh.alwaysSelectAsActiveMesh = true;
        mesh.setEnabled(false);
        list.push({
          mesh,
          active: false,
          kind,
          target: null,
          tx: 0,
          ty: 0,
          tz: 0,
          speed: SPEEDS[kind],
          life: 0,
          onHit: null,
        });
      }
      this.pools.set(kind, list);
    }
  }

  fire(
    kind: ProjectileKind,
    fromX: number,
    fromY: number,
    fromZ: number,
    target: Damageable,
    onHit: (x: number, z: number) => void,
  ): void {
    const pool = this.pools.get(kind);
    const p = pool?.find((item) => !item.active);
    if (!p) {
      // Pool exhausted: resolve immediately so a shot is never silently lost.
      onHit(target.position.x, target.position.z);
      return;
    }
    p.active = true;
    p.target = target;
    p.tx = target.position.x;
    p.ty = target.position.y + 0.7;
    p.tz = target.position.z;
    p.speed = SPEEDS[kind];
    p.life = 3;
    p.onHit = onHit;
    p.mesh.position.set(fromX, fromY, fromZ);
    p.mesh.setEnabled(true);
  }

  /** How many shots are currently in flight. */
  get activeCount(): number {
    let n = 0;
    for (const pool of this.pools.values()) {
      for (const p of pool) if (p.active) n++;
    }
    return n;
  }

  update(dt: number): void {
    for (const pool of this.pools.values()) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) continue;

        if (p.target && p.target.alive) {
          p.tx = p.target.position.x;
          p.ty = p.target.position.y + 0.7;
          p.tz = p.target.position.z;
        }

        this.dir.set(p.tx - p.mesh.position.x, p.ty - p.mesh.position.y, p.tz - p.mesh.position.z);
        const dist = this.dir.length();
        const step = p.speed * dt;
        p.life -= dt;

        if (dist <= step || p.life <= 0) {
          p.active = false;
          p.mesh.setEnabled(false);
          const cb = p.onHit;
          const hx = p.tx;
          const hz = p.tz;
          p.onHit = null;
          p.target = null;
          cb?.(hx, hz);
          continue;
        }

        const inv = step / dist;
        p.mesh.position.x += this.dir.x * inv;
        p.mesh.position.y += this.dir.y * inv;
        p.mesh.position.z += this.dir.z * inv;
        if (p.kind === "arrow" || p.kind === "bolt" || p.kind === "musketBall" || p.kind === "crossbowBolt" || p.kind === "sniperRound") {
          p.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z);
          p.mesh.rotation.x = p.kind === "arrow" ? Math.PI / 2 - Math.asin(this.dir.y / dist) : 0;
        } else {
          p.mesh.rotation.y += dt * 6;
        }
      }
    }
  }

  clear(): void {
    for (const pool of this.pools.values()) {
      for (const p of pool) {
        p.active = false;
        p.onHit = null;
        p.target = null;
        p.mesh.setEnabled(false);
      }
    }
  }

  dispose(): void {
    for (const pool of this.pools.values()) for (const p of pool) p.mesh.dispose();
    this.pools.clear();
  }
}
