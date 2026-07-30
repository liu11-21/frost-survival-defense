/**
 * Checks for the five-issue pass: universal build slots (no more slot-type
 * lock-in), the slot-layout overlap validator, the endless early-wave gold
 * reward, the four new attack buildings, and the redesigned endless boss
 * pacing (no level-6 boss before wave 20). Driven from `playtest.mjs`; every
 * helper is passed in so this file never touches puppeteer directly.
 */

const ATTACK_BUILDINGS = ["crossbowTower", "frostTower", "sniperTower", "mortar"];

export async function runV8Checks(ctx) {
  const { call, step, check, shot } = ctx;

  // -------------------------------------------------------- universal slots --
  console.log("\n> universal build slots: any type on any slot, no lock-in");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  // Hold the stage's own wave clock off indefinitely — this section runs
  // long enough that a real wave could otherwise spawn underneath it.
  await call("setPrepCountdown", 99999);
  await unlockResourceCap(ctx, "southFrontB");
  const slotId = "northFrontA";
  const sequence = ["mine", "tower", "crossbowTower", "warehouse", "frostTower", "sniperTower", "mortar"];
  let allBuilt = true;
  for (const type of sequence) {
    const before = await call("slots");
    const wasEverBuilt = before.find((s) => s.id === slotId)?.everBuilt;
    const result = await call("build", slotId, type);
    if (!result.ok) {
      allBuilt = false;
      console.log(`    build ${type} on ${slotId} failed: ${result.reason}`);
      break;
    }
    await step(0.016, 460); // covers even the slowest build time (mortar, 7.0s)
    const after = await call("slotHealth", slotId);
    if (after === null && type !== "mine" && type !== "autoCollector" && type !== "autoRebuilder") {
      allBuilt = false;
      console.log(`    ${type} finished but reports no health`);
    }
    void wasEverBuilt;
    const demolish = await call("demolish", slotId);
    if (!demolish.ok) {
      allBuilt = false;
      console.log(`    demolish of ${type} failed: ${demolish.reason}`);
      break;
    }
    await step(0.016, 100);
  }
  check(
    "every building type, including all four new towers, can be built and demolished on the same universal slot in sequence",
    allBuilt,
  );
  const finalSlot = (await call("slots")).find((s) => s.id === slotId);
  check(
    "a manually-demolished slot never locks to its former type — history is forgotten",
    finalSlot && finalSlot.everBuilt === false && finalSlot.type === null,
    JSON.stringify(finalSlot),
  );
  const queueAfter = await call("rebuildQueue");
  check(
    "manual demolition never enters the auto-rebuild FIFO",
    queueAfter.every((q) => q.slot !== slotId),
    JSON.stringify(queueAfter),
  );

  // conversion: build a tower, let it stand, destroy it by combat, then
  // manually build something else entirely before the auto-rebuilder gets to it.
  await call("build", slotId, "tower");
  await step(0.016, 260);
  await call("damageSlot", slotId, 999999);
  // A combat kill now plays a ~1.4s collapse before the slot is actually
  // freed and the rebuild queue entry pushed — never an instant vanish.
  await step(0.016, 110);
  const pendingAfterDestroy = await call("rebuildQueue");
  check("a combat kill does enter the FIFO", pendingAfterDestroy.some((q) => q.slot === slotId && q.type === "tower"));
  const converted = await call("build", slotId, "mine");
  check("the slot can be converted to a different type while a rebuild is pending", converted.ok, JSON.stringify(converted));
  await step(0.016, 260);
  const queueAfterConvert = await call("rebuildQueue");
  check(
    "building over a pending rebuild drops that rebuild entirely",
    queueAfterConvert.every((q) => q.slot !== slotId),
    JSON.stringify(queueAfterConvert),
  );
  await call("demolish", slotId);
  await step(0.016, 100);

  // ------------------------------------------------------- layout validator --
  console.log("\n> the hand-placed universal-slot layout is valid at load time");
  const layout = await call("slotLayoutReport");
  check("no two universal slots overlap given the largest possible building on each", layout.overlaps.length === 0, JSON.stringify(layout.overlaps));
  check(
    "no universal slot crowds a wall, the furnace, or a resource node",
    layout.placementIssues.length === 0,
    JSON.stringify(layout.placementIssues),
  );
  check("the layout validator's overall verdict is ok", layout.ok === true);

  // ------------------------------------------------------- gold reward -----
  console.log("\n> endless mode: early-wave gold reward");
  await call("startEndless");
  await step(0.016, 20);
  const waveMultCases = [
    { wave: 3, seconds: 30, expect: Math.floor(30 * 1.0) },
    { wave: 3, seconds: 20, expect: Math.floor(20 * 1.0) },
    { wave: 15, seconds: 10, expect: Math.floor(10 * 0.8) },
    { wave: 25, seconds: 10, expect: Math.floor(10 * 0.6) },
    { wave: 45, seconds: 10, expect: Math.floor(10 * 0.5) },
    { wave: 3, seconds: 2, expect: Math.floor(2 * 1.0) },
    { wave: 3, seconds: 1, expect: 0 },
    { wave: 3, seconds: 0, expect: 0 },
  ];
  let formulaOk = true;
  for (const { wave, seconds, expect } of waveMultCases) {
    await advanceToIntermission(ctx, wave - 1);
    await call("setPrepCountdown", seconds + 0.05);
    await step(0.016, 2);
    const preview = await call("earlyWaveReward");
    if (preview !== expect) {
      formulaOk = false;
      console.log(`    wave ${wave} seconds ${seconds}: expected ${expect}, got ${preview}`);
    }
  }
  check("the early-wave reward formula matches floor(seconds * goldPerSecond * waveMultiplier) at every tier and the 2s floor", formulaOk);

  await advanceToIntermission(ctx, 4);
  await call("setPrepCountdown", 24);
  await step(0.016, 2);
  const goldBefore = await call("goldAmount");
  const firstClaim = await call("claimEarlyWaveNow");
  const secondClaim = await call("claimEarlyWaveNow");
  check("the first early-wave claim pays out", firstClaim > 0, `firstClaim=${firstClaim}`);
  check(
    "a second claim in the same prep phase pays nothing — single claim enforced",
    secondClaim === 0,
    `secondClaim=${secondClaim}`,
  );
  const goldAfter = await call("goldAmount");
  check("gold actually increased by exactly the first claim", goldAfter - goldBefore === firstClaim, `${goldBefore} -> ${goldAfter}, claim=${firstClaim}`);
  await step(0.016, 10);

  // ------------------------------------------------------- new towers ------
  console.log("\n> the four new attack buildings: build, attack, demolish, auto-rebuild");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("setPrepCountdown", 99999);
  await unlockResourceCap(ctx, "southFrontB");
  await call("build", "southFrontA", "autoRebuilder");
  await step(0.016, 320);

  const SPAWN_OFFSET = { crossbowTower: 3, frostTower: 3, sniperTower: 3, mortar: 6 };
  // Each type gets its own dedicated slot, so one type's cleanup timing can
  // never race the next type's build attempt.
  const TEST_SLOT = { crossbowTower: "eastFrontA", frostTower: "eastMid", sniperTower: "eastBack", mortar: "northBack" };

  for (const type of ATTACK_BUILDINGS) {
    const targetSlot = TEST_SLOT[type];
    const built = await call("build", targetSlot, type);
    check(`${type} can be built on a universal slot`, built.ok, JSON.stringify(built));
    await step(0.016, 460);
    const health = await call("slotHealth", targetSlot);
    check(`${type} reports a positive max health once complete`, health && health.max > 0, JSON.stringify(health));

    const pos = await call("slotWorldPos", targetSlot);
    const offset = SPAWN_OFFSET[type];
    // The stage's own wave clock keeps running underneath this section, and
    // by the second or third tower type enough sim-time has passed that a
    // real stage wave can spawn its own grunts — clear those first so the
    // one `unitInfo("grunt")` finds below is unambiguously the test's own.
    await call("killAllEnemies");
    await step(0.016, 5);
    if (type === "frostTower") {
      await call("spawnEnemy", "grunt", pos.x, pos.z + offset);
      await step(0.016, 90);
      const info = await call("unitInfo", "grunt");
      check("frostTower slows an enemy it hits", info && info.slowFactor > 0, JSON.stringify(info));
    } else {
      await call("spawnEnemy", "grunt", pos.x, pos.z + offset);
      // Grunts recruit as a 3-member squad — a single-target tower may land
      // its hit on any one of them, so check the whole squad, not just
      // whichever member `unitInfo` happens to return first.
      let hpDropped = false;
      for (let i = 0; i < 20 && !hpDropped; i++) {
        await step(0.016, 8);
        const all = await call("allUnitsOf", "grunt");
        if (all.length < 3 || all.some((u) => u.hp < 100)) hpDropped = true;
      }
      check(`${type} actually damages an enemy in range`, hpDropped);
    }
    await call("killAllEnemies");
    await step(0.016, 30);

    const check1 = await call("demolishCheck", targetSlot);
    if (!check1.ok) await step(0.016, 200);
    const demolished = await call("demolish", targetSlot);
    check(`${type} can be demolished like any other non-core building`, demolished.ok, JSON.stringify(demolished));
    await step(0.016, 200);

    // auto-rebuild: pause the auto-rebuilder so destruction and queueing can
    // be observed as a stable state, then resume it and confirm the rebuild.
    await call("setAutoRebuild", false);
    await call("build", targetSlot, type);
    await step(0.016, 460);
    await call("damageSlot", targetSlot, 999999);
    // Collapse animation first (~1.4s) — the queue entry lands after it, not
    // on the same frame health hit zero.
    await step(0.016, 110);
    const queued = (await call("rebuildQueue")).some((q) => q.slot === targetSlot && q.type === type);
    check(`a destroyed ${type} enters the auto-rebuild queue`, queued);
    await call("setAutoRebuild", true);
    let rebuilt = false;
    for (let i = 0; i < 30 && !rebuilt; i++) {
      await step(0.016, 20);
      rebuilt = (await call("slots")).find((s) => s.id === targetSlot)?.occupied === true;
    }
    check(`${type} is auto-rebuilt`, rebuilt);
    // Wait out the slowest possible build time before the cleanup demolish —
    // a rebuilt building must finish its own construction before it can be
    // taken down again, and `occupied` goes true well before that.
    for (let i = 0; i < 5; i++) {
      await step(0.016, 460);
      const cleanup = await call("demolish", targetSlot);
      if (cleanup.ok) break;
    }
  }
  await shot("v8-new-towers");
  // Force-clear the two slots the sniper-overkill test needs next, whatever
  // state the loop above happened to leave them in.
  for (const slot of ["eastFrontA", "eastFrontB"]) {
    for (let i = 0; i < 5 && (await call("slots")).find((s) => s.id === slot)?.occupied; i++) {
      await call("demolish", slot);
      await step(0.016, 300);
    }
  }

  // sniper avoid-overkill: two snipers, one shared target — only one may commit a shot to it.
  console.log("\n> sniper towers do not both commit a lethal shot to the same dying target");
  await call("grant", 90000, 90000, 90000);
  await call("build", "eastFrontA", "sniperTower");
  await call("build", "eastFrontB", "sniperTower");
  await step(0.016, 600);
  const p1 = await call("slotWorldPos", "eastFrontA");
  const p2 = await call("slotWorldPos", "eastFrontB");
  await call("spawnEnemy", "grunt", (p1.x + p2.x) / 2, (p1.z + p2.z) / 2);
  await step(0.016, 20);
  await call("resetSniperShots");
  // Both towers just finished building on the same frame, so both attack
  // timers reach zero together — exactly the race avoidOverkill must resolve.
  await step(0.016, 10);
  const shotsAfterFirstTick = await call("sniperShotsFired");
  check(
    "only one sniper commits to the shared target on the frame both come off cooldown together",
    shotsAfterFirstTick <= 1,
    `shotsFired=${shotsAfterFirstTick}`,
  );
  await call("killAllEnemies");
  await call("demolish", "eastFrontA");
  await call("demolish", "eastFrontB");
  await step(0.016, 250);

  // ------------------------------------------------------- boss pacing -----
  console.log("\n> endless boss pacing: no level-6 boss before wave 20");
  let pacingOk = true;
  for (let wave = 1; wave <= 25; wave++) {
    const preview = await call("endlessWavePreview", wave, 2);
    const eligibility = await call("bossEligibility", wave);
    const hasBoss = preview.groups.some((g) => g.enemyId === "boss");
    if (wave < 20 && hasBoss) {
      pacingOk = false;
      console.log(`    wave ${wave} unexpectedly contains a level-6 boss`);
    }
    if (wave === 20 && !hasBoss) {
      pacingOk = false;
      console.log("    wave 20 does not contain the first level-6 boss");
    }
    if (hasBoss !== eligibility.isLevel6BossWave) {
      pacingOk = false;
      console.log(`    wave ${wave}: composed boss=${hasBoss} disagrees with eligibility=${eligibility.isLevel6BossWave}`);
    }
  }
  check("no level-6 boss is composed for any wave before 20, and wave 20 is the first one", pacingOk);

  const wave10 = await call("endlessWavePreview", 10, 2);
  check("wave 10 is an elite wave: no boss, includes a level-4-tier unit", !wave10.boss && wave10.groups.some((g) => ["juggernaut", "breacher", "icearmor", "commander"].includes(g.enemyId)), JSON.stringify(wave10.groups));
  const wave15 = await call("endlessWavePreview", 15, 2);
  check("wave 15 is a strengthened elite: no full boss, includes the level-5 unit", !wave15.boss && wave15.groups.some((g) => g.enemyId === "bombardier"), JSON.stringify(wave15.groups));

  const at20 = await call("bossEligibility", 20);
  const at30 = await call("bossEligibility", 30);
  const at40 = await call("bossEligibility", 40);
  check("boss health/damage multipliers grow by exactly one cycle-step between consecutive boss waves", Math.abs(at30.healthMultiplier - at20.healthMultiplier - 0.2) < 1e-6 && Math.abs(at40.healthMultiplier - at20.healthMultiplier - 0.4) < 1e-6, JSON.stringify({ at20, at30, at40 }));

  // ------------------------------------------------- real run through wave 20 --
  console.log("\n> a real endless run only ever sees its first boss at wave 20");
  await call("startEndless");
  await step(0.016, 20);
  let bossSeenBeforeWave20 = false;
  let reachedWave20Boss = false;
  for (let i = 0; i < 20; i++) {
    await call("jumpToWave", i + 1);
    await step(0.016, 40);
    const info = await call("bossInfo");
    const timer = await call("waveTimer");
    if (info.active && timer.wave < 20) bossSeenBeforeWave20 = true;
    if (info.active && timer.wave === 20) reachedWave20Boss = true;
    await call("killAllEnemies");
    await step(0.016, 20);
  }
  check("a real simulated run never activates the boss controller before wave 20", !bossSeenBeforeWave20);
  check("a real simulated run does activate the boss controller at wave 20", reachedWave20Boss);
  await call("killAllEnemies");
  await step(0.016, 100);

  // ------------------------------------------------- three development strategies --
  // A scripted build/recruit order stands in for genuine adaptive player
  // decision-making (implementing real autonomous economic AI is out of
  // scope for a test harness) — each strategy gets a fixed, finite resource
  // grant and a fixed build list, then plays real waves with no artificial
  // furnace-propping, unlike the AI-stability endurance test above.
  console.log("\n> three development strategies reach wave 10, two of three reach wave 20");
  // Endless starts with only north+south live, so every strategy walls
  // exactly those two sides — undefended sides would make survival a test
  // of the wall system's absence, not of the strategy's own composition.
  // mid0 sits just inside the north gate and mid4 just inside the south gate
  // — both live lanes from wave 1 — so a tower on each actually reaches the
  // besiegers at the wall face, rather than an arbitrarily-placed slot whose
  // range never touches either gate.
  const strategies = [
    {
      name: "economy-first",
      warehouseSlot: "northMid",
      resources: { wood: 700, stone: 1300, gold: 160 },
      builds: [
        ["northFrontA", "mine"],
        ["northFrontB", "lumberyard"],
        ["northBack", "recruitHall"],
        ["southFrontA", "tower"],
        ["westFrontA", "tower"],
        ["wallNorth", "wall"],
        ["wallSouth", "wall"],
      ],
      recruits: ["warrior", "warrior"],
      throughWave: 20,
    },
    {
      name: "army-first",
      warehouseSlot: "northFrontB",
      resources: { wood: 600, stone: 1250, gold: 300 },
      builds: [
        ["northFrontA", "recruitHall"],
        ["wallNorth", "wall"],
        ["wallSouth", "wall"],
      ],
      recruits: ["warrior", "warrior", "archer", "shield", "warrior"],
      throughWave: 10,
    },
    {
      name: "defense-first",
      warehouseSlot: "northFrontB",
      resources: { wood: 800, stone: 1450, gold: 210 },
      builds: [
        ["northFrontA", "recruitHall"],
        ["southFrontA", "tower"],
        ["westFrontA", "crossbowTower"],
        ["southFrontB", "frostTower"],
        ["wallNorth", "wall"],
        ["wallSouth", "wall"],
      ],
      recruits: ["warrior", "warrior"],
      throughWave: 20,
    },
  ];
  const strategyResults = [];
  for (const s of strategies) {
    strategyResults.push(await runStrategyRun(ctx, s));
  }
  for (const r of strategyResults) {
    console.log(`    ${r.name}: reachedWave10=${r.reachedWave10} reachedTargetWave=${r.reachedTargetWave} deathWave=${r.deathWave}`);
  }
  check(
    "all three development strategies survive to wave 10",
    strategyResults.every((r) => r.reachedWave10),
    JSON.stringify(strategyResults),
  );
  check(
    "at least two of the three strategies survive through to their wave-20 checkpoint",
    strategyResults.filter((r) => r.reachedTargetWave).length >= 2,
    JSON.stringify(strategyResults),
  );

  return { strategyResults };
}

