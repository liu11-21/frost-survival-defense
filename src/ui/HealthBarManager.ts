import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import type { Damageable } from "../combat/Damageable";
import type { GameCamera } from "../camera/GameCamera";
import { HealthBarLabel } from "./HealthBarLabel";
import {
  barLabel,
  barPolicy,
  CRITICAL_BELOW,
  CULL_DISTANCE,
  DEFAULT_POLICY,
  TEXT_DISTANCE,
  type BarPolicy,
  type BarStyle,
} from "./HealthBarPolicy";

/** Grown on demand; this is only the seed so a fresh run does not stall on it. */
const INITIAL_POOL = 60;
/** Hard ceiling so a pathological run cannot allocate meshes without bound. */
const MAX_POOL = 600;

export interface HealthBarWorld {
  allies: ReadonlyArray<Damageable>;
  enemies: ReadonlyArray<Damageable>;
  structures: ReadonlyArray<Damageable>;
  hero: Damageable | null;
  furnace: Damageable | null;
}

const FILL_COLOR: Record<BarStyle, [number, number, number]> = {
  ally: [0.32, 0.78, 0.95],
  hero: [0.42, 0.86, 1.0],
  enemy: [0.92, 0.28, 0.24],
  structure: [0.95, 0.72, 0.32],
};

interface StatusIcons {
  slow: Mesh;
  stun: Mesh;
  armor: Mesh;
}

interface BarSlot {
  root: Mesh;
  fill: Mesh;
  badge: Mesh;
  label: HealthBarLabel;
  icons: StatusIcons;
  owner: Damageable | null;
  /** Guards against a pooled unit being reused under a stale binding. */
  generation: number;
  policy: BarPolicy;
  active: boolean;
}

/** Not every `Damageable` is a `CombatUnit` (structures/furnace/hero aren't),
 * so these are read defensively rather than assumed present. */
interface StatusFields {
  slowFactor?: number;
  isStunned?: boolean;
  armorBroken?: boolean;
}

/**
 * Permanent, always-on world-space health bars for every living combatant and
 * every attackable structure — everything except the boss, which owns the
 * screen-wide bar instead.
 *
 * This is a binding problem, not a reveal problem: `syncAll` is called once a
 * frame with the current world state and makes the bound set exactly match
 * "alive and covered by policy" — nothing here waits for damage, a hover, or a
 * lock-on before a bar exists. A bar unbinds the instant its owner dies, is
 * recycled, or stops being relevant (e.g. a demolished building), which is
 * what keeps a reused corpse or plot from inheriting a stale bar.
 *
 * Every bar is a few thin planes billboarded at the camera. The pool grows on
 * demand rather than being fixed, because "every living thing has a bar" has
 * no natural upper bound the way "bars that appeared recently" did.
 */
export class HealthBarManager {
  private readonly pool: BarSlot[] = [];
  private readonly bound = new Map<number, BarSlot>();
  private readonly scratch = new Vector3();
  private readonly backMaterial: StandardMaterial;
  private enabled = true;

  constructor(
    private readonly scene: Scene,
    private readonly camera: GameCamera,
  ) {
    this.backMaterial = new StandardMaterial("mat.hpBack", scene);
    this.backMaterial.emissiveColor = new Color3(0.05, 0.05, 0.07);
    this.backMaterial.diffuseColor = Color3.Black();
    this.backMaterial.specularColor = Color3.Black();
    this.backMaterial.disableLighting = true;

    for (let i = 0; i < INITIAL_POOL; i++) this.pool.push(this.createSlot(i));
  }

