import type { BuildingType } from "../data/BuildingDefinitions";
import type { BuildSlot } from "./BuildSlot";

export interface VisualReportRow {
  slotId: string;
  type: BuildingType;
  required: number;
  enabled: number;
  disposed: number;
  materialsLost: number;
  ok: boolean;
}

/**
 * One row per finished building: how many parts it should be showing against
 * how many it actually is. The automated completeness test reads this, and it
 * is the evidence behind the "100% intact" claim rather than a spot check.
 */
export function buildVisualReport(slots: ReadonlyArray<BuildSlot>): VisualReportRow[] {
  const out: VisualReportRow[] = [];
  for (const slot of slots) {
    const b = slot.building;
    if (!b?.alive || !b.isComplete || b.isDemolishing) continue;
    out.push({ slotId: slot.id, type: b.type, ...b.inspectVisual() });
  }
  return out;
}

/**
 * Re-syncs every finished building and rebuilds the geometry of any that has
 * actually lost a part. Returns how many needed intervention — a number that
 * should stay at zero now the shared-material lifetime is correct.
 */
export function revalidateAll(slots: ReadonlyArray<BuildSlot>): number {
  let repaired = 0;
  for (const slot of slots) {
    const b = slot.building;
    if (!b?.alive || !b.isComplete || b.isDemolishing) continue;
    if (b.inspectVisual().ok) continue;
    b.revalidateVisual();
    repaired++;
  }
  return repaired;
}
