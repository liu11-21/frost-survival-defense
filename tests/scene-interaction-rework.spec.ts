import { expect, test, type Page } from "@playwright/test";
import { SLOT_BY_ID, UNIVERSAL_MAX_VISUAL_RADIUS } from "../src/data/BuildSlotDefinitions";

async function call(page: Page, name: string, ...args: unknown[]): Promise<any> {
  return page.evaluate(
    ({ name, args }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[name];
      return typeof fn === "function" ? fn(...args) : null;
    },
    { name, args },
  );
}

async function step(page: Page, dt: number, frames: number): Promise<void> {
  await page.evaluate(
    ({ dt, frames }) => (window as any).frostbound?.step?.(dt, frames, false),
    { dt, frames },
  );
}

async function boot(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  // `window.frostbound` is exposed immediately after Game construction, while
  // Game.start() is still awaiting scene/assets and the production loading
  // overlay legitimately owns pointer input. Wait for the real boot contract
  // instead of deleting/hiding the overlay in the test.
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());
}

async function projectWorldPoint(
  page: Page,
  x: number,
  z: number,
  y: number,
): Promise<{ x: number; y: number }> {
  // Manual simulation intentionally runs with render=false for speed. Babylon's
  // cached view/projection transform is refreshed by one render-only frame
  // before converting a world point to real CSS pointer coordinates.
  await page.evaluate(() => (window as any).frostbound?.step?.(0.001, 1, true));
  const projected = await call(page, "projectWorldPoint", x, z, y);
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    throw new Error(`non-finite world projection for (${x}, ${y}, ${z})`);
  }
  return projected;
}

async function canvasClientPoint(
  page: Page,
  projected: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!canvas) throw new Error("renderCanvas missing");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  }, projected);
}

test("mouse-clicking a remote visible slot opens the canonical build panel", async ({ page }) => {
  await boot(page);
  await call(page, "startStage", "stage-3");
  await call(page, "setFurnaceLevel", 30);
  await call(page, "teleport", 0, 0);
  await step(page, 0.016, 12);

  // coreNE is ~7.35 units away from the hero, well beyond the old 3.4-unit
  // proximity interaction radius. This must therefore be the new pointer path,
  // not the old E/B-nearby path succeeding by accident.
  const projected = await projectWorldPoint(page, 5.2, 5.2, 0.08);
  const point = await canvasClientPoint(page, projected);
  await page.mouse.click(point.x, point.y);
  await step(page, 0.016, 2);

  const pointer = await call(page, "pointerDebug");
  expect(pointer.finalHandler).toBe("slotClick");
  expect(pointer.hitWorldSlot).toBe("coreNE");
  expect(await call(page, "nearbySlotId")).toBe("coreNE");
  await expect(page.locator("#ui-build-panel")).toHaveClass(/show/);
});

test("scaled facility visuals still leave a generous real pointer placement target", async ({ page }) => {
  await boot(page);
  await call(page, "startStage", "stage-3");
  await call(page, "grant", 999, 999, 999);
  await call(page, "setFurnaceLevel", 30);
  await call(page, "teleport", 0, 0);

  // Instantiate a real non-wall facility and read its actual root scale. The
  // target slot stays empty; the click lands near the largest scaled visual
  // footprint rather than at the easy centre point.
  expect((await call(page, "build", "coreNW", "warehouse")).ok).toBe(true);
  // Before a warehouse completes, the real store caps every resource at 100.
  // Let this one finish, then replenish normally so `canBuild` below tests
  // placement legality instead of failing because the setup spent its wood.
  await step(page, 0.016, 220);
  await call(page, "grant", 999, 999, 999);
  const contract = await call(page, "facilityRuntimeContract", "coreNW");
  expect(contract).toBeTruthy();
  expect(contract.visualScale.x).toBeCloseTo(0.82, 5);

  const target = SLOT_BY_ID.get("coreNE")!;
  const visibleEdgeOffset = UNIVERSAL_MAX_VISUAL_RADIUS * contract.visualScale.x * 0.95;
  const projected = await projectWorldPoint(page, target.x + visibleEdgeOffset, target.z, 0.08);
  const point = await canvasClientPoint(page, projected);
  await page.mouse.click(point.x, point.y);
  await step(page, 0.016, 2);

  const pointer = await call(page, "pointerDebug");
  expect(pointer.finalHandler).toBe("slotClick");
  expect(pointer.hitWorldSlot).toBe("coreNE");
  expect(await call(page, "nearbySlotId")).toBe("coreNE");
  expect((await call(page, "canBuild", "coreNE", "tower")).ok).toBe(true);
  await expect(page.locator("#ui-build-panel")).toHaveClass(/show/);

  // uiVerification exposes the permanent diagnostic panel. The regression has
  // already asserted its state; close only that overlay before the evidence
  // frame so the screenshot shows the real build panel and placement context.
  await page.keyboard.press("F6");
  await step(page, 0.016, 1);
  await page.screenshot({ path: ".runtime/g1-evidence/g1-building-placement.png", fullPage: true });
});

test("a real draggable recruit icon spends only after a legal lane drop", async ({ page }) => {
  await boot(page);
  await call(page, "startStage", "stage-3");
  await call(page, "grant", 999, 999, 999);
  await call(page, "setFurnaceLevel", 30);
  await call(page, "build", "coreNE", "recruitHall");
  await step(page, 0.016, 500);

  // Move the tactical camera beside the north road so the exact ground point
  // used for the drop is visible on canvas.
  await call(page, "teleport", 8, 25);
  await step(page, 0.016, 30);

  // Production binding is G. Use the real keyboard route to open the panel.
  await page.keyboard.press("g");
  await step(page, 0.016, 2);
  await expect(page.locator("#ui-recruit-panel")).toHaveClass(/show/);

  const card = page.locator('.recruit-icon-card[data-recruit="warrior"]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("draggable", "true");

  const before = (await call(page, "allyLaneStatus")) as Array<any>;
  expect(before.some((unit) => unit.id === "warrior")).toBe(false);

  // This is an exact point on north lane segment 3, not a slot approximation.
  const projected = await projectWorldPoint(page, 8, 25, 0.04);
  const point = await canvasClientPoint(page, projected);

  await page.evaluate(({ x, y }) => {
    const source = document.querySelector('.recruit-icon-card[data-recruit="warrior"]') as HTMLElement | null;
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!source || !canvas) throw new Error("recruit drag source or canvas missing");
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
    canvas.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: x,
      clientY: y,
    }));
    canvas.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
      clientX: x,
      clientY: y,
    }));
    source.dispatchEvent(new DragEvent("dragend", {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }));
  }, point);
  await step(page, 0.016, 4);

  const deployed = (await call(page, "allyLaneStatus")) as Array<any>;
  const warriors = deployed.filter((unit) => unit.id === "warrior");
  expect(warriors.length).toBeGreaterThan(0);
  expect(warriors.every((unit) => unit.laneIndex === 0)).toBe(true);
  expect(warriors.every((unit) => unit.home !== null)).toBe(true);
});
