import type { BuildingManager } from "../buildings/BuildingManager";
import { demolishRefund } from "../buildings/Demolition";
import type { SquadManager } from "../combat/SquadManager";
import type { WaveManager } from "../enemies/WaveManager";
import type { ResourceStore } from "../economy/ResourceStore";
import type { GameEvents } from "../game/GameEvents";
import type { Furnace } from "../heat/Furnace";
import type { HeroController } from "../hero/HeroController";
import type { HeroStats } from "../hero/HeroStats";
import { entityName, subscribeLocale, t, translatedOr } from "../localization";
import type { RunController } from "../modes/RunController";
import type { PerformanceMonitor } from "../performance/PerformanceMonitor";
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

/** Player-facing live HUD values. Gameplay state remains the source of truth. */
export class GameHud {
  private hintTimer = 14;
  private fpsTimer = 0;
  private fpsVisible = true;
  private furnaceAlertRemaining = 0;
  private lastCapacity: number | null = null;
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
      subscribeLocale(() => {
        if (this.lastCapacity !== null) this.renderCapacity(this.lastCapacity);
      }),
      events.on("resourcesChanged", (p) => {
        refs.wood.textContent = String(Math.floor(p.wood));
        refs.stone.textContent = String(Math.floor(p.stone));
        refs.gold.textContent = String(Math.floor(p.gold));
        this.lastCapacity = p.capacity;
        this.renderCapacity(p.capacity);
      }),
      events.on("notify", (p) =>
        this.notifications.show({ title: p.title, message: p.body, durationMs: (p.duration ?? 3.2) * 1000 }),
      ),
      events.on("wavePreview", (p) =>
        this.notifications.show({
          title: t("notification.waveIncoming", { wave: p.wave }),
          message: previewText(p.lanes),
          type: p.boss ? "danger" : "info",
          durationMs: 4200,
        }),
      ),
      events.on("waveStarted", (p) =>
        this.notifications.show({
          title: t("wave.incoming", { wave: p.wave }),
          message: t(p.boss ? "wave.startedBoss" : "wave.started"),
          type: p.boss ? "danger" : "info",
          durationMs: p.boss ? 4200 : 2600,
        }),
      ),
      events.on("eliteEnemySpawned", (p) =>
        this.notifications.show({
          title: t("notification.elite", {
            level: p.level,
            name: translatedOr(`enemy.${p.enemyId}.name`, p.name),
          }),
          message: t("notification.eliteBody", { wave: p.wave }),
          type: "danger",
          durationMs: 2600,
        }),
      ),
      events.on("furnaceDamaged", () => {
        this.furnaceAlertRemaining = 0.9;
        refs.furnaceAlert.classList.add("show");
      }),
      events.on("squadRecruited", (p) =>
        this.toast(t("notification.recruited", { name: entityName("unit", p.defId, p.name) })),
      ),
      events.on("furnaceUpgraded", (p) =>
        this.notifications.show({
          title: t("notification.furnaceUpgrade"),
          message: t("notification.level", { level: p.level }),
          type: "success",
        }),
      ),
      events.on("buildingDestroyed", (p) => this.toast(t("notification.destroyed", { name: typeName(p.type) }), "failure")),
      events.on("buildingRebuilt", (p) => this.toast(t("notification.rebuilt", { name: typeName(p.type) }), "success")),
      events.on("buildingDemolishStarted", (p) =>
        this.notifications.show({
          title: t("notification.demolishStart", { name: typeName(p.type) }),
          message: t("notification.demolishRefund", {
            cost: costText(demolishRefund(p.type, d.buildings.slot(p.slotId)?.building?.constructionCost)),
          }),
          iconId: p.type,
        }),
      ),
      events.on("buildingDemolished", (p) =>
        this.notifications.show({
          title: t("notification.demolished", { name: typeName(p.type) }),
          message: t("notification.demolishedBody", { cost: costText(p.refund) }),
          iconId: p.type,
          type: "success",
        }),
      ),
      events.on("heroDown", () => this.toast(t("notification.heroDown"), "failure")),
    );

    refs.banner.classList.remove("show");
  }

  private renderCapacity(capacity: number): void {
    const note = this.d.refs.capacityNote;
    note.textContent = capacity === Infinity
      ? t("hud.capacityUnlimited")
      : t("hud.capacity", { capacity });
    note.classList.toggle("good", capacity === Infinity);
  }

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
    r.bossPhase.textContent = [t("boss.phase1"), t("boss.phase2"), t("boss.phase3")][phase - 1] ?? "";
    const pct = Math.max(0, Math.min(100, (health / Math.max(1, maxHealth)) * 100));
    r.bossFill.style.width = pct + "%";
    r.bossText.textContent = Math.ceil(health) + " / " + maxHealth;
    r.bossWarn.textContent = slamProgress >= 0
      ? t("boss.slam", { progress: Math.round(slamProgress * 100) })
      : resistant
        ? t("boss.resistant")
        : "";
    r.bossWarn.classList.toggle("danger", slamProgress >= 0);
  }

  setTutorial(title: string, body: string, progress: string): void {
    const el = this.d.refs.tutorial;
    if (!title) {
      el.classList.remove("show");
      return;
    }
    el.classList.add("show");
    el.innerHTML =
      `<div class="tut-step">${t("tutorial.label", { progress })}</div>` +
      `<div class="tut-title">${title}</div>` +
      `<div class="tut-body">${body}</div>` +
      `<button class="mini-btn tight" id="ui-tut-skip">${t("tutorial.skip")}</button>`;
  }

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

    const hp = Math.max(0, Math.ceil(hero.health));
    const hpMax = heroStats.maxHealth;
    refs.heroText.textContent = hero.isDown
      ? t("hud.heroDown", { seconds: hero.downRemaining.toFixed(1) })
      : `${hp} / ${hpMax}`;
    refs.heroBar.style.width = `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`;
    refs.heroBar.classList.toggle("low", hp / hpMax < 0.3);
    refs.heroStats.textContent = t("hud.heroStats", {
      ranged: Math.round(heroStats.rangedAttack),
      melee: Math.round(heroStats.meleeAttack),
      interval: heroStats.attackInterval.toFixed(2),
    });

    const rates = buildings.productionEfficiency(run.productionRate);
    refs.woodRate.textContent = `+${rates.wood.toFixed(1)}/s`;
    refs.stoneRate.textContent = `+${rates.stone.toFixed(1)}/s`;
    refs.goldRate.textContent = `+${rates.gold.toFixed(1)}/s`;

    const fh = Math.max(0, Math.ceil(furnace.health));
    refs.furnaceText.textContent = `${fh} / ${furnace.maxHealth}`;
    refs.furnaceLevel.textContent = `Lv.${furnace.currentLevel}`;
    refs.furnaceBar.style.width = `${Math.max(0, furnace.healthPercent * 100)}%`;
    refs.furnaceBar.classList.toggle("low", furnace.healthPercent < 0.35);

    const phase = waves.currentPhase;
    if (phase === "prep") {
      refs.waveLabel.textContent = t("wave.preparation");
      refs.waveTimer.textContent = t("wave.startsIn", { seconds: waves.timeToNextWave.toFixed(0) });
    } else if (phase === "intermission") {
      refs.waveLabel.textContent = t("wave.cleared", { wave: waves.currentWave });
      refs.waveTimer.textContent = t("wave.nextIn", { seconds: waves.timeToNextWave.toFixed(0) });
    } else if (phase === "finished") {
      refs.waveLabel.textContent = t("wave.finished");
      refs.waveTimer.textContent = "--";
    } else {
      const total = waves.totalWaves;
      refs.waveLabel.textContent = total > 0
        ? t("wave.currentTotal", { wave: waves.currentWave, total })
        : t("wave.current", { wave: waves.currentWave });
      refs.waveTimer.textContent = t("wave.combat");
    }
    refs.enemyCount.textContent = String(squads.livingEnemyUnits);
    const canCall = phase === "prep" || phase === "intermission";
    refs.callWaveButton.disabled = !canCall;
    refs.callWaveButton.classList.toggle("hidden", !canCall);
    const reward = canCall ? run.previewEarlyWaveReward() : 0;
    refs.callWaveButton.textContent = reward > 0
      ? t("hud.callWaveReward", { reward })
      : t("hud.callWave");

    refs.squadCount.textContent = `${squads.allySquadSlotsUsed} / ${run.squadLimit}`;
    const cost = run.furnaceUpgradeCost;
    refs.upgradeButton.disabled = !run.canUpgradeFurnace;
    refs.upgradeButton.textContent = run.allowFurnaceUpgrade
      ? t("hud.upgradeFurnace", { wood: cost.wood ?? 0, stone: cost.stone ?? 0, gold: cost.gold ?? 0 })
      : t("hud.upgradeLocked");

    const hasRebuilder = buildings.hasAutoRebuilder;
    refs.rebuildBox.classList.toggle("hidden", !hasRebuilder);
    if (hasRebuilder) {
      refs.rebuildToggle.textContent = buildings.autoRebuildEnabled ? t("hud.rebuildEnabled") : t("hud.rebuildDisabled");
      refs.rebuildToggle.classList.toggle("off", !buildings.autoRebuildEnabled);
      const head = buildings.rebuildQueue.head;
      const cooldown = buildings.rebuildCooldownRemaining;
      if (!head) {
        refs.rebuildInfo.textContent = cooldown > 0
          ? t("hud.queueCooldown", { seconds: cooldown.toFixed(1) })
          : t("hud.queueEmpty");
      } else {
        const affordable = this.d.store.canAfford(head.rebuildCost);
        const label = t("hud.queueNext", {
          count: buildings.rebuildQueue.length,
          name: typeName(head.buildingType),
        });
        refs.rebuildInfo.textContent = cooldown > 0
          ? `${label} · ${t("hud.queueCooldown", { seconds: cooldown.toFixed(1) })}`
          : affordable
            ? `${label} · ${t("hud.rebuilding")}`
            : `${label} · ${t("hud.insufficient")}`;
      }
    }

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

export function typeName(type: string): string {
  return entityName("building", type, type);
}