  private createSlot(index: number): BarSlot {
    const scene = this.scene;
    const root = MeshBuilder.CreatePlane(`hpBack${index}`, { width: 1, height: 0.14 }, scene);
    root.material = this.backMaterial;
    root.isPickable = false;
    root.renderingGroupId = 1;
    root.billboardMode = Mesh.BILLBOARDMODE_ALL;
    root.setEnabled(false);

    const fill = MeshBuilder.CreatePlane(`hpFill${index}`, { width: 1, height: 0.1 }, scene);
    fill.parent = root;
    fill.position.z = -0.01;
    fill.isPickable = false;
    fill.renderingGroupId = 1;
    const fillMat = new StandardMaterial(`mat.hpFill${index}`, scene);
    fillMat.diffuseColor = Color3.Black();
    fillMat.specularColor = Color3.Black();
    fillMat.disableLighting = true;
    fill.material = fillMat;

    // The faction badge on the left of the bar. Its colour says which side, and
    // its offset shape backs that up without relying on colour alone.
    const badge = MeshBuilder.CreatePlane(`hpBadge${index}`, { width: 0.13, height: 0.13 }, scene);
    badge.parent = root;
    badge.position.set(-0.64, 0, -0.012);
    badge.isPickable = false;
    badge.renderingGroupId = 1;
    const badgeMat = new StandardMaterial(`mat.hpBadge${index}`, scene);
    badgeMat.diffuseColor = Color3.Black();
    badgeMat.specularColor = Color3.Black();
    badgeMat.disableLighting = true;
    badge.material = badgeMat;

    const icons: StatusIcons = {
      slow: this.makeStatusIcon(scene, root, index, "slow", -0.16, new Color3(0.4, 0.78, 1.0)),
      stun: this.makeStatusIcon(scene, root, index, "stun", 0, new Color3(1.0, 0.85, 0.25)),
      armor: this.makeStatusIcon(scene, root, index, "armor", 0.16, new Color3(0.85, 0.4, 0.3)),
    };

    return {
      root,
      fill,
      badge,
      label: new HealthBarLabel(scene, root, index),
      icons,
      owner: null,
      generation: 0,
      policy: DEFAULT_POLICY,
      active: false,
    };
  }

