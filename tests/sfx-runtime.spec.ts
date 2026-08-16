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
  | "uiError"
  | "footstep"
  | "enemyAttack"
  | "healing"
  | "teleport"
  | "waveStart"
  | "bossSpawn"
  | "furnaceUpgrade"
  | "victory"
  | "defeat"
  | "gatherWood"
  | "gatherStone"
  | "bossWindup"
  | "commanderHorn"
  | "heroDown"
  | "heroRevive";

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

async function stepUntilVoice(
  page: Page,
  event: CoreSfxName,
  maxFrames = 40,
  requestedName?: string,
): Promise<SfxSnapshot> {
  for (let frame = 0; frame < maxFrames; frame++) {
    await step(page, 0.05);
    const snapshot = await sfxSnapshot(page);
    const found = playing(snapshot, event).some((voice) => requestedName === undefined || voice.requestedName === requestedName);
    if (found) return snapshot;
  }
  const snapshot = await sfxSnapshot(page);
  throw new Error(
    `Timed out waiting for ${event}${requestedName ? ` (${requestedName})` : ""}; active=${JSON.stringify(snapshot.activeVoices)}`,
  );
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
    footstep: 3,
    bossSpawn: 1,
    victory: 1,
    defeat: 1,
    furnaceUpgrade: 2,
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
    // Wait for the longest swing recipe to end so this test measures variation
    // selection, not the intentional per-event concurrency cap of two voices.
    await page.waitForTimeout(220);
  }
  expect(picked[1]).not.toBe(picked[0]);
  expect(picked[2]).not.toBe(picked[1]);
});

test("legacy high-salience sounds keep dedicated semantic events", async ({ page }) => {
  await boot(page);
  const cases: Array<[CoreSfxName, CoreSfxName]> = [
    ["bossSpawn", "artilleryExplosion"],
    ["victory", "uiConfirm"],
    ["defeat", "uiError"],
    ["furnaceUpgrade", "magicAttack"],
  ];

  for (const [event, forbidden] of cases) {
    await play(page, event, 0.65);
    const snapshot = await sfxSnapshot(page);
    const voice = latest(snapshot, event);
    expect(voice?.requestedName).toBe(event);
    expect(voice?.sourceState).toBe("playing");
    expect(snapshot.activeVoices.some((candidate) => candidate.requestedName === event && candidate.event === forbidden)).toBe(false);
    await page.waitForTimeout(90);
  }
});

test("real Hero movement emits footstep semantic, never squad melee", async ({ page }) => {
  await boot(page);
  await gameCall(page, "startStage", "stage-1");

  const start = await page.evaluate(() => {
    const p = (window as any).frostbound?.game?.s?.hero?.position;
    return { x: Number(p?.x ?? 0), z: Number(p?.z ?? 0) };
  });

  await page.keyboard.down("w");
  let snapshot: SfxSnapshot | null = null;
  try {
    for (let frame = 0; frame < 60; frame++) {
      await step(page, 0.05);
      const candidate = await sfxSnapshot(page);
      if (playing(candidate, "footstep").some((voice) => voice.requestedName === "footstep")) {
        snapshot = candidate;
        break;
      }
    }
  } finally {
    await page.keyboard.up("w");
  }

  const end = await page.evaluate(() => {
    const p = (window as any).frostbound?.game?.s?.hero?.position;
    return { x: Number(p?.x ?? 0), z: Number(p?.z ?? 0) };
  });
  expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeGreaterThan(1.5);
  expect(snapshot, "Hero moved but no footstep voice was observed").not.toBeNull();
  expect(latest(snapshot!, "footstep")?.requestedName).toBe("footstep");
  expect(snapshot!.activeVoices.some((voice) => voice.requestedName === "footstep" && voice.event === "squadMelee")).toBe(false);
});

