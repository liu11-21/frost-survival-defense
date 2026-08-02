import { InstancedMesh, Mesh, MeshBuilder, Scene, TransformNode } from "@babylonjs/core";
import { UNIT_VISUALS, type AttachmentSpec, type UnitVisual, type WeaponKind } from "../data/UnitVisuals";
import { MaterialFactory } from "../scene/MaterialFactory";
import { buildAttachmentMesh } from "./AttachmentMeshBuilder";
import type { AssetInstance } from "../assets/AssetTypes";
import type { AssetRegistry } from "../assets/AssetRegistry";

/**
 * The joints a combat animator is allowed to move. Every visible part is an
 * `InstancedMesh`, so a hundred fighters of the same type still cost one draw
 * call per body part rather than one per fighter.
 */
export interface LiteRig {
  root: TransformNode;
  /** Authored GLB instance; null means the pooled procedural fallback is active. */
  authored: AssetInstance | null;
  body: TransformNode;
  head: TransformNode;
  shoulderL: TransformNode;
  shoulderR: TransformNode;
  hipL: TransformNode;
  hipR: TransformNode;
  weapon: TransformNode;
  parts: InstancedMesh[];
  /** Parts flagged `armorPlate` in the visual spec — Ice Armor Heavy's break. */
  armorParts: InstancedMesh[];
  /** Named single parts a unit's own logic wants to reach, e.g. Ice Bomber's core. */
  tagged: ReadonlyMap<string, InstancedMesh>;
  /**
   * Restores every joint, part and transform to its spawn state. A recycled rig
   * must never inherit the previous occupant's death pose, sunken position or
   * shrunken scale.
   */
  reset(scale: number): void;
  /** Hands the rig back to its template's pool. */
  release(): void;
  /** Shows or hides the armour-plate attachments only — never disposes them. */
  setArmorVisible(visible: boolean): void;
  dispose(): void;
}

function weaponMesh(scene: Scene, kind: WeaponKind, name: string): Mesh | null {
  switch (kind) {
    case "sword":
      return MeshBuilder.CreateBox(name, { width: 0.07, height: 0.72, depth: 0.14 }, scene);
    case "dagger":
      return MeshBuilder.CreateBox(name, { width: 0.06, height: 0.4, depth: 0.1 }, scene);
    case "club":
      return MeshBuilder.CreateCylinder(
        name,
        { height: 0.66, diameterTop: 0.2, diameterBottom: 0.09, tessellation: 5 },
        scene,
      );
    case "bow":
      return MeshBuilder.CreateTorus(name, { diameter: 0.62, thickness: 0.055, tessellation: 7 }, scene);
    case "staff":
      return MeshBuilder.CreateCylinder(
        name,
        { height: 0.95, diameterTop: 0.16, diameterBottom: 0.05, tessellation: 5 },
        scene,
      );
    case "iceStaff":
      // A crystalline, hexagonal shaft with a pronounced faceted head —
      // deliberately not the Mage's smooth taper, so the two staff-users
      // never read as the same silhouette.
      return MeshBuilder.CreateCylinder(
        name,
        { height: 1.1, diameterTop: 0.28, diameterBottom: 0.035, tessellation: 6 },
        scene,
      );
    case "shield":
      return MeshBuilder.CreateBox(name, { width: 0.5, height: 0.66, depth: 0.09 }, scene);
    case "cross":
      return MeshBuilder.CreateBox(name, { width: 0.26, height: 0.26, depth: 0.08 }, scene);
    case "musket":
      // A long thin barrel plus a stock block, distinct from the bow's ring
      // and the staff's plain taper.
      return MeshBuilder.CreateCylinder(
        name,
        { height: 1.05, diameterTop: 0.05, diameterBottom: 0.08, tessellation: 6 },
        scene,
      );
    case "wrench":
      return MeshBuilder.CreateBox(name, { width: 0.09, height: 0.5, depth: 0.09 }, scene);
    case "banner":
      return MeshBuilder.CreateCylinder(
        name,
        { height: 1.15, diameterTop: 0.04, diameterBottom: 0.04, tessellation: 5 },
        scene,
      );
    case "none":
      return null;
  }
}

/**
 * One template per unit type. It owns the master meshes; `spawn()` hands out
 * cheap instances of them.
 */
