import { Mesh, MeshBuilder, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { MaterialFactory } from "../scene/MaterialFactory";
import { CARRY } from "./AnimationConfig";

export interface HumanoidPalette {
  id: string;
  coat: [number, number, number];
  coatDark: [number, number, number];
  trousers: [number, number, number];
  skin: [number, number, number];
  hood: [number, number, number];
  boots: [number, number, number];
  accent: [number, number, number];
}

/** Every node the animator is allowed to touch. */
export interface HumanoidRig {
  root: TransformNode;
  body: TransformNode;
  pelvis: TransformNode;
  chest: TransformNode;
  head: TransformNode;
  shoulderL: TransformNode;
  shoulderR: TransformNode;
  elbowL: TransformNode;
  elbowR: TransformNode;
  hipL: TransformNode;
  hipR: TransformNode;
  kneeL: TransformNode;
  kneeR: TransformNode;
  handR: TransformNode;
  axe: TransformNode;
  backRack: TransformNode;
  carrySlots: TransformNode[];
  meshes: Mesh[];
  shadowBlob: Mesh;
}

interface BuildCtx {
  scene: Scene;
  materials: MaterialFactory;
  palette: HumanoidPalette;
  meshes: Mesh[];
}

function box(
  ctx: BuildCtx,
  name: string,
  parent: TransformNode,
  size: Vector3,
  position: Vector3,
  matKey: string,
  color: [number, number, number],
  texture?: "bark" | "plank" | "rock" | "cloth" | "ice",
  roughness = 0.86,
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, ctx.scene);
  mesh.parent = parent;
  mesh.position.copyFrom(position);
  mesh.material = ctx.materials.pbr(`mat.${ctx.palette.id}.${matKey}`, {
    color,
    roughness,
    texture,
  });
  mesh.isPickable = false;
  mesh.receiveShadows = true;
  ctx.meshes.push(mesh);
  return mesh;
}

function joint(name: string, parent: TransformNode, position: Vector3, scene: Scene): TransformNode {
  const node = new TransformNode(name, scene);
  node.parent = parent;
  node.position.copyFrom(position);
  return node;
}

function buildArm(ctx: BuildCtx, chest: TransformNode, side: -1 | 1): {
  shoulder: TransformNode;
  elbow: TransformNode;
  hand: TransformNode;
} {
  const s = side === -1 ? "L" : "R";
  const p = ctx.palette;
  const shoulder = joint(`shoulder${s}`, chest, new Vector3(side * 0.29, 0.27, 0), ctx.scene);

  box(ctx, `pauldron${s}`, shoulder, new Vector3(0.19, 0.15, 0.22), new Vector3(side * 0.02, 0.02, 0), "coat", p.coat, "cloth", 0.9);
  box(ctx, `upperArm${s}`, shoulder, new Vector3(0.135, 0.32, 0.155), new Vector3(0, -0.17, 0), "coatDark", p.coatDark, "cloth", 0.9);

  const elbow = joint(`elbow${s}`, shoulder, new Vector3(0, -0.33, 0), ctx.scene);
  box(ctx, `lowerArm${s}`, elbow, new Vector3(0.115, 0.29, 0.13), new Vector3(0, -0.15, 0), "coatDark", p.coatDark, "cloth", 0.9);
  box(ctx, `cuff${s}`, elbow, new Vector3(0.14, 0.07, 0.15), new Vector3(0, -0.27, 0), "accent", p.accent, "cloth", 0.95);

  const hand = joint(`hand${s}`, elbow, new Vector3(0, -0.32, 0), ctx.scene);
  box(ctx, `palm${s}`, hand, new Vector3(0.12, 0.13, 0.11), new Vector3(0, -0.05, 0), "skin", p.skin, undefined, 0.75);

  return { shoulder, elbow, hand };
}

function buildLeg(ctx: BuildCtx, pelvis: TransformNode, side: -1 | 1): {
  hip: TransformNode;
  knee: TransformNode;
} {
  const s = side === -1 ? "L" : "R";
  const p = ctx.palette;
  const hip = joint(`hip${s}`, pelvis, new Vector3(side * 0.135, -0.06, 0), ctx.scene);
  box(ctx, `upperLeg${s}`, hip, new Vector3(0.165, 0.4, 0.175), new Vector3(0, -0.2, 0), "trousers", p.trousers, "cloth", 0.92);

  const knee = joint(`knee${s}`, hip, new Vector3(0, -0.4, 0), ctx.scene);
  box(ctx, `lowerLeg${s}`, knee, new Vector3(0.145, 0.36, 0.15), new Vector3(0, -0.18, 0), "trousers", p.trousers, "cloth", 0.92);
  box(ctx, `boot${s}`, knee, new Vector3(0.17, 0.13, 0.28), new Vector3(0, -0.4, 0.05), "boots", p.boots, undefined, 0.7);

  return { hip, knee };
}