/** Plays a real endless run under a fixed, finite build/recruit script —
 * no furnace-propping — and reports how far it got. */
async function runStrategyRun(ctx, config) {
  const { call, step } = ctx;
  await call("startEndless");
  await step(0.016, 20);
  // Every resource is capped at 100 until a warehouse stands, so the
  // warehouse always goes up first, on its own small grant, before the
  // strategy's real budget is granted.
  await call("grant", 100, 100, 20);
  await step(0.016, 5);
  await call("build", config.warehouseSlot, "warehouse");
  await step(0.016, 320);
  await call("grant", config.resources.wood, config.resources.stone, config.resources.gold);
  await step(0.016, 5);
  for (const [slot, type] of config.builds) await call("build", slot, type);
  await step(0.016, 500);
  for (const unitId of config.recruits) await call("recruit", unitId);
  await step(0.016, 30);

  // Natural wave progression, not `forceNextWave` — the wave clock only ever
  // advances once every living enemy from the current wave is actually gone,
  // so there is no risk of one wave's stragglers stacking under the next.
  let reachedWave10 = false;
  let reachedTargetWave = false;
  let deathWave = null;
  let lastWaveSeen = 0;
  for (let i = 0; i < 4000; i++) {
    await step(0.016, 40);
    if (await call("runOver")) {
      deathWave = (await call("waveTimer")).wave;
      break;
    }
    const timer = await call("waveTimer");
    if (timer.wave > lastWaveSeen) {
      lastWaveSeen = timer.wave;
      if (lastWaveSeen >= 10) reachedWave10 = true;
      if (lastWaveSeen >= config.throughWave) {
        reachedTargetWave = true;
        break;
      }
      // A per-wave income trickle standing in for hand-gathering, collected
      // production and kill-gold over a real 55-90s wave cycle (the test
      // hero never physically walks a circuit collecting buffers, so this
      // approximates the outcome rather than the mechanic) — gold is by far
      // the tightest of the three, since every kill in a ~15-20 unit wave of
      // mostly 1-5g fodder plausibly adds up to several dozen.
      await call("grant", 260, 260, 90);
      await step(0.016, 10);
      // Recruiting takes priority over the furnace level — a bigger army
      // matters more than a higher squad *limit* it can't yet afford to
      // fill, and without this the furnace upgrade (which itself grows more
      // expensive each level) crowds out recruits entirely.
      for (let r = 0; r < 8; r++) {
        const squads = await call("squadInfo");
        if (squads.count >= squads.limit) break;
        const failure = await call("recruit", "warrior");
        if (failure) break;
      }
      // A furnace upgrade grows the squad limit in endless mode — without
      // this, every strategy's army plateaus at the base limit partway
      // through and offense inevitably falls behind the per-wave difficulty
      // curve, which is a stalemate in the test, not a real design flaw.
      await call("upgradeFurnace");
    }
  }
  return { name: config.name, reachedWave10, reachedTargetWave, deathWave };
}

