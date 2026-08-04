import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type AnimationName = "Idle" | "Walk" | "Run" | "MeleeAttack" | "RangedAttack" | "Hit" | "Death";
type CameraName = "gameplay" | "tactical" | "three-quarter" | "back";
type LightingName = "snow-daylight" | "furnace-warm";
type ContextName = "alone" | "friends" | "battle";
type LodName = 0 | 1 | 2;

interface GameplayState {
  ready: boolean;
  captureMode: "heroGameplayReview=1";
  modelSource: "GLB" | "procedural";
  currentCamera: CameraName;
  currentAnimation: AnimationName;
  currentLod: "LOD0" | "LOD1" | "LOD2";
  lighting: LightingName;
  context: ContextName;
  lod: LodName;
  lodMode: "auto" | "forced";
  authoredVisibleMeshes: number;
  proceduralVisibleMeshes: number;
  allyCount: number;
  enemyCount: number;
  animationGroups: string[];
  heroScreenBounds: { x: number; y: number; width: number; height: number; right: number; bottom: number; visible: boolean };
  heroWorldPosition: { x: number; y: number; z: number };
  uiOccluded: boolean;
}

interface GameplayApi {
  setCamera(camera: CameraName): void;
  setLighting(lighting: LightingName): void;
  setContext(context: ContextName): void;
  setAnimation(animation: AnimationName): void;
  setLod(lod: LodName): void;
  setAutoLod(enabled?: boolean): void;
  capture(): Record<string, unknown> | null;
}

interface GameplayWindow extends Window {
  __heroGameplayReviewState?: GameplayState;
  frostbound?: {
    api(): { heroGameplayReview?: GameplayApi };
    step(dt: number, frames?: number, render?: boolean): void;
    stopLoop(): void;
  };
}

const animations: readonly AnimationName[] = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const outputRoot = resolve(process.cwd(), process.env.HERO_GAMEPLAY_OUTPUT ?? "reports/art-previews/hero-commercial-r6/R6-E");

function readState(page: import("@playwright/test").Page): Promise<{ state: GameplayState | null; capture: Record<string, unknown> | null }> {
  return page.evaluate(() => {
    const reviewWindow = window as GameplayWindow;
    const review = reviewWindow.frostbound?.api().heroGameplayReview;
    return { state: reviewWindow.__heroGameplayReviewState ?? null, capture: review?.capture() ?? null };
  });
}

function validateState(state: GameplayState | null, expected: { camera: CameraName; lighting: LightingName; context: ContextName; animation: AnimationName }): asserts state is GameplayState {
  expect(state, "Hero gameplay review state should be published").not.toBeNull();
  if (!state) throw new Error("Hero gameplay review state should be published");
  expect(state.ready).toBe(true);
  expect(state.captureMode).toBe("heroGameplayReview=1");
  expect(state.modelSource).toBe("GLB");
  expect(state.authoredVisibleMeshes).toBeGreaterThan(0);
  expect(state.proceduralVisibleMeshes).toBe(0);
  expect(state.allyCount).toBeGreaterThanOrEqual(4);
  expect(state.enemyCount).toBeGreaterThanOrEqual(4);
  expect(state.currentCamera).toBe(expected.camera);
  expect(state.lighting).toBe(expected.lighting);
  expect(state.context).toBe(expected.context);
  expect(state.currentAnimation).toBe(expected.animation);
  expect(animations.every((name) => state.animationGroups.some((group) => group === name || group.endsWith(`:${name}`)))).toBe(true);
  expect(state.uiOccluded).toBe(false);
  expect(state.heroScreenBounds.visible).toBe(true);
  expect(state.heroScreenBounds.x).toBeGreaterThanOrEqual(0);
  expect(state.heroScreenBounds.y).toBeGreaterThanOrEqual(0);
  expect(state.heroScreenBounds.right).toBeLessThanOrEqual(1600);
  expect(state.heroScreenBounds.bottom).toBeLessThanOrEqual(900);
  expect(state.heroScreenBounds.width).toBeGreaterThanOrEqual(64);
  expect(state.heroScreenBounds.height).toBeGreaterThanOrEqual(135);
}

