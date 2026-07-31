import { Scene, Vector3 } from "@babylonjs/core";
import type { CombatContext } from "../combat/CombatContext";
import type { CombatWorld } from "../combat/CombatWorld";
import {
  AUTO_REBUILD,
  BUILDING_BY_ID,
  wallRebuildFactor,
  type BuildingType,
} from "../data/BuildingDefinitions";
import { BUILD_SLOTS, WALL_SIDE_BY_SLOT } from "../data/BuildSlotDefinitions";
import type { ResourceStore } from "../economy/ResourceStore";
import type { PickupPool } from "../economy/PickupPool";
import type { GameEvents } from "../game/GameEvents";
import { MaterialFactory } from "../scene/MaterialFactory";
import type { CollisionWorld, Obstacle } from "../util/Collision";
import { registerWallObstacles } from "./WallObstacles";
import { Building } from "./Building";
import { BuildSlot } from "./BuildSlot";
import { collectProduction, handleDestroyed, scatter } from "./BuildingUpkeep";
import { canDemolish, type DemolishCheck } from "./Demolition";
import { completeDemolition } from "./DemolitionRunner";
import { buildVisualReport, revalidateAll, type VisualReportRow } from "./VisualReport";
import { RebuildQueue } from "./RebuildQueue";

export interface BuildResult {
  ok: boolean;
  reason?: string;
}

/** Owns every slot, every standing building, and the auto-rebuild queue. */
export class BuildingManager {
  readonly slots: BuildSlot[] = [];
  readonly rebuildQueue = new RebuildQueue();
  autoRebuildEnabled = true;

