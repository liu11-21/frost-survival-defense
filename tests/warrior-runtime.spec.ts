import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Camera = "gameplay" | "front" | "side" | "back" | "three-quarter" | "close-up";
type Animation = "Idle" | "Walk" | "Run" | "MeleeAttack" | "Hit" | "Death";
type Lod = 0 | 1 | 2;
interface WarriorState {
  ready: boolean;
  modelSource: "GLB" | "procedural";
  currentCamera: string;
  currentAnimation: string;
  currentLod: string;
  authoredVisibleMeshes: number;
  proceduralVisibleMeshes: number;
  animationGroups: string[];
  heroScreenBounds: { x: number; y: number; width: number; height: number; right: number; bottom: number; visible: boolean };
  visible: boolean;
  uiOccluded: boolean;
}
interface WarriorApi {
  setCamera(camera: Camera): void;
  setAnimation(animation: Animation): void;
  seekAnimation(normalized: number): void;
  setLod(lod: Lod): void;
  setAutoLod(enabled?: boolean): void;
  capture(): Record<string, unknown> | null;
  state(): WarriorState | null;
}
interface ReviewWindow extends Window {
  __warriorReviewState?: WarriorState;
  frostbound?: { api(): { warriorReview?: WarriorApi }; stopLoop(): void; step(dt: number, frames?: number, render?: boolean): void };
}

const outputRoot = resolve(process.cwd(), process.env.WARRIOR_RUNTIME_OUTPUT ?? ".runtime/warrior-runtime");
const evidenceRoot = resolve(process.cwd(), "reports/warrior-production-w1");
const animations: readonly Animation[] = ["Idle", "Walk", "Run", "MeleeAttack", "Hit", "Death"];
const cameras: readonly Camera[] = ["gameplay", "front", "side", "back", "three-quarter", "close-up"];

