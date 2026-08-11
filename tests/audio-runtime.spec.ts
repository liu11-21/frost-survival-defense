import { expect, test, type Page } from "@playwright/test";

type MusicState = "MENU" | "PREPARATION" | "WARNING" | "COMBAT" | "INTENSE" | "WAVE_CLEAR";
type WavePhase = "prep" | "active" | "intermission" | "finished";

interface AudioSnapshot {
  requestedState: MusicState | null;
  activeState: MusicState | null;
  unlocked: boolean;
  volumePercent: number;
  muted: boolean;
  transitionCount: number;
  crossfadeSeconds: number;
  tracks: Record<MusicState, string>;
  channels: Array<{ state: MusicState | null; paused: boolean; src: string; gain: number; currentTime: number }>;
  contextState: AudioContextState | "none";
  lifecycleSuspended: boolean;
  contextCreateCount: number;
  lifecycleListenerInstallCount: number;
  disposeCount: number;
}

interface GameplayAudioSnapshot {
  phase: WavePhase | null;
  pressure: number;
  enterDwell: number;
  exitDwell: number;
  intenseHold: number;
  reentryCooldown: number;
  intermissionElapsed: number;
}

const APP_BASE = process.env.AUDIO_TEST_BASE ?? "/";
const NORMALIZED_BASE = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;

function appUrl(query: string): string {
  return new URL(`${NORMALIZED_BASE}?${query}`, "http://127.0.0.1:4173").href;
}

