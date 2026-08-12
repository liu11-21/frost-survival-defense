import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const PHASE = process.env.HUD_CAPTURE_PHASE === "before" ? "before" : "after";
const BASE_URL = process.env.HUD_BASE_URL ?? "http://127.0.0.1:4173";
const OUTPUT_ROOT = resolve(".runtime", "ui-hud-responsive-v1", PHASE);
mkdirSync(OUTPUT_ROOT, { recursive: true });

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
  visible: boolean;
  classes: string;
}

interface GeometrySnapshot {
  label: string;
  viewport: { width: number; height: number };
  document: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    overflowX: boolean;
    overflowY: boolean;
  };
  boxes: Record<string, Box | null>;
  violations: string[];
}

const CRITICAL_SELECTORS = {
  resources: ".res-box",
  wave: ".wave-box",
  hero: ".hero-box",
  heroSkills: "#ui-hero-skills",
  furnace: ".furnace-box",
  minimap: "#ui-minimap",
  squad: "#ui-squad-hud",
  engineer: "#ui-engineer-hud",
  lanes: "#ui-lane-hud",
  banner: "#ui-banner",
  boss: "#ui-boss-bar",
  buildPanel: "#ui-build-panel",
  recruitPanel: "#ui-recruit-panel",
} as const;

async function call(page: Page, name: string, ...args: unknown[]): Promise<any> {
  return page.evaluate(
    ({ name, args }) => {
      const fn = (window as any).frostbound?.api?.()?.[name];
      return typeof fn === "function" ? fn(...args) : null;
    },
    { name, args },
  );
}

