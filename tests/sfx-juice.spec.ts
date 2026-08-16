import { expect, test, type Page } from "@playwright/test";

interface SfxVoice {
  event: string;
  requestedName: string;
  sourceState: "playing" | "ended";
}

interface SfxSnapshot {
  variationCounts: Record<string, number>;
  activeVoices: SfxVoice[];
  activeCount: number;
  totalConcurrencyCap: number;
}

const APP_BASE = process.env.AUDIO_TEST_BASE ?? "/";
const NORMALIZED_BASE = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;

async function boot(page: Page): Promise<void> {
  const url = new URL(`${NORMALIZED_BASE}?uiVerification=1&audioVerification=1&sfxVerification=1`, "http://127.0.0.1:4173").href;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => Boolean((window as any).frostbound && (window as any).frostboundSfx),
    null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());
  await page.locator("[data-settings]").click();
  await page.waitForFunction(() => (window as any).frostboundSfx.snapshot().unlocked === true);
}

async function snapshot(page: Page): Promise<SfxSnapshot> {
  return page.evaluate(() => (window as any).frostboundSfx.snapshot());
}

test("high-value gameplay moments use dedicated juice recipes", async ({ page }) => {
  await boot(page);

  const first = await snapshot(page);
  expect(first.variationCounts).toMatchObject({
    buildComplete: 2,
    bossSlam: 2,
    heroSkillFrost: 2,
    heroSkillBarrage: 2,
    heroSkillRally: 2,
  });

  const cases: Array<[string, string]> = [
    ["buildComplete", "buildPlace"],
    ["bossSlam", "artilleryExplosion"],
    ["heroSkillFrost", "magicAttack"],
    ["heroSkillBarrage", "artilleryExplosion"],
    ["heroSkillRally", "commanderHorn"],
  ];

  for (const [event, forbiddenAlias] of cases) {
    await page.evaluate((name) => (window as any).frostboundSfx.play(name, 0.75, 1), event);
    const current = await snapshot(page);
    const voice = current.activeVoices.find(
      (candidate) => candidate.requestedName === event && candidate.event === event,
    );
    expect(voice?.sourceState).toBe("playing");
    expect(
      current.activeVoices.some(
        (candidate) => candidate.requestedName === event && candidate.event === forbiddenAlias,
      ),
    ).toBe(false);
    await page.waitForTimeout(90);
  }
});

test("juice events still obey the shared 16-voice ceiling", async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => {
    const api = (window as any).frostboundSfx;
    const names = ["buildComplete", "bossSlam", "heroSkillFrost", "heroSkillBarrage", "heroSkillRally"];
    for (let i = 0; i < 40; i++) {
      api.play(names[i % names.length], 0.6, 1);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 22));
    }
  });

  const current = await snapshot(page);
  expect(current.totalConcurrencyCap).toBe(16);
  expect(current.activeCount).toBeLessThanOrEqual(16);
}
