import { expect, test, type Page } from "@playwright/test";

type CoreSfxName =
  | "heroMeleeSwing"
  | "heroMeleeHit"
  | "heroRangedShot"
  | "enemyHit"
  | "enemyDeath"
  | "squadMelee"
  | "squadGunshot"
  | "magicAttack"
  | "artilleryExplosion"
  | "buildPlace"
  | "uiConfirm"
  | "uiError";

interface SfxVoice {
  id: number;
  event: CoreSfxName;
  requestedName: string;
  variation: number;
  positional: boolean;
  priority: number;
  gain: number;
  pitch: number;
  x: number | null;
  z: number | null;
  sourceState: "playing" | "ended";
}

interface SfxSnapshot {
  unlocked: boolean;
  contextState: AudioContextState | "none";
  contextCreateCount: number;
  lifecycleListenerInstallCount: number;
  disposeCount: number;
  lifecycleSuspended: boolean;
  transientMuted: boolean;
  mix: { masterPercent: number; musicPercent: number; sfxPercent: number; muted: boolean };
  listener: { x: number; z: number };
  activeCount: number;
  totalConcurrencyCap: number;
  droppedByCooldown: number;
  droppedByConcurrency: number;
  variationCounts: Record<CoreSfxName, number>;
  activeVoices: SfxVoice[];
  ambientLoops: string[];
  voiceBusReserved: boolean;
}

const APP_BASE = process.env.AUDIO_TEST_BASE ?? "/";
const NORMALIZED_BASE = APP_BASE.endsWith("/") ? APP_BASE : `${APP_BASE}/`;

function appUrl(): string {
  return new URL(`${NORMALIZED_BASE}?uiVerification=1&audioVerification=1&sfxVerification=1`, "http://127.0.0.1:4173").href;
}

async function boot(page: Page, stopLoop = true): Promise<void> {
  await page.goto(appUrl(), { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => Boolean((window as any).frostbound && (window as any).frostboundAudio && (window as any).frostboundSfx),
    null,
    { timeout: 60_000 },
  );
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  if (stopLoop) await page.evaluate(() => (window as any).frostbound.stopLoop());

  // Real pointer input must unlock both the BGM and SFX AudioContexts.
  await page.locator("[data-settings]").click();
  await page.waitForSelector("#music-settings-audio");
  await page.waitForFunction(() => (window as any).frostboundSfx.snapshot().unlocked === true);
  await expect.poll(async () => (await sfxSnapshot(page)).contextState).toBe("running");
}

async function sfxSnapshot(page: Page): Promise<SfxSnapshot> {
  return page.evaluate(() => (window as any).frostboundSfx.snapshot());
}

async function play(page: Page, name: string, volume = 1, pitch = 1): Promise<void> {
  await page.evaluate(({ name, volume, pitch }) => (window as any).frostboundSfx.play(name, volume, pitch), {
    name, volume, pitch,
  });
}

async function playAt(page: Page, name: string, x: number, z: number, volume = 1, pitch = 1, priorityBoost = 0): Promise<void> {
  await page.evaluate(
    ({ name, x, z, volume, pitch, priorityBoost }) =>
      (window as any).frostboundSfx.playAt(name, x, z, volume, pitch, priorityBoost),
    { name, x, z, volume, pitch, priorityBoost },
  );
}

async function gameCall(page: Page, name: string, ...args: unknown[]): Promise<string | number | boolean | null> {
  return page.evaluate(
    ({ method, params }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[method];
      if (typeof fn !== "function") return null;
      const result = fn(...params);
      if (result === null || result === undefined) return null;
      const type = typeof result;
      return type === "string" || type === "number" || type === "boolean" ? result : null;
    },
    { method: name, params: args },
  );
}

async function step(page: Page, seconds: number): Promise<void> {
  const frames = Math.max(1, Math.ceil(seconds / 0.05));
  await page.evaluate(({ frames }) => (window as any).frostbound?.step?.(0.05, frames, false), { frames });
}

function playing(snapshot: SfxSnapshot, event: CoreSfxName): SfxVoice[] {
  return snapshot.activeVoices.filter((voice) => voice.event === event && voice.sourceState === "playing");
}

function latest(snapshot: SfxSnapshot, event: CoreSfxName): SfxVoice | undefined {
  return playing(snapshot, event).sort((a, b) => b.id - a.id)[0];
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      for (const key of [
        "frostbound.audio.master",
        "frostbound.audio.sfx",
        "frostbound.audio.muted",
        "frostbound.music.volume",
        "frostbound.music.muted",
      ]) localStorage.removeItem(key);
    } catch {
      // about:blank can deny storage before the real origin is committed.
    }
  });
});

