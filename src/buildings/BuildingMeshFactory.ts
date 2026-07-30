import { Material, Mesh, MeshBuilder, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import type { BuildStageDef } from "../construction/BuildingAnimator";
import type { BuildingType } from "../data/BuildingDefinitions";
import { MAP, WALL_SEGMENT_DEPTH, WALL_SIDE_BY_SLOT } from "../data/BuildSlotDefinitions";
import { MaterialFactory } from "../scene/MaterialFactory";
import { crenelRow, torch } from "./WallMeshHelpers";

export interface BuildingVisual {
  root: TransformNode;
  stages: BuildStageDef[];
  /** Meshes that flash when the building is hit. */
  body: Mesh[];
}

export interface Ctx {
  scene: Scene;
  root: TransformNode;
  mats: Record<string, Material>;
  body: Mesh[];
}

export function box(c: Ctx, name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: string, rx = 0, ry = 0): Mesh {
  const m = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, c.scene);
  m.parent = c.root;
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  m.material = c.mats[mat];
  m.isPickable = false;
  m.receiveShadows = true;
  c.body.push(m);
  return m;
}

export function cyl(c: Ctx, name: string, h: number, dTop: number, dBot: number, x: number, y: number, z: number, mat: string, tess = 6): Mesh {
  const m = MeshBuilder.CreateCylinder(name, { height: h, diameterTop: dTop, diameterBottom: dBot, tessellation: tess }, c.scene);
  m.parent = c.root;
  m.position.set(x, y, z);
  m.material = c.mats[mat];
  m.isPickable = false;
  m.receiveShadows = true;
  c.body.push(m);
  return m;
}

/**
 * Every building is assembled from several visible part groups so the staged
 * construction animation has real geometry to reveal.
 */