function buildAxe(ctx: BuildCtx, hand: TransformNode): TransformNode {
  const axe = new TransformNode("axePivot", ctx.scene);
  axe.parent = hand;
  axe.position.set(0.02, -0.08, 0.02);
  axe.rotation.set(-0.25, 0, 0.12);

  const handle = MeshBuilder.CreateCylinder(
    "axeHandle",
    { height: 0.86, diameterTop: 0.05, diameterBottom: 0.062, tessellation: 8 },
    ctx.scene,
  );
  handle.parent = axe;
  handle.position.set(0, 0.26, 0);
  handle.material = ctx.materials.pbr("mat.axe.handle", {
    color: [0.36, 0.24, 0.15],
    roughness: 0.82,
    texture: "bark",
  });
  handle.isPickable = false;
  ctx.meshes.push(handle);

  const head = MeshBuilder.CreateBox("axeHead", { width: 0.09, height: 0.2, depth: 0.09 }, ctx.scene);
  head.parent = axe;
  head.position.set(0, 0.65, 0.02);
  head.material = ctx.materials.pbr("mat.axe.metal", {
    color: [0.62, 0.65, 0.7],
    roughness: 0.34,
    metallic: 0.85,
  });
  head.isPickable = false;
  ctx.meshes.push(head);

  const blade = MeshBuilder.CreateCylinder(
    "axeBlade",
    { height: 0.06, diameterTop: 0.34, diameterBottom: 0.2, tessellation: 3 },
    ctx.scene,
  );
  blade.parent = axe;
  blade.rotation.set(0, 0, Math.PI * 0.5);
  blade.position.set(0.0, 0.68, 0.15);
  blade.scaling.set(1, 1, 0.55);
  blade.material = ctx.materials.pbr("mat.axe.blade", {
    color: [0.78, 0.82, 0.88],
    roughness: 0.22,
    metallic: 0.95,
  });
  blade.isPickable = false;
  ctx.meshes.push(blade);

  return axe;
}

function buildBackRack(ctx: BuildCtx, chest: TransformNode): {
  rack: TransformNode;
  slots: TransformNode[];
} {
  const rack = new TransformNode("backRack", ctx.scene);
  rack.parent = chest;
  rack.position.set(0, 0.05, -0.24);

  const wood: [number, number, number] = [0.42, 0.3, 0.19];
  box(ctx, "rackPostL", rack, new Vector3(0.055, 0.7, 0.055), new Vector3(-0.19, 0.05, -0.03), "rackWood", wood, "bark", 0.88);
  box(ctx, "rackPostR", rack, new Vector3(0.055, 0.7, 0.055), new Vector3(0.19, 0.05, -0.03), "rackWood", wood, "bark", 0.88);
  box(ctx, "rackShelf", rack, new Vector3(0.5, 0.06, 0.18), new Vector3(0, -0.28, -0.07), "rackWood", wood, "bark", 0.88);
  box(ctx, "rackStrapL", rack, new Vector3(0.06, 0.42, 0.24), new Vector3(-0.16, 0.16, 0.2), "rackStrap", ctx.palette.accent, "cloth", 0.95);
  box(ctx, "rackStrapR", rack, new Vector3(0.06, 0.42, 0.24), new Vector3(0.16, 0.16, 0.2), "rackStrap", ctx.palette.accent, "cloth", 0.95);

  // 10 staggered slots: two logs per row, alternating the cross direction.
  const slots: TransformNode[] = [];
  const perRow = CARRY.logsPerRow;
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / perRow);
    const idx = i % perRow;
    const slot = new TransformNode(`carrySlot${i}`, ctx.scene);
    slot.parent = rack;
    const cross = row % 2 === 0;
    slot.position.set(
      cross ? 0 : (idx - (perRow - 1) / 2) * 0.24,
      -0.22 + row * CARRY.rowHeight,
      -0.16 - (cross ? (idx - (perRow - 1) / 2) * 0.24 : 0),
    );
    slot.rotation.set(0, cross ? 0 : Math.PI * 0.5, cross ? 0.05 : -0.05);
    slots.push(slot);
  }

  return { rack, slots };
}

