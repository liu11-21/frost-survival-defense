import type { AIWatchdog } from "../ai/AIWatchdog";
import type { DeathResidueGuard } from "../ai/DeathResidueGuard";
import { renderAiDebugPanel, type AiFilterTab } from "./AIDebugPanelView";
import type { BuildingManager } from "../buildings/BuildingManager";
import type { CombatWorld } from "../combat/CombatWorld";
import type { SquadManager } from "../combat/SquadManager";
import type { FactionMarkers } from "../effects/FactionMarkers";
import type { WaveManager } from "../enemies/WaveManager";
import type { RunController } from "../modes/RunController";
import type { AdaptiveQualityManager } from "../performance/AdaptiveQualityManager";
import type { PerformanceMonitor } from "../performance/PerformanceMonitor";
import { formatReportText } from "../performance/PerformanceSnapshot";
import { STRESS_PRESETS, type StressTestController } from "../performance/StressTestController";
import { renderBalancePanel } from "./BalancePanelView";
import type { HealthBarManager } from "./HealthBarManager";
import { renderVerifyPanel } from "./VerifyPanel";
import type { HeroController } from "../hero/HeroController";

export interface DebugDeps {
  monitor: PerformanceMonitor;
  quality: AdaptiveQualityManager;
  stress: StressTestController;
  watchdog: AIWatchdog;
  residueGuard: DeathResidueGuard;
  squads: SquadManager;
  balance: BalanceKnobs;
  onBalanceAction: (action: string) => void;
  world: CombatWorld;
  buildings: BuildingManager;
  healthBars: HealthBarManager;
  hero: HeroController;
  markers: FactionMarkers;
  waves: WaveManager;
  run: RunController;
  /** Called the first time the verification panel opens; marks the run untracked. */
  onVerifyOpened: () => void;
}

/** Live multipliers the balance tool writes and the run reads. */
export interface BalanceKnobs {
  enemyHealth: number;
  enemyAttack: number;
  enemyCount: number;
  goldDrop: number;
  production: number;
  wallHealth: number;
  towerDamage: number;
  squadHealth: number;
  squadDamage: number;
  bossHealth: number;
  bossSlamCooldown: number;
  /** True once any knob has been touched; the run may not be ranked. */
  dirty: boolean;
}

export function defaultBalanceKnobs(): BalanceKnobs {
  return {
    enemyHealth: 1,
    enemyAttack: 1,
    enemyCount: 1,
    goldDrop: 1,
    production: 1,
    wallHealth: 1,
    towerDamage: 1,
    squadHealth: 1,
    squadDamage: 1,
    bossHealth: 1,
    bossSlamCooldown: 1,
    dirty: false,
  };
}

const PANEL_CSS_CLASS = "debug-panel";

/**
 * The three developer overlays: F3 performance, F7 AI inspection, F9 balance.
 * All are hidden by default and none of them exist in the normal HUD.
 */
export class DebugPanels {
  private readonly perf: HTMLElement;
  private readonly ai: HTMLElement;
  private readonly balance: HTMLElement;
  private readonly verify: HTMLElement;
  private perfOpen = false;
  private aiOpen = false;
  private activeAiTab: AiFilterTab = "all";
  private balanceOpen = false;
  private verifyOpen = false;
  private refresh = 0;

  constructor(
    root: HTMLElement,
    private readonly deps: DebugDeps,
  ) {
    this.perf = makePanel(root, "debug-perf", "right");
    this.ai = makePanel(root, "debug-ai", "left");
    this.balance = makePanel(root, "debug-balance", "right");
    this.verify = makePanel(root, "debug-verify", "center");
  }

  get anyOpen(): boolean {
    return this.perfOpen || this.aiOpen || this.balanceOpen || this.verifyOpen;
  }

