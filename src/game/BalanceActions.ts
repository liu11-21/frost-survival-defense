import type { GameSystems } from "./GameSystems";

/**
 * The F9 balance tool's one-shot actions.
 *
 * Every one of these is a development shortcut: touching any of them marks the
 * run as untracked so a tuned session can never reach the leaderboard.
 */
export function runBalanceAction(
  s: GameSystems,
  action: string,
  restart: (mode: "stage" | "endless", levelId?: string) => void,
): void {
    switch (action) {
      case "skipWave":
        s.waves.callNextWaveNow();
        break;
      case "spawnBoss":
        s.squads.spawnEnemy("boss", 0, 24, 0);
        break;
      case "clearEnemies":
        for (const e of s.world.enemies) if (e.alive) e.applyDamage(1e9, 0, 0);
        break;
      case "fillResources":
        s.store.add("wood", 9999);
        s.store.add("stone", 9999);
        s.store.add("gold", 9999);
        break;
      case "healAllies":
        s.squads.eachAlly((u) => u.heal(u.maxHealth));
        s.hero.heal(s.hero.maxHealth);
        break;
      case "resetLevel":
        restart(s.run.mode, "stage-1");
        break;
      case "jumpWave10":
        s.waves.jumpToWave(10);
        break;
      case "jumpWave15":
        s.waves.jumpToWave(15);
        break;
      case "jumpWave20":
        s.waves.jumpToWave(20);
        break;
      case "prepShort":
        s.waves.setPrepCountdown(3);
        break;
      case "callWaveEarly":
        s.run.callNextWaveEarly();
        break;
      case "unlockAttackBuildings":
        // The single most expensive attack building's own cost — enough to
        // freely test-build any of the five, without a blanket resource dump.
        s.store.add("wood", 220);
        s.store.add("stone", 300);
        s.store.add("gold", 60);
        break;
    }
}
