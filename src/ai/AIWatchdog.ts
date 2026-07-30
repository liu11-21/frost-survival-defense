import type { CombatUnit } from "../combat/CombatUnit";
import type { SquadManager } from "../combat/SquadManager";
import type { CombatWorld } from "../combat/CombatWorld";
import { WATCHDOG } from "./AIConfig";

export interface StallRecord {
  unitId: number;
  defId: string;
  state: string;
  target: string;
  idleFor: number;
  lastRecovery: string;
  events: string[];
}

/**
 * A low-frequency safety net.
 *
 * The state machine is what actually prevents stalls; this exists to catch
 * anything it misses, and — just as importantly — to *report* it, so a genuine
 * defect shows up in the test output instead of being silently papered over.
 */
export class AIWatchdog {
  private timer = 0;
  private registrationTimer = 0;
  private _recoveries = 0;
  private _stallsSeen = 0;
  private readonly worst: StallRecord[] = [];
  /** damageIds `CombatWorld` still counts alive but no squad's AI loop reaches. */
  private _unregistered: number[] = [];

  constructor(
    private readonly squads: SquadManager,
    private readonly world: CombatWorld,
  ) {}

  get recoveries(): number {
    return this._recoveries;
  }
  /** Units idle beyond the reporting threshold — the number that must be zero. */
  get stallsSeen(): number {
    return this._stallsSeen;
  }
  get report(): ReadonlyArray<StallRecord> {
    return this.worst;
  }
  /** Non-empty only if a living ally is somehow unreachable from every squad's
   * member list — the "未註冊AI" (unregistered AI) failure mode. Expected to
   * stay empty; every `CombatUnit` is constructed straight into a `Squad`, so
   * this is a regression guard, not a routinely-triggered condition. */
  get unregistered(): ReadonlyArray<number> {
    return this._unregistered;
  }

  reset(): void {
    this._recoveries = 0;
    this._stallsSeen = 0;
    this.worst.length = 0;
    this._unregistered = [];
  }

  update(dt: number): void {
    this.registrationTimer -= dt;
    if (this.registrationTimer <= 0) {
      this.registrationTimer = 2;
      this.checkRegistration();
    }

    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = WATCHDOG.interval;

    // Nothing to fight and nothing to heal is a legal reason to stand still.
    const workAvailable = this.world.livingEnemyCount > 0;

    this.squads.eachAlly((unit) => {
      const brain = unit.aiBrain;
      if (!brain) return;

      // Windups, recoveries and deliberate holds are legitimate pauses.
      if (isLegitimatePause(brain.state)) return;

      const idleFor = brain.sinceLastAction;
      if (idleFor < WATCHDOG.idleLimit) return;
      if (!workAvailable && brain.state === "followFormation") return;

      if (idleFor >= WATCHDOG.reportThreshold) {
        this._stallsSeen++;
        this.record(unit, idleFor);
      }

      this._recoveries++;
      brain.forceReacquire("watchdog");
    });
  }

  /** The F7 panel's manual "re-check registration" button. */
  checkRegistrationNow(): void {
    this.checkRegistration();
  }

  /**
   * Every 2s: does `living-ally-count` (from `CombatWorld`, the source combat
   * and targeting actually query) match `AI-update-list-count` (every squad's
   * own alive members, what `eachAlly` — and therefore every AI tick and the
   * watchdog sweep above — actually reaches)? They are two independently
   * populated collections; nothing but bookkeeping keeps them in sync.
   */
  private checkRegistration(): void {
    const reachedByAi = new Set<number>();
    this.squads.eachAlly((unit) => reachedByAi.add(unit.damageId));

    const missing: number[] = [];
    for (const unit of this.world.allies) {
      if (unit.alive && !reachedByAi.has(unit.damageId)) missing.push(unit.damageId);
    }
    this._unregistered = missing;
  }

  private record(unit: CombatUnit, idleFor: number): void {
    const brain = unit.aiBrain;
    if (!brain) return;
    if (this.worst.length >= 20) return;
    this.worst.push({
      unitId: unit.damageId,
      defId: unit.def.id,
      state: brain.state,
      target: unit.currentTarget ? unit.currentTarget.kind : "none",
      idleFor: Number(idleFor.toFixed(2)),
      lastRecovery: brain.stuckInfo.lastRecovery,
      events: brain.recentEvents.map((e) => `${e.at}s ${e.from}->${e.to} (${e.reason})`),
    });
  }
}

/** States where standing still is the correct behaviour, not a stall. */
function isLegitimatePause(state: string): boolean {
  return (
    state === "attackWindup" ||
    state === "attackRecover" ||
    state === "healWindup" ||
    state === "healRecover" ||
    state === "teleport" ||
    state === "dead" ||
    state === "spawn"
  );
}
