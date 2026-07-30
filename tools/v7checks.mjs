/**
 * Checks for the four-side perimeter rework: a unified rectangle wall with
 * ally-only gates, global ally targeting, and the expanded/irregular base
 * layout. Driven from `playtest.mjs`; every helper is passed in so this file
 * never touches puppeteer directly.
 */

async function sealAllWalls(call, step) {
  await call("grant", 90000, 90000, 90000);
  const wallIds = await call("wallSlotIds");
  for (const id of wallIds) await call("build", id, "wall");
  await step(0.016, 340);
  return wallIds;
}

export async function runV7Checks(ctx) {
  const { call, step, check, shot } = ctx;

  console.log("\n> setup: a clean stage, fully sealed on all four sides");
  await call("startStage", "stage-1");
  await step(0.016, 20);
  await call("grant", 200, 200, 200);
  await call("build", "northFrontB", "warehouse");
  await step(0.016, 320);
  const wallIds = await sealAllWalls(call, step);
  check("exactly four wall slots exist", wallIds.length === 4, `n=${wallIds.length}`);
  const perimeter = await call("perimeterInfo");
  check("the four sides are north/east/south/west", new Set(perimeter.sides.map((s) => s.side)).size === 4, JSON.stringify(perimeter.sides.map((s) => s.side)));

  // ------------------------------------------------------------ corners --
  console.log("\n> corner sealing: nothing slips between two sides");
  await call("teleport", 0, -29); // clear of the hero's own auto-attack range
  const corner = { x: perimeter.halfWidth - 1, z: perimeter.halfDepth - 1 };
  await call("spawnEnemy", "grunt", corner.x + 6, corner.z + 6);
  await step(0.016, 700);
  const cornerReport = await call("enemyReport");
  const insideAtCorner = cornerReport.some((e) => Math.abs(e.x) < perimeter.halfWidth - 0.5 && Math.abs(e.z) < perimeter.halfDepth - 0.5);
  check("an enemy approaching a corner never ends up inside", !insideAtCorner, JSON.stringify(cornerReport));
  await call("killAllEnemies");
  await step(0.016, 100);

  // -------------------------------------------------------------- gates --
  console.log("\n> gates let allies through and physically stop enemies");
  const northGate = perimeter.sides.find((s) => s.side === "north");
  await call("teleport", 0, -29); // clear of the hero's own auto-attack range
  await call("spawnAlly", "warrior", northGate.x, northGate.z - 3);
  await step(0.016, 10);
  await call("teleportUnit", "warrior", northGate.x, northGate.z + 6); // straight through the gate, outside the base
  await step(0.016, 20);
  const allyOutside = await call("unitInfo", "warrior");
  check(
    "an ally placed beyond the gate is not pushed back in by collision",
    allyOutside && allyOutside.z > northGate.z + 3,
    JSON.stringify(allyOutside),
  );
  await call("killAllAllies");
  await step(0.016, 60);

  // An enemy placed exactly in the gate gap, wall fully sealed, must be
  // pushed back out rather than allowed to sit in the opening.
  await call("spawnEnemy", "grunt", northGate.x, northGate.z + 8);
  await step(0.016, 10);
  await call("teleportUnit", "grunt", northGate.x, northGate.z - 0.2); // dropped exactly in the gate notch, just inside
  await step(0.016, 60);
  const gateGrunt = await call("unitInfo", "grunt");
  check(
    "an enemy dropped into the gate gap of a sealed wall is corrected back outside",
    gateGrunt && gateGrunt.z > northGate.z,
    JSON.stringify(gateGrunt),
  );
  await call("killAllEnemies");
  await step(0.016, 100);

  // ---------------------------------------------------- anti-exploit fix --
  console.log("\n> anti-exploit: illegal penetration of a sealed perimeter is corrected");
  await call("teleport", 0, -29); // clear of the hero's own auto-attack range
  await call("spawnEnemy", "grunt", 0, 30);
  await step(0.016, 10);
  await call("teleportUnit", "grunt", 0, 0); // dead centre, deep inside a fully sealed base
  await step(0.016, 60);
  const correctedGrunt = await call("unitInfo", "grunt");
  check(
    "an enemy forced inside a fully sealed perimeter is pushed back out, not left to fight from there",
    correctedGrunt && (Math.abs(correctedGrunt.x) >= perimeter.halfWidth - 0.5 || Math.abs(correctedGrunt.z) >= perimeter.halfDepth - 0.5),
    JSON.stringify(correctedGrunt),
  );
  check("its target was cleared rather than kept from the illegal position", correctedGrunt && correctedGrunt.targetKind !== "furnace", JSON.stringify(correctedGrunt));
  await call("killAllEnemies");
  await step(0.016, 100);

  // ------------------------------------------------------- wall destroy --
  console.log("\n> destroying one side opens only that side");
  await call("teleport", 0, -29); // clear of the hero's own auto-attack range
  await call("damageSlot", "wallNorth", 999999);
  await step(0.016, 30);
  const slotsAfterBreach = await call("slots");
  const northOpen = !slotsAfterBreach.find((s) => s.id === "wallNorth").occupied;
  const othersSealed = ["wallEast", "wallSouth", "wallWest"].every((id) => slotsAfterBreach.find((s) => s.id === id).occupied);
  check("only the destroyed side opens", northOpen && othersSealed, JSON.stringify(slotsAfterBreach.filter((s) => s.category === "wall")));
  await call("spawnEnemy", "grunt", 0, 30);
  await step(0.016, 400);
  const throughBreach = (await call("enemyReport")).some((e) => Math.abs(e.z) < perimeter.halfDepth - 1);
  check("enemies advance through the one open side", throughBreach, JSON.stringify(await call("enemyReport")));
  await call("killAllEnemies");
  await call("grant", 90000, 90000, 90000);
  await call("build", "wallNorth", "wall");
  await step(0.016, 340);
  const resealed = (await call("slots")).find((s) => s.id === "wallNorth");
  check("rebuilding the side re-seals it", resealed.occupied === true, JSON.stringify(resealed));
  await step(0.016, 100);

  // ------------------------------------------------------- global search --
  console.log("\n> ally squads search and pursue globally, not within a local radius");
  await call("teleport", 0, -29);
  await call("spawnAlly", "warrior", 0, 6);
  await step(0.016, 20);
  // Far outside the old ~13-unit local engage range, on the other side of
  // the perimeter — the squad must still notice it and route through a gate.
  await call("spawnEnemy", "grunt", 0, 26);
  let acquired = false;
  for (let i = 0; i < 60 && !acquired; i++) {
    await step(0.016, 10);
    const kind = await call("allyTargetKind", "warrior");
    if (kind === "grunt" || kind === "wall") acquired = true;
  }
  check("a squad with nothing nearby still acquires a distant enemy", acquired);
  await step(0.016, 200);
  const chased = await call("unitInfo", "warrior");
  check("it actually closes the distance rather than idling", chased && chased.z > 6, JSON.stringify(chased));
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 100);

  // --------------------------------------------------------- congestion --
  console.log("\n> fifty allies through one gate: no permanent jam");
  await call("teleport", 0, -29);
  for (let i = 0; i < 50; i++) await call("spawnAlly", "warrior", -6 + (i % 12), 6 + Math.floor(i / 12));
  await call("spawnEnemy", "grunt", 0, 26);
  await step(0.016, 30);
  await call("resetWatchdog");
  await step(0.016, 500);
  const wd = await call("watchdog");
  check("no watchdog stalls while fifty allies funnel through a gate", wd.stalls === 0, `stalls=${wd.stalls} recoveries=${wd.recoveries}`);
  await shot("v7-gate-congestion");
  await call("killAllEnemies");
  await call("killAllAllies");
  await step(0.016, 100);

  // -------------------------------------------------------------- layout --
  // Pass D explicitly supersedes the old "fully irregular" requirement with
  // "neatly arranged along each lane, plus a small number of high-value
  // multi-lane positions" — so this now checks the *new* shape directly,
  // not merely "not a single shared radius".
  console.log("\n> build slots are arranged along the 4 lanes with front/mid/back rows and multi-lane hubs");
  const layoutSlots = (await call("slots")).filter((s) => s.category === "universal");
  const positions = await Promise.all(layoutSlots.map(async (s) => ({ ...s, ...(await call("slotWorldPos", s.id)) })));

  const byRole = (role) => positions.filter((s) => s.role === role);
  const perLane = (side) => positions.filter((s) => s.lanes.includes(side));
  for (const side of ["north", "east", "south", "west"]) {
    const laneSlots = perLane(side).filter((s) => s.role === "front" || s.role === "mid" || s.role === "back");
    const front = laneSlots.filter((s) => s.role === "front").length;
    const mid = laneSlots.filter((s) => s.role === "mid").length;
    const back = laneSlots.filter((s) => s.role === "back").length;
    check(
      `${side} lane has at least 2 front-line + 1 mid-line + 1 back-line slot`,
      front >= 2 && mid >= 1 && back >= 1,
      `front=${front} mid=${mid} back=${back}`,
    );
  }
  const junctions = byRole("junction");
  check(
    "2-4 junction slots each cover exactly two adjacent lanes",
    junctions.length >= 2 && junctions.length <= 4 && junctions.every((s) => s.lanes.length === 2),
    `${junctions.length} junctions, lane-counts ${JSON.stringify(junctions.map((j) => j.lanes.length))}`,
  );
  const centers = byRole("center");
  check(
    "1-2 central hub slots exist, positioned for multi-lane reach rather than a single lane",
    centers.length >= 1 && centers.length <= 2 && centers.every((s) => s.lanes.length === 0),
    `${centers.length} centre hubs`,
  );

  const radii = positions.map((p) => Math.hypot(p.x, p.z));
  const uniqueRadii = new Set(radii.map((r) => Math.round(r * 10)));
  check(
    "the layout uses multiple distinct depth tiers, not one shared ring radius around the furnace",
    uniqueRadii.size >= 4,
    `${uniqueRadii.size} distinct radii among ${radii.length} plots`,
  );
  const minRadius = Math.min(...radii);
  // The real invariant is the layout validator's own furnace-clearance
  // formula (furnace radius + largest possible building + safety margin —
  // see `SlotLayoutValidation.ts`, currently 5.4), not an arbitrary number.
  check("the furnace core stays clear of every plot", minRadius >= 5.4, `closest plot at ${minRadius.toFixed(2)}`);

  const roadBlockCheck = await call("slotLayoutReport");
  check(
    "no slot sits inside a gate's own lane, so nothing ever blocks a road",
    roadBlockCheck.placementIssues.filter((i) => i.kind === "gateLane").length === 0,
    JSON.stringify(roadBlockCheck.placementIssues.filter((i) => i.kind === "gateLane")),
  );

  return {};
}
