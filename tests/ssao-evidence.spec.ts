/**
 * Before and after for screen-space ambient occlusion, from one camera.
 *
 * A rendering change is worth exactly what a side-by-side shows, and the only
 * honest side-by-side is the same scene, the same frame and the same camera
 * with one thing toggled. So this drives a real run to a settled state, holds
 * the loop still, and takes two shots of that identical frame with the SSAO
 * pipeline detached and attached.
 *
 * Detaching rather than setting a flag is deliberate and is what the runtime
 * does too: SSAO2 keeps rendering its depth and normal passes while merely
 * disabled, so "off" has to mean off the camera or the comparison measures
 * nothing about cost.
 */
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const outputRoot = resolve(process.cwd(), "reports/render-ibl-ssao");

interface EvidenceWindow extends Window {
  frostbound?: {
    api(): {
      startEndless(): void;
      setResources(wood: number, stone: number, gold: number): void;
      upgradeFurnace(): unknown;
      build(slotId: string, type: string): { ok: boolean };
      recruit(id: string): unknown;
      teleport(x: number, z: number): void;
      spawnEnemy(id: string, x: number, z: number): unknown;
      unitCounts(): { allies: number; enemies: number; structures: number };
    };
    step(dt: number, frames?: number, render?: boolean): void;
    stopLoop(): void;
    game?: {
      s?: {
        assets?: { isReady?: boolean };
        ssao?: { name: string } | null;
        scene?: {
          cameras: unknown[];
          postProcessRenderPipelineManager: {
            attachCamerasToRenderPipeline(name: string, cameras: unknown): void;
            detachCamerasFromRenderPipeline(name: string, cameras: unknown): void;
          };
          render(): void;
        };
      };
    };
  };
}

test("SSAO on and off, same frame, same camera", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(outputRoot, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", {
    waitUntil: "domcontentloaded", timeout: 90_000,
  });
  await page.waitForFunction(() => Boolean((window as EvidenceWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const g = (window as EvidenceWindow).frostbound;
    return Boolean(g?.game?.s?.assets?.isReady);
  }, { timeout: 90_000 });

  // The pipeline has to actually exist before any of this means anything. On a
  // WebGL1 context SceneFactory leaves it null on purpose, and a comparison of
  // two identical images is worse than no comparison.
  // Asked through the game's own debug hook, not through a `window.BABYLON`
  // global -- this app imports Babylon as ES modules and never puts it on
  // `window`, so that probe returns false whether or not the pipeline exists.
  const supported = await page.evaluate(() =>
    Boolean((window as EvidenceWindow).frostbound?.game?.s?.ssao));
  expect(supported, "frostSSAO pipeline was never created").toBe(true);

  // A recruit hall FIRST. `recruit` returns a string refusal without one, and
  // the first version of this took two perfectly matched screenshots of an
  // empty base -- which proves the toggle works and nothing about what it does
  // to a character, the only reason the toggle exists.
  await page.evaluate(() => {
    const api = (window as EvidenceWindow).frostbound!.api();
    api.startEndless();
    for (let i = 0; i < 6; i++) {
      api.setResources(999999, 999999, 999999);
      api.upgradeFurnace();
    }
    api.setResources(999999, 999999, 999999);
    api.build("eastMid", "recruitHall");
  });
  for (let i = 0; i < 140; i++) {
    await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.25, 1, false));
  }

  const recruited = await page.evaluate(() => {
    const api = (window as EvidenceWindow).frostbound!.api();
    let ok = 0;
    for (const id of ["warrior", "shield", "musketeer", "warrior", "shield", "musketeer", "archer", "medic"]) {
      api.setResources(999999, 999999, 999999);
      if (typeof api.recruit(id) !== "string") ok += 1;
    }
    return ok;
  });
  expect(recruited, "recruits are the subject of the comparison").toBeGreaterThanOrEqual(6);

  for (let i = 0; i < 60; i++) {
    await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.2, 1, false));
  }
  await page.evaluate(() => {
    const api = (window as EvidenceWindow).frostbound!.api();
    api.spawnEnemy("grunt", -3.0, 8.0);
    api.spawnEnemy("bruiser", 2.0, 9.0);
    // Put the camera among them; AO is a contact effect and a shot from across
    // the map measures the terrain, not the characters.
    api.teleport(1.5, 5.5);
  });

  // Let it settle, then stop the clock so both shots are the SAME frame.
  // Everything referenced inside `page.evaluate` has to be resolved inside it:
  // a helper closed over in Node is not in scope in the page, and the failure
  // reads as "frostbound is not a function" rather than as a scope error.
  await page.evaluate(() => {
    const hook = (window as EvidenceWindow).frostbound!;
    for (let i = 0; i < 90; i++) hook.step(1 / 60, 1, true);
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => (window as EvidenceWindow).frostbound!.stopLoop());

  const setSsao = async (on: boolean) => {
    await page.evaluate((enabled) => {
      const systems = (window as EvidenceWindow).frostbound!.game!.s!;
      const scene = systems.scene!;
      const name = systems.ssao!.name;
      const manager = scene.postProcessRenderPipelineManager;
      if (enabled) manager.attachCamerasToRenderPipeline(name, scene.cameras);
      else manager.detachCamerasFromRenderPipeline(name, scene.cameras);
      for (let i = 0; i < 3; i++) scene.render();
    }, on);
    await page.waitForTimeout(250);
  };

  // The review overlay is 40 per cent of the frame and none of it is rendered
  // by the engine. Hidden for the shots, not disabled -- the run stays exactly
  // as it was measured.
  await page.addStyleTag({ content: "#reviewPanel,.review-panel,[data-review-panel]{display:none !important}" });
  await setSsao(false);
  await page.screenshot({ path: resolve(outputRoot, "ssao-off.png") });
  await setSsao(true);
  await page.screenshot({ path: resolve(outputRoot, "ssao-on.png") });

  const counts = await page.evaluate(() => (window as EvidenceWindow).frostbound!.api().unitCounts());
  expect(counts.allies, "no allies on screen makes the comparison meaningless").toBeGreaterThan(0);
  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
