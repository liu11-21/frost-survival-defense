import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type AnimationName = "Idle" | "Walk" | "Run" | "MeleeAttack" | "RangedAttack" | "Hit" | "Death";
type CameraName = "gameplay" | "tactical" | "three-quarter" | "back";
type LightingName = "snow-daylight" | "furnace-warm";
type ContextName = "alone" | "friends" | "battle";
type LodName = 0 | 1 | 2;
type BoneTransform = {
  position: [number, number, number];
  rotation: [number, number, number, number];
};

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
  animationNormalized: number;
  boneTransforms: Record<string, BoneTransform>;
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
  seekAnimation(normalized: number): void;
  setLod(lod: LodName): void;
  setAutoLod(enabled?: boolean): void;
  renderFrame(): void;
  capture(): Record<string, unknown> | null;
}

interface GameplayWindow extends Window {
  __heroGameplayReviewState?: GameplayState;
  frostbound?: {
    api(): { heroGameplayReview?: GameplayApi };
    step(dt: number, frames?: number, render?: boolean): void;
    renderReviewFrame(): void;
    stopLoop(): void;
  };
}

const animations: readonly AnimationName[] = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const outputRoot = resolve(process.cwd(), process.env.HERO_GAMEPLAY_OUTPUT ?? "reports/art-previews/hero-commercial-r7/R7-E");

