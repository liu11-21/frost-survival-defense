/**
 * Focused regression for the furnace expansion, elevated platforms and air
 * units.  This intentionally uses the same public debug surface as the older
 * suites so the checks exercise the real slot/build/combat paths rather than
 * duplicating game internals in the test.
 */
export async function runV10Checks(ctx) {
  const { call, step, check, page } = ctx;

  console.log("\n> furnace ground-slot unlock schedule");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  const expectedGround = [4, 7, 10, 13, 16, 19, 22, 25, 28, 31];
  const unlockOk = [];
  for (let level = 1; level <= 10; level++) {
    await call("setFurnaceLevel", level);
    const info = await call("slotUnlocks");
    unlockOk.push(info.ground === expectedGround[level - 1] && info.sky === 0);
  }
  check("ground plots unlock as 4/7/10/13/16/19/22/25/28/31 through furnace Lv.10", unlockOk.every(Boolean), unlockOk);
  const slots = await call("slots");
  check("the four original wall slots remain unchanged and are ground slots", slots.filter((s) => s.category === "wall").length === 4 && slots.filter((s) => s.category === "wall").every((s) => s.surface === "ground"), slots.filter((s) => s.category === "wall"));
  await call("setFurnaceLevel", 1);
  const locked = await call("canBuild", "outpostNorth", "tower");
  check("a locked outer ground plot cannot be built before its furnace level", locked?.ok === false && /Lv\.8/.test(locked.reason ?? ""), locked);

  console.log("\n> sky platforms and surface rules");
  await call("setFurnaceLevel", 14);
  check("no sky platform exists before Lv.15", (await call("slotUnlocks")).sky === 0);
  await call("setFurnaceLevel", 15);
  const sky15 = await call("slotUnlocks");
  check("the first sky platform unlocks at Lv.15", sky15.sky === 1 && sky15.skyByLevel[0]?.unlockLevel === 15, sky15);
  await call("setFurnaceLevel", 35);
  const sky35 = await call("slotUnlocks");
  check("sky platforms unlock at Lv.15/20/25/30/35 and cap at five", sky35.sky === 5 && sky35.skyByLevel.map((s) => s.unlockLevel).join(",") === "15,20,25,30,35", sky35);
  await call("setResources", 100, 100, 100);
  const economyDenied = await call("canBuild", "skyA", "mine");
  const attackAllowed = await call("canBuild", "skyA", "tower");
  check("sky platforms reject economy buildings but accept attack buildings", economyDenied?.ok === false && attackAllowed?.ok === true, { economyDenied, attackAllowed });
  const placed = await call("build", "skyA", "tower");
  await step(0.016, 220);
  const skyStats = await call("slotStats", "skyA");
  check("sky construction uses ceil(base cost × 1.25), elevated position and sky damage multiplier", placed?.ok === true && skyStats?.isSky === true && skyStats?.cost?.wood === 94 && skyStats?.cost?.stone === 44 && skyStats?.cost?.gold === 13, skyStats);

  console.log("\n> air enemy composition and targeting");
  const stage4 = await call("stageWavePreview", 4);
  const stage8 = await call("stageWavePreview", 8);
  const endless15 = await call("endlessWavePreview", 15, 2);
  const endless20 = await call("endlessWavePreview", 20, 2);
  check("flying melee/elite/bomber/colossus first appear at waves 4/8/15/20", stage4.some((g) => g.enemyId === "flyingMelee") && stage8.some((g) => g.enemyId === "flyingEliteArcher") && endless15.groups.some((g) => g.enemyId === "flyingBomber") && endless20.groups.some((g) => g.enemyId === "flyingColossus"), { stage4, stage8, endless15, endless20 });
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("setFurnaceLevel", 15);
  await call("setResources", 100, 100, 100);
  await call("build", "skyA", "tower");
  await step(0.016, 120);
  await call("spawnEnemy", "flyingMelee", 0, 5);
  await call("spawnAlly", "warrior", 0, 0);
  await call("spawnAlly", "archer", 0, 0);
  await step(0.016, 8);
  const warriorTarget = await call("allyTargetKind", "warrior");
  const archerTarget = await call("allyTargetKind", "archer");
  const air = await call("flyingReport");
  check("flying enemies are elevated, ignored by melee allies and targetable by ranged allies", air.some((u) => u.id === "flyingMelee" && u.y === 6) && warriorTarget !== "flyingMelee" && archerTarget === "flyingMelee", { air, warriorTarget, archerTarget });
  await call("spawnEnemy", "grunt", 0, 8);
  await step(0.016, 20);
  const enemyTargets = await call("enemyReport");
  check("existing enemies never lock the elevated sky tower as a target", enemyTargets.every((e) => e.target !== "tower"), enemyTargets);

  const hud = await page.evaluate(() => ({
    roster: document.querySelector("#ui-squad-hud")?.textContent ?? "",
    rates: [...document.querySelectorAll(".res small")].map((e) => e.textContent ?? ""),
  }));
  check("roster HUD keeps category headings and resource HUD exposes production rates", /近戰/.test(hud.roster) && /遠程/.test(hud.roster) && /支援/.test(hud.roster) && hud.rates.every((text) => /\+/.test(text)), hud);
}