async function step(page: Page, dt = 0.016, frames = 2, render = true): Promise<void> {
  await page.evaluate(
    ({ dt, frames, render }) => (window as any).frostbound?.step?.(dt, frames, render),
    { dt, frames, render },
  );
}

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE_URL}/?uiVerification=1`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());
}

async function startGameplay(page: Page): Promise<void> {
  await call(page, "startStage", "stage-3");
  if (await call(page, "isVerifyOpen")) await call(page, "toggleVerify");
  await step(page, 0.016, 4, true);
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
}

async function geometry(page: Page, label: string, openPanel?: "buildPanel" | "recruitPanel"): Promise<GeometrySnapshot> {
  const snapshot = await page.evaluate(({ label, selectors }) => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const body = document.body;
    const boxes: Record<string, Box | null> = {};
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) {
        boxes[name] = null;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const visible = style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
      boxes[name] = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
        visible,
        classes: element.className,
      };
    }
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const scrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
    return {
      label,
      viewport,
      document: {
        scrollWidth,
        scrollHeight,
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        overflowX: scrollWidth > viewport.width,
        overflowY: scrollHeight > viewport.height,
      },
      boxes,
    };
  }, { label, selectors: CRITICAL_SELECTORS });

  const violations: string[] = [];
  if (snapshot.document.overflowX) violations.push(`document horizontal overflow: ${snapshot.document.scrollWidth}`);
  if (snapshot.document.overflowY) violations.push(`document vertical overflow: ${snapshot.document.scrollHeight}`);

  for (const name of ["resources", "wave", "hero", "heroSkills", "furnace", "minimap"] as const) {
    const box = snapshot.boxes[name];
    if (!box?.visible) {
      violations.push(`${name} is not visible`);
      continue;
    }
    if (box.x < -0.5 || box.y < -0.5 || box.right > snapshot.viewport.width + 0.5 || box.bottom > snapshot.viewport.height + 0.5) {
      violations.push(`${name} outside viewport: ${JSON.stringify(box)}`);
    }
  }

  for (const name of ["squad", "engineer", "lanes", "banner", "boss"] as const) {
    const box = snapshot.boxes[name];
    if (box?.visible && (box.x < -0.5 || box.y < -0.5 || box.right > snapshot.viewport.width + 0.5 || box.bottom > snapshot.viewport.height + 0.5)) {
      violations.push(`${name} outside viewport: ${JSON.stringify(box)}`);
    }
  }

  const wave = snapshot.boxes.wave;
  for (const name of ["banner", "boss"] as const) {
    const alert = snapshot.boxes[name];
    if (wave?.visible && alert?.visible && overlaps(wave, alert)) violations.push(`wave overlaps ${name}`);
  }

  if (openPanel) {
    const panel = snapshot.boxes[openPanel];
    if (!panel?.visible) violations.push(`${openPanel} is not visible`);
    else {
      if (panel.x < -0.5 || panel.y < -0.5 || panel.right > snapshot.viewport.width + 0.5 || panel.bottom > snapshot.viewport.height + 0.5) {
        violations.push(`${openPanel} outside viewport`);
      }
      for (const name of ["wave", "heroSkills", "furnace", "minimap"] as const) {
        const critical = snapshot.boxes[name];
        if (critical?.visible && overlaps(panel, critical)) violations.push(`${openPanel} overlaps ${name}`);
      }
    }
  }

  return { ...snapshot, violations };
}

async function capture(page: Page, label: string, openPanel?: "buildPanel" | "recruitPanel"): Promise<GeometrySnapshot> {
  await step(page, 0.001, 1, true);
  const snapshot = await geometry(page, label, openPanel);
  await page.screenshot({ path: resolve(OUTPUT_ROOT, `${label}.png`), fullPage: false });
  return snapshot;
}

async function openBuildPanel(page: Page): Promise<void> {
  await call(page, "setFurnaceLevel", 30);
  await call(page, "teleport", 0, 0);
  await step(page, 0.016, 12, true);
  const projected = await call(page, "projectWorldPoint", 5.2, 5.2, 0.08) as { x: number; y: number };
  const point = await page.evaluate(({ x, y }) => {
    const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  }, projected);
  await page.mouse.click(point.x, point.y);
  await step(page, 0.016, 2, true);
}

test("production gameplay HUD stays contained across desktop viewports and panel states", async ({ page }) => {
  test.setTimeout(420_000);
  const results: GeometrySnapshot[] = [];

  for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]] as const) {
    await boot(page, width, height);
    await startGameplay(page);
    results.push(await capture(page, `${width}x${height}-gameplay`));
  }

  await boot(page, 1280, 720);
  await startGameplay(page);
  await openBuildPanel(page);
  results.push(await capture(page, "1280x720-build-open", "buildPanel"));

  await boot(page, 1280, 720);
  await startGameplay(page);
  await page.keyboard.press("g");
  await step(page, 0.016, 2, true);
  results.push(await capture(page, "1280x720-recruit-open", "recruitPanel"));

  await boot(page, 1280, 720);
  await startGameplay(page);
  await call(page, "grant", 999, 999, 999);
  await call(page, "setFurnaceLevel", 30);
  await call(page, "build", "coreNE", "recruitHall");
  await step(page, 0.016, 500, false);
  await call(page, "recruit", "warrior");
  await step(page, 0.016, 4, true);
  results.push(await capture(page, "1280x720-squad-active"));

  writeFileSync(resolve(OUTPUT_ROOT, "geometry.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  const violations = results.flatMap((result) => result.violations.map((violation) => `${result.label}: ${violation}`));

  if (PHASE === "before") {
    expect(violations.length, "the recorded main baseline should expose the known HUD containment regression").toBeGreaterThan(0);
    return;
  }

  expect(violations, JSON.stringify(results, null, 2)).toEqual([]);
  const empty = results.find((result) => result.label === "1280x720-gameplay")!;
  expect(empty.boxes.squad?.classes).toContain("empty");
  expect(empty.boxes.squad?.height ?? Infinity).toBeLessThanOrEqual(42);
  expect(empty.boxes.engineer?.visible).toBe(false);
  expect(empty.boxes.lanes?.classes).toContain("quiet");
  const openQuietRows = await page.locator("#ui-lane-hud.quiet .lane-row").evaluateAll((rows) => rows.filter((row) => {
    const count = row.querySelector<HTMLElement>(".lane-count")?.textContent?.trim();
    const gate = row.querySelector<HTMLElement>(".lane-gate.open");
    return count === "0" && gate?.textContent?.includes("未設防");
  }).length);
  expect(openQuietRows, "an empty lane with an open gate must retain the 未設防 warning").toBeGreaterThan(0);
  const active = results.find((result) => result.label === "1280x720-squad-active")!;
  expect(active.boxes.squad?.classes).not.toContain("empty");
});

test("responsive presentation preserves hotkeys and canonical pointer panels", async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page, 1280, 720);
  await startGameplay(page);

  await page.keyboard.press("g");
  await expect(page.locator("#ui-recruit-panel")).toHaveClass(/show/);
  await page.keyboard.press("g");
  await expect(page.locator("#ui-recruit-panel")).not.toHaveClass(/show/);

  await page.keyboard.press("m");
  await expect(page.locator("#ui-map-overlay")).toHaveClass(/show/);
  await expect(page.locator("#ui-minimap")).toBeVisible();
  await page.keyboard.press("m");
  await expect(page.locator("#ui-map-overlay")).not.toHaveClass(/show/);

  await call(page, "setHeroSkillCooldown", "airSupport", 0);
  await page.keyboard.press("1");
  await step(page, 0.016, 1, true);
  const skills = await call(page, "heroSkillState") as Array<{ id: string; remaining: number }>;
  expect(skills.find((skill) => skill.id === "airSupport")?.remaining).toBeGreaterThan(0);

  await openBuildPanel(page);
  await expect(page.locator("#ui-build-panel")).toHaveClass(/show/);
  expect((await call(page, "panelState")).isBuild).toBe(true);
});