  /** A wall slot registers three obstacles (two half-segments plus the ally-only gate gap); every other slot registers exactly one. */
  private readonly obstacles = new Map<string, Obstacle[]>();
  private rebuildCooldown = 0;
  private lastWarehouseLoss: { x: number; z: number } | null = null;
  /** Wall rebuilds per slot within the current wave; cleared each wave. */
  private readonly wallRebuildsThisWave = new Map<string, number>();
  private clock = 0;
  private collectTimer = 0;
  private validationTimer = 30;
  private attackSpeedBuffRemaining = 0;
  private attackSpeedBuffMultiplier = 1;
  /** Counts how many times the safety net had to step in; the tests read it. */
  visualRepairs = 0;
  /**
   * Raised the frame a standing building takes damage, whatever hit it.
   * Buildings have no combat context of their own, so this is how their health
   * bar learns it should be on screen.
   */
  onStructureDamaged: ((building: Building) => void) | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly materials: MaterialFactory,
    private readonly events: GameEvents,
    private readonly store: ResourceStore,
    private readonly world: CombatWorld,
    private readonly pickups: PickupPool,
    private readonly collision: CollisionWorld,
  ) {
    for (const def of BUILD_SLOTS) this.slots.push(new BuildSlot(def));
  }

  slot(id: string): BuildSlot | undefined {
    return this.slots.find((s) => s.id === id);
  }

  countOf(type: BuildingType): number {
    let n = 0;
    for (const s of this.slots) if (s.building?.alive && s.building.type === type) n++;
    return n;
  }

  hasComplete(type: BuildingType): boolean {
    for (const s of this.slots) {
      if (s.building?.alive && s.building.type === type && s.building.isComplete) return true;
    }
    return false;
  }

  get hasRecruitHall(): boolean { return this.hasComplete("recruitHall"); }
  get hasAutoCollector(): boolean { return this.hasComplete("autoCollector"); }
  get hasAutoRebuilder(): boolean { return this.hasComplete("autoRebuilder"); }
  /** Completed attack emplacements currently able to benefit from Skill 2. */
  get activeAttackBuildingCount(): number {
    let count = 0;
    for (const slot of this.slots) {
      const building = slot.building;
      if (building?.alive && building.isComplete && building.def.attackKind) count++;
    }
    return count;
  }
  get rebuildCooldownRemaining(): number { return Math.max(0, this.rebuildCooldown); }
  get attackSpeedBoostRemaining(): number { return Math.max(0, this.attackSpeedBuffRemaining); }
  get attackSpeedMultiplier(): number {
    return this.attackSpeedBuffRemaining > 0 ? this.attackSpeedBuffMultiplier : 1;
  }

  activateAttackSpeedBoost(seconds: number, multiplier: number): void {
    this.attackSpeedBuffRemaining = Math.max(this.attackSpeedBuffRemaining, Math.max(0, seconds));
    this.attackSpeedBuffMultiplier = Math.max(this.attackSpeedBuffMultiplier, Math.max(1, multiplier));
  }

  /** Wall slots with nothing standing on them — the gaps enemies aim for. */
  openWallSlots(): BuildSlot[] {
    return this.slots.filter((s) => s.category === "wall" && !s.occupied);
  }

  canBuild(slotId: string, type: BuildingType): BuildResult {
    const slot = this.slot(slotId);
    const def = BUILDING_BY_ID.get(type);
    if (!slot || !def) return { ok: false, reason: "無效的建築" };
    if (slot.category !== def.slotCategory) return { ok: false, reason: "此槽位不可建造該設施" };
    if (slot.occupied) return { ok: false, reason: "槽位已有建築" };
    if (!this.store.canAfford(def.cost)) return { ok: false, reason: `${this.store.shortfall(def.cost)}不足` };
    return { ok: true };
  }

  build(slotId: string, type: BuildingType, healthMultiplier = 1): BuildResult {
    const check = this.canBuild(slotId, type);
    if (!check.ok) return check;
    const slot = this.slot(slotId);
    const def = BUILDING_BY_ID.get(type);
    if (!slot || !def) return { ok: false, reason: "無效的建築" };
    if (!this.store.spend(def.cost)) return { ok: false, reason: "資源不足" };
    let health = healthMultiplier;
    if (type === "wall") {
      const count = this.wallRebuildsThisWave.get(slot.id) ?? 0;
      health *= wallRebuildFactor(count);
      this.wallRebuildsThisWave.set(slot.id, count + 1);
    }
    this.place(slot, type, health);
    this.rebuildQueue.remove(slotId);
    this.events.emit("buildingPlaced", { slotId, type });
    return { ok: true };
  }

  private place(slot: BuildSlot, type: BuildingType, healthMultiplier: number): Building {
    if (slot.building) {
      this.detach(slot);
      slot.building.dispose();
    }
    const building = new Building(this.scene, this.materials, this.events, type, slot, healthMultiplier);
    slot.building = building;
    if (building.def.canBeAttacked) {
      this.world.structures.push(building);
      if (type === "wall") this.world.walls.push(building);
    }

    const wallSide = type === "wall" ? WALL_SIDE_BY_SLOT.get(slot.id) : undefined;
    const registered: Obstacle[] = wallSide
      ? registerWallObstacles(this.collision, wallSide)
      : [this.collision.add(slot.x, slot.z, building.def.radius, building.blockerBox ?? undefined)];
    this.obstacles.set(slot.id, registered);
    return building;
  }

  private detach(slot: BuildSlot): void {
    const b = slot.building;
    if (!b) return;
    removeFrom(this.world.structures, b);
    removeFrom(this.world.walls, b);
    const list = this.obstacles.get(slot.id);
    if (list) {
      for (const o of list) this.collision.remove(o);
      this.obstacles.delete(slot.id);
    }
  }

  /**
   * A fresh wave clears the wall decay, so repeated rebuilding is only punished
   * inside the wave it happened in.
   */
  onWaveBoundary(): void {
    this.wallRebuildsThisWave.clear();
  }

  /** How many times this wall slot has been rebuilt during the current wave. */
  wallRebuildCount(slotId: string): number {
    return this.wallRebuildsThisWave.get(slotId) ?? 0;
  }

  update(dt: number, ctx: CombatContext, heroPos: Vector3, productionRate: number, furnaceLevel = 1): void {
    this.clock += dt;
    if (this.rebuildCooldown > 0) this.rebuildCooldown -= dt;
    if (this.attackSpeedBuffRemaining > 0) {
      this.attackSpeedBuffRemaining -= dt;
      if (this.attackSpeedBuffRemaining <= 0) {
        this.attackSpeedBuffRemaining = 0;
        this.attackSpeedBuffMultiplier = 1;
      }
    }

    const autoCollect = this.hasAutoCollector;
    let warehouses = 0;
    let completedThisFrame: BuildSlot | null = null;

    for (const slot of this.slots) {
      const b = slot.building;
      if (!b) continue;

      if (!b.alive) {
        // Ticks the collapse animation a combat kill just started; the slot
        // is not actually freed (and the model not actually removed) until
        // that animation has finished playing — never the same frame health
        // hit zero.
        b.update(dt, ctx, productionRate, autoCollect, 0, furnaceLevel, this.attackSpeedMultiplier);
        if (!b.readyForRemoval) {
          // Mirrors the demolish path just below: a warehouse still holds the
          // cap open for as long as its collapse animation is playing. Drop
          // the count any earlier and `setWarehouseCount` trims the overage
          // before `handleDestroyed` has set `lastWarehouseLoss`, so that
          // overage is silently lost instead of scattered as pickups.
          if (b.type === "warehouse" && b.isComplete) warehouses++;
          continue;
        }
        if (
          handleDestroyed(slot, b, {
            store: this.store,
            pickups: this.pickups,
            events: this.events,
            queue: this.rebuildQueue,
            clock: this.clock,
            detach: (target) => this.detach(target),
          })
        ) {
          // The cap drops back to 100 once the last warehouse falls; whatever
          // the cap trims is scattered too, so nothing disappears untraceably.
          this.lastWarehouseLoss = { x: slot.x, z: slot.z };
        }
        continue;
      }

      const wasComplete = b.isComplete;
      b.update(dt, ctx, productionRate, autoCollect, 0, furnaceLevel, this.attackSpeedMultiplier);
      if (b.def.canBeAttacked && b.secondsSinceDamaged <= dt * 1.5) this.onStructureDamaged?.(b);
      if (b.isDemolishing) {
        // A warehouse still holds the cap open until it is actually gone, so the
        // overflow is trimmed on the same frame it is scattered rather than
        // silently vanishing when the animation starts.
        if (b.demolishFraction < 1) {
          if (b.type === "warehouse" && b.isComplete) warehouses++;
          continue;
        }
        this.finishDemolish(slot, b);
        continue;
      }
      if (!wasComplete && b.isComplete) {
        slot.markCompleted(b.type);
        b.revalidateVisual();
        completedThisFrame = slot;
      }
      if (b.type === "warehouse" && b.isComplete) warehouses++;
    }

    this.validationTimer -= dt;
    if (this.validationTimer <= 0) {
      this.validationTimer = 30;
      this.validateVisuals();
    }

    const trimmed = this.store.setWarehouseCount(warehouses);
    if (this.lastWarehouseLoss) {
      scatter(this.pickups, this.lastWarehouseLoss.x, this.lastWarehouseLoss.z, trimmed);
      this.lastWarehouseLoss = null;
    }
    if (completedThisFrame) {
      this.events.emit("buildingCompleted", {
        slotId: completedThisFrame.id,
        type: completedThisFrame.building?.type ?? "wall",
      });
    }

    this.collectTimer -= dt;
    if (this.collectTimer <= 0) {
      this.collectTimer = 0.2;
      collectProduction(this.slots, this.store, autoCollect, heroPos);
    }
    this.processRebuild();
  }

  /**
   * FIFO, strictly. The head is never skipped — if it cannot be afforded, the
   * whole queue waits rather than letting a cheaper entry jump ahead.
   */
  private processRebuild(): void {
    if (!this.autoRebuildEnabled || this.rebuildCooldown > 0) return;
    if (!this.hasAutoRebuilder) return;
    const head = this.rebuildQueue.head;
    if (!head) return;

    const slot = this.slot(head.slotId);
    if (!slot || slot.occupied) {
      this.rebuildQueue.shift();
      return;
    }
    if (!this.store.canAfford(head.rebuildCost)) return;
    if (!this.store.spend(head.rebuildCost)) return;

    this.rebuildQueue.shift();
    // A wall rebuilt again inside the same wave comes back weaker.
    let health = 1;
    if (head.buildingType === "wall") {
      const count = this.wallRebuildsThisWave.get(slot.id) ?? 0;
      health = wallRebuildFactor(count);
      this.wallRebuildsThisWave.set(slot.id, count + 1);
    }
    this.place(slot, head.buildingType, health);
    this.rebuildCooldown = AUTO_REBUILD.cooldown;
    this.events.emit("buildingRebuilt", { slotId: slot.id, type: head.buildingType });
  }

  // ---------------------------------------------------------- demolition ----

  /** The rule check, exposed so the panel can grey the button with a reason. */
  demolishCheck(slotId: string): DemolishCheck {
    const working = this.rebuildCooldown > 0 && this.rebuildQueue.length > 0;
    return canDemolish(this.slot(slotId)?.building ?? null, { rebuildInProgress: working });
  }

  /**
   * Starts taking a building apart. A manual demolition is deliberately *not*
   * a destruction: nothing enters the rebuild queue, and any pending rebuild
   * for this slot is dropped, so the auto-rebuilder can never resurrect
   * something the player chose to remove.
   */
  demolish(slotId: string): BuildResult {
    const check = this.demolishCheck(slotId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const slot = this.slot(slotId);
    const building = slot?.building;
    if (!slot || !building) return { ok: false, reason: "此點位沒有可拆除的設施" };

    building.beginDemolish();
    this.rebuildQueue.remove(slotId);
    this.events.emit("buildingDemolishStarted", { slotId, type: building.type });
    return { ok: true };
  }

  private finishDemolish(slot: BuildSlot, building: Building): void {
    completeDemolition(slot, building, this.store, this.events, {
      detach: (target) => this.detach(target),
      markWarehouseLoss: (x, z) => {
        this.lastWarehouseLoss = { x, z };
      },
    });
  }

  /**
   * Confirms that every finished building still has all of its parts on screen,
   * and rebuilds the geometry of any that does not. This is a safety net behind
   * the shared-material fix, not a replacement for it.
   */
  validateVisuals(): number {
    const repaired = revalidateAll(this.slots);
    this.visualRepairs += repaired;
    return repaired;
  }

  /** Per-building integrity, for the automated completeness test. */
  visualReport(): VisualReportRow[] {
    return buildVisualReport(this.slots);
  }

  resetAll(): void {
    for (const slot of this.slots) {
      this.detach(slot);
      slot.reset();
    }
    this.rebuildQueue.clear();
    this.wallRebuildsThisWave.clear();
    this.rebuildCooldown = 0;
    this.attackSpeedBuffRemaining = 0;
    this.attackSpeedBuffMultiplier = 1;
    this.clock = 0;
    this.autoRebuildEnabled = true;
  }
}

function removeFrom<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}
