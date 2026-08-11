import { expect, test, type Page } from "@playwright/test";

type MusicState = "MENU" | "PREPARATION" | "WARNING" | "COMBAT" | "INTENSE" | "WAVE_CLEAR";

interface AudioSnapshot {
  requestedState: MusicState | null;
  activeState: MusicState | null;
  unlocked: boolean;
  volumePercent: number;
  muted: boolean;
  transitionCount: number;
  crossfadeSeconds: number;
  tracks: Record<MusicState, string>;
  channels: Array<{ state: MusicState | null; paused: boolean; src: string; gain: number }>;
}

async function boot(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1&audioVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound && (window as any).frostboundAudio), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  // Use a real pointer gesture so the browser unlock contract is exercised,
  // rather than calling the verification API's unlock helper directly.
  await page.locator("[data-settings]").click();
  await page.waitForSelector("#music-settings-audio");
  await page.waitForFunction(() => (window as any).frostboundAudio.snapshot().unlocked === true);
}

async function audioSnapshot(page: Page): Promise<AudioSnapshot> {
  return page.evaluate(() => (window as any).frostboundAudio.snapshot());
}

async function setAudioState(page: Page, state: MusicState): Promise<void> {
  await page.evaluate((next) => (window as any).frostboundAudio.setState(next), state);
}

async function gameCall(page: Page, name: string, ...args: unknown[]): Promise<any> {
  return page.evaluate(
    ({ method, params }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[method];
      return typeof fn === "function" ? fn(...params) : null;
    },
    { method: name, params: args },
  );
}

async function step(page: Page, seconds: number): Promise<void> {
  const frames = Math.max(1, Math.ceil(seconds / 0.05));
  await page.evaluate(
    ({ frames }) => (window as any).frostbound?.step?.(0.05, frames, false),
    { frames },
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("frostbound.music.volume");
      localStorage.removeItem("frostbound.music.muted");
    } catch {
      // about:blank can deny storage before the real origin is committed.
    }
  });
});

test("state mapping and Vite base-path resolution are stable", async ({ page }) => {
  await boot(page);
  const snapshot = await audioSnapshot(page);

  expect(snapshot.requestedState).toBe("MENU");
  expect(snapshot.volumePercent).toBe(40);
  expect(snapshot.crossfadeSeconds).toBe(1.2);
  expect(Object.keys(snapshot.tracks).sort()).toEqual(
    ["MENU", "PREPARATION", "WARNING", "COMBAT", "INTENSE", "WAVE_CLEAR"].sort(),
  );
  const expectedTracks: Record<MusicState, string> = {
    MENU: "assets/audio/music/menu-idle.mp3",
    PREPARATION: "assets/audio/music/preparation.mp3",
    WARNING: "assets/audio/music/warning.mp3",
    COMBAT: "assets/audio/music/combat.mp3",
    INTENSE: "assets/audio/music/intense.mp3",
    WAVE_CLEAR: "assets/audio/music/wave-clear.mp3",
  };
  for (const [state, path] of Object.entries(snapshot.tracks) as Array<[MusicState, string]>) {
    expect(path).not.toMatch(/^\/assets\//);
    expect(path).toContain(expectedTracks[state]);
    const response = await page.request.get(new URL(path, page.url()).href);
    expect(response.ok(), `${state} asset should be served`).toBe(true);
  }

  const pagesPath = await page.evaluate(() =>
    (window as any).frostboundAudio.resolveForBase("COMBAT", "/frost-survival-defense/"),
  );
  expect(pagesPath).toBe("/frost-survival-defense/assets/audio/music/combat.mp3");

  const controls = await page.locator("#music-settings-audio").evaluate((section) => {
    const slider = section.querySelector<HTMLInputElement>("#music-volume");
    const mute = section.querySelector<HTMLButtonElement>("#music-mute");
    return { min: slider?.min, max: slider?.max, value: slider?.value, muteText: mute?.textContent };
  });
  expect(controls).toEqual({ min: "0", max: "100", value: "40", muteText: "靜音" });
});

test("music volume and mute persist through localStorage", async ({ page }) => {
  await boot(page);
  await page.locator("#music-volume").evaluate((input) => {
    const slider = input as HTMLInputElement;
    slider.value = "73";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#music-mute").click();

  const snapshot = await audioSnapshot(page);
  expect(snapshot.volumePercent).toBe(73);
  expect(snapshot.muted).toBe(true);
  const stored = await page.evaluate(() => ({
    volume: localStorage.getItem("frostbound.music.volume"),
    muted: localStorage.getItem("frostbound.music.muted"),
  }));
  expect(stored).toEqual({ volume: "0.73", muted: "1" });
});

test("duplicate state does not restart and crossfade cleans the outgoing channel", async ({ page }) => {
  await boot(page);
  await setAudioState(page, "PREPARATION");
  await page.waitForTimeout(1400);
  const settled = await audioSnapshot(page);
  const beforeDuplicate = settled.transitionCount;
  expect(settled.activeState).toBe("PREPARATION");
  expect(settled.channels.filter((channel) => channel.state !== null)).toHaveLength(1);

  await setAudioState(page, "PREPARATION");
  expect((await audioSnapshot(page)).transitionCount).toBe(beforeDuplicate);

  await setAudioState(page, "COMBAT");
  const crossing = await audioSnapshot(page);
  expect(crossing.transitionCount).toBe(beforeDuplicate + 1);
  expect(crossing.channels.filter((channel) => channel.state !== null).map((channel) => channel.state).sort()).toEqual(
    ["COMBAT", "PREPARATION"].sort(),
  );

  await page.waitForTimeout(1400);
  const after = await audioSnapshot(page);
  expect(after.activeState).toBe("COMBAT");
  expect(after.channels.filter((channel) => channel.state !== null)).toHaveLength(1);
  expect(after.channels.find((channel) => channel.state !== null)?.state).toBe("COMBAT");
});

test("existing gameplay events drive preparation, warning, combat, clear and boss intensity", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");
  expect((await audioSnapshot(page)).requestedState).toBe("PREPARATION");

  // Preparation countdown is owned by WaveManager. Step the real manager until
  // its existing wavePreview event crosses the 4-second warning boundary.
  await step(page, 45.5);
  expect((await audioSnapshot(page)).requestedState).toBe("PREPARATION");
  await step(page, 0.6);
  expect((await audioSnapshot(page)).requestedState).toBe("WARNING");

  await gameCall(page, "forceNextWave");
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");

  // First stage wave has all pending spawns out by 3 seconds. Kill only after
  // that, then let the canonical WaveManager observe an empty live field.
  await step(page, 4);
  await gameCall(page, "killAllEnemies");
  await step(page, 0.1);
  expect((await audioSnapshot(page)).requestedState).toBe("WAVE_CLEAR");

  // There is intentionally no invented post-clear timer in AudioDirector.
  // Existing gameplay will eventually publish wavePreview again; until then
  // the WAVE_CLEAR state remains authoritative.
  await step(page, 1);
  expect((await audioSnapshot(page)).requestedState).toBe("WAVE_CLEAR");

  await gameCall(page, "startStage", "stage-1");
  for (let wave = 1; wave <= 10; wave++) await gameCall(page, "forceNextWave");
  expect((await audioSnapshot(page)).requestedState).toBe("INTENSE");
});
