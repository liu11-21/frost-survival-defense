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
import { LANES, laneAdvancePoint, nearestPointOnLane } from "../data/BuildSlotDefinitions";
import { isCrossLaneUnitTarget } from "../combat/UnitTargeting";

const MAX_EVENTS = 20;

/**
 * Explicit friendly state machine.  G1 adds a lane invariant on top of the
 * existing anti-stall rules: ordinary squads chase on their assigned road,
 * melee never receives a cross-lane target, and ranged cross-lane fallback
 * shots are followed by progress on the squad's own lane rather than sideways
 * pursuit.
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

  get state(): AllyState { return this._state; }
  get currentTarget(): Damageable | null { return this.target; }
  get timeInState(): number { return this.stateTime; }
  get stuckInfo(): StuckDetector { return this.stuck; }
  get recentEvents(): ReadonlyArray<AIEvent> { return this.events; }
  get sinceLastAction(): number { return this.clock - this.heartbeat.lastMeaningfulActionAt; }
  get aiHeartbeat(): AIHeartbeatSnapshot { return this.heartbeat.snapshot(); }

  private get isHealer(): boolean { return this.unit.def.attackType === "heal"; }
  private get isEngineer(): boolean { return this.unit.def.canRepair === true; }
  private get isSupporter(): boolean { return this.unit.def.attackType === "none" && !this.isEngineer; }
  private get isRanged(): boolean {
    const t = this.unit.def.attackType;
    return t === "rangedSingle" || t === "rangedArea";
  }

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
      setRetarget: (seconds) => { this.retargetTimer = seconds; },
      markActive: () => { this.heartbeat.markMeaningfulAction(this.clock); },
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
    if (to !== "attackWindup" && to !== "healWindup" && to !== "repairWindup") this.pendingToken = -1;
  }

  private get replanState(): AllyState {
    if (this.isHealer) return "acquireHealTarget";
    if (this.isEngineer) return "acquireRepairTarget";
    if (this.isSupporter) return "followFormation";
    return "acquireTarget";
  }

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

    if (this.target && validateTarget(this.unit, this.target) !== "ok") {
      this.target = null;
      this.unit.setTarget(null);
      if (this.isCombatState()) this.transition(this.replanState, "targetInvalid");
    }

    // A ranged cross-lane target is only a fallback. Re-query on the normal
    // timer so a newly arrived same-lane enemy immediately takes precedence.
    if (
      this.target &&
      isCrossLaneUnitTarget(this.unit, this.target) &&
      this.retargetTimer <= 0 &&
      !this.isHealer &&
      !this.isEngineer &&
      !this.isSupporter
    ) {
      const previous = this.target;
      const preferred = this.unit.findHostileTarget();
      this.retargetTimer = this.isRanged ? RETARGET_INTERVAL.ranged : RETARGET_INTERVAL.melee;
      if (preferred && !isCrossLaneUnitTarget(this.unit, preferred)) {
        this.target = preferred;
        this.stuck.reset(this.unit.position.x, this.unit.position.z, this.clock);
        if (this._state !== "attackWindup") this.transition("moveToTarget", "sameLanePreemptedFallback");
      } else {
        this.target = previous;
        this.unit.setTarget(previous);
      }
    }

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

  private dispatch(dt: number): void {
    switch (this._state) {
      case "spawn": this.transition(this.replanState, "spawned"); return;
      case "acquireTarget": return this.tickAcquire(dt);
      case "moveToTarget": return this.tickMoveToTarget(dt);
      case "attackWindup":
      case "healWindup":
      case "repairWindup": return tickWindup(this, dt);
      case "attackRecover":
      case "healRecover":
      case "repairRecover": return tickRecover(this, dt);
      case "acquireHealTarget": return tickAcquireHeal(this, dt);
      case "moveToHealRange": return tickMoveToHeal(this, dt);
      case "acquireRepairTarget": return tickAcquireRepair(this, dt);
      case "moveToRepairRange": return tickMoveToRepair(this, dt);
      case "followFormation":
      case "returnToFormation": return tickFormation(this, dt);
      case "holdPosition": return tickHold(this, dt);
      case "stuckRecovery": return this.tickStuckRecovery(dt);
      case "dead": return;
      default: this.transition("acquireTarget", "unhandledState"); return;
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
    const crossLaneFallback = isCrossLaneUnitTarget(this.unit, target);

    if (crossLaneFallback && dist > reach) {
      this.target = null;
      this.unit.setTarget(null);
      this.transition("acquireTarget", "crossLaneLeftRange");
      return;
    }

    if (dist <= reach) {
      this.unit.faceMotor(target.position.x, target.position.z, dt);
      this.stuck.markIdle(this.clock);
      this.heartbeat.markMeaningfulAction(this.clock);
      if (this.unit.canStartAttack()) {
        this.unit.brakeMotor(dt);
        this.beginAttack("attackWindup");
      } else if (crossLaneFallback) {
        // The previous shot is cooling down: advance on our own road rather
        // than parking to turret another lane or walking toward that target.
        const next = laneAdvancePoint(this.unit.laneIndex, this.unit.position.x, this.unit.position.z, "outbound");
        this.unit.moveMotor(next.x, next.z, dt, this.deps.formation);
        this.checkStuck(dt, "crossLaneAdvance");
      } else {
        this.unit.brakeMotor(dt);
      }
      return;
    }

    // Same-lane pursuit follows the road instead of cutting a chord across a
    // bend. Determine whether the target lies toward spawn or toward furnace.
    if (target.kind === "unit") {
      const lane = LANES[((this.unit.laneIndex % LANES.length) + LANES.length) % LANES.length];
      const here = nearestPointOnLane(this.unit.position.x, this.unit.position.z, lane);
      const there = nearestPointOnLane(target.position.x, target.position.z, lane);
      const direction = there.segmentIndex < here.segmentIndex ||
        (there.segmentIndex === here.segmentIndex && there.t < here.t)
        ? "outbound"
        : "inbound";
      const next = laneAdvancePoint(this.unit.laneIndex, this.unit.position.x, this.unit.position.z, direction);
      this.unit.moveMotor(next.x, next.z, dt, this.deps.formation);
      this.checkStuck(dt, "lanePursuit");
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

  onHitFrame(): boolean {
    if (this.pendingToken !== this.attackToken || this.pendingToken < 0) return false;
    this.pendingToken = -1;

    if (this._state === "repairWindup") {
      this.deps.releaseRepair?.(this.unit);
      this.heartbeat.markMeaningfulAction(this.clock);
      this.transition("repairRecover", "repairLanded");
      return false;
    }

    if (this.isHealer) {
      this.deps.releaseHeal?.(this.unit);
      this.heartbeat.markMeaningfulAction(this.clock);
      this.transition("healRecover", "healLanded");
      return false;
    }

    const target = this.target;
    if (!target || validateTarget(this.unit, target) !== "ok") return false;
    if (this.unit.distanceTo(target.position.x, target.position.z) > this.unit.attackReach(target) + 0.6) return false;
    this.heartbeat.markMeaningfulAction(this.clock);
    this.transition(this._state === "healWindup" ? "healRecover" : "attackRecover", "hitLanded");
    return true;
  }

  // ------------------------------------------------------------- stuck -----

  private checkStuck(dt: number, from: AllyState): void {
    if (this.unit.movementSpeed > 0.2) {
      this.heartbeat.markMovement(this.clock);
      this.heartbeat.markMeaningfulAction(this.clock);
    }
    if (!this.stuck.sample(dt, this.unit.position.x, this.unit.position.z, this.clock)) return;
    this.sideStepSign = Math.random() < 0.5 ? -1 : 1;
    this.transition("stuckRecovery", `stuckIn:${from}`);
  }

  private tickStuckRecovery(dt: number): void {
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