  toggleVerify(): void {
    this.verifyOpen = !this.verifyOpen;
    this.verify.classList.toggle("show", this.verifyOpen);
    if (this.verifyOpen) {
      this.deps.onVerifyOpened();
      this.renderVerify();
    }
  }

  get isVerifyOpen(): boolean {
    return this.verifyOpen;
  }

  togglePerf(): void {
    this.perfOpen = !this.perfOpen;
    this.perf.classList.toggle("show", this.perfOpen);
    if (this.perfOpen) this.renderPerf();
  }

  toggleAi(): void {
    this.aiOpen = !this.aiOpen;
    this.ai.classList.toggle("show", this.aiOpen);
    if (this.aiOpen) this.renderAi();
  }

  toggleBalance(): void {
    this.balanceOpen = !this.balanceOpen;
    this.balance.classList.toggle("show", this.balanceOpen);
    if (this.balanceOpen) this.renderBalance();
  }

  openStress(): void {
    if (!this.perfOpen) this.togglePerf();
    this.renderPerf();
  }

  update(dt: number): void {
    if (!this.anyOpen) return;
    this.refresh -= dt;
    if (this.refresh > 0) return;
    this.refresh = 0.25;
    if (this.perfOpen) this.renderPerf();
    if (this.aiOpen) this.renderAi();
    if (this.verifyOpen) this.renderVerify();
  }

  private renderVerify(): void {
    this.verify.innerHTML = renderVerifyPanel(this.deps);
  }

