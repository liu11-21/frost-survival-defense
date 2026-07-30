import { updateBomber } from "./BomberLogic";
import { computeAuraBonus } from "./CommanderAura";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";
import { castFreezeZone } from "./FreezeZoneAbility";

const AURA_CHECK_INTERVAL = 0.5;

/**
 * The three v5 personal-cooldown abilities that run independently of the
 * FSM/enemy-brain state a unit is in — Ice Bomber's countdown, Commander's
 * aura broadcast, and Frost Sorcerer's periodic Freeze Zone. Pulled out of
 * `CombatUnit` so that file stays about the unit itself.
 */
export class CombatUnitAbilities {
  private auraCheckTimer = Math.random() * AURA_CHECK_INTERVAL;
  private freezeZoneTimer = -1;
  auraMoveBonus = 0;
  auraAttackBonus = 0;

  constructor(
    private readonly unit: CombatUnit,
    private readonly ctx: CombatContext,
  ) {}

  /** Enemy-only: bomber countdown and the aura broadcast (only enemies buff enemies). */
  tickEnemy(dt: number): void {
    if (this.unit.def.selfDestruct) updateBomber(this.unit, dt, this.ctx);

    this.auraCheckTimer -= dt;
    if (this.auraCheckTimer <= 0) {
      this.auraCheckTimer = AURA_CHECK_INTERVAL;
      const bonus = computeAuraBonus(this.unit, this.ctx);
      this.auraMoveBonus = bonus.move;
      this.auraAttackBonus = bonus.attack;
      // The source itself, not everyone it buffs — a visible "the aura is
      // live" cue on the Commander, on the same cadence the buff refreshes.
      if (this.unit.def.aura) {
        this.ctx.vfx.burstAt("auraPulse", this.unit.position.x, this.unit.position.z, 16);
      }
    }
  }

  /** Any faction: Frost Sorcerer's periodic Freeze Zone. */
  tickFreezeZone(dt: number): void {
    const cfg = this.unit.def.freezeZone;
    if (!cfg) return;
    if (this.freezeZoneTimer < 0) this.freezeZoneTimer = cfg.interval;
    this.freezeZoneTimer -= dt;
    if (this.freezeZoneTimer > 0) return;
    this.freezeZoneTimer = cfg.interval;
    castFreezeZone(this.unit, this.ctx, cfg);
  }
}
