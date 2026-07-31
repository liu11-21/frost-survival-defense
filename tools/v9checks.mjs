/**
 * Checks for the Pass D pass: minimap/map, attack-range display, watchdog/
 * residue diagnostics, the rebuilt build/recruit menus, and the hero's four
 * hero skills (1/2/3 plus automatic 4). Driven from `playtest.mjs`; every helper is passed in so
 * this file never touches puppeteer directly.
 */

export async function runV9Checks(ctx) {
  const { check, call, step, page, shot, snapshot } = ctx;

  // -------------------------------------------------------------- minimap --
  console.log("\n> minimap snapshot and full-map toggle");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("setPrepCountdown", 9999);
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

  // ------------------------------------------------ construction economy --
  const buildingCosts = await call("buildingCosts");
  const totalCost = buildingCosts.reduce((sum, building) => ({
    wood: sum.wood + (building.cost.wood ?? 0),
    stone: sum.stone + (building.cost.stone ?? 0),
  }), { wood: 0, stone: 0 });
  const costsById = Object.fromEntries(buildingCosts.map((building) => [building.id, building.cost]));
  check(
    "construction costs shift the global burden toward wood while retaining distinct wood- and stone-heavy choices",
    totalCost.wood > totalCost.stone &&
      (totalCost.wood - totalCost.stone) / Math.max(1, totalCost.wood + totalCost.stone) < 0.2 &&
      costsById.crossbowTower.wood > costsById.crossbowTower.stone &&
      costsById.wall.stone > costsById.wall.wood,
    { totalCost, crossbowTower: costsById.crossbowTower, wall: costsById.wall },
  );

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
  await step(0.016, 10);
  const bottomPanelLayout = await page.evaluate(() => {
    const furnace = document.querySelector(".furnace-box")?.getBoundingClientRect();
    const squad = document.querySelector(".squad-hud")?.getBoundingClientRect();
    if (!furnace || !squad) return null;
    return {
      furnaceRight: furnace.right,
      furnaceBottom: furnace.bottom,
      squadLeft: squad.left,
      squadBottom: squad.bottom,
    };
  });
  check(
    "remaining-squad panel sits immediately to the right of the bottom-centre furnace panel",
    bottomPanelLayout &&
      bottomPanelLayout.squadLeft >= bottomPanelLayout.furnaceRight - 1 &&
      Math.abs(bottomPanelLayout.squadBottom - bottomPanelLayout.furnaceBottom) <= 2,
    bottomPanelLayout,
  );
  const labelFacing = await call("healthLabelFacing");
  check(
    "overhead names are independent camera-facing planes, never a mirrored child face",
    labelFacing.length > 0 && labelFacing.every((label) => label.billboard !== 0 && label.hasParent === false),
    labelFacing,
  );

  // -------------------------------------------------- ally progression ----
  console.log("\n> recruit-panel ally progression applies 10% health/attack/speed per class level");
  await call("grant", 9000, 9000, 9000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 340);
  const warriorUpgradeBase = await call("allyUpgradeInfo", "warrior");
  const mageUpgradeBase = await call("allyUpgradeInfo", "mage");
  check(
    "starting upgrade price varies with each class's recruit price",
    warriorUpgradeBase.cost === 8 && mageUpgradeBase.cost === 35,
    { warriorUpgradeBase, mageUpgradeBase },
  );
  const warriorBeforeUpgrade = await call("unitInfo", "warrior");
  check("Warrior class upgrade succeeds", (await call("upgradeAlly", "warrior")) === null);
  const warriorAfterUpgrade = await call("unitInfo", "warrior");
  check(
    "an existing Warrior immediately gains 10% health and attack",
    warriorAfterUpgrade.max === Math.round(warriorBeforeUpgrade.max * 1.1) &&
      Math.abs(warriorAfterUpgrade.attackPower / warriorBeforeUpgrade.attackPower - 1.1) < 0.001,
    { warriorBeforeUpgrade, warriorAfterUpgrade },
  );
  check(
    "the same upgrade grants 10% attack speed by reducing the effective interval",
    Math.abs(warriorAfterUpgrade.effectiveInterval - warriorBeforeUpgrade.effectiveInterval / 1.1) < 0.002,
    { warriorBeforeUpgrade, warriorAfterUpgrade },
  );
  check("a new Warrior squad can be recruited after the upgrade", (await call("recruit", "warrior")) === null);
  const upgradedWarriors = await call("allUnitsOf", "warrior");
  check(
    "future Warrior recruits inherit the same class upgrade",
    upgradedWarriors.length === 6 && upgradedWarriors.every((unit) => unit.max === 440 && unit.upgradeLevel === 1),
    upgradedWarriors,
  );
  await page.keyboard.press("KeyG");
  await step(0.016, 5);
  const recruitTabLayout = await page.evaluate(() => {
    const host = document.querySelector("#ui-recruit-tabs .build-tabs");
    return {
      labels: [...document.querySelectorAll("[data-recruit-tab]")].map((tab) => tab.textContent?.trim()),
      fits: Boolean(host) && host.scrollWidth <= host.clientWidth + 1,
    };
  });
  await page.click("[data-recruit-tab='upgrade']");
  await step(0.016, 3);
  const progressionUi = await page.evaluate(() => ({
    warriorUpgrade: document.querySelector("[data-upgrade='warrior']")?.textContent ?? "",
    engineerUpgradeAbsent: document.querySelector("[data-upgrade='engineer']") === null,
  }));
  check(
    "the recruit panel has exactly the five requested categories without scrolling through one long roster",
    recruitTabLayout.labels.join(",") === "近戰,遠程,支援,工程,升級" && recruitTabLayout.fits,
    recruitTabLayout,
  );
  check(
    "the upgrade category exposes class upgrading and excludes non-upgradeable Engineers",
    /升級/.test(progressionUi.warriorUpgrade) && progressionUi.engineerUpgradeAbsent,
    progressionUi,
  );
  await page.keyboard.press("KeyG");
  await step(0.016, 5);
  await call("spawnAlly", "engineer", 0, 2);
  await step(0.016, 30);
  const splitHud = await page.evaluate(() => ({
    main: document.querySelector("#ui-squad-hud")?.textContent ?? "",
    engineer: document.querySelector("#ui-engineer-hud")?.textContent ?? "",
    engineerVisible: document.querySelector("#ui-engineer-hud")?.classList.contains("show") ?? false,
  }));
  check(
    "Engineers use their own small right-side HUD instead of the ordinary recruited-unit roster",
    splitHud.engineerVisible && /工程兵/.test(splitHud.engineer) && !/工程兵/.test(splitHud.main),
    splitHud,
  );
  check(
    "recruited-unit HUD rows show live average HP and current attack",
    /平均 HP/.test(splitHud.main) && /攻擊/.test(splitHud.main),
    splitHud.main,
  );
  await call("killAllAllies");
  await step(0.016, 200);

  // ----------------------------------------------------- Auto Collector ----
  console.log("\n> Auto Collector also gathers enemy gold drops");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("setPrepCountdown", 9999);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northMid", "warehouse");
  await step(0.016, 220);
  await call("grant", 9000, 9000, 9000);
  await call("build", "eastFrontA", "autoCollector");
  await step(0.016, 220);
  const goldBeforeAutoCollect = (await snapshot()).gold;
  await call("spawnPickup", "gold", 18, 18, 7);
  await call("spawnPickup", "wood", 18, 18, 5);
  await step(0.016, 8);
  const goldAfterAutoCollect = (await snapshot()).gold;
  const pickupCounts = await call("pickupCounts");
  check(
    "Auto Collector vacuums enemy gold drops while leaving non-gold ground loot alone",
    goldAfterAutoCollect - goldBeforeAutoCollect === 7 && pickupCounts.gold === 0 && pickupCounts.wood === 1,
    JSON.stringify({ goldBeforeAutoCollect, goldAfterAutoCollect, pickupCounts }),
  );

  // ------------------------------------------------ furnace-hit warning ----
  console.log("\n> furnace hit has a sustained red perimeter warning");
  await call("damageFurnace", 200);
  await step(0.016, 3);
  const alertOnHit = await page.$eval("#ui-furnace-alert", (el) => el.classList.contains("show"));
  await step(0.016, 70);
  const alertAfterQuiet = await page.$eval("#ui-furnace-alert", (el) => el.classList.contains("show"));
  check("furnace damage raises a red edge warning that clears after attacks stop", alertOnHit && !alertAfterQuiet, { alertOnHit, alertAfterQuiet });

  // ------------------------------------------------ elite warning ----------
  console.log("\n> level-4 enemies announce their arrival");
  await call("jumpToWave", 8);
  await step(0.016, 3);
  const eliteWarning = await page.$eval("#ui-banner-title", (el) => el.textContent?.trim() ?? "");
  check("a level-4 enemy group raises a high-threat warning", eliteWarning.includes("高威脅接觸"), eliteWarning);
  await call("killAllEnemies");
  await step(0.016, 12);

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

  console.log("\n> attackable facilities use level-scaled percentage repair plus the post-Lv.10 burst");
  await call("setFurnaceLevel", 1);
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
  const levelOneRepair = afterRepairPulse.health - beforeRepairDelay.health;
  check(
    "Lv.1 begins repairing 1% of maximum HP per second after the shared delay",
    Math.abs(levelOneRepair - afterRepairPulse.max * 0.005) < 0.01,
    { beforeRepairDelay, afterRepairPulse },
  );

  await call("setFurnaceLevel", 10);
  await call("damageSlot", "northFrontA", 200);
  const levelTenDamaged = await call("slotHealth", "northFrontA");
  await step(0.016, 980);
  const levelTenRepaired = await call("slotHealth", "northFrontA");
  const levelTenRepair = levelTenRepaired.health - levelTenDamaged.health;
  check(
    "Lv.10 reaches the 10%-of-maximum-HP-per-second repair cap",
    Math.abs(levelTenRepair - levelTenRepaired.max * 0.05) < 0.01,
    { levelTenDamaged, levelTenRepaired },
  );

  await call("setFurnaceLevel", 11);
  await call("damageSlot", "northFrontA", 200);
  const levelElevenDamaged = await call("slotHealth", "northFrontA");
  await step(0.016, 480);
  const beforeFixedBurst = await call("slotHealth", "northFrontA");
  check(
    "the Lv.11 fixed repair does not fire before 8 quiet seconds",
    beforeFixedBurst.health === levelElevenDamaged.health,
    { levelElevenDamaged, beforeFixedBurst },
  );
  await step(0.016, 40);
  const afterFixedBurst = await call("slotHealth", "northFrontA");
  check(
    "Lv.11 restores 10% of that facility's maximum HP once after 8 quiet seconds",
    Math.abs(afterFixedBurst.health - beforeFixedBurst.health - afterFixedBurst.max * 0.1) < 0.01,
    { beforeFixedBurst, afterFixedBurst },
  );
  const burstBase = await call("structureRepairBurstAt", 11, 60000);
  const burstNext = await call("structureRepairBurstAt", 12, 60000);
  const burstAtTwenty = await call("structureRepairBurstAt", 20, 60000);
  check(
    "post-Lv.11 burst growth is a flat 5,000 HP per level, not another percentage",
    burstBase === 6000 && burstNext === 11000 && burstAtTwenty === 51000,
    { burstBase, burstNext, burstAtTwenty },
  );
  check(
    "furnace upgrade level is clamped at the new maximum of 100",
    (await call("setFurnaceLevel", 999)) === 100 && (await call("furnaceLevel")) === 100,
    await call("furnaceLevel"),
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
  const buildTabsFit = await page.evaluate(() => {
    const host = document.querySelector("#ui-build-tabs .build-tabs");
    return Boolean(host) && host.scrollWidth <= host.clientWidth + 1 &&
      document.querySelectorAll("#ui-build-tabs [data-tab]").length === 5;
  });
  check("all five build labels fit without horizontal scrolling", buildTabsFit);
  await page.keyboard.press("KeyB");
  await step(0.016, 5);
  check("build panel closes again", (await call("panelState")).open === false);
  await call("grant", 9000, 9000, 9000);
  const goldMineBuild = await call("build", "northFrontB", "goldMine");
  check("the new Gold Mine can be built on a universal slot", goldMineBuild?.ok === true, goldMineBuild);
  const goldBeforeMineProduction = (await snapshot()).gold;
  await call("teleport", 0, 0);
  await step(0.016, 300);
  const goldMine = await call("slotProduction", "northFrontB");
  const goldAfterMineProduction = (await snapshot()).gold;
  check(
    "Gold Mine is indestructible and produces one gold every 0.75 seconds",
    goldMine?.complete &&
      goldMine.attackable === false &&
      goldMine.produces === "gold" &&
      goldMine.interval === 0.75 &&
      (goldMine.stored >= 1 || goldAfterMineProduction > goldBeforeMineProduction),
    { goldMine, goldBeforeMineProduction, goldAfterMineProduction },
  );

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

  // ------------------------------------------- hero skills (1/2/3 + AUTO) --
  console.log("\n> three hero active skills plus one automatic combat skill");
  await call("startStage", "stage-1");
  await step(0.016, 20);

  const initial = await call("heroSkillState");
  check("all four hero skills exist", initial.length === 4, initial.map((s) => s.id));
  check(
    "new-run initial cooldowns are exactly 40/10/15/0 seconds",
    initial.map((s) => Math.round(s.remaining)).join(",") === "40,10,15,0",
    initial,
  );
  const skillUi = await page.$$eval(".skill-slot", (slots) =>
    slots.map((slot) => ({
      key: slot.querySelector(".skill-key")?.textContent?.trim(),
      description: slot.querySelector(".skill-description")?.textContent?.trim(),
    })),
  );
  check("skill HUD shows 1/2/3 and an AUTO label for the automatic fourth skill", skillUi.map((s) => s.key).join("") === "123AUTO", skillUi);
  check("every skill button has a short explanation", skillUi.every((s) => (s.description?.length ?? 0) >= 4), skillUi);
  const skillFxBefore = await call("skillEffectSnapshot");

  // 1: three global furnace-area strikes, then one 500-damage fire tick.
  await call("setHeroSkillCooldown", "airSupport", 0);
  await call("teleport", 0, -30);
  await call("spawnEnemy", "boss", 2, 1);
  await step(0.016, 8);
  const airBefore = (await call("enemyReport"))[0];
  await page.keyboard.press("Digit1");
  await step(0.016, 110);
  const afterThreeStrikes = (await call("enemyReport"))[0];
  check(
    "Air Support lands three 1000-damage strikes around the furnace",
    Math.abs((airBefore.hp - afterThreeStrikes.hp) - 3000) < 1,
    { airBefore, afterThreeStrikes },
  );
  await step(0.016, 65);
  const afterFireTick = (await call("enemyReport"))[0];
  check(
    "the remaining ground fire deals 500 damage per full second",
    Math.abs((afterThreeStrikes.hp - afterFireTick.hp) - 500) < 1,
    { afterThreeStrikes, afterFireTick },
  );
  const airState = (await call("heroSkillState")).find((s) => s.id === "airSupport");
  check("Air Support starts its 80-second cooldown on cast", airState.remaining > 75 && !airState.ready, airState);
  let skillFx = await call("skillEffectSnapshot");
  check(
    "Air Support creates descending bombardment and persistent ground-fire effects",
    skillFx.casts.airSupport === skillFxBefore.casts.airSupport + 1 && skillFx.groundFirePatches > 0,
    skillFx,
  );
  await shot("v9-hero-skill-vfx");
  await call("killAllEnemies");
  await step(0.016, 20);

  // 2: attack structures run at exactly double speed for five seconds while
  // its 20-second cooldown is already counting.
  await call("grant", 9000, 9000, 9000);
  await call("build", "northFrontA", "tower");
  await step(0.016, 220);
  await call("setHeroSkillCooldown", "infiniteFirepower", 0);
  await page.keyboard.press("Digit2");
  await step(0.016, 3);
  const firepower = await call("attackBuildingBoost");
  const firepowerState = (await call("heroSkillState")).find((s) => s.id === "infiniteFirepower");
  check(
    "Infinite Firepower doubles attack-building speed for five seconds",
    firepower.multiplier === 2 && firepower.remaining > 4.8,
    firepower,
  );
  check(
    "Infinite Firepower's duration and 20-second cooldown begin together",
    firepowerState.activeRemaining > 4.8 && firepowerState.remaining > 19,
    firepowerState,
  );
  const firepowerBadge = await page.$eval('[data-skill="infiniteFirepower"] .skill-count', (el) => el.textContent?.trim());
  check("Infinite Firepower displays the live count of completed attack facilities", firepowerBadge === "1", firepowerBadge);
  await step(0.016, 320);
  check("attack-building speed returns to normal after five seconds", (await call("attackBuildingBoost")).multiplier === 1);

  // 3: three members share one pool; cooldown stays at zero until withdrawal.
  await call("setHeroSkillCooldown", "groundSupport", 0);
  await page.keyboard.press("Digit3");
  await step(0.016, 5);
  const support = await call("groundSupportInfo");
  const supportState = (await call("heroSkillState")).find((s) => s.id === "groundSupport");
  check(
    "Ground Support summons exactly three escorts sharing 5000 HP",
    support.active && support.members === 3 && support.health === 5000 && support.engaged === false,
    support,
  );
  check(
    "Ground Support does not begin cooldown during its ten-second duration",
    supportState.remaining === 0 && supportState.activeRemaining > 9.8,
    supportState,
  );
  check(
    "damage to one escort is taken from the shared squad pool",
    (await call("damageGroundSupport", 700)) === 4300,
    await call("groundSupportInfo"),
  );
  await call("spawnEnemy", "juggernaut", 0, -26);
  await step(0.016, 30);
  const engagedSupport = await call("groundSupportInfo");
  const tauntedEnemies = await call("enemyStatus");
  check(
    "the escort only engages after an enemy reaches the hero target tier, then taunts every enemy",
    engagedSupport.engaged &&
      tauntedEnemies.length > 0 &&
      tauntedEnemies.every((enemy) => enemy.target === "unit"),
    { engagedSupport, tauntedEnemies },
  );
  await step(0.016, 600);
  const withdrawn = await call("groundSupportInfo");
  const withdrawnState = (await call("heroSkillState")).find((s) => s.id === "groundSupport");
  check("Ground Support withdraws after ten seconds", withdrawn.active === false && withdrawn.members === 0, withdrawn);
  check(
    "Ground Support's 30-second cooldown begins only after withdrawal",
    withdrawnState.remaining > 29 && withdrawnState.activeRemaining === 0,
    withdrawnState,
  );
  await call("killAllEnemies");
  await step(0.016, 30);

  // 4: the automatic quake waits for a real hero attack lock and an enemy in
  // the forward cone, then applies its hit without a keypress.
  await call("setHeroSkillCooldown", "seismicWave", 10);
  await call("teleport", 0, 0);
  await call("spawnEnemy", "juggernaut", 0, 5);
  await step(0.016, 30);
  const quakeBefore = (await call("enemyStatus"))[0];
  await call("setHeroSkillCooldown", "seismicWave", 0);
  await step(0.016, 3);
  const quakeAfter = (await call("enemyStatus"))[0];
  check(
    "automatic Seismic Wave hits once for 300 and knocks the enemy farther forward",
    Math.abs((quakeBefore.hp - quakeAfter.hp) - 300) < 1 &&
      Math.hypot(quakeAfter.x, quakeAfter.z) > Math.hypot(quakeBefore.x, quakeBefore.z),
    { quakeBefore, quakeAfter },
  );
  check(
    "Seismic Wave applies +10% damage taken for three seconds",
    Math.abs(quakeAfter.vulnerability - 0.1) < 0.001 && quakeAfter.vulnerabilityRemaining > 2.8,
    quakeAfter,
  );
  const quakeState = (await call("heroSkillState")).find((s) => s.id === "seismicWave");
  check("Seismic Wave starts its ten-second cooldown", quakeState.remaining > 9 && !quakeState.ready, quakeState);

  // A fresh run restores the documented initial cooldowns, not universal ready.
  await call("startStage", "stage-1");
  await step(0.016, 2);
  const resetSkills = await call("heroSkillState");
  check(
    "starting a new run restores each skill's own initial cooldown",
    resetSkills.map((s) => Math.round(s.remaining)).join(",") === "40,10,15,0",
    resetSkills,
  );
  check("starting a new run also resets run-local ally upgrades", (await call("allyUpgradeInfo", "warrior")).level === 0);

  return {};
}
