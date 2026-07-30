import { Scene, TransformNode, Vector3 } from "@babylonjs/core";
import { BUILDING_BY_ID, type BuildingDefinition, type BuildingType } from "../data/BuildingDefinitions";
import { WALL_SEGMENT_DEPTH, WALL_SIDE_BY_SLOT } from "../data/BuildSlotDefinitions";
import type { GameEvents } from "../game/GameEvents";
import { MaterialFactory } from "../scene/MaterialFactory";
import { allocateDamageId, type Damageable, type TargetKind } from "../combat/Damageable";
import type { CombatContext } from "../combat/CombatContext";
import { makeBox, type BoxShape } from "../util/Collision";
import { BuildingVisualController, type VisualIntegrity } from "./BuildingVisualController";
import { fireBuilding, tickBuildingCombat } from "./BuildingCombat";
import type { BuildSlot } from "./BuildSlot";

const KIND_BY_TYPE: Record<BuildingType, TargetKind> = {
  mine: "warehouse",
  lumberyard: "warehouse",
  warehouse: "warehouse",
  recruitHall: "recruitHall",
  autoCollector: "warehouse",
  autoRebuilder: "warehouse",
  tower: "tower",
  crossbowTower: "tower",
  frostTower: "tower",
  sniperTower: "tower",
  mortar: "tower",
  wall: "wall",
};

/** Seconds the take-apart animation runs before the slot frees up. */
export const DEMOLISH_DURATION = 1.4;

/**
 * One constructed building. Handles its own staged assembly, production buffer
 * and — for towers — its own targeting and firing.
 */
export class Building implements Damageable {
  readonly damageId = allocateDamageId();
  readonly faction = "ally" as const;
  readonly def: BuildingDefinition;
  readonly position: Vector3;
  readonly kind: TargetKind;
  readonly level = 0;
  readonly visual: BuildingVisualController;
  /** Long straight blockers carry a box; everything else stays a circle. */
  readonly blockerBox: BoxShape | null;

  health: number;
  maxHealth: number;
  private _alive = true;
  private buildProgressValue = 0;
  private buffer = 0;
  private produceTimer = 0;
  private attackTimer = 0;
  private sinceDamaged = Infinity;
  private demolishProgress = 0;
  private demolishing = false;
  /** True from the instant combat kills this structure until its collapse
   * animation finishes — `handleDestroyed()` (which actually frees the slot)
   * must not run before then, or the model just vanishes with no warning. */
  private collapsing = false;
  private collapseProgress = 0;

  constructor(
    scene: Scene,
    materials: MaterialFactory,
    events: GameEvents,
    readonly type: BuildingType,
    readonly slot: BuildSlot,
    healthMultiplier: number,
  ) {
    const def = BUILDING_BY_ID.get(type);
    if (!def) throw new Error(`unknown building type ${type}`);
    this.def = def;
    this.kind = KIND_BY_TYPE[type];
    this.position = new Vector3(slot.x, 0, slot.z);
    this.maxHealth = Math.max(0, Math.round(def.maxHealth * healthMultiplier));
    this.health = this.maxHealth;
    // The *logical* box used for reachability (`world.wallBlocks`) spans the
    // whole side including the gate gap — the gate is only ever a physical
    // opening for allies, never a hole in what an enemy can path around.
    this.blockerBox =
      type === "wall"
        ? makeBox((WALL_SIDE_BY_SLOT.get(slot.id)?.length ?? WALL_SEGMENT_DEPTH) * 0.5, WALL_SEGMENT_DEPTH * 0.5, slot.yaw)
        : null;
    this.visual = new BuildingVisualController(
      scene,
      materials,
      events,
      type,
      slot.id,
      slot.x,
      slot.z,
      slot.yaw,
    );
  }

