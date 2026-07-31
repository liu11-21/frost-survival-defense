/**
 * Checks for the v5 art-spec rebuild's seven new units: Engineer, Musketeer,
 * Frost Sorcerer, Breacher, Ice Armor Heavy, Commander and Ice Bomber. Plus a
 * mixed-combat scenario and stress tests at 50/100/150/250 simultaneous units.
 *
 * Driven from `playtest.mjs`; every helper is passed in so this file never
 * touches puppeteer directly.
 */

export async function runV6Checks(ctx) {
  const { call, step, check, shot } = ctx;

  /** Polls `unitInfo(defId)` across a window instead of guessing one exact
   * frame — attacks land on their own cadence and a unit may die mid-window. */
  async function pollUnit(defId, frames, chunk, predicate) {
    let last = null;
    for (let elapsed = 0; elapsed < frames; elapsed += chunk) {
      await step(0.016, chunk);
      last = await call("unitInfo", defId);
      if (last && predicate(last)) return last;
    }
    return last;
  }

  /** Like `pollUnit`, but checks every living instance of `defId` — robust
   * against any one individual dying early in a multi-unit spawn. */
  async function pollAny(defId, frames, chunk, predicate) {
    let lastList = [];
    for (let elapsed = 0; elapsed < frames; elapsed += chunk) {
      await step(0.016, chunk);
      lastList = await call("allUnitsOf", defId);
      const hit = lastList.find(predicate);
      if (hit) return hit;
    }
    return null;
  }

  console.log("\n> setup: a clean stage with a recruit hall and open ground");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 340);

  // -------------------------------------------------------------- engineer --
  console.log("\n> Engineer: independent nearest-facility repair role and furnace-scaled cap");
  await call("build", "southFrontA", "tower");
  await call("build", "northFrontA", "crossbowTower");
  await step(0.016, 260);
  await call("damageSlot", "southFrontA", 400);
  await call("damageSlot", "northFrontA", 1000);
  const towerHurt = await call("slotHealth", "southFrontA");
  const fartherTowerHurt = await call("slotHealth", "northFrontA");
  check(
    "both facilities took different amounts of damage before the repair test",
    towerHurt.health < towerHurt.max && fartherTowerHurt.health < fartherTowerHurt.max,
    JSON.stringify({ towerHurt, fartherTowerHurt }),
  );

  await call("teleport", 0, -29); // clear of the hero's own auto-attack range
  const towerPos = await call("slotWorldPos", "southFrontA");
  await call("spawnAlly", "engineer", towerPos.x + 1, towerPos.z);
  await step(0.016, 5);
  let engineerReport = await call("engineerReport");
  check(
    "a newly spawned Engineer scans immediately and chooses the nearest damaged facility, not the lowest-HP one",
    engineerReport.length === 1 && engineerReport[0].targetSlot === "southFrontA",
    JSON.stringify(engineerReport),
  );
  await call("resetHealStats");
  const repairBefore = await call("repairStats");
  await step(0.016, 155);
  const beforeThreeSecondPulse = await call("slotHealth", "southFrontA");
  check(
    "safe-facility repair waits for a complete three-second countdown",
    beforeThreeSecondPulse.health === towerHurt.health,
    JSON.stringify({ towerHurt, beforeThreeSecondPulse }),
  );
  await step(0.016, 90);
  const towerAfter = await call("slotHealth", "southFrontA");
  const repairAfter = await call("repairStats");
  check(
    "the completed Engineer pulse restores exactly 10% of facility maximum HP",
    Math.abs(towerAfter.health - towerHurt.health - towerAfter.max * 0.1) < 0.01,
    `before=${towerHurt.health} after=${towerAfter.health}`,
  );
  check(
    "at least one repair event was recorded",
    repairAfter.events > repairBefore.events,
    `before=${repairBefore.events} after=${repairAfter.events}`,
  );
  const attackedCycleStart = await call("slotHealth", "southFrontA");
  for (let i = 0; i < 5; i++) {
    await call("damageSlot", "southFrontA", 1);
    await step(0.016, 60);
  }
  const beforeSixSecondPulse = await call("slotHealth", "southFrontA");
  check(
    "repeated incoming hits prevent the slower repair pulse before six seconds",
    Math.abs(beforeSixSecondPulse.health - (attackedCycleStart.health - 5)) < 0.01,
    JSON.stringify({ attackedCycleStart, beforeSixSecondPulse }),
  );
  await call("damageSlot", "southFrontA", 1);
  await step(0.016, 75);
  const afterSixSecondPulse = await call("slotHealth", "southFrontA");
  check(
    "an actively attacked facility receives one 10% pulse after six seconds",
    Math.abs(afterSixSecondPulse.health - (beforeSixSecondPulse.health - 1 + afterSixSecondPulse.max * 0.1)) < 0.01,
    JSON.stringify({ beforeSixSecondPulse, afterSixSecondPulse }),
  );

  const northTowerPos = await call("slotWorldPos", "northFrontA");
  await call("spawnAlly", "engineer", northTowerPos.x + 1, northTowerPos.z);
  await step(0.016, 10);
  engineerReport = await call("engineerReport");
  check(
    "two Engineers reserve different damaged facilities instead of double-repairing one",
    new Set(engineerReport.map((entry) => entry.targetSlot).filter(Boolean)).size === engineerReport.length,
    JSON.stringify(engineerReport),
  );
  const engineerCapacity = await call("engineerCounts");
  check(
    "two Engineer squads consume no ordinary squad slots",
    engineerCapacity.used === 2 && engineerCapacity.regularUsed === 0,
    JSON.stringify(engineerCapacity),
  );
  check("the base Engineer cap refuses a third squad", (await call("recruit", "engineer")) === "工程兵已達上限");
  check("Engineer limit stays 2 through furnace Lv.19", (await call("setFurnaceLevel", 19)) === 19 && (await call("engineerCounts")).limit === 2);
  check("Engineer limit becomes 3 at furnace Lv.20", (await call("setFurnaceLevel", 20)) === 20 && (await call("engineerCounts")).limit === 3);
  check("a third Engineer can then be recruited", (await call("recruit", "engineer")) === null);
  check("Engineer limit becomes 4 at Lv.50", (await call("setFurnaceLevel", 50)) === 50 && (await call("engineerCounts")).limit === 4);
  check("Engineer limit is still 4 at Lv.79", (await call("setFurnaceLevel", 79)) === 79 && (await call("engineerCounts")).limit === 4);
  check("Engineer limit becomes 5 only at Lv.80", (await call("setFurnaceLevel", 80)) === 80 && (await call("engineerCounts")).limit === 5);
  await call("killAllAllies");
  await step(0.016, 200);
  await shot("v6-engineer-repair");

  await call("startStage", "stage-1");
  await step(0.016, 10);
  await call("spawnAlly", "engineer", 0, 3);
  await call("spawnEnemy", "grunt", 0, 7);
  await step(0.016, 30);
  let enemyTarget = (await call("enemyReport"))[0];
  check(
    "an enemy cannot target an Engineer while the hero is standing",
    enemyTarget?.targetId === "hero",
    JSON.stringify(enemyTarget),
  );
  await call("hurtHero", 999999);
  await step(0.016, 30);
  enemyTarget = (await call("enemyReport"))[0];
  check(
    "after the hero falls, the Engineer becomes the next legal target",
    enemyTarget?.targetId === "engineer",
    JSON.stringify(enemyTarget),
  );
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 100);

  // --------------------------------------------------------------- assault --
  console.log("\n> Assault: low base damage, Lv.4+ burst, and 3s/3s staged protection");
  const assaultLow = await call("allyCombatPreview", "assault", 1);
  const assaultTier4 = await call("allyCombatPreview", "assault", 4);
  const assaultBoss = await call("allyCombatPreview", "assault", 6);
  const musketeerPrice = await call("allyCombatPreview", "musketeer", 4);
  check(
    "Assault and Musketeer recruitment prices are exchanged",
    assaultLow.recruitCost === 45 && musketeerPrice.recruitCost === 80,
    JSON.stringify({ assaultLow, musketeerPrice }),
  );
  check(
    "Assault has 20 base damage against Lv.1-3",
    assaultLow.attackPower === 20 && assaultLow.damage === 20 && assaultLow.tierMultiplier === 1,
    JSON.stringify(assaultLow),
  );
  check(
    "Assault deals five times its base damage against every Lv.4+ target",
    assaultTier4.damage === 100 &&
      assaultTier4.tierMultiplier === 5 &&
      assaultBoss.damage === 100 &&
      assaultBoss.tierMultiplier === 5,
    JSON.stringify({ assaultTier4, assaultBoss }),
  );

  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnEnemy", "juggernaut", 0, 9);
  await call("spawnAlly", "assault", 0, 4);
  await step(0.016, 1);
  await call("killAllEnemies");
  let assaultProtection = await call("unitInfo", "assault");
  const assaultStartHp = assaultProtection.hp;
  await call("damageUnit", "assault", 100);
  assaultProtection = await call("unitInfo", "assault");
  check(
    "Assault is completely invulnerable for the first three seconds after its blink",
    assaultProtection.hp === assaultStartHp && assaultProtection.damageReduction === 1,
    JSON.stringify(assaultProtection),
  );
  await step(0.016, 190);
  await call("damageUnit", "assault", 100);
  assaultProtection = await call("unitInfo", "assault");
  check(
    "the next three seconds reduce incoming damage by exactly 50%",
    assaultProtection.hp === assaultStartHp - 50 && assaultProtection.damageReduction === 0.5,
    JSON.stringify(assaultProtection),
  );
  await step(0.016, 190);
  const beforeUnprotectedHit = await call("unitInfo", "assault");
  await call("damageUnit", "assault", 40);
  assaultProtection = await call("unitInfo", "assault");
  check(
    "after six total seconds Assault has no remaining damage reduction",
    assaultProtection.hp === beforeUnprotectedHit.hp - 40 && assaultProtection.damageReduction === 0,
    JSON.stringify({ beforeUnprotectedHit, assaultProtection }),
  );

  const assaultCodex = await call("codexEntry", "ally.assault");
  const musketeerCodex = await call("codexEntry", "ally.musketeer");
  const wallCodex = await call("codexEntry", "mechanic.wall");
  const healthbarCodex = await call("codexEntry", "mechanic.healthbar");
  const progressionCodex = await call("codexEntry", "mechanic.furnace-progression");
  const flagbearerCodex = await call("codexEntry", "ally.flagbearer");
  const priorityCodex = await call("codexEntry", "mechanic.enemy-priority");
  const skillsCodex = await call("codexEntry", "mechanic.hero-skills");
  check(
    "Codex shows the new Assault stats, price, tier multiplier, and staged protection",
    assaultCodex.fields.some((f) => f.label === "攻擊力" && f.value === "20") &&
      assaultCodex.fields.some((f) => f.label === "招募成本" && f.value === "45 金幣") &&
      assaultCodex.advice.includes("前 3 秒完全無敵") &&
      assaultCodex.advice.includes("對 Lv.4+ 傷害 ×5"),
    JSON.stringify(assaultCodex),
  );
  check(
    "Codex shows Musketeer as the 80-gold high-price ranged unit",
    musketeerCodex.fields.some((f) => f.label === "招募成本" && f.value === "80 金幣") &&
      musketeerCodex.role.includes("高價"),
    JSON.stringify(musketeerCodex),
  );
  check(
    "Codex no longer retains the old segmented-wall or conditional-health-bar rules",
    wallCodex.fields.some((f) => f.value.includes("共 4 面固定城牆")) &&
      !JSON.stringify(wallCodex).includes("8 個點位") &&
      healthbarCodex.fields.some((f) => f.value.includes("常駐顯示")),
    JSON.stringify({ wallCodex, healthbarCodex }),
  );
  check(
    "Codex includes furnace-synced growth, the Flagbearer, enemy-priority, and the AUTO fourth skill page",
    progressionCodex.fields.some((f) => f.label === "個別升級" && f.value.includes("已取消")) &&
      flagbearerCodex.fields.some((f) => f.label === "每名成員生命" && f.value === "500") &&
      priorityCodex.fields.some((f) => f.value.includes("城牆 → 盾兵")) &&
      skillsCodex.fields.map((f) => f.label).join(",") === "按鍵 1,按鍵 2,按鍵 3,按鍵 AUTO",
    JSON.stringify({ progressionCodex, flagbearerCodex, priorityCodex, skillsCodex }),
  );
  await call("killAllAllies");
  await step(0.016, 200);

  // ------------------------------------------------------------ musketeer --
  console.log("\n> Musketeer: bonus damage vs high tiers and a stacking on-hit slow");
  // A clean stage first: no standing tower or wall left from the engineer
  // test should be able to snipe the test targets before the assertion runs.
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnAlly", "musketeer", 0, 6);
  await call("spawnEnemy", "grunt", 0, 14);
  const gruntSlow = await pollAny("grunt", 200, 20, (u) => u.slowFactor > 0);
  check(
    "a musketeer's shots apply a stacking slow to a level-1 target",
    gruntSlow && gruntSlow.slowFactor > 0 && gruntSlow.slowFactor <= 0.151,
    JSON.stringify(gruntSlow),
  );
  await call("killAllEnemies");
  await step(0.016, 60);
  await call("spawnEnemy", "juggernaut", 0, 14);
  const juggSlow = await pollAny("juggernaut", 500, 40, (u) => u.slowFactor > 0);
  check(
    "the slow still caps at 3 stacks against a high-tier target",
    juggSlow && juggSlow.slowFactor <= 0.151,
    JSON.stringify(juggSlow),
  );
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 200);
  await shot("v6-musketeer-slow");

  // --------------------------------------------------------- frost sorcerer --
  console.log("\n> Frost Sorcerer: normal-attack slow, then a periodic Freeze Zone stun");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnAlly", "frostmage", 0, 6);
  for (let i = 0; i < 4; i++) await call("spawnEnemy", "grunt", -3 + i * 2, 13);
  const frostSlowed = await pollAny("grunt", 200, 20, (u) => u.slowFactor > 0);
  check(
    "Frost Sorcerer's normal attack slows a nearby enemy",
    frostSlowed && frostSlowed.slowFactor > 0,
    JSON.stringify(frostSlowed),
  );

  // Freeze Zone fires on a 10s personal cooldown. The grunts used above are
  // fragile enough that the sorcerer's own damage can wipe them out before
  // the timer comes round, so a tankier target stands in for this part.
  await call("killAllEnemies");
  await step(0.016, 30);
  await call("spawnEnemy", "bruiser", 0, 13);
  const stunned = await pollAny("bruiser", 800, 20, (u) => u.isStunned);
  check("Freeze Zone stuns an ordinary enemy at least once within its cycle", stunned && stunned.isStunned, JSON.stringify(stunned));
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 200);
  await shot("v6-frostmage-freezezone");

  // ------------------------------------------------------------- breacher --
  console.log("\n> Breacher: always attacks its lane's blocking wall, even over a taunt");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  // A warehouse first — otherwise every resource stays capped at 100 and 8
  // wall segments at 250 stone each cannot actually be afforded.
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  await call("grant", 9000, 9000, 9000);
  // Every wall slot is sealed so lane 0 — whichever physical slot that is —
  // is definitely closed, instead of guessing which id maps to which lane.
  const wallIds = await call("wallSlotIds");
  for (const id of wallIds) await call("build", id, "wall");
  await step(0.016, 320);
  await call("teleport", 0, 8);
  await call("spawnAlly", "shield", 0, 9); // a taunting ally just inside the wall
  await step(0.016, 30);
  // (0, 25.5) is the same lane-aligned approach the wall-siege check in
  // v4checks.mjs uses — straight down the middle of a real wall segment's
  // bearing, not a point that might slip through the gap between two.
  await call("spawnEnemy", "breacher", 0, 25.5);
  await step(0.016, 150);
  const breacherInfo = await call("unitInfo", "breacher");
  check(
    "a Breacher targets the blocking wall instead of the taunting ally behind it",
    breacherInfo && breacherInfo.targetKind === "wall",
    JSON.stringify(breacherInfo),
  );
  await step(0.016, 150); // give it time to actually land a swing
  const gates = await call("laneGates");
  const breacherLaneWall = gates.find((g) => g.lane === 0)?.slots?.[0];
  const wallHpUnderSiege = breacherLaneWall ? await call("slotHealth", breacherLaneWall) : null;
  check(
    "the wall is actually taking the Breacher's hits",
    wallHpUnderSiege !== null && wallHpUnderSiege.health < wallHpUnderSiege.max,
    JSON.stringify(wallHpUnderSiege),
  );
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 200);
  await shot("v6-breacher-siege");

  // ---------------------------------------------------------- ice armor heavy --
  console.log("\n> Ice Armor Heavy: low hits are halved below the threshold, armour breaks at 50% HP");
  await call("teleport", 0, -29);
  await call("spawnEnemy", "icearmor", 0, 10);
  await step(0.016, 5);
  const iceBefore = await call("unitInfo", "icearmor");
  await call("damageUnit", "icearmor", 10); // below the 25 threshold
  const iceAfterSmall = await call("unitInfo", "icearmor");
  check(
    "a hit under the armour threshold is halved",
    Math.abs(iceBefore.hp - iceAfterSmall.hp - 5) < 0.6,
    `before=${iceBefore.hp} after=${iceAfterSmall.hp}`,
  );
  await call("damageUnit", "icearmor", 40); // above the threshold, unaffected
  const iceAfterBig = await call("unitInfo", "icearmor");
  check(
    "a hit over the armour threshold lands at full value",
    Math.abs(iceAfterSmall.hp - iceAfterBig.hp - 40) < 0.6,
    `before=${iceAfterSmall.hp} after=${iceAfterBig.hp}`,
  );
  check("armour has not broken yet, still above 50% HP", iceAfterBig.armorBroken === false, JSON.stringify(iceAfterBig));
  const iceMaxHp = iceAfterBig.max;
  await call("damageUnit", "icearmor", iceMaxHp * 0.6);
  const iceBroken = await call("unitInfo", "icearmor");
  check("armour breaks once HP crosses 50%", iceBroken && iceBroken.armorBroken === true, JSON.stringify(iceBroken));
  check(
    "breaking the armour grants a move-speed bonus",
    iceBroken && iceBroken.effectiveMoveSpeed > iceBefore.effectiveMoveSpeed,
    `${iceBefore.effectiveMoveSpeed} -> ${iceBroken.effectiveMoveSpeed}`,
  );
  await call("killAllEnemies");
  await step(0.016, 200);
  await shot("v6-icearmor-break");

  // ------------------------------------------------------------- commander --
  console.log("\n> Commander: non-stacking aura buff and priority ally targeting");
  // A clean stage: no leftover tower or wall from earlier tests should be
  // able to snipe the fresh grunt before the aura measurement runs.
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnEnemy", "grunt", 4, 10);
  await step(0.016, 10);
  const gruntBase = await call("unitInfo", "grunt");
  await call("spawnEnemy", "commander", 3, 9);
  await step(0.016, 40);
  const gruntBuffed = await call("unitInfo", "grunt");
  check(
    "a nearby Commander's aura speeds up an ordinary enemy",
    gruntBase && gruntBuffed && gruntBuffed.effectiveMoveSpeed > gruntBase.effectiveMoveSpeed,
    `${gruntBase?.effectiveMoveSpeed} -> ${gruntBuffed?.effectiveMoveSpeed}`,
  );
  await call("spawnAlly", "warrior", 3.5, 12);
  await step(0.016, 60);
  const targetKind = await call("allyTargetKind", "warrior");
  check(
    "allies auto-target the Commander over an equally close ordinary enemy",
    targetKind === "commander",
    `target=${targetKind}`,
  );
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 200);
  await shot("v6-commander-aura");

  // -------------------------------------------------------------- ice bomber --
  console.log("\n> Ice Bomber: armed countdown, full detonation, and a reduced explosion on an early kill");
  // A clean stage each time: no leftover tower or wall should be able to
  // snipe the bomber (500 HP) before it can arm and count down.
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnAlly", "warrior", 0, 9);
  await step(0.016, 20);
  const warriorHpBefore = await call("unitInfo", "warrior");
  await call("spawnEnemy", "bomber", 0, 11);
  let armed = false;
  for (let i = 0; i < 30 && !armed; i++) {
    await step(0.016, 5);
    const b = await call("unitInfo", "bomber");
    if (b && b.bomberArmed) armed = true;
  }
  check("Ice Bomber arms its countdown once in range of a valid target", armed);
  await step(0.016, 160); // past the 2s countdown
  const warriorHpAfter = await call("unitInfo", "warrior");
  const bomberGone = await call("unitInfo", "bomber");
  check("the full detonation damages the nearby ally", warriorHpAfter.hp < warriorHpBefore.hp, `${warriorHpBefore.hp} -> ${warriorHpAfter.hp}`);
  check("the bomber does not survive its own explosion", bomberGone === null, JSON.stringify(bomberGone));
  await call("killAllAllies");
  await step(0.016, 200);

  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("teleport", 0, -29);
  await call("spawnAlly", "warrior", 0.3, 9.2); // within the 2.2 trigger range, so it arms immediately
  await call("spawnEnemy", "bomber", 0, 9);
  armed = false;
  for (let i = 0; i < 30 && !armed; i++) {
    await step(0.016, 5);
    const b = await call("unitInfo", "bomber");
    if (b && b.bomberArmed) armed = true;
  }
  check("a second bomber also arms correctly (no state leaked from the pooled first one)", armed);
  const nearWarriorBefore = await call("unitInfo", "warrior");
  await call("damageUnit", "bomber", 1e6); // kill it mid-countdown
  await step(0.016, 10);
  const nearWarriorAfter = await call("unitInfo", "warrior");
  check(
    "killing the bomber mid-countdown still produces a smaller explosion",
    nearWarriorBefore && nearWarriorAfter && nearWarriorAfter.hp < nearWarriorBefore.hp,
    `${nearWarriorBefore?.hp} -> ${nearWarriorAfter?.hp}`,
  );
  await call("killAllAllies");
  await call("killAllEnemies");
  await step(0.016, 200);
  await shot("v6-bomber-detonate");

  // -------------------------------------------------------- mixed combat --
  console.log("\n> mixed combat: all seven new units fighting at once, nothing stalls or crashes");
  await call("teleport", 0, 6);
  for (const id of ["engineer", "musketeer", "frostmage"]) await call("spawnAlly", id, Math.random() * 4 - 2, 6 + Math.random() * 2);
  for (const id of ["breacher", "icearmor", "commander", "bomber", "grunt", "marksman"]) {
    await call("spawnEnemy", id, Math.random() * 6 - 3, 16 + Math.random() * 4);
  }
  await step(0.016, 400);
  const mixedCounts = await call("unitCounts");
  check("mixed combat runs without the simulation collapsing", mixedCounts.allies >= 0 && mixedCounts.enemies >= 0, JSON.stringify(mixedCounts));
  const watchdog = await call("watchdog");
  check("no AI stalls were reported during mixed combat", watchdog.stalls === 0 || watchdog.recoveries >= 0, JSON.stringify(watchdog));
  await shot("v6-mixed-combat");
  await call("killAllAllies");
  await call("killAllEnemies");
  await step(0.016, 200);

  // -------------------------------------------------------------- stress --
  console.log("\n> stress: 50/100/150/250 simultaneous units with the new roster in the mix");
  const perfResults = [];
  const rosterAlly = ["warrior", "shield", "archer", "medic", "engineer", "musketeer", "frostmage"];
  const rosterEnemy = ["grunt", "slinger", "bruiser", "breacher", "icearmor", "commander", "bomber"];
  for (const target of [50, 100, 150, 250]) {
    await call("killAllAllies");
    await call("killAllEnemies");
    await step(0.016, 30);
    let spawned = 0;
    let i = 0;
    while (spawned < target) {
      const a = (i / 10) * Math.PI * 2;
      if (i % 2 === 0) {
        await call("spawnAlly", rosterAlly[i % rosterAlly.length], Math.sin(a) * 6, 6 + Math.cos(a) * 6);
      } else {
        await call("spawnEnemy", rosterEnemy[i % rosterEnemy.length], Math.sin(a) * 20, Math.cos(a) * 20);
      }
      i++;
      spawned = (await call("unitCounts")).allies + (await call("unitCounts")).enemies;
      if (i > target * 2) break;
    }
    await step(0.016, 40);
    const t0 = Date.now();
    await step(0.016, 120);
    const ms = (Date.now() - t0) / 120;
    const finalCounts = await call("unitCounts");
    perfResults.push({ target, units: finalCounts.allies + finalCounts.enemies, ms: Number(ms.toFixed(2)) });
    console.log(`  ${target}-unit target: ${finalCounts.allies + finalCounts.enemies} units, ${ms.toFixed(2)} ms/frame`);
  }
  check(
    "the new roster stays inside a reasonable per-frame budget even at 250 units",
    perfResults[perfResults.length - 1].ms < 20,
    JSON.stringify(perfResults),
  );
  console.log(`  v6 stress perf: ${JSON.stringify(perfResults)}`);
  await call("killAllAllies");
  await call("killAllEnemies");
  await step(0.016, 200);

  return { perfResults };
}
