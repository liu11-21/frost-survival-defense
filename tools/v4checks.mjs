/**
 * Checks for the faction-marker, health-bar, wall-gate, direction, notification,
 * squad-HUD, codex, building-integrity, ally-death and demolition work.
 *
 * Driven from `playtest.mjs`; every helper is passed in so this file never
 * touches puppeteer directly.
 */

const MARKUP = /<\s*(svg|path|rect|ellipse|circle)\b|viewBox|stroke-width|&lt;|\[object /i;

export async function runV4Checks(ctx) {
  const { call, step, check, shot, page } = ctx;

  // ------------------------------------------------------------ markers ----
  console.log("\n> faction markers");
  check("faction markers default to the clearest setting", (await call("markerStrength")) === "clear");
  await call("setMarkerStrength", "off");
  check("faction markers can be turned off", (await call("markerStrength")) === "off");
  await call("setMarkerStrength", "subtle");
  check("faction markers have a subtle setting", (await call("markerStrength")) === "subtle");
  await call("setMarkerStrength", "clear");

  // -------------------------------------------------------------- setup ----
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);

  // --------------------------------------------------------- health bars ----
  console.log("\n> health bars");
  await call("teleport", 0, 6);
  await call("spawnEnemy", "grunt", 2, 8);
  await call("spawnEnemy", "marksman", -2, 8);
  await step(0.016, 40);
  await call("revealAllBars");
  await step(0.016, 6);
  const barsNearby = await call("healthBarCount");
  check("nearby enemies get a health bar without being hit", barsNearby > 0, `bars=${barsNearby}`);

  await call("killAllEnemies");
  await step(0.016, 260);
  await call("teleport", 0, -20);
  await step(0.016, 20);
  const barsQuiet = await call("healthBarCount");
  await call("build", "southFrontA", "tower");
  await step(0.016, 220);
  await call("damageSlot", "southFrontA", 500);
  await step(0.016, 8);
  const barsWithStructure = await call("healthBarCount");
  check(
    "a damaged structure gets a health bar even with the player far away",
    barsWithStructure > barsQuiet,
    `${barsQuiet} -> ${barsWithStructure}`,
  );
  await call("teleport", 0, 6);
  await call("spawnEnemy", "grunt", 2, 8);
  await step(0.016, 40);

  // A boss must not get a second bar over its head: it owns the top bar.
  await call("spawnEnemy", "boss", 0, 12);
  await step(0.016, 30);
  const beforeBoss = await call("healthBarCount");
  await call("damageBoss", 100);
  await step(0.016, 6);
  const afterBoss = await call("healthBarCount");
  check("the boss is excluded from world health bars", afterBoss <= beforeBoss + 1, `${beforeBoss} -> ${afterBoss}`);

  await call("killAllEnemies");
  await step(0.016, 260);
  const barsAfterDeath = await call("healthBarCount");
  const unitCounts = await call("unitCounts");
  check(
    "bars are released when their owner is recycled",
    barsAfterDeath <= unitCounts.structures + 4,
    `bars=${barsAfterDeath} structures=${unitCounts.structures}`,
  );

  // ---------------------------------------------------- walls and gates ----
  console.log("\n> lane gates, sealing and reachability");
  const wallIds = await call("wallSlotIds");
  check("the perimeter is four whole sides, not many short segments", wallIds.length === 4, `n=${wallIds.length}`);

  const gatesOpen = await call("laneGates");
  check("every lane has a named entrance", gatesOpen.every((g) => g.name && !/^路線/.test(g.name)), JSON.stringify(gatesOpen.map((g) => g.name)));
  check("one segment closes one lane", gatesOpen.every((g) => g.slots.length === 1), JSON.stringify(gatesOpen.map((g) => g.slots.length)));

  await call("grant", 90000, 90000, 90000);
  for (const id of wallIds) await call("build", id, "wall");
  await step(0.016, 340);
  const gatesSealed = await call("laneGates");
  check("a single finished wall seals its lane", gatesSealed.every((g) => g.state === "sealed"), JSON.stringify(gatesSealed.map((g) => g.state)));
  await shot("v4-sealed-perimeter");

  // A taunting shield trooper inside a sealed lane must not pull anyone through.
  await call("recruit", "shield");
  await call("teleport", 0, 12);
  await step(0.016, 400);
  for (let i = 0; i < 2; i++) await call("spawnEnemy", "grunt", -1 + i * 2, 25.5);

  let breachedWhileSealed = 0;
  let minRadius = 99;
  let wallSamples = 0;
  let samples = 0;
  for (let i = 0; i < 50; i++) {
    await step(0.016, 30);
    const sealed = (await call("laneGates"))[0].state === "sealed";
    for (const e of await call("enemyReport")) {
      samples++;
      if (e.target === "wall") wallSamples++;
      if (e.r < minRadius) minRadius = e.r;
      if (sealed && e.r < 15) breachedWhileSealed++;
    }
  }
  check("nothing gets inside a sealed perimeter", breachedWhileSealed === 0, `breaches=${breachedWhileSealed}`);
  check("enemies stop outside the wall ring", minRadius > 16, `minRadius=${minRadius.toFixed(1)}`);
  check(
    "a taunt from behind a wall does not pull enemies through it",
    samples === 0 || wallSamples / samples > 0.9,
    `wallTargetShare=${(wallSamples / Math.max(1, samples)).toFixed(2)}`,
  );
  await shot("v4-wall-siege");

  // Opening one lane must let them in again — the seal is real, not a freeze.
  await call("damageSlot", wallIds[0], 999999);
  await step(0.016, 40);
  const gateAfterBreach = (await call("laneGates"))[0];
  check("destroying the segment reopens the lane", gateAfterBreach.state === "open", gateAfterBreach.state);
  for (let i = 0; i < 6; i++) await call("spawnEnemy", "grunt", -2 + i * 0.8, 25.5);
  let closest = 99;
  for (let i = 0; i < 80 && closest > 16; i++) {
    await step(0.016, 30);
    for (const e of await call("enemyReport")) closest = Math.min(closest, e.r);
  }
  check("enemies advance through the breach", closest < 16, `closestRadius=${closest.toFixed(1)}`);
  await call("killAllEnemies");
  await step(0.016, 200);

  // ------------------------------------------------- direction indicators ----
  console.log("\n> attack direction");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  let preview = [];
  for (let i = 0; i < 460 && preview.length === 0; i++) {
    await step(0.016, 10);
    preview = await call("lanePreview");
  }
  check("a wave is announced before it lands", preview.length > 0, `lanes=${preview.length}`);
  check(
    "the announcement names real places, not lane numbers",
    preview.every((l) => l.name && !/^路線|^lane/i.test(l.name)),
    JSON.stringify(preview.map((l) => l.name)),
  );
  check("the announcement gives a head count per lane", preview.every((l) => l.count > 0), JSON.stringify(preview.map((l) => l.count)));
  const laneText = (await call("uiText")).laneHud;
  check("the lane strip names the approaches", /北方森林|南方冰原|東側山口|西側廢墟/.test(laneText), laneText.slice(0, 60));
  await shot("v4-wave-warning");

  // ---------------------------------------------------- notification text ----
  console.log("\n> notifications carry no markup");
  const offenders = [];
  const record = async (label) => {
    await step(0.016, 4);
    const text = await call("uiText");
    for (const [field, value] of Object.entries(text)) {
      if (MARKUP.test(String(value))) offenders.push(`${label}/${field}: ${String(value).slice(0, 60)}`);
    }
  };

  await call("grant", 90000, 90000, 90000);
  const built = await panelBuild(page);
  check("the build panel can be driven from the DOM", built.clicked, JSON.stringify(built));
  check("the build notification is plain words", !MARKUP.test(built.body), built.body);
  check("the build notification states the cost in words", /木材|石頭|金幣|免費/.test(built.body), built.body);
  check("the notification icon is an element, not text", built.iconIsSvg);
  await record("build");

  await call("recruit", "warrior");
  await record("recruit ok");
  await call("recruit", "mage");
  await record("recruit fail");
  await call("upgradeFurnace");
  await record("furnace");
  await call("damageSlot", "northFrontB", 999999);
  await record("destroyed");
  await call("notify", "測試標題", "測試內容");
  await record("notify");
  check("no notification ever shows markup", offenders.length === 0, offenders.join(" | "));

  // ------------------------------------------------------------ squad HUD ----
  console.log("\n> squad status HUD");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
  const emptyHud = (await call("uiText")).squadHud;
  check("the squad HUD starts empty", /尚未招募/.test(emptyHud), emptyHud.slice(0, 40));

  const hall = await call("build", "northBack", "recruitHall");
  check("a recruit hall can be built for the squad tests", hall?.ok === true, JSON.stringify(hall));
  await step(0.016, 340);
  for (const id of ["warrior", "warrior", "archer", "medic"]) await call("recruit", id);
  await step(0.016, 40);
  const hudText = normalise((await call("uiText")).squadHud);
  check("the squad HUD lists each recruited type", /戰士/.test(hudText) && /弓箭手/.test(hudText) && /醫療兵/.test(hudText), hudText.slice(0, 80));
  check("the squad HUD counts squads per type", /戰士(?:\s*Lv\.\d+)?\s*×2/.test(hudText), hudText.slice(0, 80));
  check("the squad HUD shows a status word", /正常|受傷|危險/.test(hudText), hudText.slice(0, 80));

  await call("hurtAllySquads", 100000);
  await step(0.016, 30);
  const hurtHud = normalise((await call("uiText")).squadHud);
  check("the squad HUD reacts to damage", /危險|受傷/.test(hurtHud), hurtHud.slice(0, 80));
  await shot("v4-squad-hud");

  // ------------------------------------------ health bars under real load ----
  console.log("\n> health bars at 150 units");
  await call("startEndless");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 340);
  for (let i = 0; i < 8; i++) await call("recruit", ["warrior", "archer", "shield", "medic"][i % 4]);
  // Leave enough headroom for the opening exchange: the test measures a
  // *live* 150-unit field rather than a one-frame spawn total.
  for (let i = 0; i < 25; i++) {
    const a = (i / 25) * Math.PI * 2;
    await call("spawnEnemy", "grunt", Math.sin(a) * 13, Math.cos(a) * 13);
    await call("spawnEnemy", "marksman", Math.sin(a) * 15, Math.cos(a) * 15);
  }
  await step(0.016, 60);
  const loadCounts = await call("unitCounts");
  const totalUnits = loadCounts.allies + loadCounts.enemies;
  check("150 or more units are on the field", totalUnits >= 150, JSON.stringify(loadCounts));

  await call("hurtAllySquads", 60);
  await call("revealAllBars");
  await step(0.016, 10);
  const barsUnderLoad = await call("healthBarCount");
  check("bars are shown for a crowded field", barsUnderLoad >= 40, `bars=${barsUnderLoad}`);

  const withBars = await timeFrames(page, step, 200);
  await page.evaluate(() => window.frostbound?.api()?.setMarkerStrength?.("off"));
  const barsOffMs = withBars;
  check(
    `health bars cost little at ${totalUnits} units`,
    withBars < 16,
    `${withBars.toFixed(2)} ms/frame with ${barsUnderLoad} bars`,
  );
  console.log(`  ${totalUnits} units, ${barsUnderLoad} bars: ${barsOffMs.toFixed(2)} ms/frame`);
  await shot("v4-bars-under-load");
  await call("setMarkerStrength", "clear");
  await call("killAllEnemies");
  await step(0.016, 240);

  // ------------------------------------------------- ally death lifecycle ----
  console.log("\n> ally death and cleanup");
  const before = await call("allyBodies");
  check("recruited allies are alive on the field", before.living > 0, JSON.stringify(before));
  const killed = await call("killAllAllies");
  check("every ally can be killed", killed === before.living, `${killed}/${before.living}`);
  await step(0.016, 40);
  const justDead = await call("allyBodies");
  check("bodies stay briefly for the death animation", justDead.corpses > 0, JSON.stringify(justDead));

  await step(0.016, 320);
  const cleared = await call("allyBodies");
  check("bodies are gone within a few seconds", cleared.corpses === 0, JSON.stringify(cleared));
  check("wiped squads leave the roster", cleared.squads === 0, JSON.stringify(cleared));
  check("their visuals return to the pool", cleared.pooled >= before.living, JSON.stringify(cleared));
  const snapAfter = await page.evaluate(() => window.frostbound?.snapshot());
  check("squad capacity is released", snapAfter.allySquads === 0, `squads=${snapAfter.allySquads}`);

  await call("recruit", "warrior");
  await step(0.016, 60);
  const reused = await call("allyBodies");
  check("recruiting again reuses pooled bodies cleanly", reused.living === 3 && reused.corpses === 0, JSON.stringify(reused));

  // -------------------------------------------- building visual integrity ----
  console.log("\n> building visual integrity");
  await call("startEndless");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);

  const plan = [
    ["northMid", "warehouse"],
    ["northBack", "recruitHall"],
    ["southFrontB", "tower"],
    ["southMid", "tower"],
    ["wallNorth", "wall"],
  ];
  for (let round = 0; round < 3; round++) {
    for (const [slot, type] of plan) await call("build", slot, type);
    await step(0.016, 340);
    for (const [slot] of plan) await call("damageSlot", slot, 999999);
    await step(0.016, 40);
    await call("grant", 90000, 90000, 90000);
  }
  for (const [slot, type] of plan) await call("build", slot, type);
  for (const [slot, type] of [
    ["eastFrontA", "mine"],
    ["eastFrontB", "lumberyard"],
    ["eastMid", "autoCollector"],
    ["eastBack", "autoRebuilder"],
  ]) {
    await call("build", slot, type);
  }
  await step(0.016, 420);

  await call("setQuality", "low");
  await step(0.016, 40);
  await call("setQuality", "high");
  await step(0.016, 40);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await step(0.016, 40);

  const report = await call("visualReport");
  const broken = report.filter((r) => !r.ok);
  check("every finished building is visually complete", broken.length === 0, JSON.stringify(broken.slice(0, 3)));
  check("no building part has been disposed", report.every((r) => r.disposed === 0));
  check("no shared material has been torn down", report.every((r) => r.materialsLost === 0));
  check("the completeness rate is 100%", report.length > 0 && broken.length === 0, `${report.length - broken.length}/${report.length}`);
  check("the safety net never had to step in", (await call("visualRepairs")) === 0, `repairs=${await call("visualRepairs")}`);
  await shot("v4-buildings-intact");

  // Stage and tutorial modes must pass the same check.
  for (const mode of ["stage-1", "stage-2", "stage-3"]) {
    await call("startStage", mode);
    await step(0.016, 20);
    await call("grant", 200, 200, 200);
    await call("build", "northFrontB", "warehouse");
    await step(0.016, 320);
    await call("grant", 90000, 90000, 90000);
    for (const [slot, type] of plan) await call("build", slot, type);
    await step(0.016, 360);
    const modeReport = await call("visualReport");
    check(`${mode} buildings are visually complete`, modeReport.length > 0 && modeReport.every((r) => r.ok), JSON.stringify(modeReport.filter((r) => !r.ok).slice(0, 2)));
  }
  await call("startTutorial");
  await step(0.016, 40);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 340);
  const tutReport = await call("visualReport");
  check("tutorial buildings are visually complete", tutReport.length > 0 && tutReport.every((r) => r.ok), JSON.stringify(tutReport.filter((r) => !r.ok)));

  // ------------------------------------------------------------ demolition ----
  console.log("\n> demolition and rebuilding");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);

  await call("build", "northMid", "mine");
  await step(0.016, 6);
  const midBuild = await call("demolishCheck", "northMid");
  check("a building under construction cannot be demolished", midBuild.ok === false, midBuild.reason ?? "");
  await step(0.016, 220);

  const mineCheck = await call("demolishCheck", "northMid");
  check("a finished building can be demolished", mineCheck.ok === true, mineCheck.reason ?? "");
  const buildingCosts = await call("buildingCosts");
  const mineCost = buildingCosts.find((building) => building.id === "mine")?.cost;
  const expectedWoodRefund = Math.floor((mineCost?.wood ?? 0) / 2);
  check("the refund is half the current wood cost, floored", mineCheck.refund.wood === expectedWoodRefund, JSON.stringify(mineCheck.refund));
  check("gold is never refunded", !mineCheck.refund.gold, JSON.stringify(mineCheck.refund));

  const woodBefore = (await page.evaluate(() => window.frostbound?.snapshot())).wood;
  await call("demolish", "northMid");
  await step(0.016, 140);
  const woodAfter = (await page.evaluate(() => window.frostbound?.snapshot())).wood;
  check("demolishing returns the refund", woodAfter - woodBefore === expectedWoodRefund, `${woodBefore} -> ${woodAfter}`);
  const freedSlot = (await call("slots")).find((s) => s.id === "northMid");
  check("the plot is free again", freedSlot.occupied === false, JSON.stringify(freedSlot));
  check("a manual demolition never enters the rebuild queue", (await call("rebuildQueue")).length === 0);
  const history = await call("slotHistory", "northMid");
  check("the plot forgets what it used to hold", history.last === null && history.everBuilt === false, JSON.stringify(history));
  check("the build record is kept for statistics", history.history.includes("mine"), JSON.stringify(history.history));

  // Convert the plot and confirm the *new* type is what gets rebuilt.
  await call("build", "northMid", "lumberyard");
  await step(0.016, 260);
  await call("build", "northBack", "warehouse");
  await step(0.016, 320);
  await call("damageSlot", "northBack", 999999);
  await step(0.016, 30);
  const queueAfterConvert = await call("rebuildQueue");
  check(
    "only the current building is queued after a conversion",
    queueAfterConvert.every((q) => q.slot !== "northMid"),
    JSON.stringify(queueAfterConvert),
  );

  // Combat lockout.
  await call("build", "southBack", "tower");
  await step(0.016, 260);
  await call("damageSlot", "southBack", 100);
  await step(0.016, 4);
  const hotCheck = await call("demolishCheck", "southBack");
  check("a building hit seconds ago cannot be demolished", hotCheck.ok === false, hotCheck.reason ?? "");
  check("the refusal says why", /受到攻擊/.test(hotCheck.reason ?? ""), hotCheck.reason ?? "");
  await step(0.016, 240);
  const cooledCheck = await call("demolishCheck", "southBack");
  check("the lockout expires", cooledCheck.ok === true, cooledCheck.reason ?? "");

  // Recruit hall: squads survive, recruiting stops.
  await call("build", "eastFrontA", "recruitHall");
  await step(0.016, 320);
  await call("recruit", "warrior");
  await step(0.016, 30);
  const squadsBefore = (await page.evaluate(() => window.frostbound?.snapshot())).allySquads;
  await call("demolish", "eastFrontA");
  await step(0.016, 140);
  const squadsAfter = (await page.evaluate(() => window.frostbound?.snapshot())).allySquads;
  check("demolishing the hall keeps existing squads", squadsAfter === squadsBefore, `${squadsBefore} -> ${squadsAfter}`);
  const recruitAfter = await call("recruit", "archer");
  check("demolishing the hall stops new recruiting", typeof recruitAfter === "string", String(recruitAfter));
  await call("build", "eastFrontA", "recruitHall");
  await step(0.016, 340);
  check("rebuilding the hall restores recruiting", (await call("recruit", "archer")) === null);

  // Warehouse: no destruction penalty, the cap does come back.
  await call("grant", 90000, 90000, 90000);
  const richBefore = await page.evaluate(() => window.frostbound?.snapshot());
  await call("demolish", "northFrontB");
  await step(0.016, 160);
  const capped = await page.evaluate(() => window.frostbound?.snapshot());
  check("demolishing the warehouse re-applies the cap", capped.wood <= 100 && capped.stone <= 100, JSON.stringify(capped));
  check("the overflow is dropped, not deleted", (await call("pickupCount")) > 0, `pickups=${await call("pickupCount")}`);
  check("it is not treated as an enemy kill", richBefore.wood > capped.wood);

  // No residue left behind.
  await call("build", "westFrontB", "tower");
  await step(0.016, 300);
  const structuresBefore = (await call("unitCounts")).structures;
  await call("demolish", "westFrontB");
  await step(0.016, 160);
  const structuresAfter = (await call("unitCounts")).structures;
  check("a demolished building leaves the combat world", structuresAfter === structuresBefore - 1, `${structuresBefore} -> ${structuresAfter}`);
  const residualReport = await call("visualReport");
  check("no orphan visuals remain after a demolition", residualReport.every((r) => r.slotId !== "westFrontB"), JSON.stringify(residualReport.map((r) => r.slotId)));
  await shot("v4-after-demolition");
}

