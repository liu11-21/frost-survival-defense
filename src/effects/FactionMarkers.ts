import { Color3, Mesh, Scene, StandardMaterial } from "@babylonjs/core";
import type { CombatUnit } from "../combat/CombatUnit";
import type { CombatWorld } from "../combat/CombatWorld";
import type { Damageable } from "../combat/Damageable";
import {
  createAllyHeadMarker,
  createAllyMarker,
  createEnemyHeadMarker,
  createEnemyMarker,
  createHeroBeam,
  createHeroGroundMarker,
  createHeroHeadMarker,
} from "./FactionMarkerMeshes";

export type MarkerStrength = "off" | "subtle" | "clear";

export const MARKER_COLORS = {
  ally: new Color3(0.34, 0.66, 1.0),
  enemy: new Color3(1.0, 0.33, 0.28),
  hero: new Color3(1.0, 0.82, 0.32),
};

const ALPHA: Record<MarkerStrength, number> = { off: 0, subtle: 0.42, clear: 0.9 };
const CAPACITY = 260;
/** Clear of the snow shader's drift displacement. */
const GROUND_HEIGHT = 0.14;
/** How far above a unit's own bar height the head marker floats. */
const HEAD_CLEARANCE = 0.4;

/**
 * Every combatant is marked **three independent ways at once** — a ground
 * badge at its feet, a small shape hovering over its head, and (via
 * `HealthBarManager`) a coloured health bar with its own faction badge — so
 * losing sight of any one of them in a crowd still leaves two others. None of
 * this is conditional on damage, distance, hover or lock-on: everything alive
 * that this policy covers is marked for as long as it is alive.
 *
 * The hero additionally gets a fourth and fifth cue that no ordinary ally
 * has: a doubled, unbroken ground ring (rather than the split arcs every
 * other ally uses) and a larger head marker with a thin light column above
 * it. Both are separate, non-pooled meshes — there is only ever one hero.
 */
export class FactionMarkers {
  private readonly allyMaster: Mesh;
  private readonly enemyMaster: Mesh;
  private readonly focusMesh: Mesh;
  private readonly allyHeadMaster: Mesh;
  private readonly enemyHeadMaster: Mesh;
  private readonly allyPool: Mesh[] = [];
  private readonly enemyPool: Mesh[] = [];
  private readonly allyHeadPool: Mesh[] = [];
  private readonly enemyHeadPool: Mesh[] = [];
  private readonly heroGround: Mesh;
  private readonly heroHead: Mesh;
  private readonly heroBeam: Mesh;
  private strength: MarkerStrength = "clear";
  private highlighted: string | null = null;
  private pulse = 0;

  constructor(scene: Scene, private readonly world: CombatWorld) {
    this.allyMaster = createAllyMarker(scene);
    this.allyMaster.material = markerMaterial(scene, "mat.marker.ally", MARKER_COLORS.ally);
    this.enemyMaster = createEnemyMarker(scene);
    this.enemyMaster.material = markerMaterial(scene, "mat.marker.enemy", MARKER_COLORS.enemy);
    this.focusMesh = createEnemyMarker(scene);
    this.focusMesh.material = markerMaterial(scene, "mat.marker.focus", new Color3(1, 0.72, 0.4));

    this.allyHeadMaster = createAllyHeadMarker(scene);
    this.allyHeadMaster.material = markerMaterial(scene, "mat.marker.head.ally", MARKER_COLORS.ally);
    this.enemyHeadMaster = createEnemyHeadMarker(scene);
    this.enemyHeadMaster.material = markerMaterial(scene, "mat.marker.head.enemy", MARKER_COLORS.enemy);
    for (const mesh of [this.allyHeadMaster, this.enemyHeadMaster]) {
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    }

    this.heroGround = createHeroGroundMarker(scene);
    this.heroGround.material = markerMaterial(scene, "mat.marker.hero.ground", MARKER_COLORS.hero);
    this.heroHead = createHeroHeadMarker(scene);
    this.heroHead.material = markerMaterial(scene, "mat.marker.hero.head", MARKER_COLORS.hero);
    this.heroHead.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.heroBeam = createHeroBeam(scene);
    const beamMat = markerMaterial(scene, "mat.marker.hero.beam", MARKER_COLORS.hero);
    beamMat.alpha = 0.35;
    this.heroBeam.material = beamMat;

    for (const mesh of [this.allyMaster, this.enemyMaster, this.allyHeadMaster, this.enemyHeadMaster]) {
      // The masters are templates only; every badge on screen is a clone.
      mesh.setEnabled(false);
    }
    for (const mesh of [
      this.allyMaster,
      this.enemyMaster,
      this.focusMesh,
      this.allyHeadMaster,
      this.enemyHeadMaster,
      this.heroGround,
      this.heroHead,
      this.heroBeam,
    ]) {
      // In the ordinary scene pass, so characters correctly stand on top of
      // their own badge. The snow shader lifts drifted ground by up to 0.07, so
      // anything lower than this is buried by it — which is exactly why the
      // first attempt at 0.05 drew nothing at all.
      mesh.renderingGroupId = 0;
      mesh.alwaysSelectAsActiveMesh = true;
    }
    this.allyMaster.position.y = GROUND_HEIGHT;
    this.enemyMaster.position.y = GROUND_HEIGHT;
    this.focusMesh.position.y = GROUND_HEIGHT + 0.01;
    this.focusMesh.setEnabled(false);
    this.heroGround.position.y = GROUND_HEIGHT;
    this.heroGround.setEnabled(false);
    this.heroHead.setEnabled(false);
    this.heroBeam.setEnabled(false);
  }