  private renderPerf(): void {
    const s = this.deps.monitor.snapshot;
    const gpu = this.deps.monitor.gpu;
    const stress = this.deps.stress;

    this.perf.innerHTML = `
      <div class="dbg-title">效能監測 (F3)</div>
      <div class="dbg-grid">
        <span>FPS</span><b>${s.fps.toFixed(1)}</b>
        <span>5 秒平均</span><b>${s.avgFps5s.toFixed(1)}</b>
        <span>30 秒平均</span><b>${s.avgFps30s.toFixed(1)}</b>
        <span>1% low</span><b>${s.lowFps1pct.toFixed(1)}</b>
        <span>模擬</span><b>${s.simulationMs.toFixed(2)} ms</b>
        <span>渲染</span><b>${s.renderMs.toFixed(2)} ms</b>
        <span>總 frame</span><b>${s.frameMs.toFixed(2)} ms</b>
        <span>draw calls</span><b>${s.drawCalls}</b>
        <span>active meshes</span><b>${s.activeMeshes}</b>
        <span>頂點數</span><b>${s.totalVertices}</b>
        <span>單位</span><b>${s.totalUnits} (友 ${s.allies} / 敵 ${s.enemies})</b>
        <span>投射物</span><b>${s.projectiles}</b>
        <span>拾取物</span><b>${s.pickups}</b>
        <span>粒子</span><b>${s.particles}</b>
        <span>畫質</span><b>${s.qualityLevel} (scale ${s.hardwareScaling})</b>
        <span>解析度</span><b>${s.canvasWidth}x${s.canvasHeight} / CSS ${s.cssWidth}x${s.cssHeight}</b>
      </div>
      <div class="dbg-title">GPU</div>
      <div class="dbg-note">${escapeHtml(gpu.renderer)}</div>
      <div class="dbg-note">${escapeHtml(gpu.vendor)}</div>
      ${gpu.softwareRendering ? '<div class="dbg-warn">疑似軟體渲染，效能會明顯降低。</div>' : ""}
      ${gpu.detailAvailable ? "" : '<div class="dbg-note">瀏覽器未提供完整 GPU 名稱。</div>'}
      <div class="dbg-title">壓力測試 (F8)</div>
      <div class="dbg-row" id="dbg-stress-row"></div>
      <div class="dbg-row">
        <button data-act="stopStress">停止</button>
        <button data-act="clearStress">清除單位</button>
        <button data-act="export">匯出報告</button>
      </div>
      ${stress.isRunning ? `<div class="dbg-note">測試中 ${stress.recordingElapsed.toFixed(1)} / 30 秒 · ${stress.targetUnits} 單位</div>` : ""}
      ${this.deps.monitor.isStressTagged ? '<div class="dbg-warn">本局已使用測試工具，不會寫入排行榜。</div>' : ""}
      <div class="dbg-title">畫質</div>
      <div class="dbg-row" id="dbg-quality-row"></div>
      <pre class="dbg-out" id="dbg-report"></pre>
    `;

    const stressRow = this.perf.querySelector("#dbg-stress-row");
    if (stressRow) {
      for (const preset of STRESS_PRESETS) {
        const btn = document.createElement("button");
        btn.textContent = String(preset);
        btn.addEventListener("click", () => {
          this.deps.stress.start(preset);
          this.renderPerf();
        });
        stressRow.appendChild(btn);
      }
    }

    const qualityRow = this.perf.querySelector("#dbg-quality-row");
    if (qualityRow) {
      for (const level of ["auto", "low", "medium", "high"] as const) {
        const btn = document.createElement("button");
        btn.textContent = level;
        if (this.deps.quality.currentSetting === level) btn.classList.add("on");
        btn.addEventListener("click", () => {
          this.deps.quality.setSetting(level);
          this.renderPerf();
        });
        qualityRow.appendChild(btn);
      }
    }

    this.perf.querySelector('[data-act="stopStress"]')?.addEventListener("click", () => {
      this.deps.stress.stop();
      this.renderPerf();
    });
    this.perf.querySelector('[data-act="clearStress"]')?.addEventListener("click", () => {
      this.deps.stress.clearUnits();
      this.renderPerf();
    });
    this.perf.querySelector('[data-act="export"]')?.addEventListener("click", () => {
      const report = this.deps.monitor.buildReport(this.deps.quality.current);
      const out = this.perf.querySelector<HTMLElement>("#dbg-report");
      if (out) out.textContent = formatReportText(report);
      void navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).catch(() => {
        // Clipboard may be blocked; the text output above is the fallback.
      });
    });
  }

  private renderAi(): void {
    const { html, attach } = renderAiDebugPanel(this.deps.squads, this.deps.watchdog, this.deps.residueGuard, this.activeAiTab);
    this.ai.innerHTML = html;

    this.ai.querySelectorAll<HTMLButtonElement>("button[data-ai-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeAiTab = btn.dataset.aiTab as AiFilterTab;
        this.renderAi();
      });
    });
    attach(this.ai, (unitId) => {
      this.deps.squads.eachAlly((u) => {
        if (u.damageId === unitId) u.aiBrain?.forceReacquire("manual-single");
      });
      this.renderAi();
    });
    this.ai.querySelector('[data-act="reacquireAll"]')?.addEventListener("click", () => {
      this.deps.squads.eachAlly((u) => u.aiBrain?.forceReacquire("manual"));
      this.renderAi();
    });
    this.ai.querySelector('[data-act="formationAll"]')?.addEventListener("click", () => {
      this.deps.squads.eachAlly((u) => u.aiBrain?.onWaveBoundary());
      this.renderAi();
    });
    this.ai.querySelector('[data-act="recheckRegistration"]')?.addEventListener("click", () => {
      this.deps.watchdog.checkRegistrationNow();
      this.renderAi();
    });
    this.ai.querySelector('[data-act="cleanResidue"]')?.addEventListener("click", () => {
      this.deps.residueGuard.sweepNow();
      this.renderAi();
    });
  }

  private renderBalance(): void {
    renderBalancePanel(this.balance, this.deps, () => this.renderBalance());
  }
}

function makePanel(root: HTMLElement, id: string, side: "left" | "right" | "center"): HTMLElement {
  const el = document.createElement("div");
  el.id = id;
  el.className = `${PANEL_CSS_CLASS} ${side}`;
  root.appendChild(el);
  return el;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
