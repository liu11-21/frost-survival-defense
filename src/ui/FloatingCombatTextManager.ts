import { DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";

const POOL_SIZE = 44;
const LIFETIME = 0.85;
/** Hits on the same spot inside this window merge into one number. */
const MERGE_WINDOW = 0.25;
const MERGE_RADIUS = 1.4;

interface FloatSlot {
  mesh: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  active: boolean;
  life: number;
  amount: number;
  kind: "damage" | "heal";
  x: number;
  z: number;
  /** Merge window remaining; while positive this slot can absorb more hits. */
  mergeTime: number;
}

/**
 * Pooled floating damage and healing numbers.
 *
 * High attack-speed units would otherwise bury the screen in text, so hits on
 * roughly the same spot inside a short window are accumulated into one growing
 * number instead of spawning a new label each time.
 */
export class FloatingCombatTextManager {
  private readonly pool: FloatSlot[] = [];
  private enabled = true;

  constructor(scene: Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const texture = new DynamicTexture(`fct${i}`, { width: 128, height: 64 }, scene, false);
      texture.hasAlpha = true;
      const material = new StandardMaterial(`mat.fct${i}`, scene);
      material.diffuseTexture = texture;
      material.opacityTexture = texture;
      material.emissiveTexture = texture;
      material.disableLighting = true;
      material.backFaceCulling = false;

      const mesh = MeshBuilder.CreatePlane(`fctPlane${i}`, { width: 1.5, height: 0.75 }, scene);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.setEnabled(false);

      this.pool.push({
        mesh,
        texture,
        material,
        active: false,
        life: 0,
        amount: 0,
        kind: "damage",
        x: 0,
        z: 0,
        mergeTime: 0,
      });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      for (const slot of this.pool) this.retire(slot);
    }
  }

  spawn(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void {
    if (!this.enabled || amount < 0.5) return;

    // Fold into a nearby recent number rather than stacking a new label.
    for (const slot of this.pool) {
      if (!slot.active || slot.mergeTime <= 0 || slot.kind !== kind) continue;
      if (Math.hypot(slot.x - x, slot.z - z) > MERGE_RADIUS) continue;
      slot.amount += amount;
      slot.life = LIFETIME;
      this.paint(slot);
      return;
    }

    const slot = this.pool.find((s) => !s.active);
    if (!slot) return;
    slot.active = true;
    slot.life = LIFETIME;
    slot.mergeTime = MERGE_WINDOW;
    slot.amount = amount;
    slot.kind = kind;
    slot.x = x;
    slot.z = z;
    slot.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
    slot.mesh.setEnabled(true);
    this.paint(slot);
  }

  private paint(slot: FloatSlot): void {
    const ctx = slot.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = "bold 44px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = (slot.kind === "heal" ? "+" : "") + Math.round(slot.amount).toString();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(text, 64, 32);
    ctx.fillStyle = slot.kind === "heal" ? "#7dffb0" : "#ffd66b";
    ctx.fillText(text, 64, 32);
    slot.texture.update(false);
  }

  update(dt: number): void {
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i];
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.mergeTime > 0) slot.mergeTime -= dt;
      if (slot.life <= 0) {
        this.retire(slot);
        continue;
      }
      const t = 1 - slot.life / LIFETIME;
      slot.mesh.position.y += dt * 1.5;
      slot.material.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const scale = 1 + Math.min(0.35, t * 0.7);
      slot.mesh.scaling.set(scale, scale, 1);
    }
  }

  private retire(slot: FloatSlot): void {
    slot.active = false;
    slot.amount = 0;
    slot.mergeTime = 0;
    slot.mesh.setEnabled(false);
  }

  dispose(): void {
    for (const slot of this.pool) {
      slot.mesh.dispose();
      slot.texture.dispose();
    }
    this.pool.length = 0;
  }
}
