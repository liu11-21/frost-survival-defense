import { Matrix, Mesh, MeshBuilder, Quaternion, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import type { BuildSlot } from "../buildings/BuildSlot";
import { LANES, MAP, WALL_SIDE_BY_SLOT, laneSpawnPoint } from "../data/BuildSlotDefinitions";
import { COLORS } from "../game/GameConfig";
import { MaterialFactory } from "./MaterialFactory";
import { randRange } from "../util/MathUtil";

const RING_COLORS: Record<string, [number, number, number]> = {
  universal: [0.55, 0.8, 0.5],
  wall: [0.5, 0.72, 1.0],
};

/**
 * Everything decorative in the arena: the slot pads the player builds on, the
 * lane markers, spawn gates and the distant treeline that closes the horizon.
 */
export class ArenaBuilder {
  private readonly pads = new Map<string, Mesh>();
  private readonly padSelect = new Map<string, Mesh>();
  private pulse = 0;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialFactory,
    slots: ReadonlyArray<BuildSlot>,
  ) {
    this.buildSlotPads(slots);
    this.buildLaneMarkers();
    this.buildPerimeter();
    this.buildScatter();
  }

  private buildSlotPads(slots: ReadonlyArray<BuildSlot>): void {
    for (const slot of slots) {
      const color = RING_COLORS[slot.category] ?? RING_COLORS.universal;
      const isWall = slot.category === "wall";
      const wallLength = isWall ? WALL_SIDE_BY_SLOT.get(slot.id)?.length ?? 20 : 0;
      const width = isWall ? wallLength * 0.96 : 2.5;
      const depth = isWall ? 1.3 : 2.5;

      const pad = MeshBuilder.CreateGround(`pad.${slot.id}`, { width, height: depth }, this.scene);
      pad.position.set(slot.x, 0.05, slot.z);
      pad.rotation.y = slot.yaw;
      pad.material = this.materials.unlit(`mat.pad.${slot.category}`, color, 0.22);
      pad.isPickable = false;
      pad.freezeWorldMatrix();
      this.pads.set(slot.id, pad);

      const ring = MeshBuilder.CreateTorus(
        `padRing.${slot.id}`,
        { diameter: isWall ? wallLength * 0.94 : 2.7, thickness: 0.09, tessellation: 20 },
        this.scene,
      );
      ring.position.set(slot.x, 0.07, slot.z);
      ring.rotation.y = slot.yaw;
      if (isWall) ring.scaling.z = 0.28;
      ring.material = this.materials.unlit(`mat.padRing.${slot.category}`, color, 0.9);
      ring.isPickable = false;
      ring.setEnabled(false);
      this.padSelect.set(slot.id, ring);
    }
  }

  private buildLaneMarkers(): void {
    const stone = this.materials.pbr("mat.arena.marker", {
      color: [0.3, 0.31, 0.34],
      roughness: 0.9,
      texture: "rock",
    });
    const glow = this.materials.unlit("mat.arena.laneGlow", [0.75, 0.3, 0.9], 0.85);

    for (const lane of LANES) {
      const spawn = laneSpawnPoint(lane);
      const gate = new TransformNode(`lane${lane.index}.gate`, this.scene);
      gate.position.set(spawn.x, 0, spawn.z);
      gate.rotation.y = lane.angle;

      for (const side of [-1, 1]) {
        const pillar = MeshBuilder.CreateCylinder(
          `lane${lane.index}.pillar${side}`,
          { height: 3.2, diameterTop: 0.5, diameterBottom: 0.9, tessellation: 6 },
          this.scene,
        );
        pillar.parent = gate;
        pillar.position.set(side * 2.4, 1.6, 0);
        pillar.material = stone;
        pillar.isPickable = false;

        const eye = MeshBuilder.CreateBox(`lane${lane.index}.eye${side}`, { size: 0.36 }, this.scene);
        eye.parent = gate;
        eye.position.set(side * 2.4, 3.3, 0);
        eye.material = glow;
        eye.isPickable = false;
      }
    }
  }

  private buildPerimeter(): void {
    const count = 54;
    const trunk = MeshBuilder.CreateCylinder(
      "arena.trunk",
      { height: 2.6, diameterTop: 0.34, diameterBottom: 0.7, tessellation: 5 },
      this.scene,
    );
    trunk.bakeTransformIntoVertices(Matrix.Translation(0, 1.3, 0));
    trunk.material = this.materials.pbr("mat.arena.trunk", { color: [0.2, 0.16, 0.13], roughness: 0.95 });

    const crown = MeshBuilder.CreateCylinder(
      "arena.crown",
      { height: 4.4, diameterTop: 0, diameterBottom: 3.2, tessellation: 5 },
      this.scene,
    );
    crown.bakeTransformIntoVertices(Matrix.Translation(0, 3.7, 0));
    crown.material = this.materials.pbr("mat.arena.needles", { color: [0.1, 0.19, 0.16], roughness: 0.97 });

    const cap = MeshBuilder.CreateCylinder(
      "arena.cap",
      { height: 1.8, diameterTop: 0, diameterBottom: 2.0, tessellation: 5 },
      this.scene,
    );
    cap.bakeTransformIntoVertices(Matrix.Translation(0, 5.1, 0));
    cap.material = this.materials.pbr("mat.arena.cap", {
      color: [...COLORS.meshSnow] as [number, number, number],
      roughness: 0.6,
    });

    const matrices = new Float32Array(count * 16);
    const scaling = Vector3.Zero();
    const translation = Vector3.Zero();
    const rotation = Quaternion.Identity();
    const matrix = Matrix.Identity();

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + randRange(-0.05, 0.05);
      const radius = randRange(30, 38) + (i % 3) * 3.2;
      const s = randRange(0.9, 1.6);
      scaling.set(s, s * randRange(0.85, 1.25), s);
      translation.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      Quaternion.RotationYawPitchRollToRef(randRange(0, Math.PI * 2), 0, 0, rotation);
      Matrix.ComposeToRef(scaling, rotation, translation, matrix);
      matrix.copyToArray(matrices, i * 16);
    }

    for (const mesh of [trunk, crown, cap]) {
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.doNotSyncBoundingInfo = true;
    }
  }

  private buildScatter(): void {
    const snow = this.materials.pbr("mat.arena.drift", {
      color: [...COLORS.meshSnow] as [number, number, number],
      roughness: 0.55,
    });
    for (let i = 0; i < 26; i++) {
      const a = randRange(0, Math.PI * 2);
      const r = randRange(MAP.wallRadius + 3, 30);
      const size = randRange(1.4, 3.0);
      const drift = MeshBuilder.CreateSphere(`arena.drift${i}`, { diameter: size, segments: 3 }, this.scene);
      drift.position.set(Math.sin(a) * r, -size * 0.3, Math.cos(a) * r);
      drift.rotation.set(randRange(-0.14, 0.14), randRange(0, 3), randRange(-0.14, 0.14));
      drift.scaling.set(1, randRange(0.32, 0.5), randRange(0.6, 1.3));
      drift.material = snow;
      drift.isPickable = false;
      drift.freezeWorldMatrix();
    }
  }

  /** Highlights the slot the hero is standing next to. */
  setSelected(slotId: string | null): void {
    for (const [id, ring] of this.padSelect) {
      const on = id === slotId;
      if (ring.isEnabled() !== on) ring.setEnabled(on);
    }
  }

  /** Occupied slots hide their pad so a finished base does not look cluttered. */
  setOccupied(slotId: string, occupied: boolean): void {
    const pad = this.pads.get(slotId);
    if (pad && pad.isEnabled() !== !occupied) pad.setEnabled(!occupied);
  }

  update(dt: number): void {
    this.pulse += dt * 2.4;
    const s = 1 + Math.sin(this.pulse) * 0.06;
    for (const ring of this.padSelect.values()) {
      if (ring.isEnabled()) ring.scaling.x = s;
    }
  }
}