async function boot(page: Page): Promise<void> {
  await page.goto(appUrl("uiVerification=1&audioVerification=1"), { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound && (window as any).frostboundAudio), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  // A real pointer gesture exercises browser autoplay unlocking.
  await page.locator("[data-settings]").click();
  await page.waitForSelector("#music-settings-audio");
  await page.waitForFunction(() => (window as any).frostboundAudio.snapshot().unlocked === true);
}

async function audioSnapshot(page: Page): Promise<AudioSnapshot> {
  return page.evaluate(() => (window as any).frostboundAudio.snapshot());
}

async function gameplayAudioSnapshot(page: Page): Promise<GameplayAudioSnapshot> {
  return page.evaluate(() => (window as any).frostboundAudioGameplay.snapshot());
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

function channelFor(snapshot: AudioSnapshot, state: MusicState) {
  return snapshot.channels.find((channel) => channel.state === state);
}

async function expectTrackPlaying(page: Page, state: MusicState): Promise<void> {
  await expect
    .poll(async () => {
      const snapshot = await audioSnapshot(page);
      const channel = channelFor(snapshot, state);
      return {
        activeState: snapshot.activeState,
        paused: channel?.paused ?? true,
        src: channel?.src ?? "",
      };
    })
    .toMatchObject({ activeState: state, paused: false, src: expect.stringContaining("/assets/audio/music/") });

  const before = channelFor(await audioSnapshot(page), state)?.currentTime ?? 0;
  await page.waitForTimeout(320);
  const after = channelFor(await audioSnapshot(page), state)?.currentTime ?? 0;
  expect(after, `${state} media currentTime should advance`).toBeGreaterThan(before + 0.08);
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

test("state mapping and Pages base-path resolution serve the real MP3s", async ({ page }) => {
  await boot(page);
  const snapshot = await audioSnapshot(page);

  expect(snapshot.requestedState).toBe("MENU");
  expect(snapshot.volumePercent).toBe(40);
  expect(snapshot.crossfadeSeconds).toBe(1.2);
  expect(snapshot.contextCreateCount).toBe(1);
  expect(snapshot.lifecycleListenerInstallCount).toBe(1);
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
    expect((await response.body()).byteLength, `${state} asset should be non-empty`).toBeGreaterThan(100_000);
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

  await expectTrackPlaying(page, "MENU");
  const active = channelFor(await audioSnapshot(page), "MENU");
  expect(active?.src).toContain(`${NORMALIZED_BASE}assets/audio/music/menu-idle.mp3`);
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

test("duplicate state does not restart and crossfade cleans the old playing channel", async ({ page }) => {
  await boot(page);
  await setAudioState(page, "PREPARATION");
  await page.waitForTimeout(1400);
  const settled = await audioSnapshot(page);
  const beforeDuplicate = settled.transitionCount;
  expect(settled.activeState).toBe("PREPARATION");
  expect(settled.channels.filter((channel) => channel.state !== null)).toHaveLength(1);
  await expectTrackPlaying(page, "PREPARATION");

  await setAudioState(page, "PREPARATION");
  expect((await audioSnapshot(page)).transitionCount).toBe(beforeDuplicate);

  await setAudioState(page, "COMBAT");
  const crossing = await audioSnapshot(page);
  expect(crossing.transitionCount).toBe(beforeDuplicate + 1);
  expect(crossing.channels.filter((channel) => channel.state !== null).map((channel) => channel.state).sort()).toEqual(
    ["COMBAT", "PREPARATION"].sort(),
  );
  expect(channelFor(crossing, "COMBAT")?.paused).toBe(false);

  await page.waitForTimeout(1400);
  const after = await audioSnapshot(page);
  expect(after.activeState).toBe("COMBAT");
  expect(after.channels.filter((channel) => channel.state !== null)).toHaveLength(1);
  expect(channelFor(after, "COMBAT")?.paused).toBe(false);
  expect(after.channels.find((channel) => channel.state === null)?.paused).toBe(true);
  await expectTrackPlaying(page, "COMBAT");
});

test("BFCache lifecycle can hide/show repeatedly, then terminal leave disposes immediately", async ({ page }) => {
  await boot(page);
  await setAudioState(page, "COMBAT");
  await expectTrackPlaying(page, "COMBAT");

  const initial = await audioSnapshot(page);
  expect(initial.contextState).toBe("running");
  const createCount = initial.contextCreateCount;
  const listenerCount = initial.lifecycleListenerInstallCount;

  for (let round = 0; round < 2; round++) {
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    await expect.poll(async () => (await audioSnapshot(page)).lifecycleSuspended).toBe(true);
    const hidden = await audioSnapshot(page);
    expect(hidden.contextState).toBe("suspended");
    expect(hidden.channels.filter((channel) => channel.state !== null).every((channel) => channel.paused)).toBe(true);
    const hiddenTime = channelFor(hidden, "COMBAT")?.currentTime ?? 0;
    await page.waitForTimeout(250);
    expect(channelFor(await audioSnapshot(page), "COMBAT")?.currentTime ?? 0).toBeLessThan(hiddenTime + 0.04);

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(async () => (await audioSnapshot(page)).lifecycleSuspended).toBe(false);
    await expect.poll(async () => (await audioSnapshot(page)).contextState).toBe("running");
    await expectTrackPlaying(page, "COMBAT");

    const resumed = await audioSnapshot(page);
    expect(resumed.contextCreateCount).toBe(createCount);
    expect(resumed.lifecycleListenerInstallCount).toBe(listenerCount);
  }

  const beforeDispose = await audioSnapshot(page);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  const disposed = await audioSnapshot(page);
  expect(disposed.disposeCount).toBe(beforeDispose.disposeCount + 1);
  expect(disposed.contextState).toBe("none");
  expect(disposed.channels).toHaveLength(0);
  expect(disposed.unlocked).toBe(false);
});

test("real navigation emits page lifecycle events and back navigation remains operable", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "audio.test.lifecycle.events";
    const append = (type: string, persisted: boolean): void => {
      const current = JSON.parse(sessionStorage.getItem(key) ?? "[]") as Array<{ type: string; persisted: boolean }>;
      current.push({ type, persisted });
      sessionStorage.setItem(key, JSON.stringify(current));
    };
    window.addEventListener("pagehide", (event) => append("pagehide", (event as PageTransitionEvent).persisted));
    window.addEventListener("pageshow", (event) => append("pageshow", (event as PageTransitionEvent).persisted));
  });

  await boot(page);
  await setAudioState(page, "COMBAT");
  await expectTrackPlaying(page, "COMBAT");
  await page.evaluate(() => sessionStorage.setItem("audio.test.lifecycle.events", "[]"));

  await page.goto(appUrl("audioVerification=1&lifecycleTarget=1"), { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as any).frostboundAudio), null, { timeout: 30_000 });

  const events = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("audio.test.lifecycle.events") ?? "[]") as Array<{ type: string; persisted: boolean }>,
  );
  console.log(`actual-navigation-lifecycle=${JSON.stringify(events)}`);
  expect(events.some((event) => event.type === "pagehide")).toBe(true);
  expect(events.some((event) => event.type === "pageshow")).toBe(true);

  const usedBfcache = events.some((event) => event.type === "pagehide" && event.persisted);
  if (usedBfcache) {
    expect(events.some((event) => event.type === "pageshow" && event.persisted)).toBe(true);
  }
});

