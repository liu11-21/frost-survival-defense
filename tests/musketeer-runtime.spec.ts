/**
 * The Musketeer, in the running game, from its production GLB.
 *
 * Three things have to be true together, and each of them can be true while
 * the others are false in a way that looks like success:
 *
 *   the file the manifest asks for is the pipeline one, not the older
 *   procedural `musketeer.glb` that sits beside it on disk;
 *
 *   it passes the ally contract it declares, so it is not quietly running on
 *   the procedural fallback with the GLB downloaded and discarded;
 *
 *   and when it attacks it plays RangedAttack. This is the part no manifest
 *   check reaches. `CombatAnimator` used to resolve every ally attack to
 *   `["Attack", "MeleeAttack"]`, so a ranged unit with a correctly authored
 *   firing clip would have loaded perfectly and then swung its musket.
 */
import { test, expect } from "@playwright/test";

interface RuntimeWindow extends Window {
  frostbound?: {
    api(): {
      startEndless(): void;
      setResources(wood: number, stone: number, gold: number): void;
      upgradeFurnace(): unknown;
      build(slotId: string, type: string): { ok: boolean };
      recruit(id: string): unknown;
      spawnEnemy(id: string, x: number, z: number): unknown;
    };
    step(dt: number, frames?: number, render?: boolean): void;
    game?: {
      s?: {
        assets?: {
          isReady?: boolean;
          whenFullyLoaded(): Promise<void>;
          report(key: string): { status: string; path: string; missingNodes: string[]; missingAnimations: string[] } | undefined;
        };
        combat?: { units: Array<{ def: { id: string }; faction: string }> };
      };
    };
  };
}

test("the musketeer loads its pipeline GLB and fires rather than swings", async ({ page }) => {
  test.setTimeout(240_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("http://127.0.0.1:4173/?uiVerification=1", {
    waitUntil: "domcontentloaded", timeout: 90_000,
  });
  await page.waitForFunction(() => Boolean((window as RuntimeWindow).frostbound?.game?.s?.assets?.isReady),
    { timeout: 90_000 });
  // The musketeer is in the DEFERRED set now, so `isReady` says nothing about
  // it. Waiting on the wrong promise here would have tested the critical
  // split rather than the character.
  await page.evaluate(() => (window as RuntimeWindow).frostbound!.game!.s!.assets!.whenFullyLoaded());

  const report = await page.evaluate(() =>
    (window as RuntimeWindow).frostbound!.game!.s!.assets!.report("musketeer"));
  expect(report, "no manifest report for the musketeer at all").toBeTruthy();
  expect(report!.path, "the manifest is still pointing at the procedural asset")
    .toContain("musketeer_candidate.glb");
  expect(report!.missingNodes, `missing nodes: ${report!.missingNodes.join(", ")}`).toEqual([]);
  expect(report!.missingAnimations, `missing clips: ${report!.missingAnimations.join(", ")}`).toEqual([]);
  expect(report!.status, "loaded means the GLB is what is on screen").toBe("loaded");

  // --- and now that it is on the field, what does it play when it attacks? --
  await page.evaluate(() => {
    const api = (window as RuntimeWindow).frostbound!.api();
    api.startEndless();
    for (let i = 0; i < 6; i++) { api.setResources(999999, 999999, 999999); api.upgradeFurnace(); }
    api.setResources(999999, 999999, 999999);
    api.build("eastMid", "recruitHall");
  });
  for (let i = 0; i < 140; i++) {
    await page.evaluate(() => (window as RuntimeWindow).frostbound!.step(0.25, 1, false));
  }
  await page.evaluate(() => {
    const api = (window as RuntimeWindow).frostbound!.api();
    for (let i = 0; i < 3; i++) { api.setResources(999999, 999999, 999999); api.recruit("musketeer"); }
    api.spawnEnemy("grunt", -3.0, 8.0);
    api.spawnEnemy("grunt", 2.0, 9.0);
  });

  // Sample the clip actually running on a musketeer's rig while it engages.
  // Sampled every step rather than at one moment: an attack clip is a fraction
  // of a second and a single reading catches Idle far more often than not.
  const seen = new Set<string>();
  for (let i = 0; i < 260; i++) {
    await page.evaluate(() => (window as RuntimeWindow).frostbound!.step(0.05, 1, false));
    const names = await page.evaluate(() => {
      const scene = (window as unknown as { frostbound: { game: { s: { scene: {
        animationGroups: Array<{ name: string; isPlaying: boolean; targetedAnimations: Array<{ target: unknown }> }>;
      } } } } }).frostbound.game.s.scene;
      return scene.animationGroups.filter((g) => g.isPlaying).map((g) => g.name);
    });
    for (const n of names) seen.add(n.includes(":") ? n.slice(n.lastIndexOf(":") + 1) : n);
    if (seen.has("RangedAttack")) break;
  }

  expect([...seen].sort().join(","), "clips seen playing").toContain("RangedAttack");
  expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);
});
