import { endlessEarlyWaveReward } from "../data/EndlessEconomyConfig";
import type { ResourceStore } from "../economy/ResourceStore";
import type { WaveManager } from "../enemies/WaveManager";
import type { GameMode } from "../data/GameModeRules";
import type { GameEvents } from "../game/GameEvents";

/**
 * "立即下一波"'s endless-only gold payout, pulled out of `RunController`
 * purely to keep that file's own line count under the project's convention.
 * Guards against a double claim by remembering which upcoming wave number
 * was last paid for — wave numbers only ever increase, so that alone is
 * enough without a separate per-phase reset.
 */
export class EarlyWaveRewardTracker {
  private claimedForWave = -1;

  constructor(
    private readonly waves: WaveManager,
    private readonly store: ResourceStore,
    private readonly events: GameEvents,
  ) {}

  reset(): void {
    this.claimedForWave = -1;
  }

  /** Purely a read: never mutates or claims anything. */
  preview(mode: GameMode): number {
    if (mode !== "endless") return 0;
    if (this.waves.currentPhase !== "prep" && this.waves.currentPhase !== "intermission") return 0;
    const upcomingWave = this.waves.currentWave + 1;
    if (this.claimedForWave === upcomingWave) return 0;
    return endlessEarlyWaveReward(upcomingWave, this.waves.timeToNextWave);
  }

  claim(mode: GameMode): number {
    const reward = this.preview(mode);
    const upcomingWave = this.waves.currentWave + 1;
    if (reward > 0) this.claimedForWave = upcomingWave;
    this.waves.callNextWaveNow();
    if (reward > 0) {
      this.store.add("gold", reward);
      this.events.emit("notify", { title: "提前開波獎勵", body: `金幣 +${reward}` });
    }
    return reward;
  }
}