test("cooldown, per-event concurrency and the global cap prevent a death noise wall", async ({ page }) => {
  await boot(page);

  const cooldown = await page.evaluate(() => {
    const api = (window as any).frostboundSfx;
    const before = api.snapshot().droppedByCooldown as number;
    api.playAt("enemyHit", 2, -2, 0.5, 1, 0);
    api.playAt("enemyHit", 2.2, -2, 0.5, 1, 0);
    return { before, after: api.snapshot().droppedByCooldown as number };
  });
  expect(cooldown.after).toBeGreaterThan(cooldown.before);

  await page.waitForTimeout(80);
  const concurrency = await page.evaluate(async () => {
    const api = (window as any).frostboundSfx;
    const before = api.snapshot().droppedByConcurrency as number;
    for (let i = 0; i < 5; i++) {
      api.playAt("enemyDeath", 3 + i * 0.2, -2, 0.55, 1, 0);
      if (i < 4) await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
    }
    const snapshot = api.snapshot();
    return {
      before,
      after: snapshot.droppedByConcurrency as number,
      deathVoices: snapshot.activeVoices.filter((voice: SfxVoice) => voice.event === "enemyDeath" && voice.sourceState === "playing").length,
      activeCount: snapshot.activeCount as number,
      totalCap: snapshot.totalConcurrencyCap as number,
    };
  });
  expect(concurrency.deathVoices).toBeLessThanOrEqual(4);
  expect(concurrency.after).toBeGreaterThan(concurrency.before);
  expect(concurrency.activeCount).toBeLessThanOrEqual(concurrency.totalCap);
  expect(concurrency.totalCap).toBe(16);
  expect(concurrency.totalCap).toBeLessThan(20);

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
  await gameCall(page, "setHeroSkillCooldown", "seismicWave", 999);
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "grunt", 0, -3.5);

  let snapshot = await stepUntilVoice(page, "heroMeleeSwing", 24, "heroMelee");
  expect(playing(snapshot, "heroMeleeHit")).toHaveLength(0);

  await gameCall(page, "killAllEnemies");
  await step(page, 0.45);
  snapshot = await sfxSnapshot(page);
  expect(playing(snapshot, "heroMeleeHit")).toHaveLength(0);

  await page.waitForTimeout(260);
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "setHeroSkillCooldown", "seismicWave", 999);
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "bruiser", 0, -3.5);
  await stepUntilVoice(page, "heroMeleeSwing", 24, "heroMelee");
  snapshot = await stepUntilVoice(page, "heroMeleeHit", 24);
  expect(playing(snapshot, "heroMeleeHit").length).toBeGreaterThan(0);
  expect(playing(snapshot, "enemyHit").length).toBeGreaterThan(0);

  // CombatDirector owns enemyHit; the existing unitDeath(x,z) callback owns
  // exactly one positional enemyDeath voice when the unit actually dies.
  snapshot = await stepUntilVoice(page, "enemyDeath", 160, "enemyDeath");
  expect(playing(snapshot, "enemyDeath")).toHaveLength(1);
  expect(latest(snapshot, "enemyDeath")).toMatchObject({ requestedName: "enemyDeath", positional: true });

  await page.waitForTimeout(750);
  await gameCall(page, "startStage", "stage-1");
  await gameCall(page, "setHeroSkillCooldown", "seismicWave", 999);
  await gameCall(page, "teleport", 0, -5);
  await gameCall(page, "spawnEnemy", "bruiser", 0, 1.5);
  snapshot = await stepUntilVoice(page, "heroRangedShot", 40, "heroRanged");
  expect(playing(snapshot, "heroRangedShot").length).toBeGreaterThan(0);
});

test("real squad attack starts preserve melee, gunshot and magic distinctions", async ({ page }) => {
  await boot(page);

  const expectSquadEvent = async (
    ally: string,
    event: CoreSfxName,
    requestedName: string,
    enemyDistance: number,
  ): Promise<void> => {
    await gameCall(page, "startStage", "stage-1");
    await gameCall(page, "teleport", 28, 28);
    await gameCall(page, "spawnAlly", ally, 0, -5);
    await gameCall(page, "spawnEnemy", "bruiser", 0, -5 + enemyDistance);
    const snapshot = await stepUntilVoice(page, event, 80, requestedName);
    expect(
      playing(snapshot, event).some((voice) => voice.requestedName === requestedName),
      `${ally} should start ${event} through ${requestedName}`,
    ).toBe(true);
  };

  await expectSquadEvent("warrior", "squadMelee", "allyAttack", 1.5);
  await expectSquadEvent("musketeer", "squadGunshot", "musketFire", 7);
  await expectSquadEvent("frostmage", "magicAttack", "frostCast", 7);

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
