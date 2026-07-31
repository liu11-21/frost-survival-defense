import { Vector3 } from "@babylonjs/core";
import type { FormationSlotManager } from "../ai/FormationSlotManager";
import type { Faction, UnitDefinition } from "../data/CombatTypes";
import { MEDIC_RULES } from "../data/UnitDefinitions";
import type { Building } from "../buildings/Building";
import type { CombatContext } from "./CombatContext";
import type { CombatUnit } from "./CombatUnit";
import { furnaceAllyAttackMultiplier } from "../data/FurnaceUpgradeConfig";
import { ENGINEER_RULES } from "../data/EngineerConfig";

let nextSquadId = 1;

/**
 * Counts squad-wide heal events. Three medics in one squad must produce ONE
 * event per interval, never three; the smoke test asserts against this.
 */
export const healStats = { events: 0, healedUnits: 0 };

/** Same shape, for the engineer's repair event. */
export const repairStats = { events: 0 };

/**
 * A recruited or spawned group. Members fight as individuals; the squad only
 * owns shared identity, formation anchoring and the medic's group heal.
 */
export class Squad {
  readonly id = nextSquadId++;
  readonly members: CombatUnit[] = [];
  /** Guards the one-shot wipe notification so capacity is only freed once. */
  wipeReported = false;
  private healCooldown = MEDIC_RULES.interval * Math.random();
  private armedTarget: Squad | null = null;
  private armedRepairTarget: Building | null = null;
  private repairWaitTarget: Building | null = null;
  private repairWaitElapsed = 0;
  private repairWaiting = false;
  private readonly scratch = new Vector3();
  private readonly slot = new Vector3();

  constructor(
    readonly def: UnitDefinition,
    readonly faction: Faction,
    private furnaceLevelValue = 1,
  ) {}

  add(unit: CombatUnit): void {
    this.members.push(unit);
  }

  get aliveCount(): number {
    let n = 0;
    for (const m of this.members) if (m.alive) n++;
    return n;
  }

  /** A squad only leaves the roster once every member is down. */
  get alive(): boolean {
    return this.aliveCount > 0;
  }

  get isMedic(): boolean {
    return this.def.attackType === "heal";
  }

  get furnaceLevel(): number {
    return this.furnaceLevelValue;
  }

  setFurnaceLevel(level: number): void {
    this.furnaceLevelValue = Math.max(1, Math.floor(level));
    for (const member of this.members) member.setFurnaceLevel(this.furnaceLevelValue);
  }

  /** Total current health over total max health across living members. */
  healthPercent(): number {
    let cur = 0;
    let max = 0;
    for (const m of this.members) {
      if (!m.alive) continue;
      cur += m.health;
      max += m.maxHealth;
    }
    return max > 0 ? cur / max : 1;
  }

  get needsHealing(): boolean {
    for (const m of this.members) if (m.alive && m.health < m.maxHealth) return true;
    return false;
  }

  centre(out: Vector3): Vector3 {
    let n = 0;
    out.set(0, 0, 0);
    for (const m of this.members) {
      if (!m.alive) continue;
      out.x += m.position.x;
      out.z += m.position.z;
      n++;
    }
    if (n > 0) {
      out.x /= n;
      out.z /= n;
    }
    return out;
  }

  /**
   * Writes each living member's rally point. Ranged and support squads sit one
   * step further back so they are never pushed into the front line by a slot.
   */
  assignRally(anchor: Vector3, formation: FormationSlotManager): void {
    const backline = this.isMedic || this.def.attackRange >= 8 ? 1.6 : 0;
    const len = Math.hypot(anchor.x, anchor.z) || 1;
    const cx = anchor.x + (anchor.x / len) * backline;
    const cz = anchor.z + (anchor.z / len) * backline;

    let index = 0;
    for (const member of this.members) {
      if (!member.alive) continue;
      formation.memberSlot(index, Math.max(1, this.aliveCount), cx, cz, this.slot);
      const brain = member.aiBrain;
      if (brain) {
        brain.rally.copyFrom(this.slot);
        brain.hasRally = true;
      }
      index++;
    }
  }