export class HumanoidTemplate {
  private readonly masters: Mesh[] = [];
  private readonly torso: Mesh;
  private readonly head: Mesh;
  private readonly arm: Mesh;
  private readonly leg: Mesh;
  private readonly belt: Mesh;
  private readonly boot: Mesh;
  private readonly crest: Mesh;
  private readonly weapon: Mesh | null;
  private readonly offhand: Mesh | null;
  private readonly cape: Mesh | null;
  /** A grounded ellipse makes the six-unit flight height immediately readable. */
  private readonly flyingShadow: Mesh | null;
  private readonly attachmentMeshes: Array<{ spec: AttachmentSpec; mesh: Mesh }> = [];
  private readonly pool: LiteRig[] = [];
  private counter = 0;

  constructor(
    private readonly scene: Scene,
    materials: MaterialFactory,
    readonly visualKey: string,
    private readonly assets?: AssetRegistry,
  ) {
    const v: UnitVisual = UNIT_VISUALS[visualKey] ?? UNIT_VISUALS.grunt;
    const key = `unit.${visualKey}`;

    const bodyMat = materials.pbr(`${key}.body`, { color: v.body, roughness: 0.82, texture: "cloth" });
    const limbMat = materials.pbr(`${key}.limb`, { color: v.limb, roughness: 0.86, texture: "cloth" });
    const headMat = materials.pbr(`${key}.head`, { color: v.head, roughness: 0.78 });
    const crestMat = materials.pbr(`${key}.crest`, { color: v.crest, roughness: 0.5, metallic: 0.45 });
    const weaponMat = materials.pbr(`${key}.weapon`, { color: [0.7, 0.72, 0.78], roughness: 0.3, metallic: 0.85 });
    const accentMat = materials.unlit(`${key}.accent`, v.accent, 1);
    const matByName = { body: bodyMat, limb: limbMat, head: headMat, crest: crestMat, weapon: weaponMat, accent: accentMat };

    const [tw, th, td] = v.torsoSize ?? [0.44, 0.56, 0.3];
    this.torso = MeshBuilder.CreateBox(`${key}.torso`, { width: tw, height: th, depth: td }, scene);
    this.torso.material = bodyMat;
    const [hw, hh, hd] = v.headSize ?? [0.3, 0.3, 0.29];
    // A faceted rounded head reads far better than the previous cube while
    // keeping the same low-poly, instanced performance budget.
    this.head = MeshBuilder.CreateSphere(`${key}.head`, { diameterX: hw, diameterY: hh, diameterZ: hd, segments: 6 }, scene);
    this.head.material = headMat;
    const [aw, ah, ad] = v.limbSize ?? [0.14, 0.46, 0.16];
    this.arm = MeshBuilder.CreateBox(`${key}.arm`, { width: aw, height: ah, depth: ad }, scene);
    this.arm.material = limbMat;
    this.leg = MeshBuilder.CreateBox(`${key}.leg`, { width: aw + 0.02, height: 0.5, depth: ad + 0.02 }, scene);
    this.leg.material = limbMat;
    this.belt = MeshBuilder.CreateBox(`${key}.belt`, { width: tw * 1.08, height: 0.065, depth: td * 1.12 }, scene);
    this.belt.material = crestMat;
    this.boot = MeshBuilder.CreateBox(`${key}.boot`, { width: aw + 0.04, height: 0.11, depth: ad + 0.13 }, scene);
    this.boot.material = weaponMat;
    this.crest = MeshBuilder.CreateCylinder(
      `${key}.crest`,
      { height: 0.22, diameterTop: 0.3, diameterBottom: 0.36, tessellation: 6 },
      scene,
    );
    this.crest.material = crestMat;

    this.weapon = weaponMesh(scene, v.weapon, `${key}.weapon`);
    if (this.weapon) this.weapon.material = v.weapon === "cross" ? accentMat : weaponMat;
    this.offhand = v.offhand ? weaponMesh(scene, v.offhand, `${key}.offhand`) : null;
    if (this.offhand) this.offhand.material = weaponMat;
    this.cape = v.cape
      ? MeshBuilder.CreateBox(`${key}.cape`, { width: 0.46, height: 0.6, depth: 0.07 }, scene)
      : null;
    if (this.cape) this.cape.material = accentMat;
    this.flyingShadow = visualKey.startsWith("flying")
      ? MeshBuilder.CreateGround(`${key}.flightShadow`, { width: 1.8, height: 1.25 }, scene)
      : null;
    if (this.flyingShadow) this.flyingShadow.material = materials.blobShadow();

    for (const m of [this.torso, this.head, this.arm, this.leg, this.belt, this.boot, this.crest, this.weapon, this.offhand, this.cape, this.flyingShadow]) {
      if (!m) continue;
      m.isPickable = false;
      m.receiveShadows = false;
      // The masters themselves never render; only their instances do.
      m.isVisible = false;
      m.alwaysSelectAsActiveMesh = true;
      this.masters.push(m);
    }

    for (let i = 0; i < (v.attachments?.length ?? 0); i++) {
      const spec = v.attachments![i];
      const mesh = buildAttachmentMesh(scene, spec, `${key}.attach${i}`);
      mesh.material = matByName[spec.material];
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.isVisible = false;
      mesh.alwaysSelectAsActiveMesh = true;
      this.masters.push(mesh);
      this.attachmentMeshes.push({ spec, mesh });
    }
  }