  get root(): TransformNode {
    return this.visual.root;
  }
  get alive(): boolean {
    return this._alive;
  }
  get hitRadius(): number {
    return this.def.radius;
  }
  get threat(): number {
    return this.def.attackPower;
  }
  get displayName(): string {
    return this.def.name;
  }
  get canBeAttacked(): boolean {
    return this.def.canBeAttacked;
  }
  get isComplete(): boolean {
    return this.visual.isFinished;
  }
  get buildProgress(): number {
    return Math.min(1, this.buildProgressValue);
  }
  /** Seconds of construction left, for the slot prompt. */
  get buildRemaining(): number {
    return Math.max(0, (1 - this.buildProgressValue) * this.def.buildTime);
  }
  get storedAmount(): number {
    return this.buffer;
  }
  get produces(): "wood" | "stone" | undefined {
    return this.def.produces;
  }
  /** Seconds since the last hit; the demolition rule reads this. */
  get secondsSinceDamaged(): number {
    return this.sinceDamaged;
  }
  get isDemolishing(): boolean {
    return this.demolishing;
  }
  get demolishFraction(): number {
    return this.demolishProgress;
  }
  /** True once a combat kill's collapse animation has actually finished — the
   * earliest moment it is honest to free the slot and remove the wreckage. */
  get readyForRemoval(): boolean {
    return !this._alive && (!this.collapsing || this.collapseProgress >= 1);
  }

  /** Engineer repair. Only ever raises health, and never past the cap. */
  repair(amount: number): void {
    if (!this._alive || this.demolishing || this.health >= this.maxHealth) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.health >= this.maxHealth) this.visual.setPhase("completed");
  }

  /** Empties the production buffer and returns what was inside. */
  takeBuffer(): number {
    const value = Math.floor(this.buffer);
    this.buffer -= value;
    return value;
  }

  applyDamage(amount: number, _fromX: number, _fromZ: number): void {
    if (!this._alive || !this.def.canBeAttacked || this.demolishing) return;
    this.health -= amount;
    this.sinceDamaged = 0;
    if (this.health <= 0) {
      this.health = 0;
      this._alive = false;
      this.collapsing = true;
      this.visual.setPhase("destroyed");
    } else if (this.health < this.maxHealth) {
      this.visual.setPhase("damaged");
    }
  }

  /** Begins the take-apart animation. Production and combat stop immediately. */
  beginDemolish(): void {
    if (this.demolishing) return;
    this.demolishing = true;
    this.demolishProgress = 0;
    this.buffer = 0;
    this.visual.setPhase("demolishing");
  }

  /**
   * Advances construction, production and — for towers — combat.
   * `productionRate` folds in the endless-mode production upgrade.
   */
  update(dt: number, ctx: CombatContext, productionRate: number, autoCollect: boolean, buildSpeedBonus = 0): void {
    if (!this._alive) {
      // Reuses the same take-apart animation the player's own demolish order
      // plays — a combat kill just collapses on a slightly different cue
      // (from the moment health hit zero, not from a menu confirmation).
      if (this.collapsing) this.collapseProgress = this.visual.playDemolish(dt, DEMOLISH_DURATION);
      return;
    }
    this.sinceDamaged += dt;

    if (this.demolishing) {
      this.demolishProgress = this.visual.playDemolish(dt, DEMOLISH_DURATION);
      return;
    }

    if (!this.visual.isFinished) {
      this.buildProgressValue += (dt * (1 + buildSpeedBonus)) / Math.max(0.2, this.def.buildTime);
      this.visual.animator.unlockStages(
        Math.floor(this.buildProgressValue * this.visual.animator.stageCount + 0.0001),
      );
      this.visual.update(dt);
      return;
    }
    this.visual.update(dt);

    if (this.def.produces && this.def.produceInterval) {
      this.produceTimer += dt * productionRate;
      while (this.produceTimer >= this.def.produceInterval) {
        this.produceTimer -= this.def.produceInterval;
        const cap = autoCollect ? Infinity : (this.def.bufferCap ?? 100);
        if (this.buffer < cap) this.buffer += 1;
      }
    }

    if (this.def.attackKind) {
      tickBuildingCombat(this, dt, ctx);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0 && fireBuilding(this, ctx)) {
        this.attackTimer = this.def.attackInterval ?? 1.5;
      }
    }
  }

  /** Reports whether every part that should be on screen actually is. */
  inspectVisual(): VisualIntegrity {
    return this.visual.inspect();
  }

  /** Re-syncs, and rebuilds the geometry outright if a part has been lost. */
  revalidateVisual(): boolean {
    if (!this.isComplete || this.demolishing || !this._alive) return true;
    const before = this.visual.inspect();
    if (before.ok) return true;
    if (before.disposed > 0 || before.materialsLost > 0) this.visual.repair();
    else this.visual.syncCompleted();
    return this.visual.inspect().ok;
  }

  dispose(): void {
    this.visual.dispose();
  }
}
