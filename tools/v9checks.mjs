/**
 * Checks for the Pass D pass: minimap/map, attack-range display, watchdog/
 * residue diagnostics, the rebuilt build menu, and the hero's three active
 * skills (Q/R/F). Driven from `playtest.mjs`; every helper is passed in so
 * this file never touches puppeteer directly.
 */

export async function runV9Checks(ctx) {
  const { check, call, step, page } = ctx;

  // -------------------------------------------------------------- minimap --
  console.log("\n> minimap snapshot and full-map toggle");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  const snap = await call("minimapSnapshot");
  check("minimap snapshot reports the hero's own position", snap && Number.isFinite(snap.hero.x) && Number.isFinite(snap.hero.z), snap?.hero);
  check("minimap snapshot reports all four wall sides", Array.isArray(snap.wallSides) && snap.wallSides.length === 4, snap?.wallSides?.length);

  check("map starts closed", (await call("mapOpen")) === false);
  await call("toggleMap");
  await step(0.016, 5);
  check("toggleMap opens the full map overlay", (await call("mapOpen")) === true);
  await call("toggleMap");
  await step(0.016, 5);
  check("toggleMap closes it again", (await call("mapOpen")) === false);

  // -------------------------------------------------------- attack range --
  console.log("\n> attack-range display reflects a built tower's real data");
  await call("grant", 9000, 9000, 9000);
  await call("build", "northFrontA", "crossbowTower");
  await step(0.016, 260);
  const pos = await call("slotWorldPos", "northFrontA");
  await call("teleport", pos.x, pos.z);
  await step(0.016, 20);
  const rangeState = await call("rangeDisplayState");
  check(
    "the range overlay turns on for a built attack building the hero stands near",
    rangeState.outerOn === true && rangeState.maxRange > 0,
    rangeState,
  );
  await call("teleport", 0, 0);
  await step(0.016, 20);
  check("the range overlay turns off once the hero leaves", (await call("rangeDisplayState")).outerOn === false);

  // ------------------------------------------------------ build menu (UI) --
  console.log("\n> build menu opens near an empty slot with category tabs");
  const emptyPos = await call("slotWorldPos", "northFrontB");
  await call("teleport", emptyPos.x, emptyPos.z);
  await step(0.016, 20);
  await page.keyboard.press("KeyB");
  await step(0.016, 5);
  check("build panel reports open", (await call("panelState")).isBuild === true);
  const buildText = (await call("uiText")).buildList;
  check("build panel lists at least one buildable entry", typeof buildText === "string" && buildText.length > 0, buildText?.slice(0, 80));
  await page.keyboard.press("KeyB");
  await step(0.016, 5);
  check("build panel closes again", (await call("panelState")).open === false);

  // ---------------------------------------------------- watchdog / residue --
  console.log("\n> watchdog and death-residue guard stay quiet during normal play");
  await call("resetWatchdog");
  for (let i = 0; i < 4; i++) await call("spawnAlly", "warrior", -3 + i, 4);
  await call("spawnEnemy", "grunt", 0, 20);
  await step(0.016, 300);
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 300); // well past CORPSE_TIME/DEATH_HARD_LIMIT
  const wd = await call("watchdog");
  check("no watchdog stalls during ordinary combat", wd.stalls === 0, wd);
  check("no unregistered allies after combat settles", wd.unregistered.length === 0, wd.unregistered);
  const residue = await call("residue");
  check("no forced death-residue cleanups needed after combat settles", residue.forceCleaned === 0, residue);

  // ---------------------------------------------------- hero skills (Q/R/F) --
  console.log("\n> hero active skills: cooldowns, effects, run reset");
  await call("startStage", "stage-1");
  await step(0.016, 20);

  const initial = await call("heroSkillState");
  check("all three hero skills exist", initial.length === 3, initial.map((s) => s.id));
  check("all skills start ready", initial.every((s) => s.ready), initial);

  // Frost Nova (Q): damages + slows nearby enemies.
  await call("teleport", 0, -20);
  await step(0.016, 5);
  await call("spawnEnemy", "grunt", 2, -20);
  await call("spawnEnemy", "grunt", -2, -20);
  await step(0.016, 10);
  const beforeHp = (await call("enemyReport")).map((e) => ({ id: e.id, hp: e.hp }));
  const qResult = await call("useHeroSkill", "frostNova");
  check("frostNova casts successfully", qResult === null, qResult);
  await step(0.016, 5);
  const afterHp = await call("enemyReport");
  check("frostNova damaged every enemy in its radius", afterHp.every((e, i) => e.hp < beforeHp[i].hp), { beforeHp, afterHp });
  const qState = (await call("heroSkillState")).find((s) => s.id === "frostNova");
  check("frostNova is now on cooldown", qState.remaining > 0 && !qState.ready, qState);
  check("frostNova refuses a re-cast while on cooldown", (await call("useHeroSkill", "frostNova")) === "技能冷卻中");
  await call("killAllEnemies");
  await step(0.016, 30);

  // Focused Barrage (R): needs a live target, hits far harder than one normal shot.
  check("barrage refuses with no target", (await call("useHeroSkill", "barrage")) === "沒有可攻擊的目標");
  // juggernaut is squadSize 1 with high HP, so `enemyReport()[0]` unambiguously
  // refers to the same unit across reads (grunt's squadSize 3 would not).
  await call("spawnEnemy", "juggernaut", 0, -22);
  let targetAlive = false;
  for (let i = 0; i < 20 && !targetAlive; i++) {
    await step(0.016, 5);
    targetAlive = (await call("heroTargetId")) === "juggernaut" && (await call("heroTargetAlive")) === true;
  }
  check("hero acquires the juggernaut as a target", targetAlive);
  const beforeJugg = (await call("enemyReport"))[0];
  check("barrage casts successfully with a target", (await call("useHeroSkill", "barrage")) === null);
  await step(0.016, 40);
  const afterJugg = (await call("enemyReport"))[0];
  check(
    "barrage's volley deals far more damage than a single normal hit",
    afterJugg.hp < beforeJugg.hp - 50,
    { beforeJugg, afterJugg },
  );
  await call("killAllEnemies");
  await step(0.016, 30);

  // Emergency Rally (F): heals hero + nearby allies, grants a timed shield.
  await call("hurtHero", 400);
  await call("spawnAlly", "warrior", 1, -20);
  await step(0.016, 10);
  await call("hurtAllySquads", 40);
  const beforeHero = (await page.evaluate(() => window.frostbound.snapshot())).heroHp;
  const beforeAllyHp = await call("allyHealth");
  check("rally casts successfully", (await call("useHeroSkill", "rally")) === null);
  await step(0.016, 5);
  const afterHero = (await page.evaluate(() => window.frostbound.snapshot())).heroHp;
  const afterAllyHp = await call("allyHealth");
  check("rally heals the hero", afterHero > beforeHero, { beforeHero, afterHero });
  check("rally heals nearby allies", afterAllyHp > beforeAllyHp, { beforeAllyHp, afterAllyHp });
  await call("killAllAllies");

  // The HUD's cooldown text reads the same state `tryUse` checks.
  await call("setHeroSkillCooldown", "rally", 3.4);
  const uiState = (await call("heroSkillState")).find((s) => s.id === "rally");
  check("forced cooldown is reflected in state", Math.abs(uiState.remaining - 3.4) < 0.05, uiState);
  check("rally is blocked while forced on cooldown", (await call("useHeroSkill", "rally")) === "技能冷卻中");

  // A fresh run resets every skill's cooldown.
  await call("setHeroSkillCooldown", "frostNova", 5);
  await call("startStage", "stage-1");
  await step(0.016, 5);
  check("starting a new run resets all hero skill cooldowns", (await call("heroSkillState")).every((s) => s.ready));

  return {};
}
