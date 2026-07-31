/**
 * v3 verification: finite resources, gather rate, camera fit, gold economy,
 * wall decay, boss phases, AI stability and real performance measurement.
 *
 * Imported by playtest.mjs so the whole suite runs as one pass.
 */
export async function runV3Checks(api) {
  const { check, call, step, snapshot, shot, log } = api;

  // ------------------------------------------------- finite resources -----
  log("\n> finite natural resources");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  const nodeStart = await call("nodeTotals");
  check(
    "natural nodes have a finite starting yield",
    nodeStart.wood > 0 && nodeStart.wood <= 60 && nodeStart.stone > 0 && nodeStart.stone <= 80,
    JSON.stringify(nodeStart),
  );

  const treeStates = await call("nodeStates");
  const firstTree = treeStates.find((n) => n.kind === "wood");
  check("tree capacity matches its size", [6, 10, 16].includes(firstTree.capacity), String(firstTree.capacity));
  const firstStone = treeStates.find((n) => n.kind === "stone");
  check("rock capacity matches its size", [8, 14, 22].includes(firstStone.capacity), String(firstStone.capacity));

  // Work one large tree until it is spent.
  await call("setResources", 0, 0, 0);
  await call("teleport", -4.4, 7.2);
  await step(0.016, 500);
  let nodes = await call("nodeStates");
  const worked = nodes.find((n) => n.kind === "wood" && n.remaining < n.capacity);
  check("chopping actually drains the tree", worked !== undefined, JSON.stringify(worked));

  await step(0.016, 1400);
  nodes = await call("nodeStates");
  const depleted = nodes.filter((n) => n.state === "depleted");
  check("a worked tree eventually depletes", depleted.length > 0, `${depleted.length} depleted`);

  // The spent node must not be workable any more.
  const spentBefore = await call("nodeTotals");
  await step(0.016, 400);
  const spentAfter = await call("nodeTotals");
  check(
    "a depleted node yields nothing further",
    depleted.every((n) => n.remaining === 0),
    JSON.stringify(depleted.map((n) => n.remaining)),
  );
  check(
    "total natural yield only ever decreases",
    spentAfter.wood <= spentBefore.wood,
    `${spentBefore.wood} -> ${spentAfter.wood}`,
  );

  // ------------------------------------------------------ gather rate -----
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("setResources", 0, 0, 0);
  await call("teleport", -4.4, 7.2);
  await step(0.016, 30);
  const rateStart = (await snapshot()).wood;
  await step(0.016, 375);
  const rateEnd = (await snapshot()).wood;
  const perSecond = (rateEnd - rateStart) / (375 * 0.016);
  check(
    "chopping yields roughly one wood per 0.55 s",
    perSecond > 1.1 && perSecond < 2.6,
    `${perSecond.toFixed(2)} wood/s over 6 s`,
  );

  await call("teleport", 0, -14);
  const awayStart = (await snapshot()).wood;
  await step(0.016, 200);
  check("no gathering at a distance", (await snapshot()).wood === awayStart, `wood ${awayStart}`);

  // ------------------------------------------------------- camera fit -----
  // The camera is a tactical local view now, not a base overview — it must
  // stay well short of the wall ring, not cover it.
  const framed = await call("cameraRadius");
  const mapInfo = await call("mapInfo");
  check(
    "default framing is a local view, well short of the whole wall ring",
    framed > 0 && framed < mapInfo.wallRadius * 0.6,
    `framed ${framed.toFixed(1)} vs wall ${mapInfo.wallRadius}`,
  );

  // ----------------------------------------------------- gold economy -----
  await call("startStage", "stage-1");
  await step(0.016, 20);
  let snap = await snapshot();
  check("stage 1 opens with 15 gold", snap.gold === 15, String(snap.gold));
  // Read the live data so this coverage remains valid when construction
  // resources are deliberately rebalanced.
  const buildingCosts = await call("buildingCosts");
  const hallCost = buildingCosts.find((building) => building.id === "recruitHall")?.cost;
  await call("setResources", hallCost?.wood ?? 0, hallCost?.stone ?? 0, hallCost?.gold ?? 0);
  const hall = await call("build", "northBack", "recruitHall");
  check(
    "the recruit hall builds with its exact current material cost",
    hall?.ok === true,
    JSON.stringify(hall),
  );
  check("the recruit hall consumes its exact current gold cost", (await snapshot()).gold === 0, String((await snapshot()).gold));

  // ------------------------------------------------------ wall balance ----
  await call("startStage", "stage-1");
  await step(0.016, 20);
  // A warehouse first: the 100 cap otherwise makes a 250-stone wall unbuyable.
  await call("setResources", 100, 100, 100);
  await call("build", "northMid", "warehouse");
  await step(0.016, 260);
  await call("grant", 9000, 9000, 9000);
  const wallBuild = await call("build", "wallNorth", "wall");
  check("wall is buildable once a warehouse lifts the cap", wallBuild?.ok === true, JSON.stringify(wallBuild));
  await step(0.016, 200);
  const wall1 = await call("slotHealth", "wallNorth");
  check("wall base health is 12000", wall1.max === 12000, JSON.stringify(wall1));
  await call("damageSlot", "wallNorth", 999999);
  await step(0.016, 30);
  await call("build", "wallNorth", "wall");
  await step(0.016, 200);
  const wall2 = await call("slotHealth", "wallNorth");
  check(
    "a wall rebuilt in the same wave returns at 90%",
    Math.abs(wall2.max - 12000 * 0.9) < 2,
    JSON.stringify(wall2),
  );

  // ------------------------------------------------------- boss phases ----
  log("\n> boss three phases");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northMid", "warehouse");
  await step(0.016, 240);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 240);
  for (let i = 0; i < 4; i++) await call("recruit", "warrior");
  await call("spawnEnemy", "boss", 0, 14);
  await step(0.016, 90);

  let boss = await call("bossInfo");
  check("boss controller attaches", boss.active === true, JSON.stringify(boss));
  check("boss starts in phase 1", boss.phase === 1, String(boss.phase));

  await call("damageBoss", 3200);
  await step(0.016, 40);
  boss = await call("bossInfo");
  check("boss enters phase 2 below 70%", boss.phase === 2, JSON.stringify(boss));

  await step(0.016, 700);
  const slam = await call("bossSlamSeen");
  check("phase 2 slam telegraphs before it lands", slam.warned > 0, JSON.stringify(slam));
  check(
    "a slam never removes more than 35% of a squad's health",
    slam.maxFractionDealt <= 0.36,
    `max fraction ${slam.maxFractionDealt.toFixed(3)}`,
  );

  await call("damageBoss", 3600);
  await step(0.016, 40);
  boss = await call("bossInfo");
  check("boss enters phase 3 below 35%", boss.phase === 3, JSON.stringify(boss));
  await shot("boss-phase3");
  await call("killAllEnemies");
  await step(0.016, 200);

  // --------------------------------------------------------------- AI -----
  log("\n> AI stability");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northMid", "warehouse");
  await step(0.016, 240);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northBack", "recruitHall");
  await step(0.016, 240);
  await call("resetWatchdog");

  for (const id of ["warrior", "shield", "archer", "medic", "mage", "assault"]) {
    await call("recruit", id);
  }
  await step(0.016, 150);

  for (let i = 0; i < 6; i++) await call("spawnEnemy", "grunt", 3 + i, 13);
  await step(0.016, 400);
  await call("killAllEnemies");
  await step(0.016, 45);
  let states = await call("aiStates");
  const afterDeath = states.filter((u) => u.idle > 1.5);
  check(
    "allies re-plan promptly after their target dies",
    afterDeath.length === 0,
    JSON.stringify(afterDeath),
  );

  for (let i = 0; i < 10; i++) await call("recruit", "warrior");
  for (let i = 0; i < 14; i++) await call("spawnEnemy", "grunt", -1 + (i % 3), 18 + (i % 4));
  await step(0.016, 1400);
  states = await call("aiStates");
  const crowded = states.filter((u) => u.idle > 3);
  check(
    "at most 5% of a crowded force stalls",
    crowded.length <= Math.max(1, Math.floor(states.length * 0.05)),
    `${crowded.length} of ${states.length}`,
  );
  await shot("ai-crowd");

  await call("killAllEnemies");
  await call("healAllies");
  await step(0.016, 400);
  states = await call("aiStates");
  const frozenMedics = states.filter((u) => u.id === "medic" && u.idle > 3);
  check("idle medics return to formation instead of freezing", frozenMedics.length === 0, JSON.stringify(frozenMedics));

  // ------------------------------------------------- 20-wave endurance ----
  log("\n> 20-wave AI endurance run");
  await call("startEndless");
  await step(0.016, 20);
  await call("setResources", 100, 100, 100);
  await call("build", "northMid", "warehouse");
  await step(0.016, 240);
  await call("grant", 9000, 9000, 9000);
  await call("build", "northBack", "recruitHall");
  await call("build", "northFrontA", "mine");
  await call("build", "northFrontB", "lumberyard");
  const enduranceTowerSlots = [
    "eastFrontA", "eastFrontB", "eastMid", "eastBack", "southFrontA", "southFrontB", "southMid", "southBack",
  ];
  for (const id of enduranceTowerSlots) await call("build", id, "tower");
  await step(0.016, 320);
  await call("resetWatchdog");

  let guard = 0;
  while (guard < 700) {
    guard++;
    // The furnace is held up deliberately: this measures AI stability across 20
    // waves, not whether the harness can play well enough to survive them.
    await call("restoreFurnace");
    await step(0.016, 120);
    const s = await snapshot();
    if (s.wave >= 20) break;
    await call("grant", 3000, 3000, 900);
    await call("healAllies");
    for (let i = s.allySquads; i < s.squadLimit; i++) {
      await call("recruit", ["archer", "warrior", "shield", "medic"][i % 4]);
    }
    // Clear stragglers so the wave counter advances; the allies have already
    // fought them, which is the part being measured.
    if (guard % 3 === 0) {
      await call("killAllEnemies");
      await call("forceNextWave");
    }
  }
  const endurance = await snapshot();
  const wd = await call("watchdog");
  log(`  endurance: wave ${endurance.wave}, watchdog recoveries=${wd.recoveries} stalls=${wd.stalls}`);
  if (wd.stalls > 0) log(`  stall report: ${JSON.stringify(wd.report.slice(0, 3), null, 1)}`);
  check("the endurance run reached wave 20", endurance.wave >= 20, `wave ${endurance.wave}`);
  check(
    "no friendly unit stalls beyond 3 seconds across 20 waves",
    wd.stalls === 0,
    `${wd.stalls} stalls (watchdog made ${wd.recoveries} preventive recoveries)`,
  );

  // ------------------------------------------------- perf + stress -------
  log("\n> performance monitoring");
  const gpu = await call("gpu");
  log(`  GPU: ${gpu.renderer} | vendor ${gpu.vendor} | software=${gpu.softwareRendering}`);
  check("GPU detection returns a usable result", typeof gpu.renderer === "string" && gpu.renderer.length > 0, gpu.renderer);
  check(
    "SwiftShader is correctly flagged as software rendering",
    gpu.softwareRendering === true,
    String(gpu.softwareRendering),
  );

  const perfResults = [];
  for (const count of [50, 100, 150, 250]) {
    await call("startEndless");
    await step(0.016, 20);
    await call("startStress", count);
    await step(0.016, 60);
    const counts = await call("unitCounts");
    const total = counts.allies + counts.enemies;
    const t0 = Date.now();
    await step(0.016, 150);
    const ms = (Date.now() - t0) / 150;
    perfResults.push({ preset: count, units: total, ms: Number(ms.toFixed(2)) });
    log(`  preset ${count} -> ${total} units, ${ms.toFixed(2)} ms/frame simulation`);
    check(
      `stress ${count}: simulation stays under 16 ms/frame`,
      ms < 16,
      `${ms.toFixed(2)} ms at ${total} units`,
    );
    await call("stopStress");
  }
  check("stress testing marks the run as untracked", (await call("isStressTagged")) === true);
  await shot("stress-250");

  return { perfResults, gpu, watchdog: wd };
}
