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
const SKILL_RINGS = 12;
const SKILL_COLUMNS = 4;
const SKILL_AFTERGLOWS = 4;
const SUPPORT_AURA_RINGS = 8;

type HeroSkillKind = "airSupport" | "infiniteFirepower" | "groundSupport" | "seismicWave";

const SKILL_SHAPE: Record<HeroSkillKind, {
  converge: boolean;
  waves: number;
  waveGap: number;
  release: number;
  spread: number;
  columns: number;
  columnHeight: number;
  columnWidth: number;
  afterglow: number;
  burst: string;
  burstCount: number;
  burstHeight: number;
  shake: number;
}> = {
  airSupport: {
    converge: true, waves: 3, waveGap: 0.10, release: 0.16, spread: 1.0,
    columns: 1, columnHeight: 1.45, columnWidth: 1.0, afterglow: 1.6,
    burst: "blast", burstCount: 72, burstHeight: 0.9, shake: 0.10,
  },
  infiniteFirepower: {
    converge: false, waves: 0, waveGap: 0, release: 0.10, spread: 0.55,
    columns: 3, columnHeight: 1.20, columnWidth: 0.42, afterglow: 0,
    burst: "pierce", burstCount: 46, burstHeight: 1.6, shake: 0.03,
  },
  groundSupport: {
    converge: true, waves: 1, waveGap: 0, release: 0.22, spread: 0.85,
    columns: 1, columnHeight: 0.85, columnWidth: 1.25, afterglow: 2.4,
    burst: "auraPulse", burstCount: 54, burstHeight: 0.7, shake: 0.035,
  },
  seismicWave: {
    converge: false, waves: 3, waveGap: 0.055, release: 0.09, spread: 0.72,
    columns: 0, columnHeight: 0, columnWidth: 0, afterglow: 0.7,
    burst: "shock", burstCount: 58, burstHeight: 0.45, shake: 0.11,
  },
};

interface SkillRing {
  mesh: Mesh;
  life: number;
  duration: number;
  radius: number;
  delay: number;
  mode: "expand" | "converge";
}

interface SkillColumn {
  mesh: Mesh;
  life: number;
  duration: number;
  radius: number;
  heightScale: number;
}

