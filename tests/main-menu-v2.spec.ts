import { expect, test, type Page } from "@playwright/test";

const MENU = "[data-main-menu-v2]";
const START = "[data-v2-start]";

async function bootMenu(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.waitForSelector(MENU, { state: "visible", timeout: 20_000 });
  await page.waitForTimeout(650);
}

async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>("[data-main-menu-v2]");
    if (!shell) return null;
    const rect = shell.getBoundingClientRect();
    return {
      bodyX: document.documentElement.scrollWidth - window.innerWidth,
      bodyY: document.documentElement.scrollHeight - window.innerHeight,
      left: rect.left,
      top: rect.top,
      right: rect.right - window.innerWidth,
      bottom: rect.bottom - window.innerHeight,
    };
  });
  expect(overflow).not.toBeNull();
  expect(overflow!.bodyX).toBeLessThanOrEqual(1);
  expect(overflow!.bodyY).toBeLessThanOrEqual(1);
  expect(overflow!.left).toBeGreaterThanOrEqual(-1);
  expect(overflow!.top).toBeGreaterThanOrEqual(-1);
  expect(overflow!.right).toBeLessThanOrEqual(1);
  expect(overflow!.bottom).toBeLessThanOrEqual(1);
}

test("Main Menu V2 commercial runtime, responsive states and transition", async ({ page }) => {
  await bootMenu(page, 1920, 1080);

  const shell = page.locator(MENU);
  const primary = page.locator(START);
  await expect(shell).toBeVisible();
  await expect(primary).toContainText("開始遊戲");
  await expect(page.locator("[data-v2-resume]")).toBeVisible();
  await expect(page.locator("[data-v2-endless]")).toBeVisible();
  await expect(page.locator("[data-v2-codex]")).toBeVisible();
  await expect(page.locator("[data-v2-settings]")).toBeVisible();
  await expectNoOverflow(page);

  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-1920x1080.png", fullPage: true });

  await primary.hover();
  await page.waitForTimeout(180);
  const hoverTransform = await primary.evaluate((el) => getComputedStyle(el).transform);
  expect(hoverTransform).not.toBe("none");
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-hover.png", fullPage: true });

  await page.locator("body").focus();
  await page.keyboard.press("Tab");
  await expect(primary).toBeFocused();
  const focusOutline = await primary.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(focusOutline).not.toBe("none");
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-focus.png", fullPage: true });

  await page.locator("[data-v2-settings]").click();
  await page.waitForSelector("#ui-screen.menu-secondary-v2", { state: "visible", timeout: 5_000 });
  await expect(page.locator("#ui-screen-body h1")).toContainText("設定");
  const settingsBox = await page.locator("#ui-screen .screen-inner").boundingBox();
  expect(settingsBox).not.toBeNull();
  expect(settingsBox!.x).toBeGreaterThanOrEqual(0);
  expect(settingsBox!.y).toBeGreaterThanOrEqual(0);
  expect(settingsBox!.x + settingsBox!.width).toBeLessThanOrEqual(1920);
  expect(settingsBox!.y + settingsBox!.height).toBeLessThanOrEqual(1080);
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-settings-1920x1080.png", fullPage: true });

  await bootMenu(page, 2560, 1440);
  await expectNoOverflow(page);
  const panel = await page.locator(".menu-v2-panel").boundingBox();
  const brand = await page.locator(".menu-v2-brand").boundingBox();
  expect(panel).not.toBeNull();
  expect(brand).not.toBeNull();
  expect(brand!.x + brand!.width).toBeLessThan(panel!.x + 80);
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-2560x1440.png", fullPage: true });

  await bootMenu(page, 1920, 1080);
  await primary.click();
  await expect(page.locator("#ui-screen")).toHaveClass(/menu-v2-transitioning/);
  await expect(page.locator("#ui-screen")).toHaveAttribute("aria-busy", "true");
  await page.waitForTimeout(360);
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-transition-mid.png", fullPage: true });

  await page.waitForFunction(() => !document.getElementById("ui-screen")?.classList.contains("show"), null, { timeout: 4_000 });
  await page.waitForTimeout(180);
  await expect(page.locator(".hud")).toBeVisible();
  await expect(page.locator("#ui-wave")).toBeVisible();
  await page.screenshot({ path: ".runtime/menu-v2/menu-v2-gameplay-after-transition.png", fullPage: true });
});