export function createHumanoid(
  scene: Scene,
  materials: MaterialFactory,
  palette: HumanoidPalette,
  name: string,
): HumanoidRig {
  const ctx: BuildCtx = { scene, materials, palette, meshes: [] };

  const root = new TransformNode(name, scene);
  const body = new TransformNode(`${name}.body`, scene);
  body.parent = root;

  const pelvis = joint(`${name}.pelvis`, body, new Vector3(0, 0.92, 0), scene);
  box(ctx, "hips", pelvis, new Vector3(0.42, 0.2, 0.26), new Vector3(0, -0.02, 0), "trousers", palette.trousers, "cloth", 0.92);

  // Long coat skirt: a low-poly tapered cylinder, clearly not a box.
  const skirt = MeshBuilder.CreateCylinder(
    `${name}.skirt`,
    { height: 0.44, diameterTop: 0.5, diameterBottom: 0.66, tessellation: 8 },
    scene,
  );
  skirt.parent = pelvis;
  skirt.position.set(0, -0.16, -0.01);
  skirt.material = materials.pbr(`mat.${palette.id}.coat`, { color: palette.coat, roughness: 0.9, texture: "cloth" });
  skirt.isPickable = false;
  skirt.receiveShadows = true;
  ctx.meshes.push(skirt);

  const chest = joint(`${name}.chest`, pelvis, new Vector3(0, 0.12, 0), scene);
  box(ctx, "torso", chest, new Vector3(0.46, 0.34, 0.29), new Vector3(0, 0.16, 0), "coat", palette.coat, "cloth", 0.9);
  box(ctx, "chestPlate", chest, new Vector3(0.5, 0.24, 0.32), new Vector3(0, 0.36, 0), "coat", palette.coat, "cloth", 0.9);
  box(ctx, "collar", chest, new Vector3(0.34, 0.1, 0.3), new Vector3(0, 0.5, 0), "accent", palette.accent, "cloth", 0.95);
  box(ctx, "belt", chest, new Vector3(0.48, 0.08, 0.31), new Vector3(0, 0.02, 0), "boots", palette.boots, undefined, 0.7);

  const head = joint(`${name}.head`, chest, new Vector3(0, 0.58, 0), scene);
  box(ctx, "neck", head, new Vector3(0.13, 0.09, 0.13), new Vector3(0, -0.03, 0), "skin", palette.skin, undefined, 0.78);
  box(ctx, "skull", head, new Vector3(0.27, 0.29, 0.26), new Vector3(0, 0.16, 0), "skin", palette.skin, undefined, 0.78);
  box(ctx, "face", head, new Vector3(0.2, 0.11, 0.03), new Vector3(0, 0.14, 0.14), "faceDark", [0.12, 0.11, 0.13], undefined, 0.9);
  const hood = MeshBuilder.CreateCylinder(
    `${name}.hood`,
    { height: 0.3, diameterTop: 0.36, diameterBottom: 0.4, tessellation: 7 },
    scene,
  );
  hood.parent = head;
  hood.position.set(0, 0.22, -0.03);
  hood.material = materials.pbr(`mat.${palette.id}.hood`, { color: palette.hood, roughness: 0.93, texture: "cloth" });
  hood.isPickable = false;
  ctx.meshes.push(hood);

  const armL = buildArm(ctx, chest, -1);
  const armR = buildArm(ctx, chest, 1);
  const legL = buildLeg(ctx, pelvis, -1);
  const legR = buildLeg(ctx, pelvis, 1);
  const axe = buildAxe(ctx, armR.hand);
  const { rack, slots } = buildBackRack(ctx, chest);

  const shadowBlob = MeshBuilder.CreateGround(`${name}.blob`, { width: 1.5, height: 1.9 }, scene);
  shadowBlob.parent = root;
  shadowBlob.position.y = 0.035;
  shadowBlob.material = materials.blobShadow();
  shadowBlob.isPickable = false;
  shadowBlob.rotation.y = 0;

  return {
    root,
    body,
    pelvis,
    chest,
    head,
    shoulderL: armL.shoulder,
    shoulderR: armR.shoulder,
    elbowL: armL.elbow,
    elbowR: armR.elbow,
    hipL: legL.hip,
    hipR: legR.hip,
    kneeL: legL.knee,
    kneeR: legR.knee,
    handR: armR.hand,
    axe,
    backRack: rack,
    carrySlots: slots,
    meshes: ctx.meshes,
    shadowBlob,
  };
}