  get masterMeshes(): ReadonlyArray<Mesh> {
    return this.masters;
  }

  /** Takes a rig from the pool if one is free, otherwise builds a new one. */
  spawn(scale: number): LiteRig {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.reset(scale);
      return pooled;
    }
    return this.create(scale);
  }

  private create(scale: number): LiteRig {
    const id = `${this.visualKey}${this.counter++}`;
    const parts: InstancedMesh[] = [];
    const armorParts: InstancedMesh[] = [];
    const tagged = new Map<string, InstancedMesh>();
    const pool = this.pool;

    const attach = (master: Mesh | null, parent: TransformNode, x: number, y: number, z: number): InstancedMesh | null => {
      if (!master) return null;
      const inst = master.createInstance(`${id}.${master.name}`);
      inst.parent = parent;
      inst.position.set(x, y, z);
      inst.isPickable = false;
      parts.push(inst);
      return inst;
    };

    const root = new TransformNode(`unit.${id}`, this.scene);
    root.scaling.setAll(scale);
    // Flying roots live at y=6; keep their shadow on the arena floor without
    // adding a second world entity or registering it for collision/picking.
    attach(this.flyingShadow, root, 0, -5.95, 0);
    const body = new TransformNode(`${id}.body`, this.scene);
    body.parent = root;

    attach(this.torso, body, 0, 0.86, 0);
    attach(this.belt, body, 0, 0.61, 0);
    if (this.cape) {
      const cape = attach(this.cape, body, 0, 0.84, -0.19);
      if (cape) cape.rotation.x = 0.12;
    }

    const back = new TransformNode(`${id}.back`, this.scene);
    back.parent = body;

    const head = new TransformNode(`${id}.headJoint`, this.scene);
    head.parent = body;
    head.position.set(0, 1.16, 0);
    attach(this.head, head, 0, 0.14, 0);
    attach(this.crest, head, 0, 0.3, -0.02);

    const shoulderL = new TransformNode(`${id}.shL`, this.scene);
    shoulderL.parent = body;
    shoulderL.position.set(-0.29, 1.06, 0);
    attach(this.arm, shoulderL, 0, -0.22, 0);

    const shoulderR = new TransformNode(`${id}.shR`, this.scene);
    shoulderR.parent = body;
    shoulderR.position.set(0.29, 1.06, 0);
    attach(this.arm, shoulderR, 0, -0.22, 0);

    const weapon = new TransformNode(`${id}.weaponJoint`, this.scene);
    weapon.parent = shoulderR;
    weapon.position.set(0.04, -0.46, 0.06);
    const held = attach(this.weapon, weapon, 0, 0.18, 0.05);
    if (held && this.weapon?.name.endsWith("weapon")) held.rotation.x = -0.35;

    if (this.offhand) {
      const off = attach(this.offhand, shoulderL, 0.02, -0.5, 0.12);
      if (off) off.rotation.x = -0.18;
    }

    const hipL = new TransformNode(`${id}.hipL`, this.scene);
    hipL.parent = body;
    hipL.position.set(-0.13, 0.6, 0);
    attach(this.leg, hipL, 0, -0.25, 0);
    attach(this.boot, hipL, 0, -0.53, 0.05);

    const hipR = new TransformNode(`${id}.hipR`, this.scene);
    hipR.parent = body;
    hipR.position.set(0.13, 0.6, 0);
    attach(this.leg, hipR, 0, -0.25, 0);
    attach(this.boot, hipR, 0, -0.53, 0.05);

    const jointByName: Record<AttachmentSpec["parent"], TransformNode> = {
      head,
      shoulderL,
      shoulderR,
      body,
      back,
      hipL,
      hipR,
    };
    let attachIndex = 0;
    for (const { spec, mesh } of this.attachmentMeshes) {
      const parent = jointByName[spec.parent];
      const inst = attach(mesh, parent, spec.position[0], spec.position[1], spec.position[2]);
      if (inst && spec.rotation) inst.rotation.set(spec.rotation[0], spec.rotation[1], spec.rotation[2]);
      if (inst && spec.armorPlate) armorParts.push(inst);
      if (inst) tagged.set(`attach${attachIndex}`, inst);
      attachIndex++;
    }

    const joints = [body, head, shoulderL, shoulderR, hipL, hipR, weapon];
    const restRotation = joints.map((j) => j.rotation.clone());
    const restPosition = joints.map((j) => j.position.clone());
    const partRotation = parts.map((p) => p.rotation.clone());
    const partScale = parts.map((p) => p.scaling.clone());
    const authored = this.assets?.instantiate(this.visualKey, `unit.${id}`) ?? null;
    if (authored) {
      authored.root.parent = root;
      authored.root.position.set(0, 0, 0);
      // UnitRoot already carries the Blender-to-Babylon orientation. Keep the
      // authored local +Z front aligned with the combat root's +Z yaw.
      authored.root.rotation.set(0, 0, 0);
      for (const part of parts) part.setEnabled(false);
    }

    const rig: LiteRig = {
      root,
      authored,
      body,
      head,
      shoulderL,
      shoulderR,
      hipL,
      hipR,
      weapon,
      parts,
      armorParts,
      tagged,
      reset(nextScale: number): void {
        root.setEnabled(true);
        root.position.set(0, 0, 0);
        root.rotation.set(0, 0, 0);
        root.scaling.setAll(nextScale);
        if (authored) {
          authored.root.position.set(0, 0, 0);
          authored.root.rotation.set(0, 0, 0);
          authored.root.setEnabled(true);
        }
        for (let i = 0; i < joints.length; i++) {
          joints[i].rotation.copyFrom(restRotation[i]);
          joints[i].position.copyFrom(restPosition[i]);
          joints[i].scaling.setAll(1);
          joints[i].setEnabled(true);
        }
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          p.rotation.copyFrom(partRotation[i]);
          p.scaling.copyFrom(partScale[i]);
          p.visibility = 1;
          p.isVisible = true;
          // Authored instances replace the procedural instances for the whole
          // rig lifetime.  A pooled reset must not briefly render both layers
          // or re-enable armor after the GLB has been installed.
          p.setEnabled(!authored);
        }
      },
      release(): void {
        root.setEnabled(false);
        authored?.root.setEnabled(false);
        pool.push(rig);
      },
      setArmorVisible(visible: boolean): void {
        if (authored) return;
        for (const p of armorParts) p.setEnabled(visible);
      },
      dispose(): void {
        authored?.dispose();
        for (const p of parts) p.dispose();
        root.dispose(false, false);
      },
    };
    return rig;
  }

  get poolSize(): number {
    return this.pool.length;
  }

  /** Frees the pooled rigs, e.g. between runs. */
  clearPool(): void {
    for (const rig of this.pool) rig.dispose();
    this.pool.length = 0;
  }
}

/** Lazily builds one template per unit type and hands them out by key. */
export class HumanoidTemplateCache {
  private readonly cache = new Map<string, HumanoidTemplate>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialFactory,
    private readonly assets?: AssetRegistry,
  ) {}

  get(visualKey: string): HumanoidTemplate {
    let t = this.cache.get(visualKey);
    if (!t) {
      t = new HumanoidTemplate(this.scene, this.materials, visualKey, this.assets);
      this.cache.set(visualKey, t);
    }
    return t;
  }

  /** Returns every pooled rig, so a mode switch never leaks old bodies. */
  clearPools(): void {
    for (const t of this.cache.values()) t.clearPool();
  }

  get pooledRigCount(): number {
    let n = 0;
    for (const t of this.cache.values()) n += t.poolSize;
    return n;
  }
}
