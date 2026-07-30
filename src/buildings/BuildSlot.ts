import type { BuildSlotCategory, BuildingType } from "../data/BuildingDefinitions";
import type { BuildSlotDefinition, SlotRole, WallSide } from "../data/BuildSlotDefinitions";
import type { Building } from "./Building";

/**
 * A fixed plot. It remembers what it has hosted this run, which is what the
 * auto-rebuilder consults: a slot that never held anything is never rebuilt,
 * and a slot rebuilds whatever was standing on it most recently.
 */
export class BuildSlot {
  readonly id: string;
  readonly category: BuildSlotCategory;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly ringIndex: number;
  /** Purely descriptive positional role — every slot still accepts every
   * building. Drives `name`, the player-facing label. */
  readonly role: SlotRole;
  readonly lanes: WallSide[];
  /** What the player actually sees on selection — never `id`. */
  readonly name: string;

  building: Building | null = null;
  /** The type that was last *completed* here, whether or not it still stands. */
  lastCompletedType: BuildingType | null = null;
  /** True once any building has ever finished on this slot during this run. */
  everBuilt = false;

  constructor(def: BuildSlotDefinition) {
    this.id = def.id;
    this.category = def.category;
    this.x = def.x;
    this.z = def.z;
    this.yaw = def.yaw;
    this.ringIndex = def.ringIndex;
    this.role = def.role;
    this.lanes = def.lanes;
    this.name = def.name;
  }

  get occupied(): boolean {
    return this.building !== null && this.building.alive;
  }

  get occupiedType(): BuildingType | null {
    return this.building && this.building.alive ? this.building.type : null;
  }

  /** Everything that has ever been finished here, oldest first. Stats only. */
  readonly history: BuildingType[] = [];

  /** Called when a building finishes assembling here. */
  markCompleted(type: BuildingType): void {
    this.everBuilt = true;
    this.lastCompletedType = type;
    this.history.push(type);
  }

  /**
   * Forgets what this plot used to hold, without touching the record kept for
   * statistics. Used after a manual demolition so nothing the player chose to
   * remove can come back through the auto-rebuilder.
   */
  clearHistory(): void {
    this.lastCompletedType = null;
    this.everBuilt = false;
  }

  reset(): void {
    this.building?.dispose();
    this.building = null;
    this.lastCompletedType = null;
    this.everBuilt = false;
    this.history.length = 0;
  }
}
