import { expect, test } from "@playwright/test";

/**
 * Lightweight DOM regression for the post-G1 compact command surfaces. The
 * gameplay interaction suite owns click/drag semantics; this file only guards
 * the presentation contract that regressed when ui-scene-rework.css loaded
 * before the legacy UI stylesheet.
 */
test("build and recruit panels use compact thumbnail-first cards", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  const call = (name: string, ...args: unknown[]) => page.evaluate(
    ({ name, args }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[name];
      return typeof fn === "function" ? fn(...args) : null;
    },
    { name, args },
  );
  const step = (dt: number, frames: number) => page.evaluate(
    ({ dt, frames }) => (window as any).frostbound?.step?.(dt, frames, false),
    { dt, frames },
  );

  await call("startStage", "stage-3");
  await call("grant", 999, 999, 999);
  await call("setFurnaceLevel", 30);
  await call("teleport", 5.2, 5.2);
  await step(0.016, 4);
  await page.keyboard.press("b");
  await step(0.016, 2);

  const buildPanel = page.locator("#ui-build-panel");
  await expect(buildPanel).toHaveClass(/show/);
  const buildBox = await buildPanel.boundingBox();
  expect(buildBox).toBeTruthy();
  expect(buildBox!.width).toBeLessThanOrEqual(280);
  await expect(page.locator(".build-icon-card .building-thumb-scene").first()).toBeVisible();
  await page.screenshot({ path: ".runtime/g1-evidence/g1-build-compact.png", fullPage: true });

  await page.keyboard.press("Escape");
  await call("build", "coreNE", "recruitHall");
  await step(0.016, 500);
  await page.keyboard.press("g");
  await step(0.016, 2);

  const recruitPanel = page.locator("#ui-recruit-panel");
  await expect(recruitPanel).toHaveClass(/show/);
  const recruitBox = await recruitPanel.boundingBox();
  expect(recruitBox).toBeTruthy();
  expect(recruitBox!.width).toBeLessThanOrEqual(312);
  await expect(page.locator(".recruit-icon-card .recruit-glyph").first()).toBeVisible();
  await expect(page.locator(".recruit-icon-card text")).toHaveCount(0);
  await page.screenshot({ path: ".runtime/g1-evidence/g1-recruit-compact.png", fullPage: true });
});
