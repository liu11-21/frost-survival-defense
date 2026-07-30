import { BUILDING_BY_ID, type BuildingType } from "../data/BuildingDefinitions";
import type { ResourceCost } from "../data/CombatTypes";
import type { Building } from "./Building";

/** Fraction of the original cost returned when the player takes a building down. */
export const DEMOLISH_REFUND = {
  wood: 0.5,
  stone: 0.5,
  gold: 0,
  /** A building hit within this many seconds cannot be demolished. */
  combatLockout: 3,
  /** Seconds the overflow dropped by a demolished warehouse stays on the ground. */
  overflowLifetime: 20,
};

export interface DemolishCheck {
  ok: boolean;
  /** Player-facing reason, already phrased for a dialog. */
  reason?: string;
  refund: ResourceCost;
}

/** Whole units only, always rounded down. */
export function demolishRefund(type: BuildingType): ResourceCost {
  const def = BUILDING_BY_ID.get(type);
  if (!def) return {};
  const cost = def.cost;
  const refund: ResourceCost = {};
  if (cost.wood) refund.wood = Math.floor(cost.wood * DEMOLISH_REFUND.wood);
  if (cost.stone) refund.stone = Math.floor(cost.stone * DEMOLISH_REFUND.stone);
  if (cost.gold) refund.gold = Math.floor(cost.gold * DEMOLISH_REFUND.gold);
  return refund;
}

export interface DemolishContext {
  /** True while the auto-rebuilder is mid-job; it must not be pulled out then. */
  rebuildInProgress: boolean;
}

/**
 * The full rule set, in one place so the button, the confirm dialog and the
 * actual call can never disagree about whether a demolition is legal.
 */
export function canDemolish(building: Building | null, ctx: DemolishContext): DemolishCheck {
  if (!building || !building.alive) {
    return { ok: false, reason: "此點位沒有可拆除的設施", refund: {} };
  }
  const refund = demolishRefund(building.type);
  if (!building.def.canBeDemolished) {
    return { ok: false, reason: "此設施為核心設施，不可拆除", refund };
  }
  if (building.isDemolishing) {
    return { ok: false, reason: "此設施正在拆除中", refund };
  }
  if (!building.isComplete) {
    return { ok: false, reason: "設施尚未建造完成，無法拆除", refund };
  }
  if (building.secondsSinceDamaged < DEMOLISH_REFUND.combatLockout) {
    const wait = (DEMOLISH_REFUND.combatLockout - building.secondsSinceDamaged).toFixed(1);
    return { ok: false, reason: `設施最近受到攻擊，${wait} 秒後才能拆除`, refund };
  }
  if (building.type === "autoRebuilder" && ctx.rebuildInProgress) {
    return { ok: false, reason: "自動重建站正在工作中，完成後才能拆除", refund };
  }
  return { ok: true, refund };
}
