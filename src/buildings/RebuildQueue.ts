import type { ResourceCost } from "../data/CombatTypes";
import type { BuildingType } from "../data/BuildingDefinitions";

export interface RebuildQueueItem {
  slotId: string;
  buildingType: BuildingType;
  destroyedAt: number;
  rebuildCost: ResourceCost;
}

/**
 * Strict FIFO by destruction time. The head of the queue is never skipped: if
 * the resources are short the whole queue waits, so an expensive first entry
 * cannot be jumped by a cheap later one.
 */
export class RebuildQueue {
  private items: RebuildQueueItem[] = [];

  get length(): number {
    return this.items.length;
  }

  get head(): RebuildQueueItem | null {
    return this.items.length > 0 ? this.items[0] : null;
  }

  get all(): ReadonlyArray<RebuildQueueItem> {
    return this.items;
  }

  /**
   * Records a destruction. A slot only ever holds one pending entry — if it is
   * flattened twice the newer type wins, but it keeps its original place in the
   * queue so it does not lose its turn.
   */
  push(item: RebuildQueueItem): void {
    const existing = this.items.findIndex((i) => i.slotId === item.slotId);
    if (existing >= 0) {
      const kept = this.items[existing];
      kept.buildingType = item.buildingType;
      kept.rebuildCost = item.rebuildCost;
      return;
    }
    this.items.push(item);
    this.items.sort((a, b) => a.destroyedAt - b.destroyedAt);
  }

  /** Drops a slot's pending entry, e.g. after the player rebuilt it by hand. */
  remove(slotId: string): void {
    this.items = this.items.filter((i) => i.slotId !== slotId);
  }

  shift(): RebuildQueueItem | null {
    return this.items.shift() ?? null;
  }

  clear(): void {
    this.items.length = 0;
  }
}
