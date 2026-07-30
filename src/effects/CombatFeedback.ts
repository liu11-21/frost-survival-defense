import { Mesh, MeshBuilder, Scene, Vector3 } from "@babylonjs/core";
import type { GameCamera } from "../camera/GameCamera";
import type { CombatVfx } from "../combat/CombatContext";
import type { Damageable } from "../combat/Damageable";
import type { FloatingCombatTextManager } from "../ui/FloatingCombatTextManager";
import { EffectSettingsState } from "./EffectSettingsState";
import type { HealthBarManager } from "../ui/HealthBarManager";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { AudioManager, SfxName } from "./AudioManager";
import type { VFXManager } from "./VFXManager";

const TAUNT_RINGS = 6;

/**
 * Turns combat events into particles, sound and camera shake. Combat code only
 * ever calls this interface — it never reaches for a particle system directly.
 */
export class CombatFeedback implements CombatVfx {
  private readonly point = new Vector3();
  private readonly rings: Mesh[] = [];
  private readonly ringLife: number[] = [];
  private ringCursor = 0;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    private readonly vfx: VFXManager,
    private readonly audio: AudioManager,
    private readonly camera: GameCamera,
    private readonly bars: HealthBarManager,
    private readonly text: FloatingCombatTextManager,
  ) {
    const mat = materials.unlit("mat.tauntRing", [1.0, 0.35, 0.3], 0.5);
    for (let i = 0; i < TAUNT_RINGS; i++) {
      const ring = MeshBuilder.CreateTorus(`tauntRing${i}`, { diameter: 2, thickness: 0.12, tessellation: 26 }, scene);
      ring.material = mat;
      ring.isPickable = false;
      ring.position.y = 0.08;
      ring.setEnabled(false);
      this.rings.push(ring);
      this.ringLife.push(0);
    }
  }

  meleeHit(x: number, z: number): void {
    this.point.set(x, 0.8, z);
    this.vfx.burst("slash", this.point, 8);
  }

  rangedHit(x: number, z: number): void {
    this.point.set(x, 0.8, z);
    this.vfx.burst("pierce", this.point, 6);
  }

  areaBlast(x: number, z: number, radius: number): void {
    this.point.set(x, 0.6, z);
    this.vfx.burst("blast", this.point, Math.min(34, Math.round(12 + radius * 6)));
    this.camera.shake(0.035);
  }

  heal(x: number, z: number): void {
    this.point.set(x, 0.7, z);
    this.vfx.burst("healPuff", this.point, 10);
  }

  repair(x: number, z: number): void {
    this.point.set(x, 0.9, z);
    this.vfx.burst("repairSpark", this.point, 14);
  }

  burstAt(key: string, x: number, z: number, count: number): void {
    this.point.set(x, 0.8, z);
    this.vfx.burst(key, this.point, count);
  }

  /** A short-lived ground ring so the taunt radius is readable at a glance. */
  taunt(x: number, z: number, radius: number): void {
    const ring = this.rings[this.ringCursor];
    this.ringLife[this.ringCursor] = 0.55;
    this.ringCursor = (this.ringCursor + 1) % TAUNT_RINGS;
    ring.position.set(x, 0.08, z);
    ring.scaling.set(radius, 1, radius);
    ring.setEnabled(true);
  }

  teleport(x: number, z: number): void {
    this.point.set(x, 0.7, z);
    this.vfx.burst("blink", this.point, 16);
  }

  unitDeath(x: number, z: number, level: number): void {
    this.point.set(x, 0.6, z);
    this.vfx.burst("iceShards", this.point, level >= 4 ? 18 : 9);
    this.audio.play("enemyDeath", level >= 4 ? 0.8 : 0.35, 1.2 - level * 0.07);
    if (level >= 6) this.camera.shake(0.16);
  }

  buildingHit(x: number, z: number): void {
    this.point.set(x, 1.0, z);
    this.vfx.burst("debris", this.point, 8);
  }

  damageNumber(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void {
    if (!EffectSettingsState.damageNumbersEnabled) return;
    this.text.spawn(x, y, z, amount, kind);
  }

  /** Reveals the target's bar. Height is chosen from what kind of thing it is. */
  healthChanged(target: Damageable): void {
    this.bars.reveal(target);
  }

  registerHealthBar(target: Damageable): void {
    this.bars.reveal(target);
  }

  /** Pickup-style feedback when the hero pulls a unit out of a node. */
  resourceGain(x: number, z: number, kind: "wood" | "stone" | "gold", amount: number): void {
    this.point.set(x, 1.1, z);
    this.vfx.burst(kind === "wood" ? "chips" : "debris", this.point, 8);
    this.text.spawn(x, 1.6, z, amount, "heal");
  }

  sound(name: string, volume = 1, pitch = 1): void {
    this.audio.play(name as SfxName, volume, pitch);
  }

  update(dt: number): void {
    for (let i = 0; i < this.rings.length; i++) {
      if (this.ringLife[i] <= 0) continue;
      this.ringLife[i] -= dt;
      const ring = this.rings[i];
      ring.visibility = Math.max(0, this.ringLife[i] / 0.55);
      if (this.ringLife[i] <= 0) ring.setEnabled(false);
    }
  }
}
