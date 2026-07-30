import { Mesh, MeshBuilder, Scene, VertexData } from "@babylonjs/core";

/**
 * Flat ground decals used as faction badges.
 *
 * They are deliberately different *shapes*, not just different colours: an ally
 * gets smooth arcs, an enemy gets a broken ring of spikes. That is what makes
 * the system work for a colour-blind player without a separate mode having to
 * swap anything out.
 */

interface ArcSpec {
  /** Centre of the arc, radians. */
  centre: number;
  /** Total angular width, radians. */
  sweep: number;
  /** Outer radius grows toward the middle of the arc when `pointed`. */
  pointed?: boolean;
}

const ALLY_ARCS: ArcSpec[] = [
  { centre: 0, sweep: Math.PI * 0.82 },
  { centre: Math.PI, sweep: Math.PI * 0.82 },
];

const ENEMY_ARCS: ArcSpec[] = [
  { centre: 0, sweep: Math.PI * 0.44, pointed: true },
  { centre: (Math.PI * 2) / 3, sweep: Math.PI * 0.44, pointed: true },
  { centre: (Math.PI * 4) / 3, sweep: Math.PI * 0.44, pointed: true },
];

function buildArcs(name: string, scene: Scene, arcs: ArcSpec[], inner: number, outer: number): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  for (const arc of arcs) {
    const segments = Math.max(6, Math.round((arc.sweep / (Math.PI * 2)) * 48));
    const start = arc.centre - arc.sweep * 0.5;
    const base = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = start + arc.sweep * t;
      // A pointed arc bulges outward at its middle, giving it a spike.
      const bulge = arc.pointed ? Math.sin(t * Math.PI) * (outer - inner) * 0.9 : 0;
      const rOuter = outer + bulge;
      positions.push(Math.sin(angle) * inner, 0, Math.cos(angle) * inner);
      positions.push(Math.sin(angle) * rOuter, 0, Math.cos(angle) * rOuter);
      normals.push(0, 1, 0, 0, 1, 0);
    }
    for (let i = 0; i < segments; i++) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }

  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.alwaysSelectAsActiveMesh = true;
  return mesh;
}

/** Two smooth arcs — the friendly badge. */
export function createAllyMarker(scene: Scene): Mesh {
  return buildArcs("marker.ally", scene, ALLY_ARCS, 0.42, 0.56);
}

/** Three spikes with gaps between them — the hostile badge. */
export function createEnemyMarker(scene: Scene): Mesh {
  return buildArcs("marker.enemy", scene, ENEMY_ARCS, 0.4, 0.54);
}

const FULL_RING: ArcSpec[] = [{ centre: 0, sweep: Math.PI * 2 - 0.01 }];

/**
 * A complete double ring — thicker and unbroken, unlike the split arcs every
 * other ally uses. The hero must never be mistaken for an ordinary squad
 * member in a crowd, so this is a different *shape*, not just a bigger copy.
 */
export function createHeroGroundMarker(scene: Scene): Mesh {
  const inner = buildArcs("marker.hero.inner", scene, FULL_RING, 0.5, 0.62);
  const outer = buildArcs("marker.hero.outer", scene, FULL_RING, 0.72, 0.82);
  outer.parent = inner;
  return inner;
}

/** A small diamond, billboarded so it reads from any camera angle. */
export function createAllyHeadMarker(scene: Scene): Mesh {
  const mesh = MeshBuilder.CreateDisc("marker.head.ally", { radius: 0.22, tessellation: 4 }, scene);
  mesh.rotation.z = Math.PI / 4;
  return mesh;
}

/** A small upward spike — deliberately not a diamond, for the same reason
 * the ground badges differ in shape rather than only in colour. */
export function createEnemyHeadMarker(scene: Scene): Mesh {
  const mesh = MeshBuilder.CreateDisc("marker.head.enemy", { radius: 0.24, tessellation: 3 }, scene);
  return mesh;
}

/** A larger five-point marker, unique to the hero. */
export function createHeroHeadMarker(scene: Scene): Mesh {
  const mesh = MeshBuilder.CreateDisc("marker.head.hero", { radius: 0.3, tessellation: 5 }, scene);
  return mesh;
}

/** The thin light column above the hero's head marker. */
export function createHeroBeam(scene: Scene): Mesh {
  return MeshBuilder.CreateCylinder("marker.hero.beam", { height: 1.2, diameter: 0.05, tessellation: 6 }, scene);
}