  /** A small always-hidden-until-active marker below the bar — simplified
   * colour-coded shapes rather than drawn iconography, in keeping with this
   * project's "paint at boot, cheap to instance" sprite/badge style. */
  private makeStatusIcon(scene: Scene, root: Mesh, index: number, name: string, xOffset: number, color: Color3): Mesh {
    const icon = MeshBuilder.CreatePlane(`hpStatus.${name}${index}`, { width: 0.1, height: 0.1 }, scene);
    icon.parent = root;
    icon.position.set(xOffset, -0.16, -0.012);
    icon.isPickable = false;
    icon.renderingGroupId = 1;
    const mat = new StandardMaterial(`mat.hpStatus.${name}${index}`, scene);
    mat.emissiveColor = color;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    icon.material = mat;
    icon.setEnabled(false);
    return icon;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  /**
   * Makes the bound set exactly match "everyone this policy covers, and is
   * currently alive". Call once a frame; safe to call from tests directly.
   */
  syncAll(world: HealthBarWorld): void {
    if (!this.enabled) return;
    const seen = new Set<number>();

    const bindAll = (list: Iterable<Damageable>): void => {
      for (const target of list) {
        if (!target.alive) continue;
        this.bind(target);
        seen.add(target.damageId);
      }
    };
    bindAll(world.enemies);
    bindAll(world.allies);
    bindAll(world.structures);
    if (world.hero?.alive) {
      this.bind(world.hero);
      seen.add(world.hero.damageId);
    }
    if (world.furnace?.alive) {
      this.bind(world.furnace);
      seen.add(world.furnace.damageId);
    }

    for (const [id, slot] of this.bound) {
      if (!seen.has(id)) this.release(slot);
    }
  }

  /** Binds one entity immediately, without waiting for the next `syncAll`. */
  private bind(target: Damageable): void {
    if (!this.enabled || !target.alive) return;
    const policy = barPolicy(target);
    if (policy.suppressed) return;

    const existing = this.bound.get(target.damageId);
    if (existing && existing.owner === target) return;

    const slot = this.freeSlot();
    if (!slot) return;
    slot.active = true;
    slot.owner = target;
    slot.generation = generationOf(target);
    slot.policy = policy;
    slot.root.setEnabled(true);
    slot.root.scaling.set(policy.width, 1, 1);
    this.bound.set(target.damageId, slot);
  }

  /** Compatibility entry point: damage/heal events just confirm the binding. */
  reveal(target: Damageable): void {
    this.bind(target);
  }

  /** Compatibility entry point: a hover or lock-on also just confirms the binding. */
  hold(target: Damageable | null): void {
    if (target) this.bind(target);
  }

  private freeSlot(): BarSlot | null {
    for (const slot of this.pool) if (!slot.active) return slot;
    if (this.pool.length >= MAX_POOL) return null;
    const slot = this.createSlot(this.pool.length);
    this.pool.push(slot);
    return slot;
  }

  /** How many bars are currently bound; the tests read this. */
  get activeCount(): number {
    return this.bound.size;
  }

  /** Bound bar counts by style, for the F6 verification overlay. */
  countsByStyle(): Record<BarStyle, number> {
    const out: Record<BarStyle, number> = { ally: 0, hero: 0, enemy: 0, structure: 0 };
    for (const slot of this.bound.values()) out[slot.policy.style]++;
    return out;
  }

  update(dt: number): void {
    void dt;
    if (!this.enabled) return;
    const cam = this.camera.camera.position;

    for (const slot of this.bound.values()) {
      const owner = slot.owner;
      if (!owner || !owner.alive || generationOf(owner) !== slot.generation) {
        this.release(slot);
        continue;
      }

      this.scratch.set(owner.position.x, owner.position.y + slot.policy.height, owner.position.z);
      const dist = Vector3.Distance(this.scratch, cam);
      if (dist > CULL_DISTANCE) {
        if (slot.root.isEnabled()) slot.root.setEnabled(false);
        slot.label.hide();
        continue;
      }
      if (!slot.root.isEnabled()) slot.root.setEnabled(true);
      this.draw(slot, owner, dist);
    }
  }

  private draw(slot: BarSlot, owner: Damageable, dist: number): void {
    slot.root.position.copyFrom(this.scratch);
    const ratio = Math.max(0, Math.min(1, owner.health / Math.max(1, owner.maxHealth)));
    slot.fill.scaling.x = Math.max(0.001, ratio);
    // Keep the fill left-aligned as it shrinks.
    slot.fill.position.x = -(1 - ratio) * 0.5;

    const style = slot.policy.style;
    const [r, g, b] = FILL_COLOR[style];
    const critical = ratio < CRITICAL_BELOW;
    const mat = slot.fill.material as StandardMaterial;
    if (critical && style !== "enemy") mat.emissiveColor.set(1.0, 0.45, 0.2);
    else mat.emissiveColor.set(r, g, b);

    const badge = slot.badge.material as StandardMaterial;
    if (style === "enemy") badge.emissiveColor.set(1.0, 0.33, 0.28);
    else if (style === "hero") badge.emissiveColor.set(1.0, 0.82, 0.32);
    else if (style === "ally") badge.emissiveColor.set(0.34, 0.66, 1.0);
    else badge.emissiveColor.set(0.95, 0.78, 0.4);
    // A friendly badge is square, a hostile one is a narrow diamond-ish sliver.
    slot.badge.rotation.z = style === "enemy" ? Math.PI * 0.25 : 0;

    if (dist <= TEXT_DISTANCE) {
      slot.label.set(barLabel(owner), style);
      slot.label.syncPosition();
    }
    else slot.label.hide();

    // Re-evaluated every frame, so an icon disappears the instant the
    // underlying state does — never a separate timer to fall out of sync.
    const status = owner as StatusFields;
    slot.icons.slow.setEnabled((status.slowFactor ?? 0) > 0.001);
    slot.icons.stun.setEnabled(status.isStunned === true);
    slot.icons.armor.setEnabled(status.armorBroken === true);
  }

  private release(slot: BarSlot): void {
    if (slot.owner) this.bound.delete(slot.owner.damageId);
    slot.owner = null;
    slot.active = false;
    slot.label.hide();
    slot.root.setEnabled(false);
    slot.icons.slow.setEnabled(false);
    slot.icons.stun.setEnabled(false);
    slot.icons.armor.setEnabled(false);
  }

  releaseAll(): void {
    for (const slot of [...this.bound.values()]) this.release(slot);
  }

  dispose(): void {
    for (const slot of this.pool) {
      slot.label.dispose();
      slot.root.dispose(false, true);
    }
    this.pool.length = 0;
    this.bound.clear();
  }
}

function generationOf(target: Damageable): number {
  return (target as { generation?: number }).generation ?? 0;
}