  /**
   * Runs every member, living or not — a corpse still needs ticks to play its
   * death pose and sink into the snow. But once a corpse is fully expired
   * (`readyToRemove`), `CombatWorld.removeDead()` is about to dispose it and
   * hand its visual back to the template pool for reuse — this squad must let
   * go of it in that same frame, not keep ticking a reference that may belong
   * to a brand-new unit one frame later. Iterating backwards makes the splice
   * safe mid-loop.
   */
  update(dt: number): void {
    if (this.healCooldown > 0) this.healCooldown -= dt;
    if (this.repairWaiting && this.repairWaitTarget?.alive) this.repairWaitElapsed += dt;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const member = this.members[i];
      if (member.readyToRemove) {
        this.members.splice(i, 1);
        continue;
      }
      member.update(dt);
    }
  }

  /**
   * Drops expired corpse references without advancing combat or cooldowns.
   * The halted-frame cleanup uses this while result, upgrade and pause menus
   * have stopped the rest of the simulation.
   */
  pruneExpiredMembers(): void {
    for (let i = this.members.length - 1; i >= 0; i--) {
      if (this.members[i].readyToRemove) this.members.splice(i, 1);
    }
  }

  /** Average health of the living members, for the squad HUD's status word. */
  get averageHealthPercent(): number {
    return this.healthPercent();
  }

  /** True when this medic squad's shared heal timer has come round again. */
  canHealNow(): boolean {
    return this.isMedic && this.healCooldown <= 0 && this.armedTarget === null;
  }

  /**
   * Arms one squad-wide heal. It resolves on the healer's animation hit frame,
   * which is why the cooldown is taken here — the event is already committed.
   */
  armHeal(target: Squad, ctx: CombatContext): void {
    this.armedTarget = target;
    this.healCooldown = MEDIC_RULES.interval;
    void ctx;
  }

  /**
   * Applies the armed heal. Called once from the healer's hit frame; a second
   * call in the same cycle finds nothing armed and does nothing.
   */
  releaseHeal(ctx: CombatContext): boolean {
    const target = this.armedTarget;
    this.armedTarget = null;
    if (!target || !target.alive) return false;

    healStats.events += 1;
    for (const m of target.members) {
      if (!m.alive) continue;
      m.heal(MEDIC_RULES.healPerMember * furnaceAllyAttackMultiplier(this.furnaceLevelValue));
      healStats.healedUnits += 1;
    }
    target.centre(this.scratch);
    ctx.vfx.heal(this.scratch.x, this.scratch.z);
    ctx.vfx.sound("medicHeal", 0.5);
    return true;
  }

  /** Drops an armed heal whose window passed, so the medic never waits on it. */
  cancelArmedHeal(): void {
    this.armedTarget = null;
  }

  // ------------------------------------------------------------- repair ----

  get isEngineerSquad(): boolean {
    return this.def.canRepair === true;
  }

  get isGroundSupportSquad(): boolean {
    return this.def.temporaryGroundSupport === true;
  }

  /** Ground Support stays in a tight triangle immediately around the hero
   * instead of consuming a normal formation ring slot. */
  assignTightRally(anchor: Vector3, formation: FormationSlotManager): void {
    let index = 0;
    for (const member of this.members) {
      if (!member.alive) continue;
      formation.memberSlot(index, Math.max(1, this.aliveCount), anchor.x, anchor.z, this.slot);
      const dx = this.slot.x - anchor.x;
      const dz = this.slot.z - anchor.z;
      const len = Math.hypot(dx, dz) || 1;
      this.slot.x = anchor.x + (dx / len) * Math.min(1.6, len);
      this.slot.z = anchor.z + (dz / len) * Math.min(1.6, len);
      const brain = member.aiBrain;
      if (brain) {
        brain.rally.copyFrom(this.slot);
        brain.hasRally = true;
      }
      index++;
    }
  }

  /**
   * Begins the 3s/6s countdown on arrival, then arms exactly one 10% pulse.
   * Returning false means the Engineer is still visibly working and counting.
   */
  requestRepair(target: Building): boolean {
    if (!this.isEngineerSquad || this.armedRepairTarget !== null) return false;
    if (this.repairWaitTarget !== target) {
      this.repairWaitTarget = target;
      this.repairWaitElapsed = 0;
      this.repairWaiting = false;
    }
    if (!this.repairWaiting) {
      this.repairWaiting = true;
      this.repairWaitElapsed = 0;
      return false;
    }
    const underAttack = target.secondsSinceDamaged < ENGINEER_RULES.underAttackWindow;
    const required = underAttack
      ? ENGINEER_RULES.underAttackRepairInterval
      : ENGINEER_RULES.safeRepairInterval;
    if (this.repairWaitElapsed < required) return false;
    this.armedRepairTarget = target;
    this.repairWaiting = false;
    return true;
  }

  /** Applies one 10%-of-maximum-HP repair pulse. */
  releaseRepair(ctx: CombatContext): boolean {
    const target = this.armedRepairTarget;
    this.armedRepairTarget = null;
    this.repairWaitElapsed = 0;
    this.repairWaiting = true;
    if (!target || !target.alive) return false;

    const amount = target.maxHealth * ENGINEER_RULES.repairFraction;
    if (amount <= 0) return false;
    target.repair(amount);
    repairStats.events += 1;
    ctx.vfx.repair(target.position.x, target.position.z);
    ctx.vfx.sound("engineerRepair", 0.5);
    return true;
  }

  cancelArmedRepair(): void {
    this.armedRepairTarget = null;
  }

  get assignedRepairTarget(): Building | null {
    return this.repairWaitTarget;
  }

  reserveRepairTarget(target: Building): void {
    if (this.repairWaitTarget === target) return;
    this.repairWaitTarget = target;
    this.repairWaitElapsed = 0;
    this.repairWaiting = false;
  }

  clearRepairTarget(): void {
    this.armedRepairTarget = null;
    this.repairWaitTarget = null;
    this.repairWaitElapsed = 0;
    this.repairWaiting = false;
  }

  dispose(): void {
    for (const m of this.members) m.dispose();
    this.members.length = 0;
    this.armedTarget = null;
    this.armedRepairTarget = null;
    this.repairWaitTarget = null;
    this.repairWaiting = false;
  }
}
