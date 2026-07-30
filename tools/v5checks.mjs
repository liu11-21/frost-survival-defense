/**
 * Checks for the always-on faction marking, always-on health bars, universal
 * demolition (including non-attackable buildings), the general-HUD FPS
 * readout, and the F6 forced-verification overlay.
 *
 * Driven from `playtest.mjs`; every helper is passed in so this file never
 * touches puppeteer directly.
 */

export async function runV5Checks(ctx) {
  const { call, step, check, shot, page } = ctx;

  console.log("\n> always-on faction marking and health bars");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 340);
  for (const id of ["warrior", "archer", "shield", "medic"]) await call("recruit", id);
  for (let i = 0; i < 8; i++) await call("spawnEnemy", ["grunt", "slinger", "bruiser", "marksman"][i % 4], -6 + i * 1.5, 9);
  await step(0.016, 40);

  const unitCounts = await call("unitCounts");
  const barCounts = await call("barCounts");
  const markerDebug = await call("markerDebug");
  check(
    "every living ally has a bar the instant it spawns, with no damage or hover",
    barCounts.ally === unitCounts.allies,
    `allies=${unitCounts.allies} bars=${barCounts.ally}`,
  );
  check(
    "every living enemy has a bar the instant it spawns",
    barCounts.enemy === unitCounts.enemies,
    `enemies=${unitCounts.enemies} bars=${barCounts.enemy}`,
  );
  check("the hero has exactly one hero-style bar", barCounts.hero === 1, `hero=${barCounts.hero}`);
  check(
    "every living enemy has a red ground badge with no damage or hover",
    markerDebug.enemyShown === unitCounts.enemies,
    `enemies=${unitCounts.enemies} redMarkers=${markerDebug.enemyShown}`,
  );
  check(
    "every living ally has a blue ground badge",
    markerDebug.allyShown === unitCounts.allies,
    `allies=${unitCounts.allies} blueMarkers=${markerDebug.allyShown}`,
  );
  check(
    "every marked unit also has a head marker, a second independent cue",
    markerDebug.enemyHeadShown === unitCounts.enemies && markerDebug.allyHeadShown === unitCounts.allies,
    JSON.stringify(markerDebug),
  );
  check("the hero has its own ground ring", markerDebug.heroGround === true);
  check("the hero has its own head marker", markerDebug.heroHead === true);
  check("the hero has its own light beam", markerDebug.heroBeam === true);
  await shot("v5-always-on-marking");

  console.log("\n> health bars for attackable structures, not for the rest");
  await call("build", "southFrontA", "tower");
  await step(0.016, 260);
  const withTower = await call("barCounts");
  const structureCountBefore = (await call("unitCounts")).structures;
  check(
    "a freshly completed tower gets a bar without ever being hit",
    withTower.structure >= structureCountBefore,
    `structure bars=${withTower.structure} attackable=${structureCountBefore}`,
  );
  await call("build", "northFrontA", "mine");
  await step(0.016, 260);
  const afterMine = await call("barCounts");
  check(
    "a non-attackable building (mine) does not get a fake health bar",
    afterMine.structure === withTower.structure,
    `before=${withTower.structure} after=${afterMine.structure}`,
  );

  console.log("\n> health bars survive a crowd, not just a hover");
  // Combat has to be settled first so the only variable left is distance —
  // otherwise an enemy dying mid-check would look like a bar wrongly unbound.
  await call("killAllEnemies");
  await step(0.016, 260);
  const nearBars = await call("healthBarCount");
  await call("teleport", 0, -30);
  await step(0.016, 30);
  const farBars = await call("healthBarCount");
  check(
    "bars stay bound even when the player is far away",
    farBars === nearBars,
    `near=${nearBars} far=${farBars}`,
  );
  await call("teleport", 0, 6);
  await step(0.016, 10);

  console.log("\n> demolition reaches every non-core building type, attackable or not");
  const wallIds = await call("wallSlotIds");
  await call("build", wallIds[0], "wall");
  await step(0.016, 300);
  await call("grant", 200, 200, 200);
  await call("build", "eastFrontA", "autoRebuilder");
  await call("build", "eastFrontB", "autoCollector");
  await step(0.016, 420);

  const target = await eDrivenPanel(page, "northFrontA"); // mine — non-attackable
  check("E on a non-attackable building (mine) opens its info panel", target.buildOpen, JSON.stringify(target));
  check("the mine's panel has a demolish button", target.hasDemolish, JSON.stringify(target));

  for (const [label, slotId] of [
    ["mine", "northFrontA"],
    ["auto-collector", "eastFrontB"],
    ["auto-rebuilder", "eastFrontA"],
    ["warehouse", "northFrontB"],
    ["recruit hall", "northBack"],
    ["tower", "southFrontA"],
    ["wall", wallIds[0]],
  ]) {
    const result = await eDrivenPanel(page, slotId);
    check(`E opens the demolish-capable panel for ${label}`, result.buildOpen && result.hasDemolish, JSON.stringify(result));
  }
  await shot("v5-universal-demolish-prompt");

  const clicked = await clickDemolish(page, "northFrontA");
  check("clicking demolish opens the confirmation for the correct building", /礦場/.test(clicked.confirmText ?? ""), clicked.confirmText);
  await page.evaluate(() => document.querySelector("[data-yes]")?.click());
  await step(0.016, 140);
  const afterMineDemolish = (await call("slots")).find((s) => s.id === "northFrontA");
  check("a non-attackable building can actually be demolished end to end", afterMineDemolish.occupied === false, JSON.stringify(afterMineDemolish));

  console.log("\n> canBeAttacked and canBeDemolished are independent");
  const slotsNow = await call("slots");
  const stillBuilt = slotsNow.filter((s) => s.occupied);
  check("at least one non-attackable and one attackable building are both present", stillBuilt.some((s) => ["autoCollector", "autoRebuilder"].includes(s.type)) && stillBuilt.some((s) => ["tower", "wall", "warehouse"].includes(s.type)));

  console.log("\n> general HUD shows FPS without F3");
  const fpsText = (await call("uiText")).fpsBox ?? (await page.evaluate(() => document.querySelector("#ui-fps")?.textContent ?? ""));
  check("the FPS readout is visible on the general HUD", /FPS\s*\d/.test(fpsText), fpsText);
  const perfOpen = await page.evaluate(() => document.getElementById("debug-perf")?.classList.contains("show") ?? false);
  check("F3 was never opened for the FPS readout to appear", perfOpen === false);
  const sharedSource = await page.evaluate(() => {
    const api = window.frostbound?.api();
    return api ? { hud: document.querySelector("#ui-fps")?.textContent, monitor: api.perf().avgFps5s } : null;
  });
  check(
    "the general HUD and the performance monitor agree, because they share one source",
    Number((sharedSource.hud.match(/\d+/) ?? ["-1"])[0]) === Math.round(sharedSource.monitor),
    JSON.stringify(sharedSource),
  );

  await shot("v5-fps-hud");

  console.log("\n> F6 forced-verification overlay");
  await call("toggleVerify");
  await step(0.016, 10);
  const verifyOpen = await call("isVerifyOpen");
  check("F6 opens the verification overlay", verifyOpen === true);
  check("opening the verification overlay untracks the run", await call("isStressTagged"), "isStressTagged should be true");
  const verifyText = await call("verifyText");
  check("the verification overlay reports matching bar counts", /存活敵人 \/ 敵方血條(\d+) \/ \1/.test(verifyText.replace(/\s+/g, " ")) || /存活敵人.*(\d+)\s*\/\s*\1/.test(verifyText), verifyText.slice(0, 200));
  const enemyLine = verifyText.match(/存活敵人 \/ 敵方血條[^\d]*(\d+)[^\d]*(\d+)/);
  check("enemy count equals enemy bar count in the verification overlay", enemyLine && enemyLine[1] === enemyLine[2], verifyText.slice(0, 120));
  const allyLine = verifyText.match(/我方.*?血條[^\d]*(\d+)[^\d]*(\d+)/);
  check("ally count equals ally bar count in the verification overlay", allyLine && allyLine[1] === allyLine[2], verifyText.slice(0, 200));
  const demolishLine = verifyText.match(/可拆除數 \/ 已註冊拆除互動數[^\d]*(\d+)[^\d]*(\d+)/);
  check("demolishable count equals registered-interaction count", demolishLine && demolishLine[1] === demolishLine[2], verifyText.slice(0, 300));
  await shot("v5-verify-overlay");
  await call("toggleVerify");

  console.log("\n> a run that used a test tool never offers a leaderboard row");
  await call("startEndless");
  await step(0.016, 20);
  await call("damageFurnace", 999999);
  await step(0.016, 40);
  const resultHtml = await page.evaluate(() => document.querySelector(".screen-inner")?.innerHTML ?? "");
  check("the result screen skips the score-submission row for an untracked run", !resultHtml.includes("data-submit"), resultHtml.slice(0, 200));
  check("the result screen explains why", /測試或教學工具/.test(resultHtml), resultHtml.slice(0, 300));
}

