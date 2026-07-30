import type { ResourceCost } from "../data/CombatTypes";
import type { ResourceStore } from "../economy/ResourceStore";
import type { GameEvents } from "../game/GameEvents";
import type { Building } from "./Building";
import type { BuildSlot } from "./BuildSlot";
import { demolishRefund } from "./Demolition";

export interface DemolitionHost {
  detach(slot: BuildSlot): void;
  markWarehouseLoss(x: number, z: number): void;
}

/**
 * Completes a demolition once its take-apart animation has played out.
 *
 * Kept apart from the manager because the interesting part is the *rules*: a
 * manual demolition is not a destruction, so it refunds, clears the plot's
 * build history, and — critically — never touches the auto-rebuild queue.
 */
export function completeDemolition(
  slot: BuildSlot,
  building: Building,
  store: ResourceStore,
  events: GameEvents,
  host: DemolitionHost,
): void {
  const type = building.type;
  const refund: ResourceCost = demolishRefund(type);

  host.detach(slot);
  building.dispose();
  slot.building = null;
  // Freeing the plot means forgetting what stood on it: the auto-rebuilder must
  // never resurrect something the player deliberately removed.
  slot.clearHistory();

  if (refund.wood) store.add("wood", refund.wood);
  if (refund.stone) store.add("stone", refund.stone);
  if (refund.gold) store.add("gold", refund.gold);

  if (type === "warehouse") {
    // Not an enemy kill: no loss penalty, but the cap does come back and the
    // overflow is dropped on the ground rather than deleted.
    host.markWarehouseLoss(slot.x, slot.z);
  }
  events.emit("buildingDemolished", { slotId: slot.id, type, refund });
}