test("real gameplay drives audible PREPARATION → WARNING → COMBAT → WAVE_CLEAR → PREPARATION", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");
  expect((await audioSnapshot(page)).requestedState).toBe("PREPARATION");
  await expectTrackPlaying(page, "PREPARATION");

  // Canonical WaveManager prep countdown crosses its existing 4-second preview.
  await step(page, 45.5);
  expect((await audioSnapshot(page)).requestedState).toBe("PREPARATION");
  await step(page, 0.6);
  expect((await audioSnapshot(page)).requestedState).toBe("WARNING");
  await expectTrackPlaying(page, "WARNING");

  await gameCall(page, "forceNextWave");
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");
  await expectTrackPlaying(page, "COMBAT");

  await step(page, 4);
  await gameCall(page, "killAllEnemies");
  await step(page, 0.1);
  expect((await audioSnapshot(page)).requestedState).toBe("WAVE_CLEAR");
  expect((await gameplayAudioSnapshot(page)).phase).toBe("intermission");
  await expectTrackPlaying(page, "WAVE_CLEAR");

  // The return is phase-driven and bounded by a short audio stinger hold; it
  // never waits for the 30.77-second MP3 to finish or guesses the wave timer.
  await step(page, 2.5);
  expect((await audioSnapshot(page)).requestedState).toBe("PREPARATION");
  expect((await gameplayAudioSnapshot(page)).phase).toBe("intermission");
  await expectTrackPlaying(page, "PREPARATION");

  // Remaining canonical intermission reaches the existing warning event.
  await step(page, 15.6);
  expect((await audioSnapshot(page)).requestedState).toBe("WARNING");
  await gameCall(page, "forceNextWave");
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");

  await gameCall(page, "startStage", "stage-1");
  for (let wave = 1; wave <= 10; wave++) await gameCall(page, "forceNextWave");
  expect((await audioSnapshot(page)).requestedState).toBe("INTENSE");
  await expectTrackPlaying(page, "INTENSE");
});

test("normal combat pressure enters and exits INTENSE with hysteresis and cooldown", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "forceNextWave");
  await step(page, 0.1);
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");

  // Real combat units placed near the core create pressure through the read-only
  // adapter; no wave/balance values are changed.
  for (let i = 0; i < 8; i++) {
    await gameCall(page, "spawnEnemy", "grunt", 9 + (i % 2), (i % 3) - 1);
  }
  await step(page, 1.5);
  const high = await gameplayAudioSnapshot(page);
  expect(high.phase).toBe("active");
  expect(high.pressure).toBeGreaterThanOrEqual(0.72);
  expect((await audioSnapshot(page)).requestedState).toBe("INTENSE");
  await expectTrackPlaying(page, "INTENSE");

  // Drop pressure while keeping one far enemy alive so the wave stays active.
  await gameCall(page, "killAllEnemies");
  await gameCall(page, "spawnEnemy", "bruiser", 35, 35);
  await step(page, 9);
  const low = await gameplayAudioSnapshot(page);
  expect(low.phase).toBe("active");
  expect(low.pressure).toBeLessThanOrEqual(0.42);
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");

  // Immediate pressure return cannot retrigger during the cooldown.
  for (let i = 0; i < 8; i++) {
    await gameCall(page, "spawnEnemy", "grunt", 9 + (i % 2), (i % 3) - 1);
  }
  await step(page, 2);
  expect((await audioSnapshot(page)).requestedState).toBe("COMBAT");
  expect((await gameplayAudioSnapshot(page)).reentryCooldown).toBeGreaterThan(0);

  await step(page, 3.5);
  expect((await audioSnapshot(page)).requestedState).toBe("INTENSE");
});