test("SFX graph unlocks once, reserves Voice, and starts exactly one ambience pair", async ({ page }) => {
  await boot(page);
  const first = await sfxSnapshot(page);
  expect(first.contextCreateCount).toBe(1);
  expect(first.lifecycleListenerInstallCount).toBe(1);
  expect(first.totalConcurrencyCap).toBe(16);
  expect(first.voiceBusReserved).toBe(true);
  expect(first.ambientLoops.sort()).toEqual(["coldWind", "furnace"]);
  expect(first.mix).toEqual({ masterPercent: 100, musicPercent: 40, sfxPercent: 72, muted: false });
  expect(page.url()).toContain(NORMALIZED_BASE);

  await page.evaluate(() => (window as any).frostboundSfx.unlock());
  await page.evaluate(() => (window as any).frostboundSfx.unlock());
  const repeated = await sfxSnapshot(page);
  expect(repeated.contextCreateCount).toBe(1);
  expect(repeated.lifecycleListenerInstallCount).toBe(1);
  expect(repeated.ambientLoops.sort()).toEqual(["coldWind", "furnace"]);
});

test("variation pools play real WebAudio sources with bounded pitch and volume jitter", async ({ page }) => {
  await boot(page);
  const counts = (await sfxSnapshot(page)).variationCounts;
  expect(counts).toMatchObject({
    heroMeleeSwing: 3,
    heroMeleeHit: 3,
    heroRangedShot: 3,
    enemyHit: 4,
    enemyDeath: 4,
    squadMelee: 3,
    squadGunshot: 3,
    magicAttack: 3,
    artilleryExplosion: 3,
    buildPlace: 2,
    uiConfirm: 1,
    uiError: 1,
  });

  const picked: number[] = [];
  for (let i = 0; i < 3; i++) {
    await play(page, "heroMeleeSwing", 0.8, 1);
    const voice = latest(await sfxSnapshot(page), "heroMeleeSwing");
    expect(voice?.sourceState).toBe("playing");
    expect(voice?.gain).toBeGreaterThan(0.74);
    expect(voice?.gain).toBeLessThan(0.86);
    expect(voice?.pitch).toBeGreaterThan(0.95);
    expect(voice?.pitch).toBeLessThan(1.05);
    picked.push(voice!.variation);
    await page.waitForTimeout(60);
  }
  expect(picked[1]).not.toBe(picked[0]);
  expect(picked[2]).not.toBe(picked[1]);
});

