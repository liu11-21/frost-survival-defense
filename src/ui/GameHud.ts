import type { BuildingManager } from "../buildings/BuildingManager";
import type { SquadManager } from "../combat/SquadManager";
import type { WaveManager } from "../enemies/WaveManager";
import type { ResourceStore } from "../economy/ResourceStore";
import type { GameEvents } from "../game/GameEvents";
import type { Furnace } from "../heat/Furnace";
import type { HeroController } from "../hero/HeroController";
import type { HeroStats } from "../hero/HeroStats";
import type { RunController } from "../modes/RunController";
import type { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { demolishRefund } from "../buildings/Demolition";
import { previewText } from "../enemies/WavePreview";
import { costText } from "./CostLine";
import { Notifications, type ToastType } from "./Notifications";
import type { UIRefs } from "./UIRoot";

export interface HudDeps {
  refs: UIRefs;
  events: GameEvents;
  store: ResourceStore;
  hero: HeroController;
  heroStats: HeroStats;
  furnace: Furnace;
  waves: WaveManager;
  squads: SquadManager;
  buildings: BuildingManager;
  run: RunController;
  monitor: PerformanceMonitor;
}

/**
 * Pushes live numbers into the HUD. Everything here is a player-facing value —
 * no coordinates, no state-machine names, no internal ids.
 */
export class GameHud {
  private hintTimer = 14;
  private fpsTimer = 0;
  private fpsVisible = true;
  private furnaceAlertRemaining = 0;
  private readonly unsubscribes: Array<() => void> = [];
  readonly notifications: Notifications;

  constructor(private readonly d: HudDeps) {
    const { events, refs } = d;
    this.notifications = new Notifications(
      refs.banner,
      refs.bannerTitle,
      refs.bannerBody,
      refs.bannerIcon,
      refs.toast,
    );

    this.unsubscribes.push(
      events.on("resourcesChanged", (p) => {
        refs.wood.textContent = String(Math.floor(p.wood));
        refs.stone.textContent = String(Math.floor(p.stone));
        refs.gold.textContent = String(Math.floor(p.gold));
        refs.capacityNote.textContent =
          p.capacity === Infinity ? "倉庫已建 · 容量無限" : `上限 ${p.capacity}`;
        refs.capacityNote.classList.toggle("good", p.capacity === Infinity);
      }),
      events.on("notify", (p) =>
        this.notifications.show({ title: p.title, message: p.body, durationMs: (p.duration ?? 3.2) * 1000 }),
      ),
      events.on("wavePreview", (p) =>
        this.notifications.show({
          title: `${p.name}即將來襲`,
          message: previewText(p.lanes),
          type: p.boss ? "danger" : "info",
          durationMs: 4200,
        }),
      ),
      events.on("waveStarted", (p) =>
        this.notifications.show({
          title: p.name,
          message: p.boss ? "Boss 出現，全力防守" : "敵人正在推進",
          type: p.boss ? "danger" : "info",
          durationMs: p.boss ? 4200 : 2600,
        }),
      ),
      events.on("eliteEnemySpawned", (p) =>
        this.notifications.show({
          title: `高威脅接觸：Lv.${p.level} ${p.name}`,
          message: `第 ${p.wave} 波精英單位已進場`,
          type: "danger",
          durationMs: 2600,
        }),
      ),
      events.on("furnaceDamaged", () => {
        this.furnaceAlertRemaining = 0.9;
        refs.furnaceAlert.classList.add("show");
      }),
      events.on("squadRecruited", (p) => this.toast(`已招募 ${p.name}`)),
      events.on("furnaceUpgraded", (p) =>
        this.notifications.show({ title: "火爐升級", message: `等級 ${p.level}`, type: "success" }),
      ),
      events.on("buildingDestroyed", (p) => this.toast(`${typeName(p.type)}被摧毀`, "failure")),
      events.on("buildingRebuilt", (p) => this.toast(`自動重建完成：${typeName(p.type)}`, "success")),
      events.on("buildingDemolishStarted", (p) =>
        this.notifications.show({
          title: `開始拆除：${typeName(p.type)}`,
          message: `完成後返還 ${costText(demolishRefund(p.type, d.buildings.slot(p.slotId)?.building?.constructionCost))}。`,
          iconId: p.type,
        }),
      ),
      events.on("buildingDemolished", (p) =>
        this.notifications.show({
          title: `已拆除：${typeName(p.type)}`,
          message: `返還 ${costText(p.refund)}。此點位現在可以建造其他允許的設施。`,
          iconId: p.type,
          type: "success",
        }),
      ),
      events.on("heroDown", () => this.toast("主角倒地，8 秒後於火爐旁復活", "failure")),
    );

    refs.banner.classList.remove("show");
  }

  /** Drives the top-of-screen boss bar. Hidden while no boss is alive. */
  setBoss(
    active: boolean,
    name: string,
    phase: number,
    health: number,
    maxHealth: number,
    slamProgress: number,
    resistant: boolean,
  ): void {
    const r = this.d.refs;
    r.bossBar.classList.toggle("show", active);
    if (!active) return;
    r.bossName.textContent = name;
    r.bossPhase.textContent = ["第一階段", "第二階段 · 震地", "第三階段 · 適應"][phase - 1] ?? "";
    const pct = Math.max(0, Math.min(100, (health / Math.max(1, maxHealth)) * 100));
    r.bossFill.style.width = pct + "%";
    r.bossText.textContent = Math.ceil(health) + " / " + maxHealth;
    r.bossWarn.textContent =
      slamProgress >= 0
        ? "震地施放中 " + Math.round(slamProgress * 100) + "%"
        : resistant
          ? "對砲塔傷害減免"
          : "";
    r.bossWarn.classList.toggle("danger", slamProgress >= 0);
  }

  /** Tutorial card: one task at a time, or hidden. */
  setTutorial(title: string, body: string, progress: string): void {
    const el = this.d.refs.tutorial;
    if (!title) {
      el.classList.remove("show");
      return;
    }
    el.classList.add("show");
    el.innerHTML =
      '<div class="tut-step">教學 ' + progress + "</div>" +
      '<div class="tut-title">' + title + "</div>" +
      '<div class="tut-body">' + body + "</div>" +
      '<button class="mini-btn tight" id="ui-tut-skip">跳過教學</button>';
  }

  /** The single contextual E prompt, or blank when nothing is in reach. */
  setPrompt(label: string, detail: string, enabled: boolean): void {
    const el = this.d.refs.prompt;
    if (!label) {
      el.classList.remove("show");
      return;
    }
    el.classList.add("show");
    el.classList.toggle("blocked", !enabled);
    el.innerHTML = `<div class="prompt-label">${label}</div>` +
      (detail ? `<div class="prompt-detail">${detail}</div>` : "");
  }

  showBanner(title: string, body: string, duration = 3): void {
    this.notifications.show({ title, message: body, durationMs: duration * 1000 });
  }

  toast(text: string, type: ToastType = "info"): void {
    this.notifications.toast(text, type);
  }

  hideHint(): void {
    this.hintTimer = Math.min(this.hintTimer, 1.5);
  }

  /**
   * Formal HUD element, always on by default — this is not the F3 panel and
   * does not require it. Both read the same `PerformanceMonitor`, so the
   * number here and the one in F3 can never disagree.
   */
  setFpsVisible(visible: boolean): void {
    this.fpsVisible = visible;
    this.d.refs.fpsBox.classList.toggle("hidden", !visible);
  }

  update(dt: number): void {
    const { refs, hero, heroStats, furnace, waves, squads, buildings, run } = this.d;

    if (this.furnaceAlertRemaining > 0) {
      this.furnaceAlertRemaining -= dt;
      if (this.furnaceAlertRemaining <= 0) refs.furnaceAlert.classList.remove("show");
    }

    // hero
    const hp = Math.max(0, Math.ceil(hero.health));
    const hpMax = heroStats.maxHealth;
    refs.heroText.textContent = hero.isDown
      ? `倒地 ${hero.downRemaining.toFixed(1)}s`
      : `${hp} / ${hpMax}`;
    refs.heroBar.style.width = `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`;
    refs.heroBar.classList.toggle("low", hp / hpMax < 0.3);
    refs.heroStats.textContent =
      `遠程 ${Math.round(heroStats.rangedAttack)} · 近戰 ${Math.round(heroStats.meleeAttack)}` +
      ` · 攻速 ${heroStats.attackInterval.toFixed(2)}s`;

    const rates = buildings.productionEfficiency(run.productionRate);
    refs.woodRate.textContent = `+${rates.wood.toFixed(1)}/s`;
    refs.stoneRate.textContent = `+${rates.stone.toFixed(1)}/s`;
    refs.goldRate.textContent = `+${rates.gold.toFixed(1)}/s`;

    // furnace
    const fh = Math.max(0, Math.ceil(furnace.health));
    refs.furnaceText.textContent = `${fh} / ${furnace.maxHealth}`;
    refs.furnaceLevel.textContent = `Lv.${furnace.currentLevel}`;
    refs.furnaceBar.style.width = `${Math.max(0, furnace.healthPercent * 100)}%`;
    refs.furnaceBar.classList.toggle("low", furnace.healthPercent < 0.35);

    // waves
    const phase = waves.currentPhase;
    if (phase === "prep") {
      refs.waveLabel.textContent = "準備階段";
      refs.waveTimer.textContent = `${waves.timeToNextWave.toFixed(0)} 秒後開戰`;
    } else if (phase === "intermission") {
      refs.waveLabel.textContent = `第 ${waves.currentWave} 波已清除`;
      refs.waveTimer.textContent = `${waves.timeToNextWave.toFixed(0)} 秒後下一波`;
    } else if (phase === "finished") {
      refs.waveLabel.textContent = "全部波次結束";
      refs.waveTimer.textContent = "--";
    } else {
      const total = waves.totalWaves;
      refs.waveLabel.textContent = total > 0 ? `第 ${waves.currentWave} / ${total} 波` : `第 ${waves.currentWave} 波`;
      refs.waveTimer.textContent = "作戰中";
    }
    refs.enemyCount.textContent = String(squads.livingEnemyUnits);
    const canCall = phase === "prep" || phase === "intermission";
    refs.callWaveButton.disabled = !canCall;
    refs.callWaveButton.classList.toggle("hidden", !canCall);
    // Throttled to this same per-frame HUD refresh, which already runs well
    // under 4 Hz — no need for its own timer.
    const reward = canCall ? run.previewEarlyWaveReward() : 0;
    refs.callWaveButton.textContent = reward > 0 ? `立刻開始下一波 (N)　+${reward}金幣` : "立刻開始下一波 (N)";

    // squads + furnace upgrade
    refs.squadCount.textContent = `${squads.allySquadSlotsUsed} / ${run.squadLimit}`;
    const cost = run.furnaceUpgradeCost;
    refs.upgradeButton.disabled = !run.canUpgradeFurnace;
    refs.upgradeButton.textContent = run.allowFurnaceUpgrade
      ? `升級火爐 (U) ${cost.wood}木 ${cost.stone}石 ${cost.gold}金`
      : "本關不開放升級";

    // auto rebuild
    const hasRebuilder = buildings.hasAutoRebuilder;
    refs.rebuildBox.classList.toggle("hidden", !hasRebuilder);
    if (hasRebuilder) {
      refs.rebuildToggle.textContent = buildings.autoRebuildEnabled ? "啟用中 (T)" : "已停用 (T)";
      refs.rebuildToggle.classList.toggle("off", !buildings.autoRebuildEnabled);
      const head = buildings.rebuildQueue.head;
      const cooldown = buildings.rebuildCooldownRemaining;
      if (!head) {
        refs.rebuildInfo.textContent = cooldown > 0 ? `冷卻 ${cooldown.toFixed(1)}s` : "佇列 0";
      } else {
        const affordable = this.d.store.canAfford(head.rebuildCost);
        const label = `佇列 ${buildings.rebuildQueue.length} · 下一項 ${typeName(head.buildingType)}`;
        refs.rebuildInfo.textContent = cooldown > 0
          ? `${label} · 冷卻 ${cooldown.toFixed(1)}s`
          : affordable
            ? `${label} · 重建中`
            : `${label} · 資源不足`;
      }
    }

    // fps, smoothed and throttled so the digits do not flicker every frame
    if (this.fpsVisible) {
      this.fpsTimer -= dt;
      if (this.fpsTimer <= 0) {
        this.fpsTimer = 0.25;
        const fps = Math.round(this.d.monitor.snapshot.avgFps5s);
        refs.fpsText.textContent = `FPS ${fps}`;
        refs.fpsBox.classList.toggle("warn", fps < 55 && fps >= 35);
        refs.fpsBox.classList.toggle("low", fps < 35);
      }
    }

    // transient elements
    this.notifications.update(dt);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) refs.hint.classList.add("faded");
    }
  }

  dispose(): void {
    for (const off of this.unsubscribes) off();
  }
}

const NAMES: Record<string, string> = {
  mine: "礦場",
  goldMine: "金礦",
  lumberyard: "伐木場",
  warehouse: "倉庫",
  recruitHall: "招募所",
  autoCollector: "自動收取設施",
  autoRebuilder: "自動重建站",
  tower: "砲塔",
  wall: "城牆",
};

export function typeName(type: string): string {
  return NAMES[type] ?? type;
}