/**
 * Teleports next to a slot and presses E, reporting what opened.
 *
 * A production building with a full buffer answers the first E with a
 * collect, exactly as the brief requires — so this drains that buffer first
 * (mirroring what a player would actually do) before judging whether the
 * info panel opened.
 */
async function eDrivenPanel(page, slotId) {
  return page.evaluate((id) => {
    const api = window.frostbound?.api();
    const info = api.slotWorldPos(id);
    if (!info) return { buildOpen: false, hasDemolish: false, reason: "slot not found" };
    api.teleport(info.x, info.z);
    window.frostbound.step(0.016, 20, false);
    for (let i = 0; i < 3 && api.promptNow().kind === "collect"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
      window.frostbound.step(0.016, 6, false);
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
    window.frostbound.step(0.016, 6, false);
    const buildOpen = document.querySelector("#ui-build-panel")?.classList.contains("show") ?? false;
    const hasDemolish = document.querySelector("#ui-demolish") !== null;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    window.frostbound.step(0.016, 4, false);
    return { buildOpen, hasDemolish };
  }, slotId);
}

async function clickDemolish(page, slotId) {
  return page.evaluate((id) => {
    const api = window.frostbound?.api();
    const info = api.slotWorldPos(id);
    api.teleport(info.x, info.z);
    window.frostbound.step(0.016, 20, false);
    for (let i = 0; i < 3 && api.promptNow().kind === "collect"; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
      window.frostbound.step(0.016, 6, false);
    }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE" }));
    window.frostbound.step(0.016, 6, false);
    document.querySelector("#ui-demolish")?.click();
    window.frostbound.step(0.016, 4, false);
    const confirmText = document.querySelector("#ui-confirm-body")?.textContent?.replace(/\s+/g, " ").trim();
    return { confirmText };
  }, slotId);
}