  get currentStrength(): MarkerStrength {
    return this.strength;
  }

  setStrength(strength: MarkerStrength): void {
    this.strength = strength;
    const alpha = ALPHA[strength];
    (this.allyMaster.material as StandardMaterial).alpha = alpha;
    (this.enemyMaster.material as StandardMaterial).alpha = alpha;
    (this.allyHeadMaster.material as StandardMaterial).alpha = alpha;
    (this.enemyHeadMaster.material as StandardMaterial).alpha = alpha;
    (this.heroGround.material as StandardMaterial).alpha = alpha;
    (this.heroHead.material as StandardMaterial).alpha = alpha;
    if (alpha === 0) this.hideAll();
  }

  /**
   * Brightens every marker of one ally type, e.g. when the squad HUD row for
   * 戰士 is clicked. Null clears it.
   */
  setHighlight(defId: string | null): void {
    this.highlighted = defId;
  }

  get highlight(): string | null {
    return this.highlighted;
  }

  update(dt: number, focus: Damageable | null): void {
    if (this.strength === "off") {
      this.focusMesh.setEnabled(false);
      this.heroGround.setEnabled(false);
      this.heroHead.setEnabled(false);
      this.heroBeam.setEnabled(false);
      return;
    }
    this.pulse += dt * 3.4;
    const glow = 1 + Math.sin(this.pulse) * 0.12;

    const allyUsed = this.place(this.world.allies, this.allyPool, this.allyHeadPool, this.allyMaster, this.allyHeadMaster, "ally", glow);
    hideFrom(this.allyPool, allyUsed);
    hideFrom(this.allyHeadPool, allyUsed);

    const enemyUsed = this.place(this.world.enemies, this.enemyPool, this.enemyHeadPool, this.enemyMaster, this.enemyHeadMaster, "enemy", glow);
    hideFrom(this.enemyPool, enemyUsed);
    hideFrom(this.enemyHeadPool, enemyUsed);

    const hero = this.world.hero;
    if (hero?.alive) {
      this.heroGround.setEnabled(true);
      this.heroGround.position.set(hero.position.x, GROUND_HEIGHT, hero.position.z);
      const groundSize = 1.4 * glow;
      this.heroGround.scaling.set(groundSize, 1, groundSize);

      const headY = hero.position.y + HEAD_CLEARANCE + 1.9;
      this.heroHead.setEnabled(true);
      this.heroHead.position.set(hero.position.x, headY, hero.position.z);
      const headSize = 1.15 * glow;
      this.heroHead.scaling.set(headSize, headSize, headSize);

      this.heroBeam.setEnabled(true);
      this.heroBeam.position.set(hero.position.x, headY + 0.55, hero.position.z);
    } else {
      this.heroGround.setEnabled(false);
      this.heroHead.setEnabled(false);
      this.heroBeam.setEnabled(false);
    }

    // Whatever the player is looking at or fighting gets a brighter badge.
    if (focus && focus.alive) {
      this.focusMesh.setEnabled(true);
      this.focusMesh.position.set(focus.position.x, GROUND_HEIGHT + 0.01, focus.position.z);
      const s = Math.max(1.1, focus.hitRadius * 2.9) * glow;
      this.focusMesh.scaling.set(s, 1, s);
    } else {
      this.focusMesh.setEnabled(false);
    }
  }

