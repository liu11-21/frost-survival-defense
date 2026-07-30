import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { allocateDamageId, type Damageable, type TargetKind } from "../combat/Damageable";
import { FURNACE, furnaceMaxHealth } from "../data/FurnaceUpgradeConfig";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { LightingSetup } from "../scene/LightingSetup";
import type { CollisionWorld } from "../util/Collision";
import { damp, easeOutCubic } from "../util/MathUtil";
import { HeatSource } from "./HeatSource";

/**
 * The one thing that must not fall. It is a damageable structure, a healing
 * aura for everything friendly standing near it, and the heat source that keeps
 * the snow off the settlement.
 */
export class Furnace implements Damageable {
  readonly damageId = allocateDamageId();
  readonly faction = "ally" as const;
  readonly kind: TargetKind = "furnace";
  readonly displayName = "中央火爐";
  readonly level = 0;
  readonly threat = 0;
  readonly root: TransformNode;
  readonly emitter: Mesh;
  readonly heat: HeatSource;
  readonly position: Vector3;

  health: number;
  maxHealth: number;
  private _alive = true;
  private tier = FURNACE.startLevel;

  private readonly metal: PBRMaterial;
  private readonly coals: PBRMaterial;
  private readonly upgradeParts: Mesh[] = [];
  private upgradeAnim = -1;
  private flicker = 0;
  private glowIntensity = 90;
  private glowRange = 18;
  private sinceDamage = 0;
  private selfHealTimer = 0;
  private hitFlash = 0;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    private readonly lighting: LightingSetup,
    collision: CollisionWorld,
  ) {
    this.position = new Vector3(0, 0, 0);
    this.maxHealth = furnaceMaxHealth(this.tier);
    this.health = this.maxHealth;

    this.root = new TransformNode("furnace", scene);
    this.root.scaling.setAll(0.62);

    const stone = materials.pbr("mat.furnaceStone", {
      color: [0.28, 0.28, 0.31],
      roughness: 0.94,
      texture: "rock",
    });

    this.metal = new PBRMaterial("mat.furnaceMetal", scene);
    this.metal.albedoColor = new Color3(0.26, 0.24, 0.24);
    this.metal.metallic = 0.85;
    this.metal.roughness = 0.55;
    this.metal.emissiveColor = new Color3(0.08, 0.03, 0.01);

    this.coals = new PBRMaterial("mat.furnaceCoals", scene);
    this.coals.albedoColor = new Color3(0.12, 0.05, 0.03);
    this.coals.emissiveColor = new Color3(1.0, 0.35, 0.08);
    this.coals.roughness = 0.75;

    const plinth = MeshBuilder.CreateCylinder(
      "furnace.plinth",
      { height: 0.5, diameterTop: 5.4, diameterBottom: 6.2, tessellation: 12 },
      scene,
    );
    plinth.parent = this.root;
    plinth.position.y = 0.25;
    plinth.material = stone;
    plinth.receiveShadows = true;

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const block = MeshBuilder.CreateBox(`furnace.block${i}`, { width: 1.15, height: 0.42, depth: 0.75 }, scene);
      block.parent = this.root;
      block.position.set(Math.sin(a) * 2.45, 0.68, Math.cos(a) * 2.45);
      block.rotation.y = a;
      block.material = stone;
    }

    const body = MeshBuilder.CreateCylinder(
      "furnace.body",
      { height: 2.4, diameterTop: 2.35, diameterBottom: 2.95, tessellation: 10 },
      scene,
    );
    body.parent = this.root;
    body.position.y = 1.7;
    body.material = this.metal;
    body.receiveShadows = true;

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const vent = MeshBuilder.CreateBox(`furnace.vent${i}`, { width: 0.55, height: 0.26, depth: 0.1 }, scene);
      vent.parent = this.root;
      vent.position.set(Math.sin(a) * 1.44, 1.15, Math.cos(a) * 1.44);
      vent.rotation.y = a;
      vent.material = this.coals;
    }

    const bowl = MeshBuilder.CreateCylinder(
      "furnace.bowl",
      { height: 0.5, diameterTop: 2.7, diameterBottom: 2.1, tessellation: 10 },
      scene,
    );
    bowl.parent = this.root;
    bowl.position.y = 3.0;
    bowl.material = this.metal;

    const coalBed = MeshBuilder.CreateCylinder(
      "furnace.coalBed",
      { height: 0.24, diameterTop: 2.3, diameterBottom: 1.9, tessellation: 10 },
      scene,
    );
    coalBed.parent = this.root;
    coalBed.position.y = 3.1;
    coalBed.material = this.coals;

    this.emitter = MeshBuilder.CreateBox("furnace.emitter", { size: 0.1 }, scene);
    this.emitter.parent = this.root;
    this.emitter.position.y = 3.2;
    this.emitter.isVisible = false;

    const stack = MeshBuilder.CreateCylinder(
      "furnace.stack",
      { height: 3.2, diameterTop: 1.05, diameterBottom: 1.45, tessellation: 9 },
      scene,
    );
    stack.parent = this.root;
    stack.position.y = 4.7;
    stack.material = this.metal;
    this.upgradeParts.push(stack);

    const crown = MeshBuilder.CreateTorus("furnace.crown", { diameter: 3.3, thickness: 0.3, tessellation: 12 }, scene);
    crown.parent = this.root;
    crown.position.y = 3.35;
    crown.material = this.metal;
    this.upgradeParts.push(crown);

    for (const part of this.upgradeParts) part.setEnabled(false);

    this.heat = new HeatSource(0, 0, 13, 1);
    collision.add(0, 0, FURNACE.radius);
  }

  get alive(): boolean {
    return this._alive;
  }
  get hitRadius(): number {
    return FURNACE.radius;
  }
  get currentLevel(): number {
    return this.tier;
  }
  get healthPercent(): number {
    return this.maxHealth > 0 ? this.health / this.maxHealth : 0;
  }
  get castMeshes(): Mesh[] {
    return this.root.getChildMeshes(false).filter((m): m is Mesh => m instanceof Mesh && m.isVisible);
  }

  applyDamage(amount: number, _fromX: number, _fromZ: number): void {
    if (!this._alive) return;
    this.health -= amount;
    this.sinceDamage = 0;
    this.hitFlash = 1;
    if (this.health <= 0) {
      this.health = 0;
      this._alive = false;
    }
  }

  /** Applied when the furnace level rises. Health scales, current HP follows. */
  setLevel(level: number): void {
    const clamped = Math.max(1, Math.min(FURNACE.maxLevel, level));
    if (clamped === this.tier) return;
    const ratio = this.healthPercent;
    this.tier = clamped;
    this.maxHealth = furnaceMaxHealth(clamped);
    this.health = Math.min(this.maxHealth, Math.ceil(this.maxHealth * ratio));
    this.upgradeAnim = 0;
    for (const part of this.upgradeParts) {
      part.setEnabled(true);
      part.scaling.setAll(0.01);
    }
    this.heat.setRadius(13 + Math.min(10, clamped) * 1.4);
  }

  /** Test-only: keeps the core alive so a long AI run is not cut short. */
  restoreToFull(): void {
    this.health = this.maxHealth;
    this._alive = true;
  }

  resetForNewRun(): void {
    this.tier = FURNACE.startLevel;
    this.maxHealth = furnaceMaxHealth(this.tier);
    this.health = this.maxHealth;
    this._alive = true;
    this.sinceDamage = 0;
    this.upgradeAnim = -1;
    this.heat.setRadius(13);
    for (const part of this.upgradeParts) part.setEnabled(false);
    this.metal.albedoColor.set(0.26, 0.24, 0.24);
    this.metal.emissiveColor.set(0.08, 0.03, 0.01);
    this.coals.emissiveColor.set(1.0, 0.35, 0.08);
  }

  /** Returns true on the tick a self-repair pulse landed, for the VFX hook. */
  update(dt: number): boolean {
    this.flicker += dt;
    const flick = 0.82 + Math.sin(this.flicker * 11.3) * 0.09 + Math.sin(this.flicker * 4.1 + 1.3) * 0.09;
    let healed = false;

    if (this._alive) {
      this.sinceDamage += dt;
      if (this.sinceDamage >= FURNACE.selfHealDelay && this.health < this.maxHealth) {
        this.selfHealTimer += dt;
        while (this.selfHealTimer >= FURNACE.selfHealTick) {
          this.selfHealTimer -= FURNACE.selfHealTick;
          this.health = Math.min(this.maxHealth, this.health + FURNACE.selfHealAmount);
          healed = true;
        }
      } else {
        this.selfHealTimer = 0;
      }
    }

    if (this.hitFlash > 0) {
      this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
      this.root.position.x = Math.sin(this.flicker * 60) * this.hitFlash * 0.09;
      this.root.position.z = Math.cos(this.flicker * 71) * this.hitFlash * 0.09;
    }

    if (this.upgradeAnim >= 0) {
      this.upgradeAnim += dt;
      const t = Math.min(1, this.upgradeAnim / 1.2);
      const e = easeOutCubic(t);
      for (const part of this.upgradeParts) part.scaling.setAll(0.01 + e * 0.99);
      const tierBoost = Math.min(1, (this.tier - 1) / 6);
      this.metal.albedoColor.set(0.26 + tierBoost * 0.24, 0.24 + tierBoost * 0.19, 0.24 + tierBoost * 0.14);
      this.metal.emissiveColor.set(0.08 + tierBoost * 0.4, 0.03 + tierBoost * 0.14, 0.01 + tierBoost * 0.03);
      this.coals.emissiveColor.set(1.0 + tierBoost * 1.8, 0.35 + tierBoost * 0.5, 0.08 + tierBoost * 0.14);
      if (t >= 1) this.upgradeAnim = -1;
    }

    const targetIntensity = 90 + Math.min(10, this.tier - 1) * 34;
    const targetRange = 18 + Math.min(10, this.tier - 1) * 3.2;
    this.glowIntensity = damp(this.glowIntensity, targetIntensity, 1.6, dt);
    this.glowRange = damp(this.glowRange, targetRange, 1.6, dt);
    this.lighting.setFurnaceGlow(this.glowIntensity * flick, this.glowRange, FURNACE_COLOR);
    return healed;
  }
}

const FURNACE_COLOR = new Color3(1.0, 0.6, 0.24);
