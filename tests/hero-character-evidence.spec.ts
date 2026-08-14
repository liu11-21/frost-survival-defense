import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Front-face evidence for both Hero variants, captured in real gameplay.
 *
 * The existing review harness frames the Hero from behind, so its "close-up"
 * proves nothing about a face: a whole round of head work shipped with the
 * helmet covering the eyes and every screenshot looked fine, because every
 * screenshot was of the back of the skull.
 *
 * So this trusts neither a camera preset nor a world axis -- guessing the
 * facing from world +Z is what let the Blender side agree with itself and
 * still be wrong. The camera is placed along the rig's own heading, and the
 * shot is then PROVEN to be the front before it counts as evidence: MakeHuman
 * spends most of its head topology on the face and little on the cranium, so
 * the half of the head's vertices nearer the camera must outnumber the half
 * behind it. A back-of-head frame fails that check and fails this test.
 *
 * LOD is pinned to 0. Left automatic, the Hero is far enough from the gameplay
 * camera to be drawn at LOD2 (2969 verts), and a face close-up of the lowest
 * tier is not evidence about the face that ships.
 */
const OUT = resolve(process.cwd(), "reports/hero-face");

const FRAME = `(orbit, distance, aimY, fov, lift) => {
  const fb = window.frostbound;
  const scene = fb.game.s.scene;
  const hero = fb.game.s.hero;
  const meshes = [...(hero.authoredMeshes || [])].filter((m) => m.skeleton);
  // Pin LOD0 explicitly, and take the BODY within it. The GLB ships one mesh
  // per material group -- two gloves, the outfit split by material, the sword,
  // and the human -- so the first LOD0 mesh by name is a glove, which has no
  // vertices anywhere near the head and makes the anatomy check read 0 vs 0.
  const lod0 = meshes.filter((m) => /LOD0/.test(m.name));
  const mesh = (lod0.length ? lod0 : meshes)
    .slice()
    .sort((a, b) => b.getTotalVertices() - a.getTotalVertices())[0];
  if (!mesh) return { ok: false, reason: "no skinned mesh" };
  const bone = mesh.skeleton.bones.find(
    (b) => (b.name.split(":").pop() ?? b.name) === "head");
  if (!bone) return { ok: false, reason: "no head bone" };
  const head = bone.getAbsolutePosition(mesh);
  const yaw = hero.facingYaw;

  // --- prove this is the face, by anatomy, not by axis ----------------
  // Entirely in the mesh's OWN space. The vertex buffer holds bind-pose
  // positions, so comparing it against the ANIMATED bone position mixes two
  // frames and the split came out 0 vs 4927 -- the same mesh-versus-armature
  // space mixing that produced a metre of phantom bind error in Blender. The
  // heading is brought into the mesh's space instead, and the head is located
  // from the vertices themselves.
  const positions = mesh.getVerticesData("position");
  const world = mesh.getWorldMatrix();
  const V3 = scene.activeCamera.position.constructor;
  const M = world.constructor;
  const inverse = M.Invert(world);
  const fwd = V3.TransformNormal(new V3(Math.sin(yaw), 0, Math.cos(yaw)), inverse);
  const flen = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / flen, fz = fwd.z / flen;

  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    if (positions[i] < minY) minY = positions[i];
    if (positions[i] > maxY) maxY = positions[i];
  }
  // Head region: the top of the body's own bounding box.
  const headFloor = minY + (maxY - minY) * 0.86;
  let cx = 0, cz = 0, n = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] < headFloor) continue;
    cx += positions[i]; cz += positions[i + 2]; n++;
  }
  if (!n) return { ok: false, reason: "no head-region vertices" };
  cx /= n; cz /= n;
  let ahead = 0, behind = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] < headFloor) continue;
    const d = (positions[i] - cx) * fx + (positions[i + 2] - cz) * fz;
    if (d > 0.002) ahead++; else if (d < -0.002) behind++;
  }

  const a = (orbit * Math.PI) / 180;
  const dir = { x: Math.sin(yaw + a), z: Math.cos(yaw + a) };
  // A one-shot camera move does not survive: the gameplay camera is re-seated
  // every tick, and stopping the loop to prevent that also stops rendering, so
  // the screenshot came back as the untouched overhead gameplay view while the
  // numeric assertions all passed. Own a camera instead and re-assert it each
  // frame, with the loop still running so frames keep being drawn.
  const Camera = scene.activeCamera.constructor;
  if (window.__evidenceCam) {
    scene.onBeforeRenderObservable.remove(window.__evidenceHook);
    window.__evidenceCam.dispose();
  }
  const cam = new Camera("faceEvidence", new V3(0, 0, 0), scene);
  cam.minZ = 0.01;
  cam.fov = fov;
  const place = () => {
    const h = bone.getAbsolutePosition(mesh);
    // The head BONE sits at the base of the skull, so aiming at it puts the
    // crown out of frame. Lift the aim to the middle of the face.
    cam.position.set(h.x + dir.x * distance, h.y + aimY + (lift ?? 0.01), h.z + dir.z * distance);
    cam.setTarget(new V3(h.x, h.y + aimY, h.z));
    if (scene.activeCamera !== cam) scene.activeCamera = cam;
  };
  place();
  scene.activeCamera = cam;
  window.__evidenceCam = cam;
  window.__evidenceHook = scene.onBeforeRenderObservable.add(place);
  return { ok: true, ahead, behind, mesh: mesh.name, lodVerts: mesh.getTotalVertices() };
}`;