test("verifies Hero in the formal snow, furnace, ally and enemy gameplay context", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(outputRoot, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const captures: Array<Record<string, unknown>> = [];
  const sequence: Array<Record<string, unknown>> = [];
  const result: Record<string, unknown> = {
    captureMode: "heroGameplayReview=1",
    url: "http://127.0.0.1:4173/?heroGameplayReview=1",
    viewport: { width: 1600, height: 900, deviceScaleFactor: 1 },
    passed: false,
    captures,
    sequence,
    consoleErrors,
    pageErrors,
    requestFailures,
  };

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });

  const waitForState = async (expected: { camera: CameraName; lighting: LightingName; context: ContextName; animation: AnimationName }): Promise<GameplayState> => {
    try {
      await page.waitForFunction(
        (target) => {
          const reviewWindow = window as GameplayWindow;
          const state = reviewWindow.__heroGameplayReviewState;
          return Boolean(
            document.getElementById("renderCanvas") instanceof HTMLCanvasElement &&
              state?.ready &&
              state.modelSource === "GLB" &&
              state.currentCamera === target.camera &&
              state.lighting === target.lighting &&
              state.context === target.context &&
              state.currentAnimation === target.animation,
          );
        },
        expected,
        { polling: 100, timeout: 30_000 },
      );
    } catch (error) {
      const diagnostic = await readState(page);
      throw new Error(`Hero gameplay review readiness timed out for ${JSON.stringify(expected)}; state=${JSON.stringify(diagnostic.state)}; cause=${String(error)}`);
    }
    const { state } = await readState(page);
    validateState(state, expected);
    return state;
  };

  const selectReview = async (camera: CameraName, lighting: LightingName, context: ContextName, animation: AnimationName): Promise<GameplayState> => {
    await page.evaluate((target) => {
      const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
      if (!review) throw new Error("Hero gameplay review API is unavailable");
      review.setCamera(target.camera);
      review.setLighting(target.lighting);
      review.setContext(target.context);
      review.setAnimation(target.animation);
      (window as GameplayWindow).frostbound?.step(0.016, 4, true);
    }, { camera, lighting, context, animation });
    return waitForState({ camera, lighting, context, animation });
  };

  const capture = async (name: string, camera: CameraName, lighting: LightingName, context: ContextName, animation: AnimationName): Promise<GameplayState> => {
    const state = await selectReview(camera, lighting, context, animation);
    const frame = await readState(page);
    expect(frame.capture?.captureMode, `${name} must come from heroGameplayReview=1`).toBe("heroGameplayReview=1");
    expect(frame.capture?.modelSource, `${name} must use the GLB runtime instance`).toBe("GLB");
    expect(frame.capture?.uiOccluded, `${name} must not be covered by the review panel`).toBe(false);
    const screenshotPath = resolve(outputRoot, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    captures.push({ captureId: name, capturedAt: new Date().toISOString(), screenshot: screenshotPath, state, metadata: frame.capture });
    return state;
  };

  try {
    await page.goto("http://127.0.0.1:4173/?heroGameplayReview=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForFunction(() => Boolean((window as GameplayWindow).__heroGameplayReviewState?.ready), { timeout: 90_000 });
    await page.evaluate(() => (window as GameplayWindow).frostbound?.stopLoop());

    await capture("hero-gameplay-alone", "gameplay", "snow-daylight", "alone", "Idle");
    await capture("hero-gameplay-friends", "gameplay", "snow-daylight", "friends", "Idle");
    await capture("hero-gameplay-battle", "gameplay", "snow-daylight", "battle", "Idle");
    await capture("hero-gameplay-snow", "gameplay", "snow-daylight", "battle", "Idle");
    await capture("hero-gameplay-furnace", "gameplay", "furnace-warm", "battle", "Idle");
    await capture("hero-gameplay-back", "back", "snow-daylight", "battle", "Idle");
    await capture("hero-gameplay-tactical", "tactical", "snow-daylight", "battle", "Idle");
    await capture("hero-gameplay-walk", "gameplay", "snow-daylight", "battle", "Walk");
    await capture("hero-gameplay-run", "gameplay", "snow-daylight", "battle", "Run");
    await capture("hero-gameplay-melee", "gameplay", "snow-daylight", "battle", "MeleeAttack");
    await capture("hero-gameplay-ranged", "gameplay", "snow-daylight", "battle", "RangedAttack");
    await capture("hero-gameplay-death", "gameplay", "snow-daylight", "battle", "Death");

    for (const lod of [0, 1, 2] as const) {
      await page.evaluate((target) => {
        const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
        if (!review) throw new Error("Hero gameplay review API is unavailable");
        review.setLod(target);
        (window as GameplayWindow).frostbound?.step(0.016, 3, true);
      }, lod);
      const state = await waitForState({ camera: "tactical", lighting: "snow-daylight", context: "battle", animation: "Death" });
      expect(state.currentLod).toBe(`LOD${lod}`);
      const screenshotPath = resolve(outputRoot, `hero-gameplay-lod${lod}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      captures.push({ captureId: `hero-gameplay-lod${lod}`, screenshot: screenshotPath, state, metadata: (await readState(page)).capture });
    }

    await page.evaluate(() => {
      const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
      if (!review) throw new Error("Hero gameplay review API is unavailable");
      review.setAutoLod(true);
      review.setAnimation("Idle");
    });
    const automaticLod: Array<Record<string, unknown>> = [];
    for (const camera of ["three-quarter", "gameplay", "tactical"] as const) {
      await page.evaluate((target) => {
        const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
        if (!review) throw new Error("Hero gameplay review API is unavailable");
        review.setCamera(target);
        (window as GameplayWindow).frostbound?.step(0.016, 4, true);
      }, camera);
      await page.waitForFunction((target) => (window as GameplayWindow).__heroGameplayReviewState?.currentCamera === target && (window as GameplayWindow).__heroGameplayReviewState?.lodMode === "auto", camera, { timeout: 10_000 });
      const frame = await readState(page);
      validateState(frame.state, { camera, lighting: "snow-daylight", context: "battle", animation: "Idle" });
      automaticLod.push({ camera, state: frame.state, metadata: frame.capture });
    }
    writeFileSync(resolve(outputRoot, "lod-automatic-sequence.json"), `${JSON.stringify(automaticLod, null, 2)}\n`, "utf8");

    for (const animation of ["Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"] as const) {
      await selectReview("three-quarter", "snow-daylight", "battle", animation);
      for (let frameIndex = 1; frameIndex <= 3; frameIndex += 1) {
        await page.evaluate(() => (window as GameplayWindow).frostbound?.step(0.016, 1, true));
        const state = await waitForState({ camera: "three-quarter", lighting: "snow-daylight", context: "battle", animation });
        const frame = await readState(page);
        const name = `sequence-${String(sequence.length + 1).padStart(3, "0")}-${animation.toLowerCase()}-${frameIndex}`;
        const screenshotPath = resolve(outputRoot, `${name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        sequence.push({ captureId: name, screenshot: screenshotPath, animation, state, metadata: frame.capture });
      }
    }

    if (consoleErrors.length > 0 || pageErrors.length > 0 || requestFailures.length > 0) {
      throw new Error(`Browser errors detected: ${JSON.stringify({ consoleErrors, pageErrors, requestFailures })}`);
    }
    result.passed = true;
  } finally {
    result.finishedAt = new Date().toISOString();
    writeFileSync(resolve(outputRoot, "runtime-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    writeFileSync(resolve(outputRoot, "console.log"), `${JSON.stringify({ consoleErrors, pageErrors, requestFailures }, null, 2)}\n`, "utf8");
  }
});
