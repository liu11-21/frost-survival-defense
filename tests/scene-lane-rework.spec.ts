import { expect, test } from "@playwright/test";

import {
  GROUND_SLOTS,
  LANES,
  SKY_SLOTS,
  isInsideBase,
  nearestPointOnLane,
} from "../src/data/BuildSlotDefinitions";
import { nextLaneWaypoint } from "../src/data/LaneNavigation";
import { DEFENSE_BUILDINGS } from "../src/data/DefenseBuildingDefinitions";
import { ENDLESS_SCALING, endlessLaneCount } from "../src/data/GameModeRules";
import { ENEMY_UNITS } from "../src/data/EnemyDefinitions";

function pathLength(path: readonly { x: number; z: number }[]): number {
  return path.slice(0, -1).reduce((sum, point, index) => {
    const next = path[index + 1];
    return sum + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0);
}

async function call(page: import("@playwright/test").Page, name: string, ...args: unknown[]): Promise<any> {
  return page.evaluate(
    ({ name, args }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[name];
      return typeof fn === "function" ? fn(...args) : null;
    },
    { name, args },
  );
}

async function step(page: import("@playwright/test").Page, dt: number, frames: number): Promise<void> {
  await page.evaluate(
    ({ dt, frames }) => (window as any).frostbound?.step?.(dt, frames, false),
    { dt, frames },
  );
}

test("scene contract has exactly four long winding roads and dispersed construction", () => {
  expect(LANES).toHaveLength(4);
  expect(ENDLESS_SCALING.maxLanes).toBe(4);
  expect(endlessLaneCount(999)).toBe(4);

  for (const lane of LANES) {
    expect(lane.path.length).toBeGreaterThanOrEqual(8);
    expect(pathLength(lane.path)).toBeGreaterThan(60);
    expect(Math.hypot(lane.path[0].x, lane.path[0].z)).toBeGreaterThan(40);
    expect(lane.path.at(-1)).toEqual({ x: 0, z: 0 });
    const middle = lane.path[Math.floor(lane.path.length / 2)];
    const spawn = lane.path[0];
    const cross = Math.abs(spawn.x * middle.z - spawn.z * middle.x);
    expect(cross).toBeGreaterThan(100);
  }

  expect(GROUND_SLOTS).toHaveLength(20);
  expect(SKY_SLOTS).toHaveLength(5);
  const inside = GROUND_SLOTS.filter((slot) => isInsideBase(slot.x, slot.z, 0.5));
  expect(inside.map((slot) => slot.id).sort()).toEqual(["coreNE", "coreNW", "coreSE", "coreSW"]);
  expect(inside.every((slot) => slot.lanes.length >= 2)).toBe(true);

  const basicTower = DEFENSE_BUILDINGS.find((building) => building.id === "tower")!;
  const core = inside[0];
  const covered = LANES.filter(
    (lane) => nearestPointOnLane(core.x, core.z, lane).distance <= (basicTower.attackRange ?? 0),
  );
  expect(covered.length).toBeGreaterThanOrEqual(2);
});

test("waypoint look-ahead crosses a bend instead of targeting the point already reached", () => {
  const lane = LANES[0];
  const start = lane.path[0];
  const bend = lane.path[1];
  // 80% along the first segment is inside the motor's normal approach zone.
  // Returning path[1] here creates a stable deadlock: the motor brakes before
  // the bend and every navigation refresh chooses that same bend again.
  const x = start.x + (bend.x - start.x) * 0.8;
  const z = start.z + (bend.z - start.z) * 0.8;
  expect(nextLaneWaypoint(lane.index, x, z, "inbound")).toEqual(lane.path[2]);
});

test("defence ranges are compact and enemy movement speed is a real authored stat", () => {
  const attacks = DEFENSE_BUILDINGS.filter((building) => building.attackKind);
  expect(attacks.length).toBeGreaterThan(0);
  expect(Math.max(...attacks.map((building) => building.attackRange ?? 0))).toBeLessThanOrEqual(11.5);
  expect(Math.min(...attacks.map((building) => building.attackRange ?? 0))).toBeGreaterThan(0);

  const speeds = ENEMY_UNITS.map((enemy) => enemy.moveSpeed);
  expect(speeds.every((speed) => Number.isFinite(speed) && speed > 0)).toBe(true);
  expect(new Set(speeds).size).toBeGreaterThan(4);
});

test("runtime keeps melee on-lane, permits ranged fallback, and then pre-empts it", async ({ page }, testInfo) => {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  await call(page, "startStage", "stage-3");
  await call(page, "teleport", 30, 30);
  await call(page, "grant", 999, 999, 999);
  await call(page, "setFurnaceLevel", 30);
  await call(page, "build", "coreNE", "recruitHall");
  await step(page, 0.016, 500);

  // Use support squads as test defenders so the enemy cannot disappear simply
  // because the sample itself shoots back during the targeting observation.
  expect(await call(page, "recruit", "medic")).toBeNull();
  expect(await call(page, "deploySquadForTest", "medic", 0, 0, 8)).toBe(true);

  const gruntSpawn = await call(page, "spawnEnemyOnLaneForTest", "grunt", 4, 2, 1);
  expect(gruntSpawn.ok).toBe(true);
  await step(page, 0.05, 10);
  let enemies = (await call(page, "enemyStatus")) as Array<any>;
  const grunt = enemies.find((enemy) => enemy.squadId === gruntSpawn.squadId);
  expect(grunt).toBeTruthy();
  expect(grunt.laneIndex).toBe(1);
  expect(grunt.targetLane).not.toBe(0);

  // Ranged fallback is legal only because there is no same-lane defender and
  // the lane-0 medic is inside the Slinger’s actual attack range.
  const slingerSpawn = await call(page, "spawnEnemyOnLaneForTest", "slinger", 4, 2, 1);
  expect(slingerSpawn.ok).toBe(true);
  await step(page, 0.05, 10);
  enemies = (await call(page, "enemyStatus")) as Array<any>;
  let slinger = enemies.find((enemy) => enemy.squadId === slingerSpawn.squadId);
  expect(slinger).toBeTruthy();
  expect(slinger.laneIndex).toBe(1);
  expect(slinger.targetLane).toBe(0);

  // A non-attacking flagbearer is still a valid same-lane defender. Its
  // appearance must immediately pre-empt the cross-lane fallback without
  // killing the Slinger before we can observe the new target.
  expect(await call(page, "recruit", "flagbearer")).toBeNull();
  expect(await call(page, "deploySquadForTest", "flagbearer", 1, 8, 0)).toBe(true);
  await step(page, 0.05, 12);
  enemies = (await call(page, "enemyStatus")) as Array<any>;
  slinger = enemies.find((enemy) => enemy.squadId === slingerSpawn.squadId);
  expect(slinger).toBeTruthy();
  expect(slinger.targetLane).toBe(1);

  await page.screenshot({ path: testInfo.outputPath("lane-targeting-runtime.png"), fullPage: true });
});

test("ordinary low-tier enemies march past optional facilities and speed moves them", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  await call(page, "startStage", "stage-3");
  await call(page, "teleport", 30, 30);
  await call(page, "grant", 999, 999, 999);
  await call(page, "build", "northFar", "tower");
  await step(page, 0.016, 500);

  const spawn = await call(page, "spawnEnemyOnLaneForTest", "grunt", -10, 45, 0);
  expect(spawn.ok).toBe(true);
  await step(page, 0.05, 2);
  const before = ((await call(page, "enemyStatus")) as Array<any>).find((enemy) => enemy.squadId === spawn.squadId);
  expect(before).toBeTruthy();
  expect(before.laneIndex).toBe(0);
  expect(before.moveSpeed).toBeGreaterThan(0);
  expect(before.effectiveMoveSpeed).toBeGreaterThan(0);
  expect(before.stunned).toBe(false);
  expect(before.targetId).not.toBe("tower");

  await step(page, 0.05, 20);
  const after = ((await call(page, "enemyStatus")) as Array<any>).find((enemy) => enemy.squadId === spawn.squadId);
  expect(after).toBeTruthy();
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.5);
  expect(after.targetId).not.toBe("tower");
});

test("ground enemy crosses multiple winding segments without stalling at a bend", async ({ page }) => {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());

  await call(page, "startStage", "stage-3");
  await call(page, "teleport", 30, 30);

  const lane = LANES[0];
  const spawnPoint = lane.path[0];
  const spawn = await call(page, "spawnEnemyOnLaneForTest", "icearmor", spawnPoint.x, spawnPoint.z, lane.index);
  expect(spawn.ok).toBe(true);

  // 14 simulated seconds at the authored 2 u/s is long enough to traverse the
  // first two bends but still well inside stage-3's 36-second prep window.
  await step(page, 0.05, 280);
  const enemy = ((await call(page, "enemyStatus")) as Array<any>).find((candidate) => candidate.squadId === spawn.squadId);
  expect(enemy).toBeTruthy();
  expect(enemy.laneIndex).toBe(0);
  expect(Math.hypot(enemy.x - spawnPoint.x, enemy.z - spawnPoint.z)).toBeGreaterThan(18);
  const projection = nearestPointOnLane(enemy.x, enemy.z, lane);
  expect(projection.segmentIndex).toBeGreaterThanOrEqual(2);
  expect(enemy.navStuck).toBeLessThan(1.5);
});
