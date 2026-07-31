import { Vector3 } from "@babylonjs/core";
import type { AIEvent, AllyState, BrainDeps } from "./BrainTypes";
export type { AIEvent, AllyState, BrainDeps } from "./BrainTypes";
import type { CombatUnit } from "../combat/CombatUnit";
import type { Damageable } from "../combat/Damageable";
import { RETARGET_INTERVAL, STATE_TIMEOUT } from "./AIConfig";
import { CombatMovement } from "./BrainCombatStates";
import { stepRecovery } from "./BrainRecovery";
import { tickAcquireHeal, tickFormation, tickHold, tickMoveToHeal } from "./BrainIdleStates";
import { tickAcquireRepair, tickMoveToRepair } from "./BrainRepairStates";
import type { BrainInternals } from "./BrainTypes";
import { tickRecover, tickWindup } from "./BrainAttackStates";
import { StuckDetector } from "./StuckDetector";
import { validateTarget } from "./TargetValidator";
import { AIHeartbeat, type AIHeartbeatSnapshot } from "./AIHeartbeat";

const MAX_EVENTS = 20;

/**
 * The explicit brain every friendly unit runs.
 *
 * Two rules make permanent stalls impossible by construction:
 *   1. Exactly one state is active, and every state has a hard timeout with a
 *      defined recovery — nothing can wait forever for an event that never came.
 *   2. Targets are re-validated every tick through the shared validator, so a
 *      pooled-and-reused corpse can never be held on to.
 */
export class FriendlyBrain {
  private _state: AllyState = "spawn";
  private stateTime = 0;
  private clock = 0;
  private retargetTimer = 0;
  private target: Damageable | null = null;
  private readonly movement = new CombatMovement();
  private readonly stuck = new StuckDetector();
  private readonly events: AIEvent[] = [];
  private attackToken = 0;
  private pendingToken = -1;
  private windupBudget = 0;
  private sideStepSign = 1;
  /** Rally point written by the squad each frame. */
  readonly rally = new Vector3();
  hasRally = false;
  private readonly heartbeat = new AIHeartbeat();

  constructor(
    private readonly unit: CombatUnit,
    private readonly deps: BrainDeps,
  ) {}

  get state(): AllyState {
    return this._state;
  }
  get currentTarget(): Damageable | null {
    return this.target;
  }
  get timeInState(): number {
    return this.stateTime;
  }
  get stuckInfo(): StuckDetector {
    return this.stuck;
  }
  get recentEvents(): ReadonlyArray<AIEvent> {
    return this.events;
  }
  get sinceLastAction(): number {
    return this.clock - this.heartbeat.lastMeaningfulActionAt;
  }
  get aiHeartbeat(): AIHeartbeatSnapshot {
    return this.heartbeat.snapshot();
  }

  private get isHealer(): boolean {
    return this.unit.def.attackType === "heal";
  }
  private get isEngineer(): boolean {
    return this.unit.def.canRepair === true;
  }
  private get isSupporter(): boolean {
    return this.unit.def.attackType === "none" && !this.isEngineer;
  }
  private get isRanged(): boolean {
    const t = this.unit.def.attackType;
    return t === "rangedSingle" || t === "rangedArea";
  }

  /** Narrow internal surface used by `BrainIdleStates`. */
  get internals(): BrainInternals {
    return {
      unit: this.unit,
      deps: this.deps,
      stuck: this.stuck,
      rally: this.rally,
      hasRally: this.hasRally,
      isHealer: this.isHealer,
      isEngineer: this.isEngineer,
      isSupporter: this.isSupporter,
      state: this._state,
      stateTime: this.stateTime,
      clock: this.clock,
      retargetReady: this.retargetTimer <= 0,
      setRetarget: (seconds) => {
        this.retargetTimer = seconds;
      },
      markActive: () => {
        this.heartbeat.markMeaningfulAction(this.clock);
      },
      setTarget: (t) => {
        this.target = t;
        this.unit.setTarget(t);
      },
      go: (to, reason) => this.transition(to, reason),
      startHeal: () => this.beginAttack("healWindup"),
      startRepair: () => this.beginAttack("repairWindup"),
      approach: (target, dt) => this.movement.approach(this.unit, target, false, this.deps.formation, dt),
      checkStuck: (d, from) => this.checkStuck(d, from),
      target: this.target,
      windupBudget: this.windupBudget,
      recoverReady: this.stateTime >= Math.min(STATE_TIMEOUT.attackRecover, this.unit.recoverTime),
      cancelSwing: () => {
        this.pendingToken = -1;
        this.unit.clearAnimationLock();
      },
    };
  }

  private transition(to: AllyState, reason: string): void {
    if (this._state === to) return;
    this.events.push({ at: Number(this.clock.toFixed(2)), from: this._state, to, reason });
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this._state = to;
    this.stateTime = 0;
    this.heartbeat.markStateChange(this.clock);
    // Leaving a swing invalidates its pending hit, so a late event cannot land.
    if (to !== "attackWindup" && to !== "healWindup" && to !== "repairWindup") this.pendingToken = -1;
  }

