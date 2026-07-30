import type { CombatUnit } from "../combat/CombatUnit";
import type { CombatWorld } from "../combat/CombatWorld";

export interface ResidueRecord {
  unitId: number;
  squadId: number;
  unitType: string;
  deathAge: number;
  meshEnabled: boolean;
  poolState: "corpse" | "recycled";
}

/**
 * The safety net item 6.1 asks for, kept entirely separate from `AIWatchdog`
 * (which only ever looks at *living* allies): every 2s, sweep both `world`
 * arrays for anything `!alive` that has outlived `CORPSE_TIME`/`DEATH_HARD_LIMIT`
 * (2.9s / 4s — see `UnitDeath.ts`) by a wide margin and is *still* sitting in
 * `CombatWorld`. Under correct operation `CombatWorld.removeDead()` disposes a
 * corpse well before this fires; if it ever does fire, that is a genuine
 * defect this force-cleans and logs rather than leaving a model behind forever.
 */
const RESIDUE_SWEEP_INTERVAL = 2;
/** Comfortably past `DEATH_HARD_LIMIT` (4s) — never the routine cleanup path. */
const RESIDUE_AGE_THRESHOLD = 5;

export class DeathResidueGuard {
  private timer = 0;
  private readonly worst: ResidueRecord[] = [];
  private _forceCleaned = 0;

  constructor(private readonly world: CombatWorld) {}

  get report(): ReadonlyArray<ResidueRecord> {
    return this.worst;
  }
  get forceCleaned(): number {
    return this._forceCleaned;
  }

  reset(): void {
    this.worst.length = 0;
    this._forceCleaned = 0;
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = RESIDUE_SWEEP_INTERVAL;
    this.sweepNow();
  }

  /** The F7 panel's manual "force-clean death residue" button — the same
   * sweep the periodic timer runs, just on demand. */
  sweepNow(): void {
    this.sweep(this.world.allies);
    this.sweep(this.world.enemies);
  }

  private sweep(list: CombatUnit[]): void {
    for (const unit of list) {
      if (unit.alive || unit.corpseAge < RESIDUE_AGE_THRESHOLD) continue;
      this._forceCleaned++;
      if (this.worst.length < 20) {
        this.worst.push({
          unitId: unit.damageId,
          squadId: unit.squadId,
          unitType: unit.def.id,
          deathAge: Number(unit.corpseAge.toFixed(1)),
          meshEnabled: true,
          poolState: "corpse",
        });
      }
      // `readyToRemove` is already true well before this threshold, so the
      // ordinary `CombatWorld.removeDead()` pass would have disposed this on
      // its own — call the same disposal directly rather than waiting for it.
      unit.dispose();
    }
  }
}
