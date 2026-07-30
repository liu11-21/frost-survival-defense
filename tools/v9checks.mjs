/**
 * Checks for the Pass D pass: minimap/map, attack-range display, watchdog/
 * residue diagnostics, the rebuilt build menu, and the hero's three active
 * skills (1/2/3). Driven from `playtest.mjs`; every helper is passed in so
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

  // ------------------------------------------------------ squad capacity --
  console.log("\n> squad capacity counts squads, not their members");
  await call("spawnAlly", "warrior", -2, 4);
  let capacity = await call("squadInfo");
  check(
    "one three-person Warrior squad consumes exactly one squad slot",
    capacity.count === 1 && capacity.units === 3,
    capacity,
  );
  await call("spawnAlly", "shield", 2, 4);
  capacity = await call("squadInfo");
  check(
    "adding a one-person Shield squad consumes one additional slot",
    capacity.count === 2 && capacity.units === 4,
    capacity,
  );

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

  console.log("\n> attackable facilities share the furnace self-repair cadence");
  await call("damageSlot", "northFrontA", 100);
  const damagedFacility = await call("slotHealth", "northFrontA");
  await step(0.016, 920);
  const beforeRepairDelay = await call("slotHealth", "northFrontA");
  check(
    "an attackable facility does not heal before 15 seconds without damage",
    beforeRepairDelay.health === damagedFacility.health,
    { damagedFacility, beforeRepairDelay },
  );
  await step(0.016, 60);
  const afterRepairPulse = await call("slotHealth", "northFrontA");
  check(
    "the facility begins fixed repair pulses after the shared delay",
    afterRepairPulse.health > beforeRepairDelay.health && afterRepairPulse.health <= afterRepairPulse.max,
    { beforeRepairDelay, afterRepairPulse },
  );

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

  // ------------------------------------- enemy priority and pre-emption --
  console.log("\n> generic enemies enforce and refresh the six-tier target order");
  await call("startStage", "stage-1");
  await step(0.016, 10);
  await call("grant", 100, 100, 20);
  const priorityWarehouse = await call("build", "northMid", "warehouse");
  check("priority test warehouse unlocks the resource cap", priorityWarehouse?.ok === true, priorityWarehouse);
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
  const firstWall = await call("build", "wallNorth", "wall");
  check("priority test wall starts building", firstWall?.ok === true, firstWall);
  await step(0.016, 340);
  await call("spawnAlly", "shield", 0, 13);
  await call("spawnEnemy", "grunt", 0, 25.5);
  await step(0.016, 30);
  let priorityTargets = await call("enemyReport");
  check(
    "a standing lane wall outranks a shield unit",
    priorityTargets.length > 0 && priorityTargets.every((e) => e.target === "wall"),
    priorityTargets,
  );

  await call("damageSlot", "wallNorth", 999999);
  await step(0.016, 110);
  priorityTargets = await call("enemyReport");
  check(
    "after the wall falls, surviving generic enemies reacquire the shield",
    priorityTargets.length > 0 && priorityTargets.every((e) => e.targetId === "shield"),
    priorityTargets,
  );

  await call("grant", 90000, 90000, 90000);
  const rebuiltWall = await call("build", "wallNorth", "wall");
  check("destroyed priority wall can be rebuilt", rebuiltWall?.ok === true, rebuiltWall);
  await step(0.016, 340);
  priorityTargets = await call("enemyReport");
  check(
    "a rebuilt higher-tier wall pre-empts the still-living shield target",
    priorityTargets.length > 0 && priorityTargets.every((e) => e.target === "wall"),
    priorityTargets,
  );

  // --------------------------------------------- friendly auto-lock --
  console.log("\n> friendly combat units immediately reacquire after a kill");
  await call("startStage", "stage-1");
  await step(0.016, 5);
  await call("spawnAlly", "warrior", 0, 4);
  await call("spawnEnemy", "juggernaut", 0, 8);
  await call("spawnEnemy", "grunt", 2, 9);
  await step(0.016, 30);
  check("warrior initially locks the higher-tier juggernaut", (await call("allyTargetKind", "warrior")) === "juggernaut");
  await call("damageUnit", "juggernaut", 999999);
  await step(0.016, 2);
  check(
    "warrior auto-locks another living enemy within two frames",
    (await call("allyTargetKind", "warrior")) === "grunt",
    await call("aiStates"),
  );

  // ------------------------------------------ halted corpse lifecycle --
  console.log("\n> allied corpses still clear after the result menu halts combat");
  await call("startStage", "stage-1");
  await step(0.016, 5);
  await call("spawnAlly", "warrior", 0, 4);
  const haltedBefore = await call("allyBodies");
  await call("killAllAllies");
  await call("damageFurnace", 999999);
  await step(0.016, 70);
  const haltedAfter = await call("allyBodies");
  check(
    "a wiped squad disappears even though defeat opened the result menu",
    haltedBefore.living === 3 && haltedAfter.corpses === 0 && haltedAfter.squads === 0,
    { haltedBefore, haltedAfter },
  );

  // ---------------------------------------------------- watchdog / residue --
  console.log("\n> watchdog and death-residue guard stay quiet during normal play");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("resetWatchdog");
  for (let i = 0; i < 4; i++) await call("spawnAlly", "warrior", -3 + i, 4);
  await call("spawnEnemy", "grunt", 0, 20);
  await step(0.016, 300);
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 90); // well past CORPSE_TIME/DEATH_HARD_LIMIT
  const wd = await call("watchdog");
  check("no watchdog stalls during ordinary combat", wd.stalls === 0, wd);
  check("no unregistered allies after combat settles", wd.unregistered.length === 0, wd.unregistered);
  const residue = await call("residue");
  check("no forced death-residue cleanups needed after combat settles", residue.forceCleaned === 0, residue);

  // ---------------------------------------------------- hero skills (1/2/3) --
  console.log("\n> hero active skills: cooldowns, effects, run reset");
  await call("startStage", "stage-1");
  await step(0.016, 20);

  const initial = await call("heroSkillState");
  check("all three hero skills exist", initial.length === 3, initial.map((s) => s.id));
  check("all skills start ready", initial.every((s) => s.ready), initial);
  const skillUi = await page.$$eval(".skill-slot", (slots) =>
    slots.map((slot) => ({
      key: slot.querySelector(".skill-key")?.textContent?.trim(),
      description: slot.querySelector(".skill-description")?.textContent?.trim(),
    })),
  );
  check("skill HUD shows the 1/2/3 keys", skillUi.map((s) => s.key).join("") === "123", skillUi);
  check("every skill button has a short explanation", skillUi.every((s) => (s.description?.length ?? 0) >= 4), skillUi);

  // Frost Nova (1): damages + slows nearby enemies.
  await call("teleport", 0, -20);
  await step(0.016, 5);
  await call("spawnEnemy", "grunt", 2, -20);
  await call("spawnEnemy", "grunt", -2, -20);
  await step(0.016, 10);
  const beforeHp = (await call("enemyReport")).map((e) => ({ id: e.id, hp: e.hp }));
  await page.keyboard.press("Digit1");
  await step(0.016, 5);
  const afterHp = await call("enemyReport");
  check("frostNova damaged every enemy in its radius", afterHp.every((e, i) => e.hp < beforeHp[i].hp), { beforeHp, afterHp });
  const qState = (await call("heroSkillState")).find((s) => s.id === "frostNova");
  check("frostNova is now on cooldown", qState.remaining > 0 && !qState.ready, qState);
  check("frostNova refuses a re-cast while on cooldown", (await call("useHeroSkill", "frostNova")) === "技能冷卻中");
  await call("killAllEnemies");
  await step(0.016, 30);

  // Focused Barrage (2): needs a live target, hits far harder than one normal shot.
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
  await page.keyboard.press("Digit2");
  await step(0.016, 40);
  const afterJugg = (await call("enemyReport"))[0];
  const barrageState = (await call("heroSkillState")).find((s) => s.id === "barrage");
  check("Digit2 casts barrage and starts its cooldown", barrageState.remaining > 0 && !barrageState.ready, barrageState);
  check(
    "barrage's volley deals far more damage than a single normal hit",
    afterJugg.hp < beforeJugg.hp - 50,
    { beforeJugg, afterJugg },
  );
  await call("killAllEnemies");
  await step(0.016, 30);

  // Emergency Rally (3): heals hero + nearby allies, grants a timed shield.
  await call("hurtHero", 400);
  await call("spawnAlly", "warrior", 1, -20);
  await step(0.016, 10);
  await call("hurtAllySquads", 40);
  const beforeHero = (await page.evaluate(() => window.frostbound.snapshot())).heroHp;
  const beforeAllyHp = await call("allyHealth");
  await page.keyboard.press("Digit3");
  await step(0.016, 5);
  const afterHero = (await page.evaluate(() => window.frostbound.snapshot())).heroHp;
  const afterAllyHp = await call("allyHealth");
  const rallyState = (await call("heroSkillState")).find((s) => s.id === "rally");
  check("Digit3 casts rally and starts its cooldown", rallyState.remaining > 0 && !rallyState.ready, rallyState);
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