  /** The re-plan entry state, given this unit's role. */
  private get replanState(): AllyState {
    if (this.isHealer) return "acquireHealTarget";
    if (this.isEngineer) return "acquireRepairTarget";
    if (this.isSupporter) return "followFormation";
    return "acquireTarget";
  }

  /** Forced re-plan used by the watchdog and by wave transitions. */
  forceReacquire(reason: string): void {
    this.target = null;
    this.unit.setTarget(null);
    this.pendingToken = -1;
    this.unit.clearAnimationLock();
    this.retargetTimer = 0;
    this.stuck.reset(this.unit.position.x, this.unit.position.z, this.clock);
    this.transition(this.replanState, reason);
  }

  onDeath(): void {
    this.target = null;
    this.unit.setTarget(null);
    this.transition("dead", "died");
  }

  /** Called on wave boundaries so nothing survives holding last wave's state. */
  onWaveBoundary(): void {
    if (this._state === "dead") return;
    this.target = null;
    this.unit.setTarget(null);
    this.pendingToken = -1;
    this.unit.clearAnimationLock();
    this.transition(this.replanState, "waveBoundary");
  }

  update(dt: number): void {
    this.clock += dt;
    this.stateTime += dt;
    this.heartbeat.markUpdate(this.clock);

    if (!this.unit.alive) {
      if (this._state !== "dead") this.onDeath();
      return;
    }
    if (this.retargetTimer > 0) this.retargetTimer -= dt;

    // Any held target is re-validated before the state runs — this is the
    // single check that used to be scattered and inconsistent.
    if (this.target && validateTarget(this.unit, this.target) !== "ok") {
      this.target = null;
      this.unit.setTarget(null);
      if (this.isCombatState()) {
        this.transition(this.replanState, "targetInvalid");
      }
    }

    // A normal combat unit with living enemies must never spend a frame parked
    // in formation/hold with no target. This immediate safety net sits above
    // the slower state timers, so a kill or pooled-corpse cleanup cannot leave
    // the survivor visibly idle while another valid enemy is still present.
    if (
      !this.isHealer &&
      !this.isEngineer &&
      !this.isSupporter &&
      !this.target &&
      this._state !== "spawn" &&
      this._state !== "dead" &&
      this.deps.ctx.world.livingEnemyCount > 0
    ) {
      const found = this.unit.findHostileTarget();
      if (found) {
        this.target = found;
        this.retargetTimer = this.isRanged ? RETARGET_INTERVAL.ranged : RETARGET_INTERVAL.melee;
        this.heartbeat.markMeaningfulAction(this.clock);
        this.heartbeat.markTargetAcquired(this.clock);
        this.stuck.reset(this.unit.position.x, this.unit.position.z, this.clock);
        this.transition("moveToTarget", "autoLockSafety");
      }
    }

    this.dispatch(dt);
  }

  /** Runs exactly one state. Anything unrecognised falls back to re-planning. */
  private dispatch(dt: number): void {
    switch (this._state) {
      case "spawn":
        this.transition(this.replanState, "spawned");
        return;
      case "acquireTarget":
        return this.tickAcquire(dt);
      case "moveToTarget":
        return this.tickMoveToTarget(dt);
      case "attackWindup":
      case "healWindup":
      case "repairWindup":
        return tickWindup(this, dt);
      case "attackRecover":
      case "healRecover":
      case "repairRecover":
        return tickRecover(this, dt);
      case "acquireHealTarget":
        return tickAcquireHeal(this, dt);
      case "moveToHealRange":
        return tickMoveToHeal(this, dt);
      case "acquireRepairTarget":
        return tickAcquireRepair(this, dt);
      case "moveToRepairRange":
        return tickMoveToRepair(this, dt);
      case "followFormation":
      case "returnToFormation":
        return tickFormation(this, dt);
      case "holdPosition":
        return tickHold(this, dt);
      case "stuckRecovery":
        return this.tickStuckRecovery(dt);
      case "dead":
        return;
      default:
        this.transition("acquireTarget", "unhandledState");
        return;
    }
  }

  private isCombatState(): boolean {
    return (
      this._state === "moveToTarget" ||
      this._state === "attackWindup" ||
      this._state === "attackRecover" ||
      this._state === "moveToHealRange" ||
      this._state === "healWindup" ||
      this._state === "moveToRepairRange" ||
      this._state === "repairWindup"
    );
  }

  // ------------------------------------------------------------- combat ----