export function createBuildingVisual(
  scene: Scene,
  materials: MaterialFactory,
  type: BuildingType,
  x: number,
  z: number,
  yaw: number,
  slotId?: string,
): BuildingVisual {
  const root = new TransformNode(`building.${type}.${x.toFixed(1)}_${z.toFixed(1)}`, scene);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;

  const mats: Record<string, Material> = {
    stone: materials.pbr("mat.b.stone", { color: [0.36, 0.37, 0.4], roughness: 0.94, texture: "rock" }),
    plank: materials.pbr("mat.b.plank", { color: [0.58, 0.42, 0.26], roughness: 0.88, texture: "plank" }),
    beam: materials.pbr("mat.b.beam", { color: [0.38, 0.27, 0.17], roughness: 0.9, texture: "bark" }),
    roof: materials.pbr("mat.b.roof", { color: [0.3, 0.26, 0.26], roughness: 0.82, texture: "plank" }),
    metal: materials.pbr("mat.b.metal", { color: [0.55, 0.58, 0.62], roughness: 0.3, metallic: 0.9 }),
    dark: materials.pbr("mat.b.dark", { color: [0.2, 0.2, 0.23], roughness: 0.7, metallic: 0.5 }),
    glow: materials.unlit("mat.b.glow", [1.0, 0.7, 0.3], 1),
    cool: materials.unlit("mat.b.cool", [0.42, 0.82, 1.0], 1),
    green: materials.unlit("mat.b.green", [0.45, 1.0, 0.6], 1),
    frost: materials.unlit("mat.b.frost", [0.55, 0.9, 1.0], 1),
    ember: materials.unlit("mat.b.ember", [1.0, 0.42, 0.15], 1),
    darkwood: materials.pbr("mat.b.darkwood", { color: [0.3, 0.22, 0.15], roughness: 0.85, texture: "bark" }),
  };

  const c: Ctx = { scene, root, mats, body: [] };
  const anchor = new Vector3(x, 1.2, z);
  const stages: BuildStageDef[] = [];
  const stage = (name: string, meshes: Mesh[], dropIn = false): void => {
    stages.push({ name, meshes, anchor, dropIn });
  };

  switch (type) {
    case "mine":
    case "goldMine": {
      const prefix = type === "goldMine" ? "gm" : "m";
      const oreMaterial = type === "goldMine" ? "glow" : "stone";
      stage("base", [box(c, `${prefix}.base`, 2.4, 0.3, 2.4, 0, 0.15, 0, "stone")]);
      stage("frame", [
        box(c, `${prefix}.p1`, 0.2, 1.5, 0.2, -0.9, 0.9, -0.9, "beam"),
        box(c, `${prefix}.p2`, 0.2, 1.5, 0.2, 0.9, 0.9, -0.9, "beam"),
        box(c, `${prefix}.lintel`, 2.1, 0.24, 0.24, 0, 1.7, -0.9, "beam"),
      ]);
      stage("shaft", [
        box(c, `${prefix}.mouth`, 1.5, 1.3, 0.5, 0, 0.85, -1.0, "dark"),
        cyl(c, `${prefix}.pile`, 0.7, 0.5, 1.4, 0.8, 0.4, 0.7, oreMaterial),
      ]);
      stage("cart", [
        box(c, `${prefix}.cart`, 0.9, 0.5, 0.7, -0.7, 0.55, 0.7, "plank"),
        cyl(c, `${prefix}.wheel`, 0.12, 0.42, 0.42, -0.7, 0.3, 0.7, "dark"),
        box(c, `${prefix}.lamp`, 0.2, 0.24, 0.2, 0, 1.95, -0.9, "glow"),
      ], true);
      break;
    }
    case "lumberyard": {
      stage("base", [box(c, "l.base", 2.4, 0.24, 2.4, 0, 0.12, 0, "plank")]);
      stage("posts", [
        box(c, "l.p1", 0.2, 1.5, 0.2, -1.0, 0.9, -1.0, "beam"),
        box(c, "l.p2", 0.2, 1.5, 0.2, 1.0, 0.9, -1.0, "beam"),
        box(c, "l.p3", 0.2, 1.5, 0.2, -1.0, 0.9, 1.0, "beam"),
        box(c, "l.p4", 0.2, 1.5, 0.2, 1.0, 0.9, 1.0, "beam"),
      ]);
      stage("roof", [
        box(c, "l.roofA", 2.7, 0.18, 1.7, 0, 1.85, -0.6, "roof", -0.5),
        box(c, "l.roofB", 2.7, 0.18, 1.7, 0, 1.85, 0.6, "roof", 0.5),
      ], true);
      stage("saw", [
        cyl(c, "l.blade", 0.08, 1.0, 1.0, 0, 1.0, 0, "metal", 12),
        box(c, "l.logs", 2.0, 0.34, 0.34, 0, 0.4, 0.85, "beam", 0, 0),
        box(c, "l.logs2", 2.0, 0.34, 0.34, 0, 0.74, 0.85, "beam", 0, 0),
      ]);
      break;
    }
    case "warehouse": {
      stage("base", [box(c, "w.base", 3.0, 0.3, 2.6, 0, 0.15, 0, "stone")]);
      stage("walls", [
        box(c, "w.wall", 2.8, 1.7, 2.4, 0, 1.0, 0, "plank"),
        box(c, "w.door", 1.0, 1.2, 0.12, 0, 0.7, -1.24, "beam"),
      ]);
      stage("roof", [
        box(c, "w.roofA", 3.2, 0.2, 1.6, 0, 2.2, -0.62, "roof", -0.6),
        box(c, "w.roofB", 3.2, 0.2, 1.6, 0, 2.2, 0.62, "roof", 0.6),
        box(c, "w.ridge", 3.3, 0.18, 0.22, 0, 2.62, 0, "beam"),
      ], true);
      stage("crates", [
        box(c, "w.c1", 0.7, 0.7, 0.7, -1.7, 0.35, 0.6, "plank"),
        box(c, "w.c2", 0.6, 0.6, 0.6, 1.7, 0.3, -0.5, "plank"),
        box(c, "w.sign", 0.7, 0.4, 0.1, 0, 1.9, -1.3, "glow"),
      ]);
      break;
    }
    case "recruitHall": {
      stage("base", [box(c, "r.base", 3.0, 0.3, 2.6, 0, 0.15, 0, "stone")]);
      stage("walls", [
        box(c, "r.wall", 2.7, 1.8, 2.3, 0, 1.05, 0, "beam"),
        box(c, "r.gate", 1.2, 1.4, 0.14, 0, 0.8, -1.2, "dark"),
      ]);
      stage("roof", [
        box(c, "r.roof", 3.3, 0.24, 2.9, 0, 2.05, 0, "roof"),
        box(c, "r.tower", 0.9, 1.2, 0.9, 0, 2.6, 0.6, "beam"),
      ], true);
      stage("banners", [
        box(c, "r.b1", 0.16, 1.1, 0.5, -1.45, 1.4, -1.1, "glow"),
        box(c, "r.b2", 0.16, 1.1, 0.5, 1.45, 1.4, -1.1, "glow"),
        box(c, "r.rack", 1.6, 0.16, 0.3, 0, 1.9, 0.6, "metal"),
      ]);
      break;
    }
    case "autoCollector": {
      stage("base", [cyl(c, "a.base", 0.4, 2.0, 2.4, 0, 0.2, 0, "stone", 8)]);
      stage("pylon", [cyl(c, "a.pylon", 2.4, 0.5, 0.9, 0, 1.4, 0, "metal", 6)]);
      stage("arms", [
        box(c, "a.arm1", 1.8, 0.14, 0.14, 0, 2.3, 0, "metal"),
        box(c, "a.arm2", 0.14, 0.14, 1.8, 0, 2.3, 0, "metal"),
      ], true);
      stage("core", [cyl(c, "a.core", 0.7, 0.7, 0.7, 0, 2.85, 0, "green", 6)]);
      break;
    }
    case "autoRebuilder": {
      stage("base", [box(c, "b.base", 2.4, 0.34, 2.4, 0, 0.17, 0, "stone")]);
      stage("frame", [
        box(c, "b.f1", 0.2, 2.0, 0.2, -0.9, 1.2, -0.9, "metal"),
        box(c, "b.f2", 0.2, 2.0, 0.2, 0.9, 1.2, -0.9, "metal"),
        box(c, "b.f3", 0.2, 2.0, 0.2, -0.9, 1.2, 0.9, "metal"),
        box(c, "b.f4", 0.2, 2.0, 0.2, 0.9, 1.2, 0.9, "metal"),
      ]);
      stage("crane", [
        box(c, "b.top", 2.2, 0.2, 2.2, 0, 2.3, 0, "dark"),
        box(c, "b.jib", 0.16, 0.16, 2.4, 0, 2.7, 0.7, "metal"),
      ], true);
      stage("core", [
        cyl(c, "b.core", 0.9, 0.6, 0.6, 0, 1.3, 0, "cool", 6),
        box(c, "b.lamp", 0.24, 0.24, 0.24, 0, 2.95, 0, "cool"),
      ]);
      break;
    }
    case "tower": {
      stage("base", [
        cyl(c, "t.base", 0.5, 1.9, 2.3, 0, 0.25, 0, "stone", 8),
        // Four corner buttresses give the footing real visual weight instead
        // of reading as a plain cylinder the shaft merely sits on.
        box(c, "t.but1", 0.32, 0.7, 0.32, -1.15, 0.35, -1.15, "stone", 0, 0.79),
        box(c, "t.but2", 0.32, 0.7, 0.32, 1.15, 0.35, -1.15, "stone", 0, -0.79),
        box(c, "t.but3", 0.32, 0.7, 0.32, -1.15, 0.35, 1.15, "stone", 0, -0.79),
        box(c, "t.but4", 0.32, 0.7, 0.32, 1.15, 0.35, 1.15, "stone", 0, 0.79),
      ]);
      stage("shaft", [cyl(c, "t.shaft", 2.1, 1.35, 1.7, 0, 1.4, 0, "stone", 8)]);
      stage("head", [
        cyl(c, "t.head", 0.7, 2.0, 1.6, 0, 2.75, 0, "beam", 8),
        // A full four-way crenellation ring instead of just the two merlons
        // that used to flank the barrel — the silhouette now reads as a
        // proper battlement from every approach angle, not only front-on.
        box(c, "t.crenA", 0.35, 0.4, 0.35, -0.7, 3.2, 0, "stone"),
        box(c, "t.crenB", 0.35, 0.4, 0.35, 0.7, 3.2, 0, "stone"),
        box(c, "t.crenC", 0.35, 0.4, 0.35, 0, 3.2, -0.7, "stone"),
        box(c, "t.crenD", 0.35, 0.4, 0.35, 0, 3.2, 0.7, "stone"),
      ], true);
      stage("gun", [
        cyl(c, "t.barrel", 1.5, 0.32, 0.42, 0, 3.15, 0.6, "metal", 8),
        box(c, "t.eye", 0.26, 0.26, 0.26, 0, 3.5, 0, "glow"),
        // A small ammo rack beside the barrel and a banner behind it so the
        // tower isn't just "cylinder plus one gun" from any other angle.
        box(c, "t.ammo1", 0.16, 0.5, 0.16, -0.55, 3.05, 0.35, "metal"),
        box(c, "t.ammo2", 0.16, 0.5, 0.16, -0.75, 3.05, 0.2, "metal"),
        box(c, "t.pole", 0.07, 0.9, 0.07, 0, 3.75, -0.55, "beam"),
        box(c, "t.flag", 0.05, 0.5, 0.4, 0.02, 3.9, -0.78, "cool"),
      ]);
      break;
    }
    case "crossbowTower": {
      // Low, light, fast — a small wooden platform, not a stone shaft. The
      // silhouette reads as "improvised" next to the tower's proper masonry.
      stage("base", [cyl(c, "cb.base", 0.4, 1.7, 1.9, 0, 0.2, 0, "stone", 6)]);
      stage("legs", [
        box(c, "cb.leg1", 0.18, 1.3, 0.18, -0.75, 0.85, -0.75, "beam"),
        box(c, "cb.leg2", 0.18, 1.3, 0.18, 0.75, 0.85, -0.75, "beam"),
        box(c, "cb.leg3", 0.18, 1.3, 0.18, -0.75, 0.85, 0.75, "beam"),
        box(c, "cb.leg4", 0.18, 1.3, 0.18, 0.75, 0.85, 0.75, "beam"),
      ]);
      stage("deck", [box(c, "cb.deck", 1.8, 0.16, 1.8, 0, 1.58, 0, "plank")], true);
      stage("bow", [
        box(c, "cb.stock", 0.16, 0.2, 1.1, 0, 1.85, 0.1, "darkwood"),
        box(c, "cb.limb1", 1.3, 0.1, 0.12, -0.35, 1.9, -0.35, "beam", 0, 0.5),
        box(c, "cb.limb2", 1.3, 0.1, 0.12, 0.35, 1.9, -0.35, "beam", 0, -0.5),
        box(c, "cb.quiver", 0.3, 0.5, 0.3, 0.55, 1.85, 0.5, "darkwood"),
      ]);
      break;
    }
    case "frostTower": {
      // A crystalline spire, deliberately unlike every stone-and-timber
      // building around it, so a slow field reads as "cold" from a glance.
      stage("base", [cyl(c, "fr.base", 0.4, 1.9, 2.2, 0, 0.2, 0, "stone", 6)]);
      stage("spire", [cyl(c, "fr.spire", 2.0, 0.3, 1.1, 0, 1.4, 0, "frost", 6)]);
      stage("ring", [
        cyl(c, "fr.ring", 0.14, 1.5, 1.5, 0, 2.1, 0, "metal", 12),
        box(c, "fr.strut1", 0.1, 0.1, 1.5, 0, 2.1, 0, "metal"),
        box(c, "fr.strut2", 1.5, 0.1, 0.1, 0, 2.1, 0, "metal"),
      ], true);
      stage("crystal", [
        cyl(c, "fr.core", 0.9, 0, 0.5, 0, 2.85, 0, "frost", 6),
        box(c, "fr.shard1", 0.14, 0.5, 0.14, 0.4, 2.3, 0.3, "frost", 0.3, 0.7),
        box(c, "fr.shard2", 0.14, 0.5, 0.14, -0.4, 2.3, -0.3, "frost", -0.3, -0.7),
      ]);
      break;
    }
    case "sniperTower": {
      // Tall and thin: the silhouette itself communicates "long range single
      // target" next to the tower's stout, wide-barreled area weapon.
      stage("base", [cyl(c, "sn.base", 0.5, 1.6, 1.9, 0, 0.25, 0, "stone", 6)]);
      stage("shaft", [cyl(c, "sn.shaft", 3.4, 0.55, 0.9, 0, 2.0, 0, "stone", 6)]);
      stage("platform", [
        box(c, "sn.deck", 1.6, 0.18, 1.6, 0, 3.75, 0, "metal"),
        box(c, "sn.rail1", 1.6, 0.4, 0.08, 0, 4.0, 0.78, "dark"),
        box(c, "sn.rail2", 1.6, 0.4, 0.08, 0, 4.0, -0.78, "dark"),
      ], true);
      stage("barrel", [
        box(c, "sn.body", 0.3, 0.3, 1.6, 0, 4.1, 0.4, "dark"),
        cyl(c, "sn.barrel", 2.0, 0.08, 0.12, 0, 4.1, 1.5, "metal", 8),
        box(c, "sn.scope", 0.14, 0.14, 0.6, 0, 4.35, 0.2, "metal"),
        box(c, "sn.lens", 0.16, 0.16, 0.04, 0, 4.35, -0.12, "glow"),
      ]);
      break;
    }
    case "mortar": {
      // Squat, heavy, wide-mouthed — the largest footprint of the five attack
      // buildings, angled up rather than levelled, to read as arc-fire.
      stage("base", [cyl(c, "mo.base", 0.5, 2.3, 2.6, 0, 0.25, 0, "stone", 8)]);
      stage("cradle", [
        box(c, "mo.side1", 0.3, 1.0, 1.6, -0.9, 0.9, 0, "metal"),
        box(c, "mo.side2", 0.3, 1.0, 1.6, 0.9, 0.9, 0, "metal"),
      ]);
      stage("barrel", [cyl(c, "mo.barrel", 2.2, 0.9, 0.6, 0, 1.55, 0.35, "dark", 8)], true);
      stage("details", [
        box(c, "mo.rack1", 0.3, 0.6, 0.3, -1.1, 0.45, -0.9, "beam"),
        box(c, "mo.rack2", 0.3, 0.6, 0.3, -1.1, 0.45, -0.5, "beam"),
        cyl(c, "mo.shell1", 0.5, 0.22, 0.22, -1.1, 0.75, -0.9, "ember", 6),
        cyl(c, "mo.shell2", 0.5, 0.22, 0.22, -1.1, 0.75, -0.5, "ember", 6),
        box(c, "mo.eye", 0.2, 0.2, 0.2, 0, 2.5, 0.6, "ember"),
      ]);
      break;
    }
    case "wall": {
      // A whole side of the perimeter, not a 45° arc: two long masonry runs
      // flanking a fixed gate gap in the middle. The gap is never part of the
      // collider — that is handled entirely by BuildingManager's own faction-
      // aware obstacles — so nothing here is allowed to make the opening any
      // wider or narrower than `MAP.gateWidth`.
      const fullLength = WALL_SIDE_BY_SLOT.get(slotId ?? "")?.length ?? 20;
      const gate = MAP.gateWidth;
      const halfSeg = Math.max(2, (fullLength - gate) * 0.5);
      const segCentre = gate * 0.5 + halfSeg * 0.5;
      const d = WALL_SEGMENT_DEPTH;

      const footing: Mesh[] = [];
      const body: Mesh[] = [];
      const crenels: Mesh[] = [];
      const details: Mesh[] = [];
      for (const dir of [-1, 1] as const) {
        const cx = dir * segCentre;
        footing.push(box(c, `wl.foot${dir}`, halfSeg, 0.4, d, cx, 0.2, 0, "stone"));
        body.push(
          box(c, `wl.body${dir}`, halfSeg, 2.0, d * 0.86, cx, 1.25, 0, "stone"),
          // The front face is darker so the outward side is obvious from above.
          box(c, `wl.face${dir}`, halfSeg, 1.7, 0.16, cx, 1.3, -d * 0.45, "dark"),
          box(c, `wl.walk${dir}`, halfSeg, 0.18, d * 0.95, cx, 2.34, 0, "beam"),
        );
        crenels.push(...crenelRow(c, halfSeg, cx, dir));
        details.push(...torch(c, halfSeg, cx, dir));
      }
      // Outer-end braces plus a pair flanking the gate on each side.
      body.push(
        box(c, "wl.brace1", 0.4, 1.9, 0.9, -fullLength * 0.5 + 0.25, 1.0, d * 0.42, "beam"),
        box(c, "wl.brace2", 0.4, 1.9, 0.9, fullLength * 0.5 - 0.25, 1.0, d * 0.42, "beam"),
        box(c, "wl.braceGateL", 0.32, 2.0, 0.8, -gate * 0.5 - 0.16, 1.05, 0, "beam"),
        box(c, "wl.braceGateR", 0.32, 2.0, 0.8, gate * 0.5 + 0.16, 1.05, 0, "beam"),
        // Gate pillars and a lintel arch. Purely decorative — the actual
        // ally-only passage rule lives entirely in the collision layer.
        cyl(c, "wl.pillarL", 2.6, 0.55, 0.7, -gate * 0.5 - 0.16, 1.3, 0, "stone", 6),
        cyl(c, "wl.pillarR", 2.6, 0.55, 0.7, gate * 0.5 + 0.16, 1.3, 0, "stone", 6),
        box(c, "wl.arch", gate + 0.6, 0.4, 0.5, 0, 2.65, 0, "beam"),
        box(c, "wl.lantern1", 0.2, 0.24, 0.2, -gate * 0.5 - 0.16, 2.85, 0, "glow"),
        box(c, "wl.lantern2", 0.2, 0.24, 0.2, gate * 0.5 + 0.16, 2.85, 0, "glow"),
      );

      stage("footing", footing);
      stage("body", body, true);
      stage("crenels", crenels);
      stage("details", details);
      break;
    }
  }

  return { root, stages, body: c.body };
}