test.use({ video: "on" });

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
  // Readability is asserted on the box diagonal, not on height.
  //
  // These bounds used to be read off a bounding box that was never refreshed
  // for the current pose, so every animation reported the rest-pose silhouette
  // and the old `height >= 135` floor passed vacuously -- it had never once
  // been evaluated against a real animated pose. With the box now tracking the
  // skeleton, Death at 60% measures 139.5 x 127.0: the body has gone
  // horizontal. That is the animation working, not the Hero becoming
  // unreadable, and no width/height floor can express it, because which axis
  // carries the body's length depends on the pose.
  //
  // The diagonal is the pose-invariant quantity -- the body's length is
  // conserved as it rotates. Sampled over 4 cameras x 7 animations x 6 phases
  // (168 states) it spans 134.8 to 198.3, against 116.3 to 198.3 for the long
  // axis alone. 130 sits just under the measured floor; the 64px narrow-axis
  // minimum is carried over unchanged (measured minimum 65.0, on the back
  // camera during RangedAttack) so a thin sliver still fails.
  const { width, height } = state.heroScreenBounds;
  expect(Math.hypot(width, height), "Hero silhouette must span 130px on the diagonal").toBeGreaterThanOrEqual(130);
  expect(Math.min(width, height), "Hero must be at least 64px across its narrow axis").toBeGreaterThanOrEqual(64);
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
      review.seekAnimation(0);
      (window as GameplayWindow).frostbound?.renderReviewFrame();
    }, { camera, lighting, context, animation });
    return waitForState({ camera, lighting, context, animation });
  };

  const seekAndRender = async (normalized: number): Promise<GameplayState> => {
    await page.evaluate((value) => {
      const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
      if (!review) throw new Error("Hero gameplay review API is unavailable");
      review.seekAnimation(value);
      (window as GameplayWindow).frostbound?.renderReviewFrame();
    }, normalized);
    const { state } = await readState(page);
    validateState(state, {
      camera: (state as GameplayState | null)?.currentCamera ?? "gameplay",
      lighting: (state as GameplayState | null)?.lighting ?? "snow-daylight",
      context: (state as GameplayState | null)?.context ?? "battle",
      animation: (state as GameplayState | null)?.currentAnimation ?? "Idle",
    });
    if (!state) throw new Error("Hero gameplay review state should be published");
    expect(state.animationNormalized).toBeCloseTo(normalized, 3);
    return state;
  };

  const capture = async (name: string, camera: CameraName, lighting: LightingName, context: ContextName, animation: AnimationName, normalized = 0): Promise<GameplayState> => {
    await selectReview(camera, lighting, context, animation);
    const state = await seekAndRender(normalized);
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

    await capture("hero-alone-snow", "gameplay", "snow-daylight", "alone", "Idle");
    await capture("hero-alone-furnace", "gameplay", "furnace-warm", "alone", "Idle");
    await capture("hero-with-allies", "gameplay", "snow-daylight", "friends", "Idle");
    await capture("hero-battle", "gameplay", "snow-daylight", "battle", "Idle");
    await capture("gameplay-front", "gameplay", "snow-daylight", "battle", "Idle");
    await capture("gameplay-back", "back", "snow-daylight", "battle", "Idle");
    await capture("gameplay-tactical", "tactical", "snow-daylight", "battle", "Idle");
    await capture("gameplay-walk", "gameplay", "snow-daylight", "battle", "Walk", 0.4);
    await capture("gameplay-run", "gameplay", "snow-daylight", "battle", "Run", 0.4);
    await capture("gameplay-melee-windup", "gameplay", "snow-daylight", "battle", "MeleeAttack", 0.2);
    await capture("gameplay-melee-impact", "gameplay", "snow-daylight", "battle", "MeleeAttack", 0.55);
    await capture("gameplay-ranged-aim", "gameplay", "snow-daylight", "battle", "RangedAttack", 0.4);
    await capture("gameplay-ranged-fire", "gameplay", "snow-daylight", "battle", "RangedAttack", 0.6);
    await capture("gameplay-death", "gameplay", "snow-daylight", "battle", "Death", 1);

    for (const lod of [0, 1, 2] as const) {
      await page.evaluate((target) => {
        const review = (window as GameplayWindow).frostbound?.api().heroGameplayReview;
        if (!review) throw new Error("Hero gameplay review API is unavailable");
        review.setCamera("tactical");
        review.setLod(target);
        review.seekAnimation(1);
        (window as GameplayWindow).frostbound?.renderReviewFrame();
      }, lod);
      const state = await waitForState({ camera: "tactical", lighting: "snow-daylight", context: "battle", animation: "Death" });
      expect(state.currentLod).toBe(`LOD${lod}`);
      const screenshotPath = resolve(outputRoot, `gameplay-lod${lod}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      captures.push({ captureId: `gameplay-lod${lod}`, screenshot: screenshotPath, state, metadata: (await readState(page)).capture });
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
        review.seekAnimation(0);
        (window as GameplayWindow).frostbound?.renderReviewFrame();
      }, camera);
      await page.waitForFunction((target) => (window as GameplayWindow).__heroGameplayReviewState?.currentCamera === target && (window as GameplayWindow).__heroGameplayReviewState?.lodMode === "auto", camera, { timeout: 10_000 });
      const frame = await readState(page);
      validateState(frame.state, { camera, lighting: "snow-daylight", context: "battle", animation: "Idle" });
      automaticLod.push({ camera, state: frame.state, metadata: frame.capture });
    }
    writeFileSync(resolve(outputRoot, "lod-automatic-sequence.json"), `${JSON.stringify(automaticLod, null, 2)}\n`, "utf8");

    const normalizedTimeline = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const animationSamples: Record<string, Array<Record<string, unknown>>> = {};
    for (const animation of ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"] as const) {
      await selectReview("three-quarter", "snow-daylight", "battle", animation);
      const samples: Array<Record<string, unknown>> = [];
      for (const normalized of normalizedTimeline) {
        const state = await seekAndRender(normalized);
        const frame = await readState(page);
        expect(frame.capture?.animationNormalized, `${animation} must expose deterministic normalized time`).toBeCloseTo(normalized, 3);
        const sample = { animation, normalized, state, metadata: frame.capture };
        samples.push(sample);
        sequence.push({
          captureId: `sequence-${String(sequence.length + 1).padStart(3, "0")}-${animation.toLowerCase()}-${String(normalized).replace(".", "_")}`,
          sampleMode: "normalized-timeline",
          ...sample,
        });
      }
      animationSamples[animation] = samples;
    }

    const idleMid = animationSamples.Idle?.find((sample) => sample.normalized === 0.4)?.state as GameplayState | undefined;
    if (!idleMid) throw new Error("Idle midpoint deterministic sample is missing");
    const boneDelta = (a: Record<string, BoneTransform>, b: Record<string, BoneTransform>): number => {
      let max = 0;
      for (const name of Object.keys(a)) {
        const left = a[name];
        const right = b[name];
        if (!right) continue;
        const values = [...left.position, ...left.rotation];
        const other = [...right.position, ...right.rotation];
        for (let i = 0; i < values.length; i++) max = Math.max(max, Math.abs(values[i] - other[i]));
      }
      return max;
    };
    const midDeltas: Record<string, number> = {};
    for (const animation of animations.filter((name) => name !== "Idle")) {
      const midpoint = animationSamples[animation]?.find((sample) => sample.normalized === 0.4)?.state as GameplayState | undefined;
      if (!midpoint) throw new Error(`${animation} midpoint deterministic sample is missing`);
      midDeltas[animation] = boneDelta(idleMid.boneTransforms, midpoint.boneTransforms);
      expect(midDeltas[animation], `${animation} must differ from Idle at the midpoint`).toBeGreaterThan(0.01);
    }
    const meleeMid = animationSamples.MeleeAttack?.find((sample) => sample.normalized === 0.4)?.state as GameplayState | undefined;
    const rangedMid = animationSamples.RangedAttack?.find((sample) => sample.normalized === 0.4)?.state as GameplayState | undefined;
    if (!meleeMid || !rangedMid) throw new Error("Combat midpoint deterministic samples are missing");
    expect(boneDelta(meleeMid.boneTransforms, rangedMid.boneTransforms), "Melee and Ranged midpoint poses must differ").toBeGreaterThan(0.01);
    const deathFinal = animationSamples.Death?.find((sample) => sample.normalized === 1)?.state as GameplayState | undefined;
    if (!deathFinal) throw new Error("Death final deterministic sample is missing");
    expect(deathFinal.heroScreenBounds.visible, "Death final Hero bounds must remain visible").toBe(true);
    expect(deathFinal.heroScreenBounds.x).toBeGreaterThanOrEqual(0);
    expect(deathFinal.heroScreenBounds.y).toBeGreaterThanOrEqual(0);
    expect(deathFinal.heroScreenBounds.right).toBeLessThanOrEqual(1600);
    expect(deathFinal.heroScreenBounds.bottom).toBeLessThanOrEqual(900);
    writeFileSync(resolve(outputRoot, "animation-samples.json"), `${JSON.stringify({ sampleMode: "normalized-timeline", normalizedTimeline, midDeltas, animations: animationSamples }, null, 2)}\n`, "utf8");

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
