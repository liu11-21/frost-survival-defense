import type { BuildingManager } from "../buildings/BuildingManager";
import type { CombatScaling } from "../combat/CombatContext";
import type { CombatUnit } from "../combat/CombatUnit";
import type { SquadManager } from "../combat/SquadManager";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import { FURNACE, FURNACE_UPGRADE, furnaceMaxHealth, furnaceUpgradeCost } from "../data/FurnaceUpgradeConfig";
import {
  ENDLESS_RULES,
  ENDLESS_SCALING,
  LEVEL_BY_ID,
  STAGE_RULES,
  endlessAttackMultiplier,
  endlessCountMultiplier,
  endlessHealthMultiplier,
  endlessLaneCount,
  type GameMode,
  type GameModeRules,
  type LevelDefinition,
} from "../data/GameModeRules";
import type { UpgradeDefinition, UpgradeState } from "../data/UpgradeDefinitions";
import { EarlyWaveRewardTracker } from "./EarlyWaveReward";
import type { PickupPool } from "../economy/PickupPool";
import type { ResourceStore } from "../economy/ResourceStore";
import type { WaveManager } from "../enemies/WaveManager";
import type { GameEvents } from "../game/GameEvents";
import type { Furnace } from "../heat/Furnace";
import type { HeroStats } from "../hero/HeroStats";
import type { HeroController } from "../hero/HeroController";
import type { HeroSkills } from "../hero/HeroSkills";
import { HERO_REVIVE } from "../data/UnitDefinitions";

export interface RunDeps {
  upgrades: UpgradeState;
  events: GameEvents;
  store: ResourceStore;
  squads: SquadManager;
  waves: WaveManager;
  buildings: BuildingManager;
  furnace: Furnace;
  hero: HeroController;
  heroStats: HeroStats;
  heroSkills: HeroSkills;
  pickups: PickupPool;
  scaling: CombatScaling;
}

/** Owns the rules of one run: mode, scaling, squad limit, victory and defeat. */
export class RunController {
  private rules: GameModeRules = STAGE_RULES;
  private level: LevelDefinition | null = null;
  private _mode: GameMode = "stage";
  private _kills = 0;
  private _elapsed = 0;
  private _over = false;
  private _victory = false;
  private pendingUpgradeWave = 0;
  private lastScaledWave = -1;
  private readonly earlyReward: EarlyWaveRewardTracker;

  readonly upgrades: UpgradeState;

  constructor(private readonly deps: RunDeps) {
    this.upgrades = deps.upgrades;
    this.earlyReward = new EarlyWaveRewardTracker(deps.waves, deps.store, deps.events);
  }

  get mode(): GameMode {
    return this._mode;
  }
  get kills(): number {
    return this._kills;
  }
  get elapsed(): number {
    return this._elapsed;
  }
  get isOver(): boolean {
    return this._over;
  }
  get victory(): boolean {
    return this._victory;
  }
  get levelName(): string {
    return this.level?.name ?? "無限模式";
  }
  get allowFurnaceUpgrade(): boolean {
    return this.rules.allowFurnaceUpgrade && (this.level?.allowFurnaceUpgrade ?? true);
  }
  /** "3 / 8" for the recruit prompt. */
  get squadLimitUsageText(): string {
    return this.deps.squads.allySquadCount + " / " + this.squadLimit;
  }

  get squadLimit(): number {
    const bonus = (this.deps.furnace.currentLevel - 1) * this.rules.squadLimitPerFurnaceLevel;
    return this.rules.initialSquadLimit + bonus;
  }
  get furnaceUpgradeCost(): ReturnType<typeof furnaceUpgradeCost> {
    return furnaceUpgradeCost(this.deps.furnace.currentLevel + 1);
  }
  get canUpgradeFurnace(): boolean {
    return (
      this.allowFurnaceUpgrade &&
      this.deps.furnace.currentLevel < FURNACE.maxLevel &&
      this.deps.store.canAfford(this.furnaceUpgradeCost)
    );
  }