for (const variant of ["male", "female"] as const) {
  test(`hero ${variant} front face, proven front`, async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 900, height: 1000 });
    await page.goto(`http://127.0.0.1:4173/?uiVerification=1&heroVariant=${variant}`,
      { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForFunction(
      () => (window as any).frostbound?.game?.s?.hero?.modelSource === "GLB",
      null, { timeout: 90_000 });

    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")]
        .find((b) => /第一關/.test(b.textContent || ""));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForFunction(() => (window as any).frostbound.snapshot().inMenu === false,
      null, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el === canvas || el.contains(canvas)) continue;
        (el as HTMLElement).style.display = "none";
      }
    });

    // Pin LOD0 and a deterministic Idle frame. The loop keeps running -- the
    // evidence camera defends itself in an onBeforeRender hook instead.
    await page.evaluate(() => {
      const fb = (window as any).frostbound;
      const h = fb.game.s.hero;
      h.setReviewLod(0);
      h.setReviewAnimation("Idle");
      h.seekReviewAnimation(0.25);
    });
    await page.waitForTimeout(300);

    const framed = await page.evaluate(
      ([fn, orbit, distance, aimY, fov, lift]) => (eval(fn as string) as any)(orbit, distance, aimY, fov, lift),
      [FRAME, 0, 0.62, 0.09, 0.75, 0.01] as const);
    expect(framed.ok, `framing failed: ${framed.reason}`).toBe(true);
    expect(framed.lodVerts, "face evidence must be captured on LOD0 (LOD1 body is 6901, LOD2 2969)").toBeGreaterThan(10000);
    expect(
      framed.ahead,
      `camera is on the sparse side of the head (${framed.ahead} ahead vs ${framed.behind} behind): this frames the BACK of the skull, not the face`,
    ).toBeGreaterThan(framed.behind);

    await page.evaluate(() => (window as any).frostbound.renderReviewFrame?.());
    await page.waitForTimeout(700);
    await page.locator("canvas").first().screenshot({ path: resolve(OUT, `hero-${variant}-face-front.png`) });

    await page.evaluate(
      ([fn, orbit, distance, aimY, fov, lift]) => (eval(fn as string) as any)(orbit, distance, aimY, fov, lift),
      [FRAME, 38, 0.72, 0.09, 0.75, 0.01] as const);
    await page.evaluate(() => (window as any).frostbound.renderReviewFrame?.());
    await page.waitForTimeout(700);
    await page.locator("canvas").first().screenshot({ path: resolve(OUT, `hero-${variant}-face-three-quarter.png`) });

    // Full body, front. The inherited gameplay capture uses the overhead
    // gameplay camera, where the Hero is about forty pixels tall and shows
    // nothing about the silhouette or the kit. The camera is lifted well above
    // the aim point: level with the chest at this distance it ended up inside
    // the furnace the Hero spawns beside, and the frame came back solid black.
    await page.evaluate(
      ([fn, orbit, distance, aimY, fov, lift]) => (eval(fn as string) as any)(orbit, distance, aimY, fov, lift),
      [FRAME, 0, 2.9, -0.72, 0.85, 1.35] as const);
    await page.waitForTimeout(700);
    await page.locator("canvas").first().screenshot(
      { path: resolve(OUT, `hero-${variant}-body-front.png`) });

    // Melee, at the moment of the swing, framed three-quarter so the arc reads.
    await page.evaluate(() => {
      const h = (window as any).frostbound.game.s.hero;
      h.setReviewAnimation("MeleeAttack");
      h.seekReviewAnimation(0.35);
    });
    await page.evaluate(
      ([fn, orbit, distance, aimY, fov, lift]) => (eval(fn as string) as any)(orbit, distance, aimY, fov, lift),
      [FRAME, 42, 2.9, -0.68, 0.85, 1.30] as const);
    await page.waitForTimeout(700);
    await page.locator("canvas").first().screenshot(
      { path: resolve(OUT, `hero-${variant}-melee.png`) });

    expect(errors, "no page errors").toEqual([]);
  });
}