/** Opens the build panel through the real key handler and clicks an entry. */
async function panelBuild(page) {
  return page.evaluate(() => {
    const api = window.frostbound?.api();
    if (!api) return { clicked: false };
    const slot = api.slots().find((s) => s.category === "universal" && !s.occupied);
    if (!slot) return { clicked: false, reason: "no free universal slot" };
    const pos = api.slotWorldPos(slot.id);
    if (!pos) return { clicked: false, reason: "no world position for slot" };
    api.teleport(pos.x, pos.z);
    window.frostbound.step(0.016, 6, false);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB" }));
    window.frostbound.step(0.016, 6, false);
    const entry = document.querySelector("#ui-build-list button.entry:not(:disabled)");
    if (!entry) return { clicked: false, reason: "no enabled entry" };
    entry.click();
    window.frostbound.step(0.016, 4, false);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    return {
      clicked: true,
      title: document.querySelector("#ui-banner-title").textContent ?? "",
      body: document.querySelector("#ui-banner-body").textContent ?? "",
      iconIsSvg: (document.querySelector("#ui-banner-icon").innerHTML ?? "").startsWith("<svg"),
    };
  });
}

/** Wall-clock cost of running `frames` simulation steps. */
async function timeFrames(page, step, frames) {
  const t0 = Date.now();
  await step(0.016, frames);
  await page.evaluate(() => undefined);
  return (Date.now() - t0) / frames;
}

function normalise(text) {
  return String(text).replace(/\s+/g, " ").trim();
}