  /** Wipes every scrap of run progress, then boots the requested mode. */
  start(mode: GameMode, levelId?: string): void {
    const d = this.deps;
    this._mode = mode;
    this.rules = mode === "endless" ? ENDLESS_RULES : STAGE_RULES;
    this.level = mode === "stage" ? (LEVEL_BY_ID.get(levelId ?? "stage-1") ?? null) : null;
    this._kills = 0;
    this._elapsed = 0;
    this._over = false;
    this._victory = false;
    this.pendingUpgradeWave = 0;
    this.lastScaledWave = -1;
    this.earlyReward.reset();
    this.upgrades.reset();

    d.squads.clearAll();
    d.buildings.resetAll();
    d.pickups.clear();
    d.furnace.resetForNewRun();
    d.heroStats.reset();
    d.hero.resetForNewRun();
    d.heroSkills.reset();
    this.applyScaling(1);

    if (mode === "stage" && this.level) {
      const lvl = this.level;
      d.store.reset(lvl.startingWood, lvl.startingStone, lvl.startingGold);
      d.waves.start({
        waves: lvl.waves,
        laneCount: lvl.laneCount,
        prepTime: lvl.prepTime,
        waveInterval: lvl.waveInterval,
      });
      this.applyScaling(lvl.difficulty);
    } else {
      d.store.reset(
        ENDLESS_SCALING.startingWood,
        ENDLESS_SCALING.startingStone,
        ENDLESS_SCALING.startingGold,
      );
      d.waves.start({
        waves: null,
        laneCount: ENDLESS_SCALING.startingLanes,
        prepTime: ENDLESS_SCALING.prepTime,
        waveInterval: ENDLESS_SCALING.waveInterval,
        laneCountForWave: endlessLaneCount,
      });
    }
    d.heroStats.setFurnaceLevel(d.furnace.currentLevel);
  }

  update(dt: number): void {
    if (this._over) return;
    this._elapsed += dt;

    if (this._mode === "endless") this.updateEndlessScaling();
    this.refreshUpgradeMultipliers();

    if (!this.deps.furnace.alive) {
      this.finish(false);
      return;
    }
  }

  /** Endless waves get linearly tougher; nothing here compounds. */
  private updateEndlessScaling(): void {
    const wave = Math.max(1, this.deps.waves.currentWave);
    if (wave === this.lastScaledWave) return;
    this.lastScaledWave = wave;
    this.deps.scaling.enemyHealth = endlessHealthMultiplier(wave);
    this.deps.scaling.enemyAttack = endlessAttackMultiplier(wave);
  }

  /** Endless count scaling is exposed for the wave manager and the HUD. */
  get enemyCountMultiplier(): number {
    return this._mode === "endless" ? endlessCountMultiplier(Math.max(1, this.deps.waves.currentWave)) : 1;
  }

  private applyScaling(difficulty: number): void {
    const s = this.deps.scaling;
    s.enemyHealth = difficulty;
    s.enemyAttack = difficulty;
    s.allyAttack = 1;
    s.allyHealth = 1;
    s.towerAttack = 1;
    s.heroAttack = 1;
    s.goldDrop = 1;
  }

  private refreshUpgradeMultipliers(): void {
    const s = this.deps.scaling;
    const base = this._mode === "stage" ? (this.level?.difficulty ?? 1) : s.enemyHealth;
    s.allyAttack = this.upgrades.multiplier("allyAttack");
    s.allyHealth = this.upgrades.multiplier("allyHealth");
    s.towerAttack = this.upgrades.multiplier("towerAttack");
    s.goldDrop = this.upgrades.multiplier("goldDrop");
    if (this._mode === "stage") s.enemyHealth = base;
  }

  get productionRate(): number {
    return this.upgrades.multiplier("productionRate");
  }
  get furnaceHealRate(): number {
    return this.upgrades.multiplier("furnaceHeal");
  }
  get wallHealthMultiplier(): number {
    return this.upgrades.multiplier("wallHealth");
  }

  /** Exact before/after numbers for the furnace upgrade panel. */
  previewNextLevel(): {
    heroHealth: number;
    ranged: number;
    melee: number;
    interval: number;
    furnaceHealth: number;
    squadLimitNote: string;
  } {
    const current = this.deps.furnace.currentLevel;
    const stats = this.deps.heroStats;
    const before = current;
    stats.setFurnaceLevel(current + 1);
    const preview = {
      heroHealth: stats.maxHealth,
      ranged: Math.round(stats.rangedAttack),
      melee: Math.round(stats.meleeAttack),
      interval: stats.attackInterval,
      furnaceHealth: furnaceMaxHealth(current + 1),
      squadLimitNote:
        this.rules.squadLimitPerFurnaceLevel > 0
          ? "小隊上限：" + this.squadLimit + " → " + (this.squadLimit + this.rules.squadLimitPerFurnaceLevel)
          : "小隊上限不變（僅無限模式會增加）",
    };
    stats.setFurnaceLevel(before);
    return preview;
  }

