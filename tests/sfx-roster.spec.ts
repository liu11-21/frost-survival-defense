import { expect, test, type Page } from "@playwright/test";
import { ENEMY_UNITS } from "../src/data/EnemyDefinitions";
import { ALLY_UNITS, GROUND_SUPPORT_UNIT } from "../src/data/UnitDefinitions";

interface SfxVoice {
  event: string;
  requestedName: string;
  positional: boolean;
  sourceState: "playing" | "ended";
}

const APP_BASE = process.env.AUDIO_TEST_BASE ?? "/";
const NORMALIZED_BASE = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;

function appUrl(): string {
  return new URL(`${NORMALIZED_BASE}?uiVerification=1&audioVerification=1&sfxVerification=1`, "http://127.0.0.1:4173").href;
}

async function boot(page: Page): Promise<void> {
  await page.goto(appUrl(), { waitUntil: "networkidle" });
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
  await page.waitForSelector("#music-settings-audio");
  await page.waitForFunction(() => (window as any).frostboundSfx.snapshot().unlocked === true);
}

async function gameCall(page: Page, name: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(({ method, params }) => {
    const api = (window as any).frostbound?.api?.();
    const fn = api?.[method];
    if (typeof fn === "function") fn(...params);
  }, { method: name, params: args });
}

const attackRoster = [...ALLY_UNITS, GROUND_SUPPORT_UNIT, ...ENEMY_UNITS]
  .filter((unit) => unit.attackType !== "none");

const expectedFamilies: Record<string, string> = {
  warrior: "allyAttack",
  shield: "wallHit",
  archer: "heroRanged",
  medic: "medicHeal",
  mage: "frostCast",
  assault: "allyAttack",
  musketeer: "musketFire",
  frostmage: "frostCast",
  groundSupport: "musketFire",
  grunt: "enemyAttack",
  slinger: "heroRanged",
  bruiser: "wallHit",
  marksman: "heroRanged",
  juggernaut: "wallHit",
  bombardier: "bomberBlast",
  boss: "bossSlam",
  breacher: "wallHit",
  icearmor: "armorBreak",
  commander: "commanderHorn",
  flyingMelee: "enemyAttack",
  flyingEliteArcher: "heroRanged",
  flyingBomber: "bomberBlast",
  flyingColossus: "bossSlam",
};

test("every attack-capable roster character declares an attack cue family", () => {
  const missing = attackRoster
    .filter((unit) => !unit.attackSoundOverride)
    .map((unit) => unit.id);
  expect(missing).toEqual([]);

  const actual = Object.fromEntries(
    attackRoster.map((unit) => [unit.id, unit.attackSoundOverride]),
  );
  expect(actual).toEqual(expectedFamilies);

  expect(ALLY_UNITS.find((unit) => unit.id === "flagbearer")?.supportAura).toBeDefined();
  expect(ALLY_UNITS.find((unit) => unit.id === "engineer")?.canRepair).toBe(true);
  expect(ENEMY_UNITS.find((unit) => unit.id === "bomber")?.selfDestruct).toBeDefined();
});

test("every roster attack cue resolves to a real WebAudio source", async ({ page }) => {
  await boot(page);
  const uniqueCues = [...new Set(attackRoster.map((unit) => unit.attackSoundOverride!))];

  for (const requestedName of uniqueCues) {
    const voice = await page.evaluate((name) => {
      const audio = (window as any).frostboundSfx;
      audio.playAt(name, 3, -2, 0.24, 1, -8);
      return (audio.snapshot().activeVoices as SfxVoice[])
        .filter((candidate) => candidate.requestedName === name)
        .sort((a, b) => Number((b as any).id ?? 0) - Number((a as any).id ?? 0))[0] ?? null;
    }, requestedName);
    expect(voice, `${requestedName} should create a real active source`).not.toBeNull();
    expect(voice?.sourceState).toBe("playing");
    await page.waitForTimeout(850);
  }
});

test("the non-attacking Flagbearer emits a restrained positional aura cue", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "spawnAlly", "flagbearer", 0, -5);

  const voice = await page.evaluate(() => {
    const game = (window as any).frostbound;
    const audio = (window as any).frostboundSfx;
    for (let frame = 0; frame < 30; frame++) {
      game.step(0.05, 1, false);
      const found = (audio.snapshot().activeVoices as SfxVoice[])
        .filter((candidate) => candidate.requestedName === "commanderHorn")
        .sort((a, b) => Number((b as any).id ?? 0) - Number((a as any).id ?? 0))[0];
      if (found) return found;
    }
    return null;
  });

  expect(voice).not.toBeNull();
  expect(voice?.sourceState).toBe("playing");
  expect(voice?.positional).toBe(true);
});
