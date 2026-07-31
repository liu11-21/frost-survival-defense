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
const SKILL_RINGS = 8;

type HeroSkillKind = "airSupport" | "infiniteFirepower" | "groundSupport" | "seismicWave";

interface SkillRing {
  mesh: Mesh;
  life: number;
  duration: number;
  radius: number;
  delay: number;
}

interface FallingStrike {
  beam: Mesh;
  impact: Mesh;
  life: number;
  x: number;
  z: number;
}

interface FirePatch {
  ground: Mesh;
  flame: Mesh;
  phase: number;
}

/**
 * Turns combat events into particles, sound and camera shake. Combat code only
 * ever calls this interface — it never reaches for a particle system directly.
 */
export class CombatFeedback implements CombatVfx {
  private readonly point = new Vector3();
  private readonly rings: Mesh[] = [];
  private readonly ringLife: number[] = [];
  private ringCursor = 0;
  private readonly skillRings: SkillRing[] = [];
  private skillRingCursor = 0;
  private readonly skillMaterials: Record<HeroSkillKind, ReturnType<MaterialFactory["unlit"]>>;
  private readonly skillCasts: Record<HeroSkillKind, number> = {
    airSupport: 0,
    infiniteFirepower: 0,
    groundSupport: 0,
    seismicWave: 0,
  };
  private readonly fallingStrikes: FallingStrike[] = [];
  private strikeCursor = 0;
  private readonly firePatches: FirePatch[] = [];
  private groundFireRemaining = 0;
  private groundFireElapsed = 0;

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
    this.skillMaterials = {
      airSupport: materials.unlit("mat.skill.airSupport", [1.0, 0.35, 0.12], 0.95),
      infiniteFirepower: materials.unlit("mat.skill.infiniteFirepower", [1.0, 0.72, 0.22], 0.95),
      groundSupport: materials.unlit("mat.skill.groundSupport", [0.35, 1.0, 0.62], 0.9),
      seismicWave: materials.unlit("mat.skill.seismicWave", [0.72, 0.55, 0.32], 0.95),
    };
    for (let i = 0; i < SKILL_RINGS; i++) {
      const mesh = MeshBuilder.CreateTorus(
        `heroSkillRing${i}`,
        { diameter: 2, thickness: 0.13, tessellation: 40 },
        scene,
      );
      mesh.isPickable = false;
      mesh.position.y = 0.12;
      mesh.renderingGroupId = 1;
      mesh.setEnabled(false);
      this.skillRings.push({ mesh, life: 0, duration: 0.8, radius: 1, delay: 0 });
    }

    const strikeMat = materials.unlit("mat.airStrike.beam", [1.0, 0.78, 0.26], 1);
    const impactMat = materials.unlit("mat.airStrike.impact", [1.0, 0.22, 0.06], 1);
    for (let i = 0; i < 6; i++) {
      const beam = MeshBuilder.CreateCylinder(`airStrikeBeam${i}`, { height: 2.4, diameterTop: 0.13, diameterBottom: 0.38, tessellation: 6 }, scene);
      beam.material = strikeMat;
      beam.isPickable = false;
      beam.renderingGroupId = 1;
      beam.setEnabled(false);
      const impact = MeshBuilder.CreateTorus(`airStrikeImpact${i}`, { diameter: 1.6, thickness: 0.13, tessellation: 32 }, scene);
      impact.material = impactMat;
      impact.position.y = 0.16;
      impact.isPickable = false;
      impact.renderingGroupId = 1;
      impact.setEnabled(false);
      this.fallingStrikes.push({ beam, impact, life: -1, x: 0, z: 0 });
    }

