import { expect, test, type Page } from "@playwright/test";
import { LANES, SLOT_BY_ID, nearestPointOnLane } from "../src/data/BuildSlotDefinitions";
import { BUILDING_BY_ID } from "../src/data/BuildingDefinitions";
import { ROAD_WIDTH } from "../src/game/GameConfig";

async function call(page: Page, name: string, ...args: unknown[]): Promise<any> {
  return page.evaluate(
    ({ name, args }) => {
      const api = (window as any).frostbound?.api?.();
      const fn = api?.[name];
      return typeof fn === "function" ? fn(...args) : null;
    },
    { name, args },
  );
}

async function step(page: Page, dt: number, frames: number, render = false): Promise<void> {
  await page.evaluate(
    ({ dt, frames, render }) => (window as any).frostbound?.step?.(dt, frames, render),
    { dt, frames, render },
  );
}

async function boot(page: Page): Promise<void> {
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean((window as any).frostbound), null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  }, null, { timeout: 15_000 });
  await page.evaluate(() => (window as any).frostbound.stopLoop());
}

async function moveHero(page: Page, key: "w" | "a" | "s" | "d", frames: number): Promise<void> {
  await page.keyboard.down(key);
  await step(page, 0.016, frames);
  await page.keyboard.up(key);
  await step(page, 0.016, 2);
}

function centroid(units: Array<{ x: number; z: number }>): { x: number; z: number } {
  const n = Math.max(1, units.length);
  return {
    x: units.reduce((sum, unit) => sum + unit.x, 0) / n,
    z: units.reduce((sum, unit) => sum + unit.z, 0) / n,
  };
}

