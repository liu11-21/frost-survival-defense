import type { GpuInfo } from "./GpuDetector";

/** One instant of measured state. Everything here is observed, never estimated. */
export interface PerformanceSnapshot {
  fps: number;
  avgFps5s: number;
  avgFps30s: number;
  /** Approximate 1% low over the retained window. */
  lowFps1pct: number;
  simulationMs: number;
  renderMs: number;
  frameMs: number;

  allies: number;
  enemies: number;
  totalUnits: number;
  projectiles: number;
  pickups: number;
  particles: number;

  drawCalls: number;
  activeMeshes: number;
  totalVertices: number;

  hardwareScaling: number;
  qualityLevel: string;
  canvasWidth: number;
  canvasHeight: number;
  cssWidth: number;
  cssHeight: number;
}

export interface PerformanceReport {
  date: string;
  browser: string;
  gpu: GpuInfo;
  displayResolution: string;
  canvasResolution: string;
  quality: string;
  hardwareScaling: number;
  durationSeconds: number;
  avgFps: number;
  lowFps1pct: number;
  avgSimulationMs: number;
  avgRenderMs: number;
  avgFrameMs: number;
  maxUnits: number;
  maxProjectiles: number;
  avgDrawCalls: number;
  avgActiveMeshes: number;
  /** Set when the numbers came from a stress test rather than normal play. */
  stressTest: boolean;
  notes: string[];
}

export function emptySnapshot(): PerformanceSnapshot {
  return {
    fps: 0,
    avgFps5s: 0,
    avgFps30s: 0,
    lowFps1pct: 0,
    simulationMs: 0,
    renderMs: 0,
    frameMs: 0,
    allies: 0,
    enemies: 0,
    totalUnits: 0,
    projectiles: 0,
    pickups: 0,
    particles: 0,
    drawCalls: 0,
    activeMeshes: 0,
    totalVertices: 0,
    hardwareScaling: 1,
    qualityLevel: "high",
    canvasWidth: 0,
    canvasHeight: 0,
    cssWidth: 0,
    cssHeight: 0,
  };
}

export function formatReportText(report: PerformanceReport): string {
  const lines = [
    "=== Frostbound Furnace 效能報告 ===",
    `測試日期        ${report.date}`,
    `瀏覽器          ${report.browser}`,
    `GPU renderer    ${report.gpu.renderer}`,
    `GPU vendor      ${report.gpu.vendor}`,
    `GPU 名稱可讀    ${report.gpu.detailAvailable ? "是" : "否（瀏覽器未提供）"}`,
    `疑似軟體渲染    ${report.gpu.softwareRendering ? "是" : "否"}`,
    `顯示解析度      ${report.displayResolution}`,
    `Canvas 解析度   ${report.canvasResolution}`,
    `畫質設定        ${report.quality} (hardwareScaling ${report.hardwareScaling})`,
    `測試時間        ${report.durationSeconds.toFixed(1)} 秒`,
    `平均 FPS        ${report.avgFps.toFixed(1)}`,
    `1% low FPS      ${report.lowFps1pct.toFixed(1)}`,
    `模擬平均耗時    ${report.avgSimulationMs.toFixed(2)} ms`,
    `渲染平均耗時    ${report.avgRenderMs.toFixed(2)} ms`,
    `總 frame time   ${report.avgFrameMs.toFixed(2)} ms`,
    `最大同時單位    ${report.maxUnits}`,
    `最大投射物      ${report.maxProjectiles}`,
    `平均 draw calls ${report.avgDrawCalls.toFixed(0)}`,
    `平均 active mesh${report.avgActiveMeshes.toFixed(0)}`,
    `壓力測試        ${report.stressTest ? "是" : "否"}`,
  ];
  if (report.notes.length > 0) {
    lines.push("備註:");
    for (const note of report.notes) lines.push(`  - ${note}`);
  }
  return lines.join("\n");
}