interface SkillAfterglow {
  mesh: Mesh;
  life: number;
  duration: number;
  radius: number;
  durationScale: number;
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

export class CombatFeedback implements CombatVfx {
  private readonly point = new Vector3();
  private readonly rings: Mesh[] = [];
  private readonly ringLife: number[] = [];
  private ringCursor = 0;
  private readonly supportRings: SkillRing[] = [];
  private supportRingCursor = 0;
  private readonly skillRings: SkillRing[] = [];
  private readonly skillColumns: SkillColumn[] = [];
  private readonly skillAfterglows: SkillAfterglow[] = [];
  private skillColumnCursor = 0;
  private skillAfterglowCursor = 0;
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
    const supportMat = materials.unlit("mat.supportAuraRing", [1.0, 0.8, 0.18], 0.8);
    supportMat.backFaceCulling = false;
    for (let i = 0; i < SUPPORT_AURA_RINGS; i++) {
      const mesh = MeshBuilder.CreateTorus(`supportAuraRing${i}`, { diameter: 2, thickness: 0.09, tessellation: 36 }, scene);
      mesh.material = supportMat;
      mesh.position.y = 0.11;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
      mesh.setEnabled(false);
      this.supportRings.push({ mesh, life: 0, duration: 0.72, radius: 1, delay: 0, mode: "expand" });
    }
    this.skillMaterials = {
      airSupport: materials.unlit("mat.skill.airSupport", [1.0, 0.35, 0.12], 0.95),
      infiniteFirepower: materials.unlit("mat.skill.infiniteFirepower", [1.0, 0.72, 0.22], 0.95),
      groundSupport: materials.unlit("mat.skill.groundSupport", [0.35, 1.0, 0.62], 0.9),
      seismicWave: materials.unlit("mat.skill.seismicWave", [0.72, 0.55, 0.32], 0.95),
    };
    for (let i = 0; i < SKILL_RINGS; i++) {
      const mesh = MeshBuilder.CreateTorus(`heroSkillRing${i}`, { diameter: 2, thickness: 0.13, tessellation: 40 }, scene);
      mesh.isPickable = false;
      mesh.position.y = 0.12;
      mesh.renderingGroupId = 1;
      mesh.setEnabled(false);
      this.skillRings.push({ mesh, life: 0, duration: 0.8, radius: 1, delay: 0, mode: "expand" });
    }
    for (let i = 0; i < SKILL_COLUMNS; i++) {
      const mesh = MeshBuilder.CreateCylinder(`heroSkillColumn${i}`, { height: 1, diameterTop: 1.05, diameterBottom: 0.75, tessellation: 20 }, scene);
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
      mesh.setEnabled(false);
      this.skillColumns.push({ mesh, life: 0, duration: 0.42, radius: 1, heightScale: 1 });
    }
    for (let i = 0; i < SKILL_AFTERGLOWS; i++) {
      const mesh = MeshBuilder.CreateDisc(`heroSkillAfterglow${i}`, { radius: 1, tessellation: 32 }, scene);
      mesh.rotation.x = Math.PI * 0.5;
      mesh.position.y = 0.06;
      mesh.isPickable = false;
      mesh.renderingGroupId = 1;
      mesh.setEnabled(false);
      this.skillAfterglows.push({ mesh, life: 0, duration: 1.15, radius: 1, durationScale: 1 });
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

  meleeHit(x: number, z: number): void { this.point.set(x, 0.8, z); this.vfx.burst("slash", this.point, 8); }
  rangedHit(x: number, z: number): void { this.point.set(x, 0.8, z); this.vfx.burst("pierce", this.point, 6); }
  areaBlast(x: number, z: number, radius: number): void { this.point.set(x, 0.6, z); this.vfx.burst("blast", this.point, Math.min(34, Math.round(12 + radius * 6))); this.camera.shake(0.035); }
  heal(x: number, z: number): void { this.point.set(x, 0.7, z); this.vfx.burst("healPuff", this.point, 10); }
  repair(x: number, z: number): void { this.point.set(x, 0.9, z); this.vfx.burst("repairSpark", this.point, 14); }
  burstAt(key: string, x: number, z: number, count: number): void { this.point.set(x, 0.8, z); this.vfx.burst(key, this.point, count); }

  heroSkill(kind: HeroSkillKind, x: number, z: number, radius: number): void {
    this.skillCasts[kind]++;
    const shape = SKILL_SHAPE[kind];
    if (shape.converge) this.launchSkillRing(kind, x, z, radius * shape.spread, 0, "converge");
    for (let i = 0; i < shape.columns; i++) this.launchSkillColumn(kind, x, z, radius, shape.columnHeight, shape.columnWidth, i * 0.07);
    for (let i = 0; i < shape.waves; i++) this.launchSkillRing(kind, x, z, radius * shape.spread, shape.release + i * shape.waveGap, "expand");
    if (shape.afterglow > 0) this.launchSkillAfterglow(kind, x, z, radius * shape.spread, shape.afterglow);
    this.point.set(x, shape.burstHeight, z);
    this.vfx.burst(shape.burst, this.point, shape.burstCount);
    this.camera.shake(shape.shake);
  }

  private launchSkillColumn(kind: HeroSkillKind, x: number, z: number, radius: number, height: number, width: number, delay: number): void {
    const column = this.skillColumns[this.skillColumnCursor];
    this.skillColumnCursor = (this.skillColumnCursor + 1) % this.skillColumns.length;
    column.mesh.material = this.skillMaterials[kind];
    const spin = delay * 9.0;
    column.mesh.position.set(x + Math.sin(spin) * radius * 0.22, 0.05, z + Math.cos(spin) * radius * 0.22);
    column.radius = Math.max(0.5, radius * 0.34 * width);
    column.heightScale = height;
    column.life = -delay;
    column.mesh.visibility = 0;
    column.mesh.setEnabled(true);
  }

  private launchSkillAfterglow(kind: HeroSkillKind, x: number, z: number, radius: number, linger: number): void {
    const glow = this.skillAfterglows[this.skillAfterglowCursor];
    this.skillAfterglowCursor = (this.skillAfterglowCursor + 1) % this.skillAfterglows.length;
    glow.mesh.material = this.skillMaterials[kind];
    glow.mesh.position.set(x, 0.06, z);
    glow.radius = Math.max(1.5, radius) * 0.9;
    glow.durationScale = Math.max(0.1, linger);
    glow.life = 0;
    glow.mesh.visibility = 0;
    glow.mesh.setEnabled(true);
  }

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

  supportAura(x: number, z: number, radius: number): void {
    const ring = this.supportRings[this.supportRingCursor];
    this.supportRingCursor = (this.supportRingCursor + 1) % this.supportRings.length;
    ring.mesh.position.set(x, 0.11, z);
    ring.mesh.scaling.setAll(0.3);
    ring.mesh.visibility = 0.85;
    ring.life = 0;
    ring.duration = 0.72;
    ring.radius = Math.max(1, radius);
    ring.delay = 0;
    ring.mesh.setEnabled(true);
  }

  skillEffectSnapshot(): { casts: Record<HeroSkillKind, number>; activeRings: number; fallingStrikes: number; groundFirePatches: number } {
    return { casts: { ...this.skillCasts }, activeRings: this.skillRings.filter((ring) => ring.mesh.isEnabled()).length, fallingStrikes: this.fallingStrikes.filter((strike) => strike.life >= 0).length, groundFirePatches: this.firePatches.filter((patch) => patch.ground.isEnabled() && patch.flame.isEnabled()).length };
  }

  private launchSkillRing(kind: HeroSkillKind, x: number, z: number, radius: number, delay: number, mode: "expand" | "converge" = "expand"): void {
    const ring = this.skillRings[this.skillRingCursor];
    this.skillRingCursor = (this.skillRingCursor + 1) % this.skillRings.length;
    ring.mesh.material = this.skillMaterials[kind];
    ring.mesh.position.set(x, 0.12, z);
    ring.mode = mode;
    ring.mesh.scaling.setAll(mode === "converge" ? Math.max(1.5, radius) * 1.55 : 0.15);
    ring.mesh.visibility = mode === "converge" ? 0 : 1;
    ring.life = 0;
    ring.duration = mode === "converge" ? 0.2 : (kind === "groundSupport" ? 1.0 : 0.75);
    ring.radius = Math.max(1.5, radius);
    ring.delay = delay;
    ring.mesh.setEnabled(true);
  }

  taunt(x: number, z: number, radius: number): void {
    const ring = this.rings[this.ringCursor];
    this.ringLife[this.ringCursor] = 0.55;
    this.ringCursor = (this.ringCursor + 1) % TAUNT_RINGS;
    ring.position.set(x, 0.08, z);
    ring.scaling.set(radius, 1, radius);
    ring.setEnabled(true);
  }

  teleport(x: number, z: number): void { this.point.set(x, 0.7, z); this.vfx.burst("blink", this.point, 16); }

  unitDeath(x: number, z: number, level: number): void {
    this.point.set(x, 0.6, z);
    this.vfx.burst("iceShards", this.point, level >= 4 ? 18 : 9);
    this.audio.playAt("enemyDeath", x, z, level >= 4 ? 0.8 : 0.35, 1.2 - level * 0.07, Math.min(18, level * 3));
    if (level >= 6) this.camera.shake(0.16);
  }

  buildingHit(x: number, z: number): void { this.point.set(x, 1.0, z); this.vfx.burst("debris", this.point, 8); }
  damageNumber(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void { if (EffectSettingsState.damageNumbersEnabled) this.text.spawn(x, y, z, amount, kind); }
  healthChanged(target: Damageable): void { this.bars.reveal(target); }
  registerHealthBar(target: Damageable): void { this.bars.reveal(target); }
  resourceGain(x: number, z: number, kind: "wood" | "stone" | "gold", amount: number): void { this.point.set(x, 1.1, z); this.vfx.burst(kind === "wood" ? "chips" : "debris", this.point, 8); this.text.spawn(x, 1.6, z, amount, "heal"); }
  sound(name: string, volume = 1, pitch = 1): void { this.audio.play(name as SfxName, volume, pitch); }

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
      if (ring.life < ring.delay) { ring.mesh.visibility = 0; continue; }
      const t = Math.min(1, (ring.life - ring.delay) / ring.duration);
      if (ring.mode === "converge") {
        const scale = ring.radius * (1.55 - 1.35 * (t * t));
        ring.mesh.scaling.set(scale, scale, scale);
        ring.mesh.visibility = Math.min(1, t * 2.2) * (1 - Math.pow(t, 4));
      } else {
        const scale = 0.15 + ring.radius * (1 - Math.pow(1 - t, 3));
        ring.mesh.scaling.set(scale, scale, scale);
        ring.mesh.visibility = Math.max(0, 1 - t);
      }
      if (t >= 1) ring.mesh.setEnabled(false);
    }
    for (const column of this.skillColumns) {
      if (!column.mesh.isEnabled()) continue;
      column.life += dt;
      if (column.life < 0) { column.mesh.visibility = 0; continue; }
      const t = Math.min(1, column.life / column.duration);
      const height = (1.2 + 9.5 * (1 - Math.pow(1 - t, 2.2))) * column.heightScale;
      const width = column.radius * (1 - 0.55 * t);
      column.mesh.scaling.set(width, height, width);
      column.mesh.position.y = height * 0.5;
      column.mesh.visibility = Math.max(0, 0.72 * (1 - Math.pow(t, 1.6)));
      if (t >= 1) column.mesh.setEnabled(false);
    }
    for (const glow of this.skillAfterglows) {
      if (!glow.mesh.isEnabled()) continue;
      glow.life += dt;
      const t = Math.min(1, glow.life / (glow.duration * glow.durationScale));
      const scale = glow.radius * (0.45 + 0.55 * Math.min(1, t * 3));
      glow.mesh.scaling.set(scale, scale, scale);
      glow.mesh.visibility = Math.max(0, 0.4 * Math.pow(1 - t, 1.8));
      if (t >= 1) glow.mesh.setEnabled(false);
    }
    for (const ring of this.supportRings) {
      if (!ring.mesh.isEnabled()) continue;
      ring.life += dt;
      const t = Math.min(1, ring.life / ring.duration);
      ring.mesh.scaling.setAll(0.25 + ring.radius * (0.48 + t * 0.55));
      ring.mesh.visibility = Math.max(0, 0.85 * (1 - t));
      if (t >= 1) ring.mesh.setEnabled(false);
    }
    for (const strike of this.fallingStrikes) {
      if (strike.life < 0) continue;
      strike.life += dt;
      if (strike.life < 0.22) {
        const t = strike.life / 0.22;
        strike.beam.position.y = 11.5 - t * 9.7;
        strike.beam.scaling.y = 1 - t * 0.45;
      } else if (strike.life < 0.48) {
        strike.beam.setEnabled(false);
        strike.impact.setEnabled(true);
        const t = (strike.life - 0.22) / 0.26;
        strike.impact.position.set(strike.x, 0.16, strike.z);
        strike.impact.scaling.setAll(0.4 + t * 3.1);
        strike.impact.visibility = 1 - t;
      } else {
        strike.beam.setEnabled(false);
        strike.impact.setEnabled(false);
        strike.life = -1;
      }
    }
    if (this.groundFireRemaining > 0) {
      this.groundFireRemaining -= dt;
      this.groundFireElapsed += dt;
      const fade = Math.min(1, this.groundFireRemaining / 0.5);
      for (let i = 0; i < this.firePatches.length; i++) {
        const patch = this.firePatches[i];
        if (!patch.ground.isEnabled()) continue;
        patch.ground.visibility = 0.34 * fade;
        patch.flame.visibility = (0.5 + Math.sin(this.groundFireElapsed * 5 + patch.phase) * 0.25) * fade;
        patch.flame.scaling.y = 0.7 + Math.sin(this.groundFireElapsed * 4.1 + patch.phase) * 0.2;
      }
      if (this.groundFireRemaining <= 0) {
        for (const patch of this.firePatches) { patch.ground.setEnabled(false); patch.flame.setEnabled(false); }
      }
    }
  }
}