test("G1 closure: facility visuals do not create obvious invisible movement collision", async ({ page }, testInfo) => {
  await boot(page);
  await call(page, "startStage", "stage-3");
  await call(page, "setFurnaceLevel", 30);
  await call(page, "setResources", 100, 100, 100);

  // Use warehouse as the worst visual/gameplay-radius mismatch case.
  expect((await call(page, "build", "northOuter", "warehouse")).ok).toBe(true);
  await step(page, 0.016, 230);
  await call(page, "grant", 999, 999, 999);

  expect((await call(page, "build", "northMid", "tower")).ok).toBe(true);
  expect((await call(page, "build", "coreNE", "warehouse")).ok).toBe(true);
  expect((await call(page, "build", "coreSE", "warehouse")).ok).toBe(true);
  expect((await call(page, "build", "coreNW", "recruitHall")).ok).toBe(true);
  await step(page, 0.016, 520);

  // uiVerification only exposes the permanent harness; hide its panel before
  // evidence capture so the frame is a normal gameplay view.
  await page.keyboard.press("F6");

  const warehouseDef = BUILDING_BY_ID.get("warehouse")!;
  const towerDef = BUILDING_BY_ID.get("tower")!;
  const warehouseSlot = SLOT_BY_ID.get("northOuter")!;
  const towerSlot = SLOT_BY_ID.get("northMid")!;
  const warehouse = await call(page, "facilityRuntimeContract", "northOuter");
  const tower = await call(page, "facilityRuntimeContract", "northMid");
  expect(warehouse.visualScale.x).toBeCloseTo(0.82, 5);
  expect(tower.visualScale.x).toBeCloseTo(0.82, 5);

  // Hero physically walks into the warehouse using real WASD. The remaining
  // centre-to-centre clearance beyond visible facility + hero body must stay
  // tiny; this catches an obvious invisible shell without changing balance.
  await call(page, "teleport", warehouseSlot.x, warehouseSlot.z - 4.8);
  const warehouseStart = await call(page, "heroMovementStatus");
  await moveHero(page, "w", 95);
  const warehouseStop = await call(page, "heroMovementStatus");
  const warehouseDistance = Math.hypot(
    warehouseStop.x - warehouseSlot.x,
    warehouseStop.z - warehouseSlot.z,
  );
  const warehouseVisualRadius = warehouseDef.visualBoundsRadius * warehouse.visualScale.x;
  const warehouseInvisibleGap = warehouseDistance - warehouseVisualRadius - warehouseStop.hitRadius;
  expect(Math.hypot(warehouseStop.x - warehouseStart.x, warehouseStop.z - warehouseStart.z)).toBeGreaterThan(2);
  expect(warehouseDistance).toBeGreaterThan(warehouse.hitRadius + 0.3);
  expect(warehouseDistance).toBeLessThan(warehouse.hitRadius + warehouseStop.hitRadius + 0.2);
  expect(warehouseInvisibleGap).toBeLessThan(0.2);

  // Repeat against a tower because its compact gameplay radius is smaller and
  // its scaled visual bounds are slightly larger than collision.
  await call(page, "teleport", towerSlot.x - 4.2, towerSlot.z);
  const towerStart = await call(page, "heroMovementStatus");
  await moveHero(page, "d", 90);
  const towerStop = await call(page, "heroMovementStatus");
  const towerDistance = Math.hypot(towerStop.x - towerSlot.x, towerStop.z - towerSlot.z);
  const towerVisualRadius = towerDef.visualBoundsRadius * tower.visualScale.x;
  expect(Math.hypot(towerStop.x - towerStart.x, towerStop.z - towerStart.z)).toBeGreaterThan(1.5);
  expect(towerDistance - towerVisualRadius - towerStop.hitRadius).toBeLessThan(0.2);

  // Two visible warehouse silhouettes leave almost exactly the same corridor
  // as their gameplay footprints. Then walk the Hero through that corridor.
  const ne = SLOT_BY_ID.get("coreNE")!;
  const se = SLOT_BY_ID.get("coreSE")!;
  const centreGap = Math.hypot(ne.x - se.x, ne.z - se.z);
  const visualGap = centreGap - warehouseDef.visualBoundsRadius * warehouse.visualScale.x * 2;
  const gameplayGap = centreGap - warehouseDef.radius * 2;
  expect(visualGap - gameplayGap).toBeLessThan(0.15);
  expect(gameplayGap).toBeGreaterThan(warehouseStop.hitRadius * 2 + 1);

  await call(page, "teleport", 2.8, 0);
  await moveHero(page, "d", 90);
  const corridorExit = await call(page, "heroMovementStatus");
  expect(corridorExit.x).toBeGreaterThan(7);
  expect(Math.abs(corridorExit.z)).toBeLessThan(0.5);

  // Normal gameplay and minimap evidence after the real movement checks.
  await call(page, "teleport", 7, 22);
  await step(page, 0.016, 1, true);
  await page.screenshot({ path: testInfo.outputPath("g1-normal-gameplay.png"), fullPage: true });
  await page.locator("#ui-minimap").screenshot({ path: testInfo.outputPath("g1-minimap.png") });

  // A real FriendlyBrain/UnitMotor chase now crosses the tightest roadside
  // facility area. We sample the squad centroid instead of a geometry probe.
  await call(page, "resetWatchdog");
  expect(await call(page, "recruit", "assault")).toBeNull();
  expect(await call(page, "deploySquadForTest", "assault", 0, 13, 18)).toBe(true);
  const enemySpawn = await call(page, "spawnEnemyOnLaneForTest", "icearmor", -10, 45, 0);
  expect(enemySpawn.ok).toBe(true);

  const initialAssault = ((await call(page, "allyLaneStatus")) as Array<any>).filter((unit) => unit.id === "assault");
  expect(initialAssault.length).toBeGreaterThan(0);
  const initialCentroid = centroid(initialAssault);
  let furthest = 0;
  let nearestWarehouse = Infinity;
  let maxLaneDeviation = 0;

  for (let sample = 0; sample < 16; sample++) {
    await step(page, 0.05, 10);
    const assault = ((await call(page, "allyLaneStatus")) as Array<any>).filter((unit) => unit.id === "assault");
    expect(assault.length).toBeGreaterThan(0);
    const c = centroid(assault);
    furthest = Math.max(furthest, Math.hypot(c.x - initialCentroid.x, c.z - initialCentroid.z));
    nearestWarehouse = Math.min(nearestWarehouse, Math.hypot(c.x - warehouseSlot.x, c.z - warehouseSlot.z));
    maxLaneDeviation = Math.max(maxLaneDeviation, nearestPointOnLane(c.x, c.z, LANES[0]).distance);
  }

  expect(furthest).toBeGreaterThan(16);
  expect(nearestWarehouse).toBeLessThan(4.5);
  expect(maxLaneDeviation).toBeLessThan(ROAD_WIDTH * 0.75);
  const assaultAi = ((await call(page, "aiStates")) as Array<any>).filter((state) => state.id === "assault");
  expect(assaultAi.every((state) => state.stuck <= 1)).toBe(true);
  expect((await call(page, "watchdog")).recoveries).toBe(0);

  // Put the normal tactical camera on the roadside engagement for closure evidence.
  await call(page, "teleport", -7.5, 29.5);
  await step(page, 0.016, 1, true);
  await page.screenshot({ path: testInfo.outputPath("g1-squad-combat-lane.png"), fullPage: true });
});
