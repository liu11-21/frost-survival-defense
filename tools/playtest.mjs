/**
 * Headless functional harness for the tower-defence rebuild.
 *
 * Drives the real dev build in Chrome, plays a full stage run plus targeted
 * rule checks (rebuild FIFO, taunt, medic healing, wall blocking, warehouse
 * loss, mode reset), captures screenshots and fails on any console error.
 *
 *   node tools/playtest.mjs [--url http://localhost:5173]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runV3Checks } from "./v3checks.mjs";
import { runV4Checks } from "./v4checks.mjs";
import { runCodexChecks } from "./codexcheck.mjs";
import { runV5Checks } from "./v5checks.mjs";
import { runV6Checks } from "./v6checks.mjs";
import { runV7Checks } from "./v7checks.mjs";
import { runV8Checks } from "./v8checks.mjs";
import { runV9Checks } from "./v9checks.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const url = urlIndex >= 0 ? args[urlIndex + 1] : "http://localhost:5173";
const outDir = resolve(process.cwd(), "playtest-shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const problems = [];
const checks = [];
let shotIndex = 0;

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`FAILED CHECK: ${name}${detail ? ` — ${detail}` : ""}`);
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
  protocolTimeout: 900000,
  defaultViewport: { width: 1120, height: 630 },
});

const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => {
  const f = r.failure();
  if (f && !r.url().includes("favicon")) problems.push(`requestfailed: ${r.url()} ${f.errorText}`);
});

const snapshot = () => page.evaluate(() => window.frostbound?.snapshot() ?? null);
const step = (dt, frames) => page.evaluate((d, f) => window.frostbound?.step(d, f, false), dt, frames);
const render = (frames = 3) => page.evaluate((f) => window.frostbound?.step(0.016, f, true), frames);
const call = (name, ...params) =>
  page.evaluate(
    (n, p) => {
      const api = window.frostbound?.api();
      const fn = api?.[n];
      return typeof fn === "function" ? fn(...p) : null;
    },
    name,
    params,
  );

async function shot(label) {
  await render(4);
  const name = `${String(++shotIndex).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: resolve(outDir, name) });
  console.log(`  shot -> ${name}`);
}

console.log(`\n> loading ${url}`);
await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
await page.waitForFunction(() => Boolean(window.frostbound), { timeout: 60000 });
await page.waitForFunction(
  () => {
    const el = document.getElementById("loadingScreen");
    return !el || el.classList.contains("hidden");
  },
  { timeout: 90000 },
);
await page.evaluate(() => window.frostbound?.stopLoop());
console.log("> booted, rAF detached");
await shot("main-menu");

// ---------------------------------------------------------------- stage 1 --
console.log("\n> stage 1: economy and construction");
await call("startStage", "stage-1");
await step(0.016, 20);
let snap = await snapshot();
check("stage run starts in prep phase", snap.phase === "prep", `phase=${snap.phase}`);
check("stage grants starting resources", snap.wood === 60 && snap.stone === 40, `${snap.wood}/${snap.stone}`);

// hero hand-gathering next to a tree
await call("teleport", -4.4, 7.0);
await step(0.016, 400);
snap = await snapshot();
check("hero hand-gathers wood", snap.wood > 60, `wood=${snap.wood}`);
const handRate = (snap.wood - 60) / (400 * 0.016);
await shot("hand-gathering");

// build a mine + lumberyard, then measure the automated rate
await call("grant", 400, 400, 400);
const r1 = await call("build", "northFrontA", "mine");
const r2 = await call("build", "northFrontB", "lumberyard");
check("mine build accepted", r1?.ok === true, JSON.stringify(r1));
check("lumberyard build accepted", r2?.ok === true, JSON.stringify(r2));
await call("teleport", 0, 0);
await step(0.016, 200);
const before = await snapshot();
const lumberyardPos = await call("slotWorldPos", "northFrontB");
await call("teleport", lumberyardPos.x, lumberyardPos.z);
await step(0.016, 250);
const after = await snapshot();
const autoRate = (after.wood - before.wood) / (250 * 0.016);
check(
  "automated production is ~4-5x hand gathering",
  autoRate > handRate * 3,
  `hand=${handRate.toFixed(2)}/s auto=${autoRate.toFixed(2)}/s`,
);
await shot("production");

// capacity rule
await call("grant", 500, 500, 500);
snap = await snapshot();
check("capacity capped at 100 without a warehouse", snap.wood <= 100 && snap.gold <= 100, `${snap.wood}/${snap.gold}`);
const wh = await call("build", "northMid", "warehouse");
check("warehouse build accepted", wh?.ok === true, JSON.stringify(wh));
await step(0.016, 260);
await call("grant", 500, 500, 500);
snap = await snapshot();
check("warehouse lifts the cap", snap.wood > 100, `wood=${snap.wood}`);

// ------------------------------------------------------------- recruiting --
console.log("\n> recruiting and squads");
const denied = await call("recruit", "warrior");
check("recruit blocked before the hall", denied === "招募所未完成", String(denied));
const hall = await call("build", "northBack", "recruitHall");
check("recruit hall build accepted", hall?.ok === true, JSON.stringify(hall));
await step(0.016, 260);
for (const id of ["warrior", "shield", "archer", "medic", "mage", "assault"]) {
  const err = await call("recruit", id);
  check(`recruit ${id}`, err === null, String(err));
}
snap = await snapshot();
check("six squads on the field", snap.allySquads === 6, `squads=${snap.allySquads}`);
check("squad limit is 8 in stage mode", snap.squadLimit === 8, `limit=${snap.squadLimit}`);
await shot("squads");

// squad limit enforcement
for (let i = 0; i < 4; i++) await call("recruit", "warrior");
snap = await snapshot();
check("squad limit is enforced", snap.allySquads === 8, `squads=${snap.allySquads}`);

// -------------------------------------------------------- defence systems --
console.log("\n> towers, walls and enemy routing");
await call("grant", 9000, 9000, 9000);
await call("build", "southFrontA", "tower");
await call("build", "westFrontA", "tower");
await step(0.016, 200);

// seal the whole perimeter, then confirm enemies attack a wall rather than stall
const wallIds = await call("wallSlotIds");
check("the perimeter is four whole sides, not many short segments", wallIds.length === 4, `slots=${wallIds.length}`);
for (const id of wallIds) await call("build", id, "wall");
await step(0.016, 320);
const slotsAfterWalls = await call("slots");
const wallsUp = slotsAfterWalls.filter((s) => s.type === "wall").length;
check("every wall slot can be filled", wallsUp === wallIds.length, `walls=${wallsUp}`);
await shot("sealed-base");

await call("spawnEnemy", "grunt", 0, 25.5);
await step(0.016, 900);
const wallSlot = (await call("slots")).find((s) => s.id === "wallNorth");
check("sealed perimeter is attacked, not bypassed", wallSlot.occupied === true, "wallNorth still standing after ~14.4s");
const wallHp = await page.evaluate(() => {
  const api = window.frostbound?.api();
  const slots = api?.slots?.() ?? [];
  return slots.find((s) => s.id === "wallNorth")?.occupied ?? false;
});
check("enemies do not tunnel through walls", wallHp === true);
await call("killAllEnemies");
await step(0.016, 200);

// ------------------------------------------------------- rebuild FIFO test --
console.log("\n> auto-rebuild FIFO and per-slot type memory");
await call("grant", 5000, 5000, 5000);
const rb = await call("build", "eastFrontA", "autoRebuilder");
check("auto-rebuilder build accepted", rb?.ok === true, JSON.stringify(rb));
await step(0.016, 300);

// destroy three buildings in a known order, with the rebuilder paused so the
// queue can be inspected before anything is consumed
await call("setAutoRebuild", false);
// Combat destruction now plays a ~1.4s collapse animation before the slot is
// actually freed and the rebuild queue entry is pushed (see `Building.ts`'s
// `readyForRemoval` / `BuildingManager`'s dead-branch) — never an instant
// vanish. Each wait below must clear that, not just the old instant-removal.
await call("damageSlot", "southFrontA", 99999);
await step(0.016, 20);
await call("damageSlot", "wallNorth", 99999);
await step(0.016, 20);
await call("damageSlot", "northMid", 99999); // the warehouse
await step(0.016, 110); // clears every one of the three collapse animations
const queue = await call("rebuildQueue");
check(
  "queue is FIFO by destruction time",
  queue.length === 3 && queue[0].slot === "southFrontA" && queue[1].slot === "wallNorth" && queue[2].slot === "northMid",
  JSON.stringify(queue.map((q) => q.slot)),
);
check("queue remembers the destroyed type per slot", queue[2]?.type === "warehouse", String(queue[2]?.type));
check("disabling the rebuilder keeps the queue intact", queue.length === 3, `len=${queue.length}`);

// head-of-queue must never be skipped: afford the cheap tower but not the wall
await call("setResources", 60, 60, 60);
await call("setAutoRebuild", true);
await step(0.016, 400);
const midway = await call("slots");
check(
  "a short first entry blocks the queue instead of being skipped",
  midway.find((s) => s.id === "wallNorth").occupied === false &&
    midway.find((s) => s.id === "northMid").occupied === false,
  JSON.stringify(midway.filter((s) => ["southFrontA", "wallNorth", "northMid"].includes(s.id)).map((s) => `${s.id}:${s.type}`)),
);

// The wall costs 200 stone but the cap is 100 while no warehouse stands, so the
// queue legitimately stays blocked. Hand-rebuild the warehouse to unblock it —
// exactly the recovery path a player has.
await call("setResources", 100, 100, 100);
const manualWarehouse = await call("build", "northMid", "warehouse");
check("player can hand-rebuild to unblock a stalled queue", manualWarehouse?.ok === true, JSON.stringify(manualWarehouse));
await step(0.016, 260);
await call("grant", 9000, 9000, 9000);
await step(0.016, 2600);
const slotsAfterRebuild = await call("slots");
const mid0 = slotsAfterRebuild.find((s) => s.id === "southFrontA");
const wall0 = slotsAfterRebuild.find((s) => s.id === "wallNorth");
const inner2 = slotsAfterRebuild.find((s) => s.id === "northMid");
check("first destroyed rebuilt first", mid0.type === "tower", String(mid0.type));
check("second destroyed rebuilt second", wall0.type === "wall", String(wall0.type));
check("hand-rebuilt warehouse stands again", inner2.type === "warehouse", String(inner2.type));
await shot("rebuilt");

// same slot, different type: it must rebuild the most recent one it completed
await call("setAutoRebuild", false);
await call("damageSlot", "southFrontA", 99999); // tower falls
await step(0.016, 20);
await call("build", "southFrontA", "tower"); // player rebuilds by hand
await step(0.016, 220);
const afterManual = await call("rebuildQueue");
check(
  "a hand-rebuilt slot is dropped from the queue",
  afterManual.every((q) => q.slot !== "southFrontA"),
  JSON.stringify(afterManual.map((q) => q.slot)),
);
await call("damageSlot", "southFrontA", 99999);
await step(0.016, 110); // clears the collapse animation before the slot re-enters the queue
const requeued = await call("rebuildQueue");
check("re-destroyed slot re-enters the queue", requeued.some((q) => q.slot === "southFrontA"), JSON.stringify(requeued));
await call("setAutoRebuild", true);
await step(0.016, 1400);
const mid0Again = (await call("slots")).find((s) => s.id === "southFrontA");
check("slot rebuilds its most recent completed type", mid0Again.type === "tower", String(mid0Again.type));

// ---------------------------------------------------- unit behaviour rules --
console.log("\n> taunt, medic healing, hero death");

// Taunt: a shield trooper must pull nearby enemies onto itself.
await call("startStage", "stage-1");
await step(0.016, 20);
await call("grant", 5000, 5000, 5000);
await call("build", "northMid", "warehouse");
await step(0.016, 260);
await call("grant", 9000, 9000, 9000);
await call("build", "northBack", "recruitHall");
await step(0.016, 260);
await call("teleport", 0, 8);
await call("recruit", "shield");
await call("recruit", "archer");
await step(0.016, 60);
for (let i = 0; i < 3; i++) await call("spawnEnemy", "bruiser", -2 + i * 2, 11);
await step(0.016, 90);
const taunted = await call("targetKinds");
check(
  "enemies inside the taunt radius attack the shield trooper",
  taunted.taunted > 0,
  JSON.stringify(taunted),
);
await shot("taunt");
await call("killAllEnemies");
await step(0.016, 200);

// Medic: one squad-wide heal event per interval, not one per medic.
// Parked clear of the furnace aura (radius 9) so only the medic is healing.
await call("teleport", 0, 16);
await call("recruit", "medic");
await call("recruit", "warrior");
await step(0.016, 220);
const beforeHeal = await call("hurtAllySquads", 120);
check("ally squads took test damage", beforeHeal > 0, `damaged=${beforeHeal}`);
await call("resetHealStats");
const hpBefore = await call("allyHealth");
await step(0.016, 190); // ~3s at a 1.0s heal interval
const hpAfter = await call("allyHealth");
const stats = await call("healStats");
const healed = hpAfter - hpBefore;
check(
  "a 3-medic squad fires ONE heal event per interval, not three",
  stats.events > 0 && stats.events <= 4,
  `events=${stats.events} over ~3s at a 1.0s interval`,
);
check(
  "healing equals exactly events x 20 per living member of one squad",
  Math.abs(healed - stats.healedUnits * 20) < 1.5,
  `healed=${healed.toFixed(1)} expected=${stats.healedUnits * 20}`,
);
await call("killAllEnemies");

// Hero death and revive.
await call("hurtHero", 99999);
await step(0.016, 20);
snap = await snapshot();
check("hero goes down rather than ending the run", snap.heroDown === true && snap.over === false, JSON.stringify({ down: snap.heroDown, over: snap.over }));
await step(0.016, 560); // 9s > the 8s down timer
snap = await snapshot();
check("hero revives after 8 seconds", snap.heroDown === false, `down=${snap.heroDown}`);
check("hero revives at 60% health", Math.abs(snap.heroHp - 1000 * 0.6) < 60, `hp=${snap.heroHp}`);

// Warehouse destruction spills resources. The cap only drops (and the
// overage only scatters) once the combat-kill's collapse animation actually
// finishes — never on the same frame health hits zero.
await call("setResources", 400, 400, 400);
const goldBeforeLoss = (await snapshot()).gold;
await call("damageSlot", "northMid", 99999);
await step(0.016, 110);
snap = await snapshot();
check(
  "warehouse loss takes 70% of gold, then the 100 cap applies",
  snap.gold === Math.min(100, Math.ceil(goldBeforeLoss * 0.3)),
  `${goldBeforeLoss} -> ${snap.gold}`,
);
check("warehouse loss re-imposes the 100 cap", snap.wood <= 100, `wood=${snap.wood}`);
const dropped = await call("pickupCount");
check("lost resources land as pickups instead of vanishing", dropped > 0, `pickups=${dropped}`);
await shot("warehouse-loss");

// ---------------------------------------------------------- furnace rules --
console.log("\n> furnace healing, self-repair and upgrade");
await call("damageFurnace", 5000);
let f1 = (await snapshot()).furnaceHp;
await step(0.016, 300); // 4.8s — still inside the 15s no-damage window
let f2 = (await snapshot()).furnaceHp;
check("furnace does not self-heal within 15s of damage", f2 === f1, `${f1} -> ${f2}`);
await step(0.016, 800); // past 15s
const f3 = (await snapshot()).furnaceHp;
check("furnace self-heals after 15 quiet seconds", f3 > f2, `${f2} -> ${f3}`);

await call("grant", 5000, 5000, 5000);
const upgradeError = await call("upgradeFurnace");
check("furnace upgrade accepted", upgradeError === null, String(upgradeError));
snap = await snapshot();
check("furnace reaches level 2", snap.furnaceLevel === 2, `level=${snap.furnaceLevel}`);
check("stage mode does NOT raise the squad limit", snap.squadLimit === 8, `limit=${snap.squadLimit}`);
await shot("upgraded");

// --------------------------------------------------------------- the run --
console.log("\n> playing the 10-wave stage");
await call("startStage", "stage-1");
await step(0.016, 20);
// A warehouse comes first: every resource is capped at 100 until one stands.
await call("setResources", 100, 100, 100);
const runWarehouse = await call("build", "northMid", "warehouse");
check("warehouse affordable from a clean start", runWarehouse?.ok === true, JSON.stringify(runWarehouse));
await step(0.016, 260);
await call("grant", 9000, 9000, 9000);
await call("build", "northFrontA", "mine");
await call("build", "northFrontB", "lumberyard");
await call("build", "northBack", "recruitHall");
await call("build", "eastFrontB", "autoCollector");
await call("build", "eastFrontA", "autoRebuilder");
for (const id of await call("wallSlotIds")) await call("build", id, "wall");
const remainingUniversalSlots = [
  "eastMid", "eastBack", "southFrontA", "southFrontB", "southMid", "southBack", "westFrontA", "westFrontB",
];
for (const id of remainingUniversalSlots) await call("build", id, "tower");
await step(0.016, 400);
const builtOut = await call("slots");
check(
  "a full defensive build-out fits the fixed slots",
  builtOut.filter((s) => s.occupied).length === 18,
  `${builtOut.filter((s) => s.occupied).length} occupied slots (4 walls + 8 towers + 6 inner)`,
);

// Play it like a competent player: waves arrive on their own clock, squads get
// topped back up between waves, and the walls get repaired.
let guard = 0;
while (guard < 600) {
  guard++;
  await step(0.016, 120);
  snap = await snapshot();
  if (snap.over) break;
  if (snap.phase === "finished" && snap.enemies === 0) break;
  if (guard % 2 === 0) {
    await call("grant", 1200, 1200, 400);
    for (let i = snap.allySquads; i < snap.squadLimit; i++) {
      await call("recruit", i % 3 === 0 ? "archer" : i % 3 === 1 ? "warrior" : "shield");
    }
    for (const id of await call("wallSlotIds")) await call("build", id, "wall");
  }
}
snap = await snapshot();
console.log(`  run ended: ${JSON.stringify(snap)}`);
if (!snap.over) {
  console.log(`  stragglers: ${JSON.stringify(await call("enemyReport"))}`);
}
check("stage run reached a conclusion", snap.over === true, `over=${snap.over} wave=${snap.wave}`);
check("stage was survived", snap.victory === true, `victory=${snap.victory} furnaceHp=${snap.furnaceHp}`);
check("kills were recorded", snap.kills > 20, `kills=${snap.kills}`);
await shot("stage-result");

// ============================================================ v3 checks ====
const v3 = await runV3Checks({ check, call, step, snapshot, shot, log: (m) => console.log(m) });

// ------------------------------------------------------------ mode reset --
console.log("\n> endless mode and stage reset");
await call("startEndless");
await step(0.016, 20);
snap = await snapshot();
check("endless run resets resources", snap.wood === 60 && snap.gold === 15, `${snap.wood}/${snap.gold}`);
check("endless run resets the furnace level", snap.furnaceLevel === 1, `level=${snap.furnaceLevel}`);
check("endless run resets squads", snap.allySquads === 0, `squads=${snap.allySquads}`);
check("endless run resets kills", snap.kills === 0, `kills=${snap.kills}`);
const slotsAfterReset = await call("slots");
check(
  "stage buildings do not carry into the next run",
  slotsAfterReset.every((s) => !s.occupied),
  `${slotsAfterReset.filter((s) => s.occupied).length} still occupied`,
);

// A warehouse first: without one every resource is capped at 100.
await call("grant", 100, 100, 100);
const endlessWarehouse = await call("build", "northMid", "warehouse");
check("warehouse buildable inside the 100 cap", endlessWarehouse?.ok === true, JSON.stringify(endlessWarehouse));
await step(0.016, 260);

// endless furnace levels DO raise the squad limit
await call("grant", 9000, 9000, 9000);
await call("upgradeFurnace");
snap = await snapshot();
check("endless furnace level raises squad limit by 2", snap.squadLimit === 10, `limit=${snap.squadLimit}`);

const endlessHall = await call("build", "northBack", "recruitHall");
check("recruit hall buildable in endless", endlessHall?.ok === true, JSON.stringify(endlessHall));
await step(0.016, 260);
check("endless recruit works", (await call("recruit", "medic")) === null);
check("endless second recruit works", (await call("recruit", "warrior")) === null);
await step(0.016, 60);
await shot("endless");

// --------------------------------------------------------- load / stress --
console.log("\n> stress: many simultaneous units");
await call("grant", 9000, 9000, 9000);
for (let i = 0; i < 8; i++) await call("recruit", "warrior");
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2;
  await call("spawnEnemy", "grunt", Math.sin(a) * 20, Math.cos(a) * 20);
  await call("spawnEnemy", "marksman", Math.sin(a) * 22, Math.cos(a) * 22);
}
await step(0.016, 60);
const counts = await call("unitCounts");
console.log(`  unit counts: ${JSON.stringify(counts)}`);
check("120+ simultaneous combat units are handled", counts.allies + counts.enemies >= 120, JSON.stringify(counts));
const t0 = Date.now();
await step(0.016, 200);
const simMs = (Date.now() - t0) / 200;
console.log(`  simulation cost: ${simMs.toFixed(2)} ms/frame at ${counts.allies + counts.enemies} units`);
check("simulation stays under 16ms/frame at load", simMs < 16, `${simMs.toFixed(2)} ms`);
await shot("stress");

await call("killAllEnemies");
await step(0.016, 200);

// ============================================================ v4 checks ====
await runV4Checks({ check, call, step, snapshot, shot, page });

// The codex is reached from the main menu, so go back there first.
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" })));
await step(0.016, 10);
await page.evaluate(() => {
  document.querySelector("[data-menu]")?.click();
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
});
await step(0.016, 10);
await runCodexChecks({ check, call, step, shot, page });

// ============================================================ v5 checks ====
await runV5Checks({ check, call, step, shot, page });

// ============================================================ v6 checks ====
const v6 = await runV6Checks({ check, call, step, shot, page });

// ============================================================ v7 checks ====
await runV7Checks({ check, call, step, shot, page });

// ============================================================ v8 checks ====
const v8 = await runV8Checks({ check, call, step, shot, page });

// ============================================================ v9 checks ====
await runV9Checks({ check, call, step, shot, page });

// ------------------------------------------------------------ resilience --
console.log("\n> resize and delta spike");
await page.setViewport({ width: 900, height: 506 });
await step(0.016, 30);
await shot("resized");
await step(0.5, 6);
await step(0.016, 40);
snap = await snapshot();
check("survives a large delta spike", Number.isFinite(snap.heroX), JSON.stringify(snap.heroX));

await browser.close();

console.log("\n=========================================");
const failed = checks.filter((c) => !c.ok).length;
console.log(`checks: ${checks.length - failed}/${checks.length} passed`);
console.log("perf (simulation ms/frame): " + JSON.stringify(v3.perfResults));
console.log("v6 roster stress perf: " + JSON.stringify(v6.perfResults));
console.log("v8 development-strategy results: " + JSON.stringify(v8.strategyResults));
if (problems.length === 0) {
  console.log("PLAYTEST PASSED — no console errors, all rule checks green.");
  process.exit(0);
}
console.log(`PLAYTEST FAILED — ${problems.length} problem(s):`);
for (const p of problems) console.log(` - ${p}`);
process.exit(1);