    const fireGround = materials.unlit("mat.groundFire.ground", [1.0, 0.16, 0.03], 0.9);
    const fireFlame = materials.unlit("mat.groundFire.flame", [1.0, 0.68, 0.08], 1);
    fireGround.backFaceCulling = false;
    fireFlame.backFaceCulling = false;
    for (let i = 0; i < 9; i++) {
      const ground = MeshBuilder.CreateDisc(`groundFirePatch${i}`, { radius: 1, tessellation: 18 }, scene);
      ground.material = fireGround;
      ground.rotation.x = Math.PI * 0.5;
      ground.position.y = 0.17;
      ground.isPickable = false;
      ground.renderingGroupId = 1;
      ground.setEnabled(false);
      const flame = MeshBuilder.CreateCylinder(`groundFireFlame${i}`, { height: 1.3, diameterTop: 0.03, diameterBottom: 0.62, tessellation: 6 }, scene);
      flame.material = fireFlame;
      flame.position.y = 0.74;
      flame.isPickable = false;
      flame.renderingGroupId = 1;
      flame.setEnabled(false);
      this.firePatches.push({ ground, flame, phase: i * 1.7 });
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

  /** Two expanding rings plus a dense colour-coded burst make casts unmistakable. */
  heroSkill(kind: HeroSkillKind, x: number, z: number, radius: number): void {
    this.skillCasts[kind]++;
    this.launchSkillRing(kind, x, z, radius, 0);
    this.launchSkillRing(kind, x, z, radius, 0.12);
    this.point.set(x, 0.9, z);
    if (kind === "airSupport") this.vfx.burst("blast", this.point, 72);
    else if (kind === "infiniteFirepower") this.vfx.burst("pierce", this.point, 42);
    else if (kind === "groundSupport") this.vfx.burst("auraPulse", this.point, 50);
    else this.vfx.burst("shock", this.point, 54);
    this.camera.shake(kind === "airSupport" || kind === "seismicWave" ? 0.09 : 0.045);
  }

  /** A bright descending beam followed by a blast ring: distinct from a normal shell. */
  airStrike(x: number, z: number, radius: number): void {
    const strike = this.fallingStrikes[this.strikeCursor];
    this.strikeCursor = (this.strikeCursor + 1) % this.fallingStrikes.length;
    const phase = this.strikeCursor * 2.399963229728653;
    const offset = radius * (0.18 + (this.strikeCursor % 3) * 0.16);
    strike.x = x + Math.sin(phase) * offset;
    strike.z = z + Math.cos(phase) * offset;
    strike.life = 0;
    strike.beam.position.set(strike.x, 11.5, strike.z);
    strike.beam.scaling.setAll(1);
    strike.beam.setEnabled(true);
    strike.impact.setEnabled(false);
  }

  /** Starts or refreshes an obvious ring of ground flames. */
  groundFire(x: number, z: number, radius: number, duration: number): void {
    this.groundFireRemaining = Math.max(this.groundFireRemaining, duration);
    this.groundFireElapsed = 0;
    for (let i = 0; i < this.firePatches.length; i++) {
      const patch = this.firePatches[i];
      const angle = i * 2.399963229728653;
      const distance = i === 0 ? 0 : radius * (0.18 + (i % 3) * 0.16);
      const px = x + Math.sin(angle) * distance;
      const pz = z + Math.cos(angle) * distance;
      const size = Math.max(0.7, radius * (i === 0 ? 0.17 : 0.105));
      patch.ground.position.set(px, 0.17, pz);
      patch.ground.scaling.set(size, size, size);
      patch.flame.position.set(px, 0.72, pz);
      patch.flame.scaling.set(size * 0.7, 1, size * 0.7);
      patch.ground.setEnabled(true);
      patch.flame.setEnabled(true);
    }
  }

  skillEffectSnapshot(): { casts: Record<HeroSkillKind, number>; activeRings: number; fallingStrikes: number; groundFirePatches: number } {
    return {
      casts: { ...this.skillCasts },
      activeRings: this.skillRings.filter((ring) => ring.mesh.isEnabled()).length,
      fallingStrikes: this.fallingStrikes.filter((strike) => strike.life >= 0).length,
      groundFirePatches: this.firePatches.filter((patch) => patch.ground.isEnabled() && patch.flame.isEnabled()).length,
    };
  }

  private launchSkillRing(kind: HeroSkillKind, x: number, z: number, radius: number, delay: number): void {
    const ring = this.skillRings[this.skillRingCursor];
    this.skillRingCursor = (this.skillRingCursor + 1) % this.skillRings.length;
    ring.mesh.material = this.skillMaterials[kind];
    ring.mesh.position.set(x, 0.12, z);
    ring.mesh.scaling.setAll(0.15);
    ring.mesh.visibility = 1;
    ring.life = 0;
    ring.duration = kind === "groundSupport" ? 1.0 : 0.75;
    ring.radius = Math.max(1.5, radius);
    ring.delay = delay;
    ring.mesh.setEnabled(true);
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
    for (const ring of this.skillRings) {
      if (!ring.mesh.isEnabled()) continue;
      ring.life += dt;
      if (ring.life < ring.delay) {
        ring.mesh.visibility = 0;
        continue;
      }
      const t = Math.min(1, (ring.life - ring.delay) / ring.duration);
      const scale = 0.15 + ring.radius * (1 - Math.pow(1 - t, 3));
      ring.mesh.scaling.set(scale, scale, scale);
      ring.mesh.visibility = Math.max(0, 1 - t);
      if (t >= 1) ring.mesh.setEnabled(false);
    }
    for (const strike of this.fallingStrikes) {
      if (strike.life < 0) continue;
      strike.life += dt;
      const progress = Math.min(1, strike.life / 0.34);
      strike.beam.position.y = 11.5 - progress * 10.4;
      strike.beam.scaling.set(1 + progress * 0.8, 1, 1 + progress * 0.8);
      if (progress < 1) continue;
      if (strike.beam.isEnabled()) {
        strike.beam.setEnabled(false);
        strike.impact.position.set(strike.x, 0.16, strike.z);
        strike.impact.scaling.setAll(0.35);
        strike.impact.visibility = 1;
        strike.impact.setEnabled(true);
        this.point.set(strike.x, 0.7, strike.z);
        this.vfx.burst("blast", this.point, 64);
      }
      const impactProgress = Math.min(1, (strike.life - 0.34) / 0.38);
      strike.impact.scaling.setAll(0.35 + impactProgress * 3.2);
      strike.impact.visibility = Math.max(0, 1 - impactProgress);
      if (impactProgress >= 1) {
        strike.impact.setEnabled(false);
        strike.life = -1;
      }
    }
    if (this.groundFireRemaining > 0) {
      this.groundFireRemaining -= dt;
      this.groundFireElapsed += dt;
      const fade = Math.max(0, Math.min(1, this.groundFireRemaining / 1.2));
      for (const patch of this.firePatches) {
        const flicker = 0.78 + Math.sin(this.groundFireElapsed * 9 + patch.phase) * 0.22;
        patch.ground.visibility = fade * (0.55 + flicker * 0.25);
        patch.flame.visibility = fade * flicker;
        patch.flame.scaling.y = 0.72 + flicker * 0.48;
      }
      if (this.groundFireRemaining <= 0) {
        for (const patch of this.firePatches) {
          patch.ground.setEnabled(false);
          patch.flame.setEnabled(false);
        }
      }
    }
  }
}