  recruitCost(defId: string): number {
    const def = ALLY_BY_ID.get(defId);
    if (!def) return 0;
    return Math.max(1, Math.round((def.recruitCost ?? 0) * this.upgrades.multiplier("recruitCost")));
  }

  /** Returns null on success, or the reason the recruit was refused. */
  tryRecruit(defId: string): string | null {
    const d = this.deps;
    const def = ALLY_BY_ID.get(defId);
    if (!def) return "未知兵種";
    if (!d.buildings.hasRecruitHall) return "招募所未完成";
    if (d.squads.allySquadCount >= this.squadLimit) return "小隊已達上限";
    const cost = this.recruitCost(defId);
    if (d.store.gold < cost) return "金幣不足";
    if (!d.store.spend({ gold: cost })) return "金幣不足";

    const hero = d.hero.position;
    const angle = Math.random() * Math.PI * 2;
    d.squads.recruit(defId, hero.x + Math.sin(angle) * 2.2, hero.z + Math.cos(angle) * 2.2);
    d.events.emit("squadRecruited", { defId, name: def.name });
    return null;
  }

  tryUpgradeFurnace(): string | null {
    const d = this.deps;
    if (!this.allowFurnaceUpgrade) return "本關卡不開放火爐升級";
    if (d.furnace.currentLevel >= FURNACE.maxLevel) return "火爐已達最高等級";
    const cost = this.furnaceUpgradeCost;
    if (!d.store.canAfford(cost)) return `${d.store.shortfall(cost)}不足`;
    if (!d.store.spend(cost)) return "資源不足";

    const previousMax = d.heroStats.maxHealth;
    const level = d.furnace.currentLevel + 1;
    d.furnace.setLevel(level);
    d.heroStats.setFurnaceLevel(level);
    d.hero.refreshMaxHealth(previousMax);
    d.events.emit("furnaceUpgraded", { level });
    return null;
  }

  /** Squad-limit gain per furnace level, exposed for the recruit panel. */
  get squadLimitPerLevel(): number {
    return this.rules.squadLimitPerFurnaceLevel * FURNACE_UPGRADE.squadLimitPerLevel > 0
      ? this.rules.squadLimitPerFurnaceLevel
      : 0;
  }

  reportKill(unit: CombatUnit): void {
    if (unit.faction !== "enemy") return;
    this._kills++;
    const gold = Math.max(1, Math.round((unit.def.goldValue ?? 1) * this.deps.scaling.goldDrop));
    this.deps.pickups.spawn("gold", unit.position.x, unit.position.z, gold);
  }

  onHeroDeath(): void {
    if (!this.rules.heroDeathGoldPenalty) return;
    this.deps.store.loseGoldPenalty(HERO_REVIVE.endlessGoldPenalty, HERO_REVIVE.endlessGoldMinimum);
  }

  /** What "立即下一波" would pay right now — 0 outside endless mode, mid-wave,
   * below the minimum remaining-seconds floor, or once already claimed for
   * the upcoming wave. Purely a read: never mutates or claims anything. */
  previewEarlyWaveReward(): number {
    return this.earlyReward.preview(this._mode);
  }

  /**
   * Calls the next wave early. In endless mode this also pays out the gold
   * the remaining prep time was worth, exactly once per prep/intermission
   * phase — stage mode keeps the same button but never reads this reward.
   */
  callNextWaveEarly(): number {
    return this.earlyReward.claim(this._mode);
  }

  /** Endless offers a three-choice upgrade after every tenth wave. */
  onWaveCleared(wave: number): UpgradeDefinition[] | null {
    if (!this.rules.offersRunUpgrades) return null;
    if (wave % ENDLESS_SCALING.lanesEveryWaves !== 0) return null;
    if (this.pendingUpgradeWave === wave) return null;
    this.pendingUpgradeWave = wave;
    const choices = this.upgrades.roll(3);
    return choices.length > 0 ? choices : null;
  }

  onAllWavesCleared(): void {
    if (this._mode === "stage") this.finish(true);
  }

  private finish(victory: boolean): void {
    if (this._over) return;
    this._over = true;
    this._victory = victory;
    this.deps.events.emit("gameOver", {
      victory,
      mode: this._mode,
      wave: this.deps.waves.currentWave,
      kills: this._kills,
      seconds: this._elapsed,
    });
  }
}
