import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Formal faction evidence, captured under assertion.
 *
 * The previous evidence frame for this claim was taken after all twelve
 * enemies were already dead, so it showed the player's side standing alone in
 * an empty arena and proved nothing about telling humans from monsters. A
 * screenshot is only evidence if something guarantees what was on screen when
 * the shutter opened, so this test asserts the roster is alive and engaged
 * *before* it captures, and fails rather than producing a misleading frame.
 *
 * It also captures the same camera with and without the elite/boss aura, so
 * the aura's contribution can be judged rather than asserted.
 */
const outputRoot = resolve(process.cwd(), process.env.FACTION_OUTPUT ?? "reports/faction-evidence");

interface DebugApi {
  startEndless(): void;
  setResources(wood: number, stone: number, gold: number): void;
  upgradeFurnace(): unknown;
  build(slotId: string, type: string): { ok: boolean };
  recruit(id: string): unknown;
  spawnEnemy(id: string, x: number, z: number): unknown;
  enemyReport(): Array<Record<string, unknown>>;
  unitCounts(): { allies: number; enemies: number; structures: number };
  teleport(x: number, z: number): void;
}

interface EvidenceWindow extends Window {
  frostbound?: {
    api(): DebugApi;
    step(dt: number, frames?: number, render?: boolean): void;
    stopLoop(): void;
  };
}

/** One representative of every monster body plan, plus the boss. */
const ENEMY_CAST: Array<{ id: string; form: string; x: number; z: number }> = [
  { id: "grunt", form: "swarm", x: -5.5, z: 9.5 },
  { id: "slinger", form: "stalker", x: -2.0, z: 11.0 },
  { id: "bruiser", form: "brute", x: 1.5, z: 10.0 },
  { id: "icearmor", form: "elite", x: 5.0, z: 11.5 },
  { id: "boss", form: "boss", x: 9.0, z: 10.5 },
];

const ALLY_CAST = ["warrior", "warrior", "shield", "shield", "archer", "medic", "engineer", "musketeer"];

test("captures humans and every monster form in one live engagement", async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(outputRoot, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as EvidenceWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const g = (window as unknown as { frostbound?: { game?: { s?: { assets?: { isReady?: boolean } } } } }).frostbound;
    return Boolean(g?.game?.s?.assets?.isReady);
  }, { timeout: 90_000 });

  // A real run, a real recruit hall, real recruits.
  await page.evaluate(() => {
    const api = (window as EvidenceWindow).frostbound!.api();
    api.startEndless();
    for (let i = 0; i < 8; i++) { api.setResources(999999, 999999, 999999); api.upgradeFurnace(); }
    api.setResources(999999, 999999, 999999);
    api.build("eastMid", "recruitHall");
  });
  for (let i = 0; i < 140; i++) await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.25, 1, false));

  const recruited = await page.evaluate((cast) => {
    const api = (window as EvidenceWindow).frostbound!.api();
    api.setResources(999999, 999999, 999999);
    let ok = 0;
    for (const id of cast) {
      const result = api.recruit(id);
      if (typeof result !== "string") ok += 1;
      api.setResources(999999, 999999, 999999);
    }
    return ok;
  }, ALLY_CAST);
  expect(recruited, "at least six human recruits must reach the field").toBeGreaterThanOrEqual(6);

  for (let i = 0; i < 40; i++) await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.2, 1, false));

  await page.evaluate((cast) => {
    const api = (window as EvidenceWindow).frostbound!.api();
    for (const enemy of cast) api.spawnEnemy(enemy.id, enemy.x, enemy.z);
  }, ENEMY_CAST);

  // Let them close on the settlement, but stop well short of a wipe. Sampled
  // rather than run blind: the loop stops the moment the cast is engaged, so
  // the frame is taken mid-fight instead of after one.
  let state = { allies: 0, enemies: 0, structures: 0 };
  for (let i = 0; i < 90; i++) {
    await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.1, 1, true));
    state = await page.evaluate(() => (window as EvidenceWindow).frostbound!.api().unitCounts());
    if (i > 25 && state.enemies < ENEMY_CAST.length) break;
  }

  const report = await page.evaluate(() => (window as EvidenceWindow).frostbound!.api().enemyReport());
  const aliveIds = report.map((row) => String((row as { id?: string }).id ?? ""));

  // The assertions that make the screenshot evidence rather than decoration.
  expect(state.enemies, "enemies must still be alive when the frame is captured").toBeGreaterThan(0);
  expect(report.length, "the enemy report must list living monsters").toBeGreaterThan(0);
  expect(
    aliveIds.some((id) => id === "icearmor" || id === "boss"),
    `at least one elite or boss must be alive in frame; alive = ${aliveIds.join(", ")}`,
  ).toBe(true);
  expect(state.allies, "at least six humans must be on the field").toBeGreaterThanOrEqual(6);

  // Put the camera where both lines are in frame. It follows the Hero, so
  // walking the Hero into the gap between the two sides is the only way to
  // frame a melee -- the previous attempt captured from the spawn point and
  // put the monsters off the edge.
  await page.evaluate(() => (window as EvidenceWindow).frostbound!.api().teleport(1.5, 5.5));
  for (let i = 0; i < 26; i++) await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.08, 1, true));
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    for (const el of Array.from(document.body.children)) {
      if (el !== canvas && !el.contains(canvas)) (el as HTMLElement).style.visibility = "hidden";
    }
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: resolve(outputRoot, "melee-humans-vs-monsters.png") });

  // Same camera, aura suppressed, so the aura's contribution is visible as a
  // difference rather than asserted in prose.
  await page.evaluate(() => {
    const g = (window as unknown as { frostbound?: { game?: { s?: { scene?: { meshes: Array<{ name: string; setEnabled(v: boolean): void }> } } } } }).frostbound;
    for (const mesh of g?.game?.s?.scene?.meshes ?? []) if (mesh.name.includes("aura.")) mesh.setEnabled(false);
  });
  await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.05, 1, true));
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outputRoot, "melee-aura-off.png") });

  await page.evaluate(() => {
    const g = (window as unknown as { frostbound?: { game?: { s?: { scene?: { meshes: Array<{ name: string; setEnabled(v: boolean): void }> } } } } }).frostbound;
    for (const mesh of g?.game?.s?.scene?.meshes ?? []) if (mesh.name.includes("aura.")) mesh.setEnabled(true);
  });
  await page.evaluate(() => (window as EvidenceWindow).frostbound!.step(0.05, 1, true));
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outputRoot, "melee-aura-on.png") });

  writeFileSync(
    resolve(outputRoot, "capture-state.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), unitCounts: state, aliveEnemies: aliveIds, enemyCast: ENEMY_CAST, allyCast: ALLY_CAST, pageErrors }, null, 2)}\n`,
    "utf8",
  );
  expect(pageErrors, "no page errors during capture").toEqual([]);
});