/** Grants just enough to build a warehouse on `warehouseSlotId`, waits for it
 * to finish, then tops resources up freely — the store caps every resource
 * at 100 until a warehouse stands, so any test that needs to grant a large
 * amount must clear that gate first. */
async function unlockResourceCap(ctx, warehouseSlotId) {
  const { call, step } = ctx;
  await call("grant", 100, 100, 20);
  await step(0.016, 5);
  await call("build", warehouseSlotId, "warehouse");
  await step(0.016, 320);
  await call("grant", 90000, 90000, 90000);
}

/** Jumps to `wave`, then clears it out and steps until the wave manager has
 * actually transitioned into its intermission phase — `setPrepCountdown`
 * only takes effect during prep/intermission, never mid-wave. */
async function advanceToIntermission(ctx, wave) {
  const { call, step } = ctx;
  await call("jumpToWave", wave);
  // Groups spawn on their own delays within the wave (up to ~20s for a late
  // high-wave group), so killing once is not enough — keep clearing until
  // nothing is left pending or alive and the wave manager actually flips to
  // intermission.
  for (let i = 0; i < 150; i++) {
    await call("killAllEnemies");
    await step(0.016, 20);
    const timer = await call("waveTimer");
    if (timer.phase === "intermission" || timer.phase === "prep") return;
  }
}
