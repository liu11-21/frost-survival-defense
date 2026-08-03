import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type AnimationName = "Idle" | "Walk" | "Run" | "MeleeAttack" | "RangedAttack" | "Hit" | "Death";
type CameraName = "gameplay" | "front" | "left-side" | "back" | "three-quarter" | "close-up";
type LodName = 0 | 1 | 2;

interface ReviewState {
  ready: boolean;
  modelSource: "GLB" | "procedural";
  currentCamera: string;
  currentAnimation: string;
  currentLod: "LOD0" | "LOD1" | "LOD2";
  authoredVisibleMeshes: number;
  proceduralVisibleMeshes: number;
  visibleVertices: number;
  visibleTriangles: number;
  heroWorldPosition: { x: number; y: number; z: number };
  heroScreenBounds: { x: number; y: number; width: number; height: number; visible: boolean };
  animationGroups: string[];
  consoleErrors: string[];
  uiOccluded: boolean;
}

interface ReviewApi {
  setCamera(camera: CameraName): void;
  setAnimation(animation: AnimationName): void;
  setLod(lod: LodName): void;
  resetPerformance(): void;
  capture(): Record<string, unknown> | null;
}

interface ReviewWindow extends Window {
  __heroReviewState?: ReviewState;
  frostbound?: {
    api(): { heroReview?: ReviewApi };
  };
}

const requiredAnimations: readonly AnimationName[] = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const outputRoot = resolve(process.cwd(), process.env.HERO_RUNTIME_OUTPUT ?? "reports/hero-runtime-ci");

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readReviewState(page: import("@playwright/test").Page): Promise<{ state: ReviewState | null; capture: Record<string, unknown> | null }> {
  return page.evaluate(() => {
    const reviewWindow = window as ReviewWindow;
    const review = reviewWindow.frostbound?.api().heroReview;
    return {
      state: reviewWindow.__heroReviewState ?? null,
      capture: review?.capture() ?? null,
    };
  });
}

function assertVisibleState(state: ReviewState | null, expected: { camera: CameraName; animation: AnimationName; lod: LodName }): asserts state is ReviewState {
  expect(state, "Hero review state should be published").not.toBeNull();
  if (!state) throw new Error("Hero review state should be published");
  expect(state.ready, "Hero review state should be ready").toBe(true);
  expect(state.modelSource).toBe("GLB");
  expect(state.authoredVisibleMeshes).toBeGreaterThan(0);
  expect(state.proceduralVisibleMeshes).toBe(0);
  expect(state.currentCamera).toBe(expected.camera);
  expect(state.currentAnimation).toBe(expected.animation);
  expect(state.currentLod).toBe(`LOD${expected.lod}`);
  const hasAnimation = (name: AnimationName): boolean =>
    state.animationGroups.some((group) => group === name || group.endsWith(`:${name}`));
  expect(requiredAnimations.every(hasAnimation), "All seven authored animation groups must be present").toBe(true);
  expect(state.uiOccluded).toBe(false);

  const bounds = state.heroScreenBounds;
  expect(bounds.visible).toBe(true);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1600);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
  expect(bounds.width).toBeGreaterThanOrEqual(64);
  expect(bounds.height).toBeGreaterThanOrEqual(135);
}

