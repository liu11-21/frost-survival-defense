import type { Vector3 } from "@babylonjs/core";
import { WAREHOUSE_LOSS } from "../data/BuildingDefinitions";
import type { ResourceKind } from "../data/EconomyConfig";
import type { PickupPool } from "../economy/PickupPool";
import type { ResourceStore } from "../economy/ResourceStore";
import type { GameEvents } from "../game/GameEvents";
import type { Building } from "./Building";
import type { BuildSlot } from "./BuildSlot";
import type { RebuildQueue } from "./RebuildQueue";

/**
 * Production collection, destruction handling and the ground-scatter that goes
 * with losing a warehouse. Split out so `BuildingManager` reads as the slot and
 * queue owner rather than a catch-all.
 */

/** Auto-collector drains continuously; otherwise the hero must walk over. */
export function collectProduction(
  slots: ReadonlyArray<BuildSlot>,
  store: ResourceStore,
  autoCollect: boolean,
  heroPos: Vector3,
): void {
  for (const slot of slots) {
    const b = slot.building;
    if (!b?.alive || !b.isComplete || !b.produces) continue;
    if (!autoCollect) {
      const dx = heroPos.x - slot.x;
      const dz = heroPos.z - slot.z;
      if (dx * dx + dz * dz > 12) continue;
    }
    const amount = b.takeBuffer();
    if (amount > 0) store.add(b.produces as ResourceKind, amount);
  }
}

export interface DestructionDeps {
  store: ResourceStore;
  pickups: PickupPool;
  events: GameEvents;
  queue: RebuildQueue;
  clock: number;
  detach(slot: BuildSlot): void;
}

/**
 * A building has been reduced to zero. Unlike a demolition this *is* a loss:
 * the warehouse penalty applies and the slot joins the rebuild queue in the
 * order it fell.
 */
export function handleDestroyed(slot: BuildSlot, building: Building, deps: DestructionDeps): boolean {
  const type = building.type;
  const def = building.def;
  deps.detach(slot);

  let warehouseFell = false;
  if (type === "warehouse") {
    scatter(deps.pickups, slot.x, slot.z, {
      wood: deps.store.loseFraction("wood", WAREHOUSE_LOSS.wood),
      stone: deps.store.loseFraction("stone", WAREHOUSE_LOSS.stone),
      gold: deps.store.loseFraction("gold", WAREHOUSE_LOSS.gold),
    });
    warehouseFell = true;
  }

  deps.events.emit("buildingDestroyed", { slotId: slot.id, type, x: slot.x, z: slot.z });
  building.dispose();
  slot.building = null;

  if (def.canBeRebuilt && slot.everBuilt) {
    deps.queue.push({
      slotId: slot.id,
      buildingType: slot.lastCompletedType ?? type,
      destroyedAt: deps.clock,
      rebuildCost: { ...def.cost },
    });
  }
  return warehouseFell;
}

/** Drops resources as chunky ground pickups the player can run back over. */
export function scatter(
  pickups: PickupPool,
  x: number,
  z: number,
  amounts: Record<ResourceKind, number>,
): void {
  for (const kind of ["wood", "stone", "gold"] as ResourceKind[]) {
    let remaining = Math.floor(amounts[kind]);
    if (remaining <= 0) continue;
    const per = Math.max(1, Math.ceil(remaining / 10));
    while (remaining > 0) {
      const take = Math.min(per, remaining);
      pickups.spawn(kind, x, z, take, WAREHOUSE_LOSS.pickupLifetime);
      remaining -= take;
    }
  }
}
