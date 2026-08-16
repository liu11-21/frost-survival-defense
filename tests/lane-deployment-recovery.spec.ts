import { expect, test, type Page } from "@playwright/test";

const BASE_URL = process.env.FROSTBOUND_BASE_URL ?? "http://127.0.0.1:4173";

type RecruitTab = "melee" | "ranged" | "support" | "engineer";

function recruitTab(defId: string): RecruitTab {
  if (defId === "engineer") return "engineer";
  if (defId === "medic" || defId === "flagbearer") return "support";
  if (defId === "warrior" || defId === "shield" || defId === "assault") return "melee";
  return "ranged";
}

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
  await page.goto(`${BASE_URL}/?uiVerification=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());
}

async function projectWorldPoint(page: Page, x: number, z: number, y = 0.04): Promise<{ x: number; y: number }> {
  await page.evaluate(() => (window as any).frostbound?.step?.(0.001, 1, true));
  const projected = await call(page, "projectWorldPoint", x, z, y);
  if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    throw new Error(`non-finite world projection for (${x}, ${y}, ${z})`);
  }
  return projected;
}

async function canvasClientPoint(page: Page, projected: { x: number; y: number }): Promise<{ x: number; y: number }> {
  return page.evaluate(({ x, y }) => {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!canvas) throw new Error("renderCanvas missing");
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  }, projected);
}

async function openRecruitPanel(page: Page): Promise<void> {
  const panel = page.locator("#ui-recruit-panel");
  if (!(await panel.evaluate((el) => el.classList.contains("show")))) {
    await page.keyboard.press("g");
    await step(page, 0.016, 2);
  }
  await expect(panel).toHaveClass(/show/);
}

async function dragRecruit(page: Page, defId: string, x: number, z: number): Promise<void> {
  await openRecruitPanel(page);
  const tab = recruitTab(defId);
  const tabButton = page.locator(`.recruit-tab[data-recruit-tab="${tab}"]`);
  await expect(tabButton).toBeVisible();
  await tabButton.click();
  await step(page, 0.016, 1);

  const source = page.locator(`.recruit-icon-card[data-recruit="${defId}"]`);
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute("draggable", "true");
  const projected = await projectWorldPoint(page, x, z);
  const point = await canvasClientPoint(page, projected);

  await page.evaluate(({ defId, x, y }) => {
    const source = document.querySelector(`.recruit-icon-card[data-recruit="${defId}"]`) as HTMLElement | null;
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!source || !canvas) throw new Error("recruit drag source or canvas missing");
    const transfer = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
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
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { defId, x: point.x, y: point.y });
  await step(page, 0.016, 3);
}

async function prepareRecruiting(page: Page): Promise<void> {
  await boot(page);
  await call(page, "startStage", "stage-3");
  await call(page, "grant", 999, 999, 999);
  await call(page, "setFurnaceLevel", 30);
  expect((await call(page, "build", "coreNE", "recruitHall")).ok).toBe(true);
  await step(page, 0.05, 180);
  await call(page, "grant", 999, 999, 999);
}

function uniqueSquads(status: Array<any>): number {
  return new Set(status.map((unit) => unit.squadId)).size;
}

test("the road is deployable from the furnace circle outward and the central reserve holds two ordinary squads", async ({ page }) => {
  await prepareRecruiting(page);

  // (0,10) is inside the wall-side construction perimeter but outside the
  // 9-unit furnace circle. It is still the north road and must accept a squad.
  await dragRecruit(page, "warrior", 0, 10);
  let status = (await call(page, "allyLaneStatus")) as Array<any>;
  const innerRoadWarriors = status.filter((unit) => unit.id === "warrior");
  expect(innerRoadWarriors.length).toBeGreaterThan(0);
  expect(innerRoadWarriors.every((unit) => unit.laneIndex === 0)).toBe(true);
  expect(innerRoadWarriors.some((unit) => Math.hypot(unit.x, unit.z) > 9)).toBe(true);

  await dragRecruit(page, "archer", 4, 0);
  await dragRecruit(page, "shield", -4, 0);
  status = (await call(page, "allyLaneStatus")) as Array<any>;
  const beforeThird = uniqueSquads(status);

  // A third ordinary central squad is rejected before RunController spends.
  await dragRecruit(page, "mage", 0, -4);
  status = (await call(page, "allyLaneStatus")) as Array<any>;
  expect(uniqueSquads(status)).toBe(beforeThird);
  expect(status.some((unit) => unit.id === "mage")).toBe(false);
});

test("with no enemies ordinary allies return inside the real furnace heal aura and recover", async ({ page }) => {
  await prepareRecruiting(page);
  await call(page, "teleport", 8, 25);
  await step(page, 0.016, 20);
  await dragRecruit(page, "warrior", 8, 25);

  const hurt = await call(page, "hurtAllySquads", 250);
  expect(hurt).toBeGreaterThan(0);
  const healthBefore = await call(page, "allyHealth");

  await step(page, 0.05, 260);
  const status = (await call(page, "allyLaneStatus")) as Array<any>;
  const warriors = status.filter((unit) => unit.id === "warrior");
  expect(warriors.length).toBeGreaterThan(0);
  expect(warriors.every((unit) => Math.hypot(unit.x, unit.z) <= 9)).toBe(true);
  expect(await call(page, "allyHealth")).toBeGreaterThan(healthBefore);

  await call(page, "teleport", 0, 0);
  await page.evaluate(() => (window as any).frostbound?.step?.(0.001, 1, true));
  await page.screenshot({ path: ".runtime/deployment-policy/furnace-recovery.png", fullPage: true });
});

test("a flagbearer follows the combat line on its assigned road instead of staying at the furnace", async ({ page }) => {
  await prepareRecruiting(page);
  await dragRecruit(page, "warrior", 0, 10);
  await dragRecruit(page, "flagbearer", 1.5, 10);

  const spawned = await call(page, "spawnEnemyOnLaneForTest", "juggernaut", -10, 45, 0);
  expect(spawned.ok).toBe(true);
  await step(page, 0.05, 120);

  const status = (await call(page, "allyLaneStatus")) as Array<any>;
  const warriors = status.filter((unit) => unit.id === "warrior" && unit.laneIndex === 0);
  const flag = status.find((unit) => unit.id === "flagbearer");
  expect(warriors.length).toBeGreaterThan(0);
  expect(flag).toBeTruthy();
  expect(flag.laneIndex).toBe(0);

  const warriorCentre = warriors.reduce(
    (sum, unit) => ({ x: sum.x + unit.x / warriors.length, z: sum.z + unit.z / warriors.length }),
    { x: 0, z: 0 },
  );
  expect(flag.home).toBeTruthy();
  expect(Math.hypot(flag.home.x - warriorCentre.x, flag.home.z - warriorCentre.z)).toBeLessThan(2.5);
  expect(Math.hypot(flag.x, flag.z)).toBeGreaterThan(10.5);
});

test("engineers can only be deployed at the furnace but still repair facilities outside that zone", async ({ page }) => {
  await prepareRecruiting(page);

  // This point is a legal inner north-road point for ordinary troops, but it is
  // outside the furnace heal circle and therefore illegal for an Engineer.
  await dragRecruit(page, "engineer", 0, 10);
  let status = (await call(page, "allyLaneStatus")) as Array<any>;
  expect(status.some((unit) => unit.id === "engineer")).toBe(false);

  await dragRecruit(page, "engineer", 4, 0);
  status = (await call(page, "allyLaneStatus")) as Array<any>;
  expect(status.some((unit) => unit.id === "engineer")).toBe(true);

  expect((await call(page, "build", "northOuter", "tower")).ok).toBe(true);
  await step(page, 0.05, 180);
  const full = await call(page, "slotHealth", "northOuter");
  expect(full).toBeTruthy();
  await call(page, "damageSlot", "northOuter", Math.max(200, full.max * 0.4));
  const damaged = await call(page, "slotHealth", "northOuter");
  expect(damaged.health).toBeLessThan(damaged.max);

  // No repair-range override is introduced: the existing Engineer AI must walk
  // from the furnace and repair this remote road facility normally.
  await step(page, 0.05, 420);
  const repaired = await call(page, "slotHealth", "northOuter");
  expect(repaired.health).toBeGreaterThan(damaged.health);
});