test("cooldown, per-event concurrency and the global cap prevent a death noise wall", async ({ page }) => {
  await boot(page);

  const beforeCooldown = await sfxSnapshot(page);
  await playAt(page, "enemyHit", 2, -2, 0.5);
  await playAt(page, "enemyHit", 2.2, -2, 0.5);
  const afterCooldown = await sfxSnapshot(page);
  expect(afterCooldown.droppedByCooldown).toBeGreaterThan(beforeCooldown.droppedByCooldown);

  // Death duration is >=250 ms and cooldown is 35 ms. Five launches spaced
  // 45 ms therefore overlap, so the fifth must hit the per-event cap of four.
  await page.waitForTimeout(80);
  const beforeConcurrency = (await sfxSnapshot(page)).droppedByConcurrency;
  for (let i = 0; i < 5; i++) {
    await playAt(page, "enemyDeath", 3 + i * 0.2, -2, 0.55);
    if (i < 4) await page.waitForTimeout(45);
  }
  const capped = await sfxSnapshot(page);
  expect(playing(capped, "enemyDeath").length).toBeLessThanOrEqual(4);
  expect(capped.droppedByConcurrency).toBeGreaterThan(beforeConcurrency);
  expect(capped.activeCount).toBeLessThanOrEqual(capped.totalConcurrencyCap);
  expect(capped.totalConcurrencyCap).toBeLessThan(20);

  // A burst of many low-priority hit/death requests still cannot create 20+
  // simultaneous voices, even when they originate at different world points.
  for (let i = 0; i < 40; i++) {
    await playAt(page, i % 2 === 0 ? "enemyHit" : "enemyDeath", 4 + (i % 5), i % 3, 0.5);
  }
  expect((await sfxSnapshot(page)).activeCount).toBeLessThanOrEqual(16);
});

test("world SFX are positional and attenuated while UI feedback remains centred", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window as any).frostboundSfx.setListenerPosition(0, 0));
  const attenuation = await page.evaluate(() => ({
    near: (window as any).frostboundSfx.attenuationForDistance(2),
    mid: (window as any).frostboundSfx.attenuationForDistance(12),
    far: (window as any).frostboundSfx.attenuationForDistance(44),
  }));
  expect(attenuation.near).toBe(1);
  expect(attenuation.mid).toBeGreaterThan(0);
  expect(attenuation.mid).toBeLessThan(1);
  expect(attenuation.far).toBe(0);

  await playAt(page, "enemyHit", 12, 0, 0.6);
  const world = latest(await sfxSnapshot(page), "enemyHit");
  expect(world).toMatchObject({ positional: true, x: 12, z: 0, sourceState: "playing" });

  await playAt(page, "uiConfirm", 20, 20, 0.6);
  const ui = latest(await sfxSnapshot(page), "uiConfirm");
  expect(ui?.positional).toBe(false);
  expect(ui?.x).toBeNull();
  expect(ui?.z).toBeNull();
});

test("Master, Music and SFX controls are independent and shared mute reaches both runtimes", async ({ page }) => {
  await boot(page);

  const setSlider = async (selector: string, value: string): Promise<void> => {
    await page.locator(selector).evaluate((input, value) => {
      const slider = input as HTMLInputElement;
      slider.value = String(value);
      slider.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
  };
  await setSlider("#master-volume", "87");
  await setSlider("#music-volume", "35");
  await setSlider("#sfx-volume", "61");

  const mixed = await page.evaluate(() => ({
    music: (window as any).frostboundAudio.snapshot(),
    sfx: (window as any).frostboundSfx.snapshot(),
  }));
  expect(mixed.music.masterVolumePercent).toBe(87);
  expect(mixed.music.volumePercent).toBe(35);
  expect(mixed.music.sfxVolumePercent).toBe(61);
  expect(mixed.sfx.mix).toEqual({ masterPercent: 87, musicPercent: 35, sfxPercent: 61, muted: false });

  await page.locator("#music-mute").click();
  const muted = await page.evaluate(() => ({
    music: (window as any).frostboundAudio.snapshot().muted,
    sfx: (window as any).frostboundSfx.snapshot().mix.muted,
  }));
  expect(muted).toEqual({ music: true, sfx: true });
});

test("real gameplay separates Hero swing from hit and produces ranged, enemy-hit and death SFX", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "grunt", 0, -3.5);

  // One simulation frame acquires the target and begins the melee animation.
  await step(page, 0.05);
  let snapshot = await sfxSnapshot(page);
  expect(playing(snapshot, "heroMeleeSwing").length).toBeGreaterThan(0);
  expect(playing(snapshot, "heroMeleeHit")).toHaveLength(0);

  // Kill the target before the animation's actual hit frame: this is a real
  // gameplay miss/abort path, so no impact is allowed to appear retroactively.
  await gameCall(page, "killAllEnemies");
  await step(page, 0.45);
  snapshot = await sfxSnapshot(page);
  expect(playing(snapshot, "heroMeleeHit")).toHaveLength(0);
  expect(playing(snapshot, "enemyDeath").length).toBeGreaterThan(0);

  // Fresh target survives through the real hit frame: attack + impact now layer.
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "bruiser", 0, -3.5);
  await step(page, 0.4);
  snapshot = await sfxSnapshot(page);
  expect(playing(snapshot, "heroMeleeSwing").length).toBeGreaterThan(0);
  expect(playing(snapshot, "heroMeleeHit").length).toBeGreaterThan(0);
  expect(playing(snapshot, "enemyHit").length).toBeGreaterThan(0);

  // A target outside melee threshold uses the existing ranged attack path.
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "bruiser", 0, 1.5);
  await step(page, 0.05);
  snapshot = await sfxSnapshot(page);
  expect(playing(snapshot, "heroRangedShot").length).toBeGreaterThan(0);
});