test("verifies the production Hero GLB in Babylon runtime", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(outputRoot, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const captures: Array<Record<string, unknown>> = [];
  const sequence: Array<Record<string, unknown>> = [];
  const result: Record<string, unknown> = {
    captureMode: "heroReview=1",
    url: "http://127.0.0.1:4173/?heroReview=1",
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

  const waitForState = async (expected: { camera: CameraName; animation: AnimationName; lod: LodName }): Promise<ReviewState> => {
    try {
      await page.waitForFunction(
        (target) => {
          const reviewWindow = window as ReviewWindow;
          const state = reviewWindow.__heroReviewState;
          return Boolean(
            document.getElementById("renderCanvas") instanceof HTMLCanvasElement &&
              state?.ready &&
              state.modelSource === "GLB" &&
              state.authoredVisibleMeshes > 0 &&
              state.proceduralVisibleMeshes === 0 &&
              state.currentCamera === target.camera &&
              state.currentAnimation === target.animation &&
              state.currentLod === `LOD${target.lod}`,
          );
        },
        expected,
        { timeout: 30_000 },
      );
    } catch (error) {
      const diagnostic = await readReviewState(page);
      throw new Error(`Hero review readiness timed out for ${JSON.stringify(expected)}; state=${JSON.stringify(diagnostic.state)}; cause=${String(error)}`);
    }
    const { state } = await readReviewState(page);
    assertVisibleState(state, expected);
    return state;
  };

  const selectReview = async (camera: CameraName, animation: AnimationName, lod: LodName): Promise<ReviewState> => {
    const commandAnimation = await page.evaluate((target) => {
      const review = (window as ReviewWindow).frostbound?.api().heroReview;
      if (!review) throw new Error("Hero review API is unavailable");
      review.setCamera(target.camera);
      review.setAnimation(target.animation);
      review.setLod(target.lod);
      review.resetPerformance();
      return review.capture()?.animation ?? null;
    }, { camera, animation, lod });
    expect(commandAnimation, `Hero review API did not accept animation ${animation}`).toBe(animation);
    return waitForState({ camera, animation, lod });
  };

  const capture = async (name: string, camera: CameraName, animation: AnimationName, lod: LodName): Promise<void> => {
    const state = await selectReview(camera, animation, lod);
    const frame = await readReviewState(page);
    const metadata = frame.capture;
    expect(metadata?.captureMode, `${name} must come from heroReview=1`).toBe("heroReview=1");
    expect(metadata?.cameraMode).toBe(camera);
    expect(metadata?.animation).toBe(animation);
    expect(metadata?.lod).toBe(lod);
    expect(metadata?.modelSource, `${name} must use the GLB runtime instance`).toBe("GLB");
    expect(metadata?.authoredVisibleMeshCount, `${name} must show authored meshes`).toBeGreaterThan(0);
    expect(metadata?.proceduralVisibleMeshCount, `${name} must not show procedural meshes`).toBe(0);
    expect(metadata?.uiOccluded, `${name} must not be covered by the review panel`).toBe(false);
    const screenshotPath = resolve(outputRoot, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const record = {
      captureId: name,
      capturedAt: new Date().toISOString(),
      screenshot: screenshotPath,
      camera,
      animation,
      lod: `LOD${lod}`,
      state,
      metadata,
    };
    captures.push(record);
  };

  try {
    await page.goto("http://127.0.0.1:4173/?heroReview=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForFunction(
      () => Boolean((window as ReviewWindow).__heroReviewState?.ready),
      { timeout: 90_000 },
    );

    await capture("hero-review-gameplay", "gameplay", "Idle", 0);
    await capture("hero-review-front", "front", "Idle", 0);
    await capture("hero-review-side", "left-side", "Idle", 0);
    await capture("hero-review-back", "back", "Idle", 0);
    await capture("hero-review-three-quarter", "three-quarter", "Idle", 0);
    await capture("hero-review-close-up", "close-up", "Idle", 0);

    for (const animation of requiredAnimations) {
      const name = animation === "MeleeAttack" ? "hero-review-melee" : animation === "RangedAttack" ? "hero-review-ranged" : animation === "Death" ? "hero-review-death" : `hero-review-animation-${slug(animation)}`;
      await capture(name, "three-quarter", animation, 0);
      for (let frame = 1; frame <= 3; frame += 1) {
        await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
        const state = await waitForState({ camera: "three-quarter", animation, lod: 0 });
        const frameCapture = await readReviewState(page);
        const sequenceName = `sequence-${String(sequence.length + 1).padStart(3, "0")}-${slug(animation)}-${frame}`;
        const screenshotPath = resolve(outputRoot, `${sequenceName}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        sequence.push({
          captureId: sequenceName,
          screenshot: screenshotPath,
          animation,
          state,
          metadata: frameCapture.capture,
        });
      }
    }

    await capture("hero-review-lod0", "front", "Idle", 0);
    await capture("hero-review-lod1", "front", "Idle", 1);
    await capture("hero-review-lod2", "front", "Idle", 2);

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