test("verifies Warrior GLB review mode and normalized animation evidence", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(outputRoot, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const samples: Array<Record<string, unknown>> = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`); });

  await page.goto("http://127.0.0.1:4173/?unitReview=warrior", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).__warriorReviewState?.ready), { timeout: 90_000, polling: 100 });
  await page.evaluate(() => (window as ReviewWindow).frostbound?.stopLoop());
  const read = () => page.evaluate(() => {
    const w = window as ReviewWindow;
    return { state: w.__warriorReviewState ?? null, capture: w.frostbound?.api().warriorReview?.capture() ?? null };
  });
  const select = async (camera: Camera, animation: Animation, lod: Lod, normalized = 0.5) => {
    await page.evaluate(({ camera, animation, lod, normalized }) => {
      const api = (window as ReviewWindow).frostbound?.api().warriorReview;
      if (!api) throw new Error("Warrior review API unavailable");
      api.setCamera(camera);
      api.setAnimation(animation);
      api.setLod(lod);
      api.seekAnimation(normalized);
      (window as ReviewWindow).frostbound?.step(0, 1, true);
    }, { camera, animation, lod, normalized });
    const frame = await read();
    expect(frame.state?.ready).toBe(true);
    expect(frame.state?.modelSource).toBe("GLB");
    expect(frame.state?.authoredVisibleMeshes).toBeGreaterThan(0);
    expect(frame.state?.proceduralVisibleMeshes).toBe(0);
    expect(frame.state?.currentCamera).toBe(camera);
    expect(frame.state?.currentAnimation).toBe(animation);
    expect(frame.state?.currentLod).toBe(`LOD${lod}`);
    expect(frame.state?.visible).toBe(true);
    expect(frame.state?.uiOccluded).toBe(false);
    expect(frame.state?.heroScreenBounds.width).toBeGreaterThan(36);
    expect(frame.state?.heroScreenBounds.height).toBeGreaterThan(90);
    samples.push({ camera, animation, lod: `LOD${lod}`, normalized, state: frame.state, metadata: frame.capture });
  };

  const captureEvidence = async (name: string) => {
    mkdirSync(evidenceRoot, { recursive: true });
    await page.screenshot({ path: resolve(evidenceRoot, name), fullPage: false });
  };

  for (const camera of cameras) {
    await select(camera, "Idle", 0, 0);
    const evidenceName: Partial<Record<Camera, string>> = {
      gameplay: "warrior-gameplay.png",
      front: "warrior-front.png",
      side: "warrior-side.png",
      back: "warrior-back.png",
      "three-quarter": "warrior-three-quarter.png",
    };
    if (evidenceName[camera]) await captureEvidence(evidenceName[camera]!);
  }
  for (const animation of animations) {
    for (const normalized of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      await select("three-quarter", animation, 0, normalized);
      if (animation === "MeleeAttack" && normalized === 0.6) await captureEvidence("warrior-melee-impact.png");
      if (animation === "Death" && normalized === 0.8) await captureEvidence("warrior-death.png");
    }
  }
  await select("front", "Idle", 1, 0.5);
  await select("front", "Idle", 2, 0.5);
  expect(samples.filter((sample) => sample.lod === "LOD0").length).toBeGreaterThanOrEqual(42);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  writeFileSync(resolve(outputRoot, "runtime-result.json"), `${JSON.stringify({ passed: true, sampleCount: samples.length, samples, consoleErrors, pageErrors, requestFailures }, null, 2)}\n`, "utf8");
  await page.screenshot({ path: resolve(outputRoot, "warrior-front.png"), fullPage: false });
});

test("loads three Warrior squads from the authored GLB path", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown> | undefined;
    return Boolean((api?.assetsReady as (() => boolean) | undefined)?.() && (api?.assetStatus as ((key: string) => { loaded: boolean }) | undefined)?.("warrior")?.loaded);
  }, { timeout: 90_000, polling: 100 });
  const result = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.grant as (wood: number, stone: number, gold: number) => void)?.(0, 0, 1000);
    (api.startStage as (id: string) => void)?.("stage-1");
    const spawn = api.spawnAlly as (id: string, x: number, z: number) => unknown;
    spawn("warrior", -2, 0);
    spawn("warrior", 0, 0);
    spawn("warrior", 2, 0);
    const units = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    return { units, squadSummary: (api.squadSummary as () => unknown)() };
  });
  expect(result.units).toHaveLength(9);
  expect(result.units.every((unit) => unit.modelSource === "GLB")).toBe(true);
  expect(result.units.every((unit) => unit.proceduralVisibleMeshCount === 0)).toBe(true);
  expect(result.units.every((unit) => unit.authoredVisibleMeshCount > 0)).toBe(true);
  await page.screenshot({ path: resolve(evidenceRoot, "warrior-squad.png"), fullPage: false });
});

test("records the development Warrior pressure context", async ({ page }) => {
  test.setTimeout(180_000);
  const output = resolve(process.cwd(), process.env.WARRIOR_RUNTIME_OUTPUT ?? ".runtime/warrior-runtime");
  mkdirSync(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`); });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown> | undefined;
    return Boolean((api?.assetsReady as (() => boolean) | undefined)?.() && (api?.assetStatus as ((key: string) => { loaded: boolean }) | undefined)?.("warrior")?.loaded);
  }, { timeout: 90_000, polling: 100 });
  const result = await page.evaluate(() => {
    const w = window as ReviewWindow;
    const api = w.frostbound?.api() as Record<string, unknown>;
    const spawnAlly = api.spawnAlly as (id: string, x: number, z: number) => unknown;
    const spawnEnemy = api.spawnEnemy as (id: string, x: number, z: number) => unknown;
    (api.startStage as (id: string) => void)("stage-1");
    for (const x of [-3, 0, 3]) spawnAlly("warrior", x, 0);
    for (const x of [-6, -2, 2, 6]) spawnEnemy("grunt", x, 8);
    w.frostbound?.step(0.016, 30, true);
    const warriorUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    const gruntUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt");
    return {
      hero: true,
      warriorCount: warriorUnits.length,
      gruntCount: gruntUnits.length,
      warriorGlbCount: warriorUnits.filter((unit) => unit.modelSource === "GLB").length,
      warriorProceduralVisible: warriorUnits.reduce((sum, unit) => sum + Number(unit.proceduralVisibleMeshCount ?? 0), 0),
      warriorLodDistribution: warriorUnits.reduce((distribution, unit) => {
        const lod = String(unit.currentLod ?? "LOD0");
        distribution[lod] = (distribution[lod] ?? 0) + 1;
        return distribution;
      }, {} as Record<string, number>),
      glbInstanceCount: warriorUnits.filter((unit) => unit.modelSource === "GLB").length,
      squadSummary: (api.squadSummary as () => unknown)(),
      unitCounts: (api.unitCounts as () => unknown)(),
      perf: (api.perf as () => unknown)(),
      snapshot: w.frostbound?.snapshot(),
    };
  });
  expect(result.warriorCount).toBe(9);
  expect(result.gruntCount).toBe(12);
  expect(result.warriorGlbCount).toBe(9);
  expect(result.warriorProceduralVisible).toBe(0);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  writeFileSync(resolve(output, "pressure-result.json"), `${JSON.stringify({ ...result, consoleErrors, pageErrors, requestFailures }, null, 2)}\n`, "utf8");
});
