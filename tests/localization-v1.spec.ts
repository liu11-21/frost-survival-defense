import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:4173/";
const STORAGE_KEY = "frostbound.locale";
const LOCALES = ["zh-TW", "en", "ja"] as const;

test.setTimeout(360_000);

async function bootMenu(page: Page, width = 1920, height = 1080): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#ui-screen.show", { timeout: 60_000 });
  await page.waitForSelector("button[data-locale]", { timeout: 20_000 });
}

async function chooseLocale(page: Page, locale: typeof LOCALES[number]): Promise<void> {
  await page.locator(`button[data-locale="${locale}"]`).first().click();
  await page.waitForFunction((value) => document.documentElement.lang === value, locale);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe(locale);
}

async function expectResponsive(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
  const geometry = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const inner = document.querySelector<HTMLElement>("#ui-screen .screen-inner");
    const buttons = [...document.querySelectorAll<HTMLElement>("#ui-screen button")].filter((el) => {
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const rect = inner?.getBoundingClientRect();
    return {
      documentX: Math.max(root.scrollWidth, body.scrollWidth) - window.innerWidth,
      innerLeft: rect?.left ?? -999,
      innerRight: rect?.right ?? 99999,
      buttonOutside: buttons.some((button) => {
        const r = button.getBoundingClientRect();
        return r.left < -1 || r.right > window.innerWidth + 1;
      }),
    };
  });
  expect(geometry.documentX).toBeLessThanOrEqual(1);
  expect(geometry.innerLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.innerRight).toBeLessThanOrEqual(width + 1);
  expect(geometry.buttonOutside).toBe(false);
}

async function expectBrowserDefault(browser: Browser, locale: string, expectedTitle: string): Promise<void> {
  const context = await browser.newContext({ locale });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("#ui-screen.show", { timeout: 60_000 });
  await expect(page.locator("#ui-screen-body h1")).toContainText(expectedTitle);
  await context.close();
}

test("browser language chooses zh-TW, ja, otherwise English", async ({ browser }) => {
  await expectBrowserDefault(browser, "zh-Hant", "寒霜火爐");
  await expectBrowserDefault(browser, "ja-JP", "フロストバウンド");
  await expectBrowserDefault(browser, "fr-FR", "Frostbound Furnace");
});

test("locale switching is immediate, persisted, responsive, and reaches Settings audio copy", async ({ page }) => {
  await bootMenu(page);

  const expected = {
    "zh-TW": { title: "寒霜火爐", settings: "設定" },
    en: { title: "Frostbound Furnace", settings: "Settings" },
    ja: { title: "フロストバウンド・ファーネス", settings: "設定" },
  } as const;

  for (const locale of LOCALES) {
    await chooseLocale(page, locale);
    await expect(page.locator("#ui-screen-body h1")).toContainText(expected[locale].title);
    await expect(page.locator("button[data-locale=\"zh-TW\"]").first()).toContainText("繁體中文");
    await expect(page.locator("button[data-locale=\"en\"]").first()).toContainText("English");
    await expect(page.locator("button[data-locale=\"ja\"]").first()).toContainText("日本語");

    for (const [width, height] of [[1280, 720], [1920, 1080], [2560, 1440]] as const) {
      await expectResponsive(page, width, height);
    }

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: `.runtime/localization-v1/menu-${locale}-1920x1080.png` });
  }

  await chooseLocale(page, "en");
  await page.locator("button[data-settings]").click();
  await expect(page.locator("#ui-screen-body h1")).toHaveText("Settings");
  await expect(page.locator("#music-settings-audio h2")).toHaveText("Music");
  await expect(page.locator("#music-volume")).toHaveAttribute("aria-label", "Background music volume");

  await page.locator('button[data-locale="ja"]').first().click();
  await expect(page.locator("#ui-screen-body h1")).toHaveText("設定");
  await expect(page.locator("#music-settings-audio h2")).toHaveText("音楽");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("ja");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("#ui-screen.show", { timeout: 60_000 });
  await expect(page.locator("#ui-screen-body h1")).toContainText("フロストバウンド");
  await expect(page.locator('button[data-locale="ja"]').first()).toHaveAttribute("aria-pressed", "true");
});

test("English runtime HUD, recruitment and build surfaces use localized player copy", async ({ page }) => {
  await bootMenu(page);
  await chooseLocale(page, "en");
  await page.locator('button[data-stage="stage-1"]').click();
  await page.waitForSelector(".hud", { state: "visible", timeout: 60_000 });
  await page.waitForTimeout(600);

  await expect(page.locator("#ui-wave")).toContainText("Preparation");
  await expect(page.locator(".wave-sub")).toContainText("Enemies");
  await expect(page.locator(".res-name").nth(0)).toHaveText("Wood");
  await expect(page.locator(".res-name").nth(1)).toHaveText("Stone");
  await expect(page.locator(".res-name").nth(2)).toHaveText("Gold");
  await expect(page.locator('[data-skill="airSupport"] .skill-name')).toHaveText("Air Support");
  await expect(page.locator("#ui-upgrade")).toContainText("Upgrade Furnace");
  await expect(page.locator("#ui-lane-hud .lane-title")).toHaveText("Incoming Lanes");

  await page.keyboard.press("g");
  await expect(page.locator("#ui-recruit-panel")).toHaveClass(/show/);
  await expect(page.locator("#ui-recruit-header")).toHaveText("Recruit Hall not completed");
  await expect(page.locator('[data-recruit-tab="melee"]')).toHaveText("Melee");
  await page.keyboard.press("g");

  const visibleCopy = await page.locator(".hud, #ui-recruit-panel").allTextContents();
  const joined = visibleCopy.join(" ");
  for (const token of ["準備階段", "敵人", "木材", "石頭", "金幣", "升級火爐", "來襲路線", "招募所尚未完成"]) {
    expect(joined).not.toContain(token);
  }

  await page.goto(`${BASE}?uiVerification=1`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound?.game?.s), null, { timeout: 60_000 });
  await page.waitForSelector("#ui-screen.show", { timeout: 20_000 });
  await page.locator('button[data-locale="en"]').first().click();
  await page.locator('button[data-stage="stage-1"]').click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = (window as any).frostbound.game.s;
    const slot = s.buildings.slots.find((candidate: any) => candidate.category === "universal" && !candidate.building);
    s.panels.setNearbySlot(slot);
    s.panels.openBuild();
  });
  await expect(page.locator("#ui-build-panel")).toHaveClass(/show/);
  await expect(page.locator("#ui-build-title")).toContainText("Building Slot");
  await expect(page.locator('[data-build-type="mine"] .build-icon-name')).toContainText("Stone Mine");
});
