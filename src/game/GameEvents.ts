import type { BuildingType } from "../data/BuildingDefinitions";
import type { ResourceCost } from "../data/CombatTypes";
import type { GameMode } from "../data/GameModeRules";
import type { LaneWarning } from "../enemies/WavePreview";
import type { UpgradeDefinition } from "../data/UpgradeDefinitions";

export interface GameEventMap {
  resourcesChanged: { wood: number; stone: number; gold: number; capacity: number };

  buildingPlaced: { slotId: string; type: BuildingType };
  buildingCompleted: { slotId: string; type: BuildingType };
  buildingDestroyed: { slotId: string; type: BuildingType; x: number; z: number };
  buildingRebuilt: { slotId: string; type: BuildingType };
  buildingDemolishStarted: { slotId: string; type: BuildingType };
  buildingDemolished: { slotId: string; type: BuildingType; refund: ResourceCost };
  /** Emitted by BuildingAnimator for each assembled part group. */
  buildStage: { zoneId: string; stage: number; total: number; position: { x: number; y: number; z: number } };

  /** Fires a few seconds before a wave, naming the lanes it will come down. */
  wavePreview: { wave: number; name: string; boss: boolean; lanes: LaneWarning[]; seconds: number };
  waveStarted: { wave: number; name: string; boss: boolean; total: number };
  waveCleared: { wave: number };
  allWavesCleared: Record<string, never>;

  squadRecruited: { defId: string; name: string };
  squadLimitReached: Record<string, never>;

  heroDown: Record<string, never>;
  heroRevived: Record<string, never>;

  bossSpawned: { name: string; maxHealth: number };
  bossPhaseChanged: { phase: number };
  bossSlamWarning: Record<string, never>;
  bossSlamLanded: Record<string, never>;
  bossDefeated: Record<string, never>;

  tutorialStep: { index: number; total: number; title: string; body: string };
  tutorialComplete: Record<string, never>;

  /** Result feedback for a player action: build, recruit or upgrade. */
  actionResult: { ok: boolean; title: string; detail: string };

  furnaceUpgraded: { level: number };
  furnaceDamaged: { health: number; maxHealth: number };

  runUpgradeOffer: { choices: UpgradeDefinition[] };
  runUpgradeTaken: { id: string; name: string };

  gameOver: { victory: boolean; mode: GameMode; wave: number; kills: number; seconds: number };
  notify: { title: string; body?: string; duration?: number };
  paused: { paused: boolean };
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

/** Minimal typed event bus. Systems never reach into each other directly. */
export class GameEvents {
  private readonly handlers = new Map<string, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(key: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(key as string);
    if (!set) {
      set = new Set();
      this.handlers.set(key as string, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      set?.delete(handler as Handler<never>);
    };
  }

  emit<K extends keyof GameEventMap>(key: K, payload: GameEventMap[K]): void {
    const set = this.handlers.get(key as string);
    if (!set) return;
    for (const handler of set) (handler as Handler<K>)(payload);
  }

  dispose(): void {
    this.handlers.clear();
  }
}