  private tickAcquire(dt: number): void {
    this.unit.brakeMotor(dt);
    this.stuck.markIdle(this.clock);

    if (this.retargetTimer <= 0) {
      this.retargetTimer = this.isRanged ? RETARGET_INTERVAL.ranged : RETARGET_INTERVAL.melee;
      const found = this.unit.findHostileTarget();
      if (found) {
        this.target = found;
        this.heartbeat.markMeaningfulAction(this.clock);
        this.heartbeat.markTargetAcquired(this.clock);
        this.stuck.reset(this.unit.position.x, this.unit.position.z, this.clock);
        this.transition("moveToTarget", "targetFound");
        return;
      }
      this.retargetTimer = RETARGET_INTERVAL.idle;
    }

    if (this.stateTime >= STATE_TIMEOUT.acquireTarget) {
      // Searching is an activity in its own right, not a stall.
      this.heartbeat.markMeaningfulAction(this.clock);
      this.transition(this.hasRally ? "followFormation" : "holdPosition", "noTargetTimeout");
    }
  }

  private tickMoveToTarget(dt: number): void {
    const target = this.target;
    if (!target) {
      this.transition("acquireTarget", "lostTarget");
      return;
    }

    const reach = this.unit.attackReach(target);
    const dist = this.unit.distanceTo(target.position.x, target.position.z);

    if (dist <= reach) {
      this.unit.brakeMotor(dt);
      this.unit.faceMotor(target.position.x, target.position.z, dt);
      this.stuck.markIdle(this.clock);
      // In range, waiting on the attack cooldown: a legitimate pause.
      this.heartbeat.markMeaningfulAction(this.clock);
      if (this.unit.canStartAttack()) this.beginAttack("attackWindup");
      return;
    }

    this.movement.approach(this.unit, target, this.isRanged, this.deps.formation, dt);
    this.checkStuck(dt, "moveToTarget");
  }

  private beginAttack(state: AllyState): void {
    this.attackToken += 1;
    this.pendingToken = this.attackToken;
    const isCast = state === "healWindup" || state === "repairWindup";
    const duration = this.unit.beginStrike(isCast ? "cast" : undefined);
    this.windupBudget = duration + (isCast ? STATE_TIMEOUT.healWindupSlack : STATE_TIMEOUT.attackWindupSlack);
    this.heartbeat.markMeaningfulAction(this.clock);
    this.transition(state, "strike");
  }

  /**
   * The hit frame reports back here. A stale token means the swing was already
   * abandoned, so the damage is dropped rather than applied late.
   */
  onHitFrame(): boolean {
    if (this.pendingToken !== this.attackToken || this.pendingToken < 0) return false;
    this.pendingToken = -1;

    if (this._state === "repairWindup") {
      this.deps.releaseRepair?.(this.unit);
      this.heartbeat.markMeaningfulAction(this.clock);
      this.transition("repairRecover", "repairLanded");
      // Repair heals the structure via the squad, not the attack resolver.
      return false;
    }

    if (this.isHealer) {
      this.deps.releaseHeal?.(this.unit);
      this.heartbeat.markMeaningfulAction(this.clock);
      this.transition("healRecover", "healLanded");
      // Healing is applied by the squad, not by the attack resolver.
      return false;
    }

    const target = this.target;
    if (!target || validateTarget(this.unit, target) !== "ok") return false;
    if (this.unit.distanceTo(target.position.x, target.position.z) > this.unit.attackReach(target) + 0.6) {
      return false;
    }
    this.heartbeat.markMeaningfulAction(this.clock);
    this.transition(this._state === "healWindup" ? "healRecover" : "attackRecover", "hitLanded");
    return true;
  }

  // ------------------------------------------------------------- stuck -----

  private checkStuck(dt: number, from: AllyState): void {
    // Covering ground is progress; without this a long walk reads as a stall.
    if (this.unit.movementSpeed > 0.2) {
      this.heartbeat.markMovement(this.clock);
      this.heartbeat.markMeaningfulAction(this.clock);
    }
    if (!this.stuck.sample(dt, this.unit.position.x, this.unit.position.z, this.clock)) return;
    this.sideStepSign = Math.random() < 0.5 ? -1 : 1;
    this.transition("stuckRecovery", `stuckIn:${from}`);
  }

  /**
   * Escalating recovery, delegated to `BrainRecovery`. The brain only decides
   * what the outcome means for its state.
   */
  private tickStuckRecovery(dt: number): void {
    // Actively recovering counts as progress.
    this.heartbeat.markMeaningfulAction(this.clock);
    const outcome = stepRecovery(
      {
        unit: this.unit,
        target: this.target,
        formation: this.deps.formation,
        stuck: this.stuck,
        rally: this.hasRally ? this.rally : null,
        sideStepSign: this.sideStepSign,
        stateElapsed: this.stateTime,
      },
      dt,
    );

    switch (outcome) {
      case "returnToFormation":
        this.transition("returnToFormation", "stuckFallback");
        break;
      case "dropTarget":
        this.target = null;
        this.unit.setTarget(null);
        this.transition("acquireTarget", "stuckDroppedTarget");
        break;
      case "finished":
        this.stuck.reset(this.unit.position.x, this.unit.position.z, this.clock);
        this.transition(this.replanState, "recoveryDone");
        break;
      case "continue":
        break;
    }
  }

}