  private place(
    units: ReadonlyArray<CombatUnit>,
    groundPool: Mesh[],
    headPool: Mesh[],
    groundMaster: Mesh,
    headMaster: Mesh,
    faction: "ally" | "enemy",
    glow: number,
  ): number {
    let used = 0;
    for (let i = 0; i < units.length && used < CAPACITY; i++) {
      const u = units[i];
      if (!u.alive) continue;
      let size = Math.max(0.95, u.hitRadius * 2.6);
      if (u.level >= 6) size *= 1.6;
      else if (u.level >= 4) size *= 1.25;
      if (faction === "ally" && this.highlighted === u.def.id) size *= 1.4 * glow;

      const ground = this.slot(groundPool, groundMaster, used);
      ground.position.set(u.position.x, GROUND_HEIGHT, u.position.z);
      ground.scaling.set(size, 1, size);
      if (!ground.isEnabled()) ground.setEnabled(true);

      const headY = u.position.y + HEAD_CLEARANCE + Math.min(1.6, u.hitRadius * 1.6) + 1.9;
      const head = this.slot(headPool, headMaster, used);
      head.position.set(u.position.x, headY, u.position.z);
      const headScale = Math.max(0.8, Math.min(1.6, size * 0.55));
      head.scaling.set(headScale, headScale, headScale);
      if (!head.isEnabled()) head.setEnabled(true);

      used++;
    }
    return used;
  }

  /**
   * Grows the pool on demand; clones are never destroyed once made.
   *
   * Clones rather than hardware instances: an instance whose source mesh is
   * hidden never reaches Babylon's active-mesh list here, so the badges simply
   * did not draw. The geometry is small and the material is shared, so the
   * cost of a clone is a draw call and nothing else.
   */
  private slot(pool: Mesh[], master: Mesh, index: number): Mesh {
    let marker = pool[index];
    if (!marker) {
      marker = master.clone(`${master.name}.${index}`, null, true);
      marker.material = master.material;
      marker.billboardMode = master.billboardMode;
      marker.isPickable = false;
      marker.alwaysSelectAsActiveMesh = true;
      marker.doNotSyncBoundingInfo = true;
      marker.setEnabled(false);
      pool.push(marker);
    }
    return marker;
  }

  private hideAll(): void {
    hideFrom(this.allyPool, 0);
    hideFrom(this.enemyPool, 0);
    hideFrom(this.allyHeadPool, 0);
    hideFrom(this.enemyHeadPool, 0);
    this.focusMesh.setEnabled(false);
    this.heroGround.setEnabled(false);
    this.heroHead.setEnabled(false);
    this.heroBeam.setEnabled(false);
  }

  /** Inspection for the visual tests: what the badges are actually drawing. */
  debugState(): Record<string, number | boolean | string> {
    return {
      strength: this.strength,
      allyShown: countEnabled(this.allyPool),
      enemyShown: countEnabled(this.enemyPool),
      allyHeadShown: countEnabled(this.allyHeadPool),
      enemyHeadShown: countEnabled(this.enemyHeadPool),
      allyPool: this.allyPool.length,
      enemyPool: this.enemyPool.length,
      alpha: (this.allyMaster.material as StandardMaterial).alpha,
      focus: this.focusMesh.isEnabled(),
      heroGround: this.heroGround.isEnabled(),
      heroHead: this.heroHead.isEnabled(),
      heroBeam: this.heroBeam.isEnabled(),
    };
  }

  dispose(): void {
    for (const m of this.allyPool) m.dispose();
    for (const m of this.enemyPool) m.dispose();
    for (const m of this.allyHeadPool) m.dispose();
    for (const m of this.enemyHeadPool) m.dispose();
    this.allyPool.length = 0;
    this.enemyPool.length = 0;
    this.allyHeadPool.length = 0;
    this.enemyHeadPool.length = 0;
    this.allyMaster.dispose(false, true);
    this.enemyMaster.dispose(false, true);
    this.allyHeadMaster.dispose(false, true);
    this.enemyHeadMaster.dispose(false, true);
    this.focusMesh.dispose(false, true);
    this.heroGround.dispose(false, true);
    this.heroHead.dispose(false, true);
    this.heroBeam.dispose(false, true);
  }
}

function hideFrom(pool: Mesh[], from: number): void {
  for (let i = from; i < pool.length; i++) {
    if (pool[i].isEnabled()) pool[i].setEnabled(false);
  }
}

function countEnabled(pool: Mesh[]): number {
  let n = 0;
  for (const m of pool) if (m.isEnabled()) n++;
  return n;
}

function markerMaterial(scene: Scene, key: string, color: Color3): StandardMaterial {
  const mat = new StandardMaterial(key, scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = color;
  mat.disableLighting = true;
  mat.alpha = ALPHA.clear;
  mat.backFaceCulling = false;
  mat.zOffset = -3;
  return mat;
}