test("real squad attack starts preserve melee, gunshot and magic distinctions", async ({ page }) => {
  await boot(page);

  const expectSquadEvent = async (ally: string, event: CoreSfxName, enemyDistance: number): Promise<void> => {
    await gameCall(page, "startStage", "stage-1");
    await gameCall(page, "teleport", 28, 28);
    await gameCall(page, "spawnAlly", ally, 0, -5);
    await gameCall(page, "spawnEnemy", "bruiser", 0, -5 + enemyDistance);
    await step(page, 0.7);
    const snapshot = await sfxSnapshot(page);
    expect(playing(snapshot, event).length, `${ally} should start ${event}`).toBeGreaterThan(0);
  };

  await expectSquadEvent("warrior", "squadMelee", 1.5);
  await expectSquadEvent("musketeer", "squadGunshot", 7);
  await expectSquadEvent("frostmage", "magicAttack", 7);

  // Recipes are independent semantic voices, not the same event renamed.
  await playAt(page, "artilleryExplosion", 0, 0, 0.6);
  const final = await sfxSnapshot(page);
  expect(latest(final, "artilleryExplosion")?.sourceState).toBe("playing");
  expect(final.variationCounts.artilleryExplosion).toBe(3);
  expect(final.variationCounts.magicAttack).toBe(3);
});

test("build/UI feedback plays and dispose/reload does not duplicate SFX contexts or ambience", async ({ page }) => {
  await boot(page);
  await play(page, "buildPlace", 0.7);
  await play(page, "uiConfirm", 0.7);
  let snapshot = await sfxSnapshot(page);
  expect(latest(snapshot, "buildPlace")?.sourceState).toBe("playing");
  expect(latest(snapshot, "uiConfirm")?.sourceState).toBe("playing");

  const createCount = snapshot.contextCreateCount;
  const listenerCount = snapshot.lifecycleListenerInstallCount;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  await expect.poll(async () => (await sfxSnapshot(page)).contextState).toBe("suspended");
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await expect.poll(async () => (await sfxSnapshot(page)).contextState).toBe("running");
  snapshot = await sfxSnapshot(page);
  expect(snapshot.contextCreateCount).toBe(createCount);
  expect(snapshot.lifecycleListenerInstallCount).toBe(listenerCount);
  expect(snapshot.ambientLoops.sort()).toEqual(["coldWind", "furnace"]);

  await page.evaluate(() => (window as any).frostboundSfx.dispose());
  const disposed = await sfxSnapshot(page);
  expect(disposed.contextState).toBe("none");
  expect(disposed.activeCount).toBe(0);
  expect(disposed.ambientLoops).toHaveLength(0);

  await boot(page);
  const reloaded = await sfxSnapshot(page);
  expect(reloaded.contextCreateCount).toBe(1);
  expect(reloaded.ambientLoops.sort()).toEqual(["coldWind", "furnace"]);
});
