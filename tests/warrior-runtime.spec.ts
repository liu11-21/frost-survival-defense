import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Camera = "gameplay" | "front" | "side" | "back" | "three-quarter" | "close-up" | "head";
type Animation = "Idle" | "Walk" | "Run" | "MeleeAttack" | "Hit" | "Death";
type Lod = 0 | 1 | 2;
type BoneTransform = { position: [number, number, number]; rotation: [number, number, number, number] };
interface WeaponTransform {
  socket: BoneTransform | null;
  upperGrip: [number, number, number] | null;
  lowerGrip: [number, number, number] | null;
  axeTip: [number, number, number] | null;
  axeWorldCenter: [number, number, number] | null;
  axeWorldExtents: [number, number, number] | null;
  handContactL: number | null;
  handContactR: number | null;
}
interface WarriorState {
  ready: boolean;
  modelSource: "GLB" | "procedural";
  currentCamera: string;
  currentAnimation: string;
  currentLod: string;
  authoredVisibleMeshes: number;
  proceduralVisibleMeshes: number;
  animationGroups: string[];
  boneTransforms: Record<string, BoneTransform>;
  weaponTransform: WeaponTransform;
  heroScreenBounds: { x: number; y: number; width: number; height: number; right: number; bottom: number; visible: boolean };
  visible: boolean;
  uiOccluded: boolean;
}
interface WarriorApi {
  setCamera(camera: Camera): void;
  setAnimation(animation: Animation): void;
  seekAnimation(normalized: number): void;
  setLod(lod: Lod): void;
  setAutoLod(enabled?: boolean): void;
  capture(): Record<string, unknown> | null;
  state(): WarriorState | null;
}
interface ReviewWindow extends Window {
  __warriorReviewState?: WarriorState;
  frostbound?: {
    api(): { warriorReview?: WarriorApi } & Record<string, unknown>;
    stopLoop(): void;
    step(dt: number, frames?: number, render?: boolean): void;
    snapshot(): Record<string, unknown>;
  };
}

const outputRoot = resolve(process.cwd(), process.env.WARRIOR_RUNTIME_OUTPUT ?? ".runtime/warrior-runtime");
const evidenceRoot = resolve(process.cwd(), "reports/warrior-production-w1");
const animations: readonly Animation[] = ["Idle", "Walk", "Run", "MeleeAttack", "Hit", "Death"];
const requiredPoseAnimations: readonly Animation[] = ["Idle", "Walk", "MeleeAttack", "Hit", "Death"];
const cameras: readonly Camera[] = ["gameplay", "front", "side", "back", "three-quarter", "close-up"];

test("verifies Warrior GLB review mode and normalized animation evidence", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(outputRoot, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const samples: Array<Record<string, unknown>> = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`); });

  await page.goto("http://127.0.0.1:4173/?unitReview=warrior", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).__warriorReviewState?.ready), { timeout: 90_000, polling: 100 });
  await page.evaluate(() => (window as ReviewWindow).frostbound?.stopLoop());
  const read = () => page.evaluate(() => {
    const w = window as ReviewWindow;
    return { state: w.__warriorReviewState ?? null, capture: w.frostbound?.api().warriorReview?.capture() ?? null };
  });
  const select = async (camera: Camera, animation: Animation, lod: Lod, normalized = 0.5, wholeFigure = true) => {
    await page.evaluate(({ camera, animation, lod, normalized }) => {
      const api = (window as ReviewWindow).frostbound?.api().warriorReview;
      if (!api) throw new Error("Warrior review API unavailable");
      api.setCamera(camera);
      api.setAnimation(animation);
      api.setLod(lod);
      api.seekAnimation(normalized);
      (window as ReviewWindow).frostbound?.step(0, 1, true);
    }, { camera, animation, lod, normalized });
    const frame = await read();
    expect(frame.state?.modelSource).toBe("GLB");
    expect(frame.state?.authoredVisibleMeshes).toBeGreaterThan(0);
    expect(frame.state?.proceduralVisibleMeshes).toBe(0);
    expect(frame.state?.currentCamera).toBe(camera);
    expect(frame.state?.currentAnimation).toBe(animation);
    expect(frame.state?.currentLod).toBe(`LOD${lod}`);
    // `ready`, `visible` and `uiOccluded` are all computed against the
    // *entire* body bounding box. That is the right contract for a turntable
    // frame and the wrong one for a deliberate head crop, where the body is
    // supposed to run off the edge -- and where a box that spans past the
    // viewport trivially "overlaps" a HUD panel it does not visually touch.
    // The head frame gets its own occlusion check at the call site instead.
    if (wholeFigure) {
      expect(frame.state?.ready).toBe(true);
      expect(frame.state?.visible).toBe(true);
      expect(frame.state?.uiOccluded).toBe(false);
      expect(frame.state?.heroScreenBounds.width).toBeGreaterThan(36);
      expect(frame.state?.heroScreenBounds.height).toBeGreaterThan(90);
    }
    samples.push({ camera, animation, lod: `LOD${lod}`, normalized, state: frame.state, metadata: frame.capture });
    return frame;
  };

  const captureEvidence = async (name: string) => {
    mkdirSync(evidenceRoot, { recursive: true });
    await page.screenshot({ path: resolve(evidenceRoot, name), fullPage: false });
  };

  for (const camera of cameras) {
    await select(camera, "Idle", 0, 0);
    // `warrior-gameplay.png` is deliberately NOT captured here. Review mode
    // is an isolated turntable with its own lighting and an empty scene, so
    // a shot from its "gameplay" camera preset is not gameplay evidence --
    // it only looks like it. That image is produced by the squad test below,
    // in the real arena.
    const evidenceName: Partial<Record<Camera, string>> = {
      front: "warrior-front.png",
      side: "warrior-side.png",
      back: "warrior-back.png",
      "three-quarter": "warrior-three-quarter.png",
    };
    if (evidenceName[camera]) await captureEvidence(evidenceName[camera]!);
  }
  const normalizedTimeline = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
  const animationSamples: Record<Animation, Array<{ normalized: number; state: WarriorState }>> = { Idle: [], Walk: [], Run: [], MeleeAttack: [], Hit: [], Death: [] };
  for (const animation of animations) {
    for (const normalized of normalizedTimeline) {
      const frame = await select("three-quarter", animation, 0, normalized);
      animationSamples[animation].push({ normalized, state: frame.state as WarriorState });
      if (animation === "MeleeAttack" && normalized === 0.6) await captureEvidence("warrior-melee-impact.png");
      if (animation === "Death" && normalized === 0.8) await captureEvidence("warrior-death.png");
    }
  }
  // LOD contact sheet: the same camera and pose at each tier, so a reviewer
  // can compare identity retention across the switch rather than trusting a
  // triangle count. Goes to the runtime output dir, not the 8 canonical
  // repo evidence PNGs.
  for (const lod of [0, 1, 2] as const) {
    await select("three-quarter", "Idle", lod, 0);
    await page.screenshot({ path: resolve(outputRoot, `warrior-lod${lod}.png`), fullPage: false });
  }
  await select("front", "Idle", 1, 0.5);
  await select("front", "Idle", 2, 0.5);
  const requiredSampleCount = requiredPoseAnimations.length * normalizedTimeline.length;
  expect(requiredSampleCount, "Warrior-W2 requires 5 animations x 6 normalized samples").toBe(30);
  expect(samples.filter((sample) => sample.lod === "LOD0").length).toBeGreaterThanOrEqual(42);

  // --- deterministic pose-delta evidence (Warrior-W2 §9) ---------------------
  const boneDelta = (a: Record<string, BoneTransform>, b: Record<string, BoneTransform>): number => {
    let max = 0;
    for (const name of Object.keys(a)) {
      const left = a[name];
      const right = b[name];
      if (!right) continue;
      const values = [...left.position, ...left.rotation];
      const other = [...right.position, ...right.rotation];
      for (let i = 0; i < values.length; i++) max = Math.max(max, Math.abs(values[i] - other[i]));
    }
    return max;
  };
  const atNormalized = (animation: Animation, normalized: number): WarriorState => {
    const sample = animationSamples[animation].find((s) => s.normalized === normalized);
    if (!sample) throw new Error(`${animation} @ ${normalized} deterministic sample is missing`);
    return sample.state;
  };

  // NaN/Infinity guard across every sampled bone and weapon value.
  for (const animation of animations) {
    for (const { normalized, state } of animationSamples[animation]) {
      for (const [bone, transform] of Object.entries(state.boneTransforms)) {
        for (const value of [...transform.position, ...transform.rotation]) {
          expect(Number.isFinite(value), `${animation}@${normalized} bone ${bone} must be finite`).toBe(true);
        }
      }
      const weapon = state.weaponTransform;
      for (const value of [...(weapon.axeWorldCenter ?? []), ...(weapon.axeWorldExtents ?? [])]) {
        expect(Number.isFinite(value), `${animation}@${normalized} axe transform must be finite`).toBe(true);
      }
    }
  }

  const poseDeltas: Record<string, number> = {
    "Walk@0.4 vs Idle@0.4": boneDelta(atNormalized("Idle", 0.4).boneTransforms, atNormalized("Walk", 0.4).boneTransforms),
    "MeleeAttack@0.4 vs Idle@0.4": boneDelta(atNormalized("Idle", 0.4).boneTransforms, atNormalized("MeleeAttack", 0.4).boneTransforms),
    "MeleeAttack@0.6 vs Idle@0.6": boneDelta(atNormalized("Idle", 0.6).boneTransforms, atNormalized("MeleeAttack", 0.6).boneTransforms),
    "Hit@0.4 vs Idle@0.4": boneDelta(atNormalized("Idle", 0.4).boneTransforms, atNormalized("Hit", 0.4).boneTransforms),
    "Death@0.8 vs Idle@0.8": boneDelta(atNormalized("Idle", 0.8).boneTransforms, atNormalized("Death", 0.8).boneTransforms),
    "Death@1.0 vs Idle@1.0": boneDelta(atNormalized("Idle", 1).boneTransforms, atNormalized("Death", 1).boneTransforms),
  };
  for (const [label, delta] of Object.entries(poseDeltas)) {
    expect(delta, `${label} pose delta must be meaningfully non-zero`).toBeGreaterThan(0.01);
  }

  // Axe transform arc: the axe (bounding-box centre, skeleton-applied) and
  // the driving arm bones must both move visibly between wind-up and impact.
  // The rig's terminal hand.L/hand.R bones carry no keyframes of their own
  // (confirmed by direct sampling) -- the swing lives on upper_arm/lower_arm,
  // with the hands following passively -- so the "arm must move" check reads
  // those bones instead of hand.R.
  const meleeStart = atNormalized("MeleeAttack", 0);
  const meleeImpact = atNormalized("MeleeAttack", 0.6);
  const axeCenterDistance = (a: WarriorState, b: WarriorState): number => {
    if (!a.weaponTransform.axeWorldCenter || !b.weaponTransform.axeWorldCenter) return 0;
    const [ax, ay, az] = a.weaponTransform.axeWorldCenter;
    const [bx, by, bz] = b.weaponTransform.axeWorldCenter;
    return Math.hypot(ax - bx, ay - by, az - bz);
  };
  const axeDisplacement = axeCenterDistance(meleeStart, meleeImpact);
  expect(axeDisplacement, "axe centre must displace visibly across the MeleeAttack swing").toBeGreaterThan(0.02);
  const swingArmDelta = boneDelta(
    { "upper_arm.R": meleeStart.boneTransforms["upper_arm.R"], "lower_arm.R": meleeStart.boneTransforms["lower_arm.R"] },
    { "upper_arm.R": meleeImpact.boneTransforms["upper_arm.R"], "lower_arm.R": meleeImpact.boneTransforms["lower_arm.R"] },
  );
  expect(swingArmDelta, "the swinging arm (upper_arm.R/lower_arm.R) must rotate visibly across the MeleeAttack swing").toBeGreaterThan(0.01);

  // --- two-hand grip, measured at the real grip points -------------------
  // Distances are hand bone -> the `lower_grip` / `upper_grip` locator nodes
  // the GLB exports bone-parented to hand.R. The earlier version measured to
  // the axe's bounding-box *centre* with a 1.5m envelope, which is why it
  // passed while the left arm was flung out to the side, a full 1.4m off the
  // haft and plainly wrong on screen. A bounding-box centre cannot express
  // "is the hand on the handle", so no threshold on it would have helped.
  //
  // hand.R is a rigidity check, not a pose check: the upper grip is authored
  // to coincide with hand.R's bind position and the whole axe is skinned
  // 100% to that bone, so any drift means the weapon stopped being rigid.
  const RIGID_TOLERANCE = 0.005;
  // hand.L is the real pose assertion. Keys solve to 0; the allowance covers
  // interpolation between keyframes (worst observed mid-key error 0.032m).
  const GRIP_TOLERANCE = 0.12;
  // Death deliberately releases the haft as the body collapses, so only the
  // part of that clip before the fall is required to hold the grip.
  const gripHeld = (animation: Animation, normalized: number): boolean =>
    animation !== "Death" || normalized <= 0.4;

  const handContactSamples: Array<{ animation: Animation; normalized: number; handContactL: number | null; handContactR: number | null }> = [];
  for (const animation of requiredPoseAnimations) {
    for (const { normalized, state } of animationSamples[animation]) {
      const { handContactL, handContactR, upperGrip, lowerGrip } = state.weaponTransform;
      handContactSamples.push({ animation, normalized, handContactL, handContactR });
      expect(upperGrip, `${animation}@${normalized} upper_grip locator must exist`).not.toBeNull();
      expect(lowerGrip, `${animation}@${normalized} lower_grip locator must exist`).not.toBeNull();
      expect(handContactR ?? Infinity, `${animation}@${normalized} axe is no longer rigid to hand.R`).toBeLessThan(RIGID_TOLERANCE);
      if (gripHeld(animation, normalized)) {
        expect(handContactL ?? Infinity, `${animation}@${normalized} hand.L is not on the lower grip`).toBeLessThan(GRIP_TOLERANCE);
      }
    }
  }
  // The two grips must stay a fixed distance apart: that is what proves the
  // haft is rigid rather than the locators drifting independently.
  for (const { state } of animationSamples.MeleeAttack) {
    const { upperGrip, lowerGrip } = state.weaponTransform;
    if (!upperGrip || !lowerGrip) continue;
    const spacing = Math.hypot(upperGrip[0] - lowerGrip[0], upperGrip[1] - lowerGrip[1], upperGrip[2] - lowerGrip[2]);
    expect(spacing, "grip spacing must stay rigid through the swing").toBeGreaterThan(0.37);
    expect(spacing, "grip spacing must stay rigid through the swing").toBeLessThan(0.42);
  }

  // --- swing arc, measured at the cutting edge ---------------------------
  const meleeTips = animationSamples.MeleeAttack
    .map(({ state }) => state.weaponTransform.axeTip)
    .filter((tip): tip is [number, number, number] => tip !== null);
  expect(meleeTips.length, "axe_tip locator must be sampled across MeleeAttack").toBe(6);
  let bladeTipArc = 0;
  for (const a of meleeTips) {
    for (const b of meleeTips) {
      bladeTipArc = Math.max(bladeTipArc, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
    }
  }
  // Authored wind-up to impact travel is ~2.4m at the keys; sampling on the
  // normalized grid sees ~2.0m. A weak or absent swing collapses this.
  expect(bladeTipArc, "the blade tip must travel a readable arc through the swing").toBeGreaterThan(1.5);

  // Death final pose: the silhouette must have visibly collapsed relative to
  // standing Idle while staying anchored near the same ground line. The
  // current authored clip produces a real but modest ~8% screen-height
  // collapse (confirmed by direct world-space bounding-box inspection: the
  // corpse's Y span drops from [0.08, 2.40] to [-0.70, 1.00]) -- this bar is
  // set to catch a *regression back to zero collapse* (which is exactly the
  // bug this assertion caught before `WarriorReviewMode.capture()` was
  // fixed to call `refreshBoundingInfo({ applySkeleton: true })`), not to
  // impose an unreviewed aesthetic minimum on how dramatic the fall reads.
  const idleStanding = atNormalized("Idle", 0);
  const deathFinal = atNormalized("Death", 1);
  expect(deathFinal.heroScreenBounds.height, "Death final silhouette must be measurably shorter than standing Idle").toBeLessThan(idleStanding.heroScreenBounds.height * 0.97);
  expect(Math.abs(deathFinal.heroScreenBounds.bottom - idleStanding.heroScreenBounds.bottom), "Death final silhouette must stay anchored near the ground line, not fly off-screen or sink far below it").toBeLessThan(250);

  writeFileSync(resolve(outputRoot, "pose-evidence.json"), `${JSON.stringify({ normalizedTimeline, requiredPoseAnimations, poseDeltas, axeDisplacement, swingArmDelta, handContactSamples }, null, 2)}\n`, "utf8");

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  writeFileSync(resolve(outputRoot, "runtime-result.json"), `${JSON.stringify({ passed: true, sampleCount: samples.length, samples, consoleErrors, pageErrors, requestFailures }, null, 2)}\n`, "utf8");

  // Close-range art evidence, forced to LOD0 and labelled inside the frame.
  //
  // This used to be one bare screenshot that inherited whatever the last
  // `select()` had left behind -- which was `select("front", "Idle", 2, 0.5)`
  // a hundred and fifty lines earlier. It landed in the CI artifact under the
  // same name as the LOD0 file in `reports/`, so `warrior-front.png` shipped
  // as front art evidence while actually being LOD2, and an audit caught it.
  //
  // Two things stop that recurring. The filename now states the tier, so a
  // frame at the wrong tier cannot quietly occupy the right name. And the
  // caption burned into the image is read back out of the live review state
  // rather than typed here, so it cannot describe a frame that was not taken.
  const closeSheet: ReadonlyArray<Camera> = ["front", "side", "three-quarter", "close-up", "head"];
  const labelled: Array<Record<string, unknown>> = [];
  for (const camera of closeSheet) {
    const frame = await select(camera, "Idle", 0, 0, camera !== "head");
    expect(frame.state?.currentLod, `close-range ${camera} evidence must be captured at LOD0`).toBe("LOD0");
    const caption = `warrior.glb — ${frame.state?.currentLod} — ${camera} — ${frame.state?.currentAnimation}`;
    await page.evaluate((text) => {
      const el = document.getElementById("art-evidence-label") ?? document.createElement("div");
      el.id = "art-evidence-label";
      el.style.cssText = "position:fixed;left:18px;bottom:18px;z-index:99999;font:600 15px/1.4 ui-monospace,SFMono-Regular,monospace;color:#eef3ff;background:rgba(8,12,20,.82);padding:8px 13px;border-radius:6px;letter-spacing:.02em;pointer-events:none";
      el.textContent = text;
      if (!el.isConnected) document.body.appendChild(el);
    }, caption);
    if (camera === "head") {
      // The head crop cannot use the whole-body occlusion result, so check
      // the thing that actually matters for it: nothing the review draws may
      // sit over the middle of the canvas, which is where the head is framed.
      const overlap = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        const panel = document.getElementById("warriorReviewPanel");
        if (!canvas || !panel) return null;
        const c = canvas.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const zone = { left: c.left + c.width * 0.2, right: c.right - c.width * 0.2, top: c.top + c.height * 0.05, bottom: c.bottom - c.height * 0.2 };
        return p.right > zone.left && p.left < zone.right && p.bottom > zone.top && p.top < zone.bottom;
      });
      expect(overlap, "review HUD must not sit over the head crop").toBe(false);
    }
    const file = `warrior-LOD0-${camera}.png`;
    await page.screenshot({ path: resolve(outputRoot, file), fullPage: false });
    labelled.push({ file, camera, caption, lod: frame.state?.currentLod, animation: frame.state?.currentAnimation });
  }
  await page.evaluate(() => document.getElementById("art-evidence-label")?.remove());
  writeFileSync(
    resolve(outputRoot, "close-range-evidence.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), asset: "warrior.glb", frames: labelled }, null, 2)}\n`,
    "utf8",
  );
});

test("loads three Warrior squads from the authored GLB path", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown> | undefined;
    return Boolean((api?.assetsReady as (() => boolean) | undefined)?.() && (api?.assetStatus as ((key: string) => { loaded: boolean }) | undefined)?.("warrior")?.loaded);
  }, { timeout: 90_000, polling: 100 });
  const result = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.grant as (wood: number, stone: number, gold: number) => void)?.(0, 0, 1000);
    (api.startStage as (id: string) => void)?.("stage-1");
    const spawn = api.spawnAlly as (id: string, x: number, z: number) => unknown;
    spawn("warrior", -2, 0);
    spawn("warrior", 0, 0);
    spawn("warrior", 2, 0);
    const units = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    return { units, squadSummary: (api.squadSummary as () => unknown)() };
  });
  expect(result.units).toHaveLength(9);
  expect(result.units.every((unit) => unit.modelSource === "GLB")).toBe(true);
  expect(result.units.every((unit) => unit.proceduralVisibleMeshCount === 0)).toBe(true);
  expect(result.units.every((unit) => unit.authoredVisibleMeshCount > 0)).toBe(true);

  // `?uiVerification=1` opens the debug-verify overlay, which is the large
  // panel that was covering the squad in the committed evidence. Close it and
  // let the scene settle before capturing.
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    if ((api.isVerifyOpen as () => boolean)()) (api.toggleVerify as () => void)();
    return 0;
  });
  await page.evaluate(() => { (window as ReviewWindow).frostbound?.step(0.05, 20, true); return 0; });

  /**
   * Occlusion is asserted, not eyeballed. The squad's projected screen box is
   * compared against every visible HUD element's client rect; the previous
   * evidence was accepted purely by looking at it, which is how a shot with a
   * debug panel across the subject got committed in the first place.
   */
  const framing = await page.evaluate(() => {
    const w = window as ReviewWindow;
    const game = (w.frostbound as unknown as { game: { s: Record<string, any> } }).game;
    const scene = game.s.scene;
    const camera = game.s.camera.camera;
    const engine = game.s.engine;
    const canvas = engine.getRenderingCanvas() as HTMLCanvasElement;
    const rw = engine.getRenderWidth();
    const rh = engine.getRenderHeight();
    const viewport = camera.viewport.toGlobal(rw, rh);
    const scaleX = canvas.clientWidth / rw;
    const scaleY = canvas.clientHeight / rh;
    const transform = scene.getTransformMatrix();

    // Project the authored warrior meshes, skeleton applied. Babylon is
    // bundled, not global, so the view-projection is applied by hand rather
    // than via BABYLON.Vector3.Project.
    const m = transform.m as ArrayLike<number>;
    const project = (v: { x: number; y: number; z: number }) => {
      const rx = v.x * m[0] + v.y * m[4] + v.z * m[8] + m[12];
      const ry = v.x * m[1] + v.y * m[5] + v.z * m[9] + m[13];
      const rw = v.x * m[3] + v.y * m[7] + v.z * m[11] + m[15];
      if (Math.abs(rw) < 1e-6) return null;
      const ndcX = rx / rw;
      const ndcY = ry / rw;
      return {
        x: (viewport.x + (1 + ndcX) * viewport.width * 0.5) * scaleX,
        y: (viewport.y + (1 - ndcY) * viewport.height * 0.5) * scaleY,
      };
    };
    const points: Array<{ x: number; y: number }> = [];
    for (const mesh of scene.meshes) {
      // Any LOD tier: at gameplay camera distance the squad is already on
      // LOD1/LOD2, so matching only LOD0 finds nothing and the occlusion
      // check would silently pass on an empty set.
      if (!/^unit\..*:LOD\d_PROD/.test(mesh.name)) continue;
      if (!mesh.isEnabled() || !mesh.isVisible) continue;
      mesh.refreshBoundingInfo({ applySkeleton: true });
      for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
        const p = project(corner);
        if (p) points.push(p);
      }
    }
    if (points.length === 0) return { projected: 0 };
    const box = {
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      top: Math.min(...points.map((p) => p.y)),
      bottom: Math.max(...points.map((p) => p.y)),
    };
    const canvasRect = canvas.getBoundingClientRect();
    const overlaps: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (element === canvas || element.contains(canvas)) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) continue;
      if (style.pointerEvents === "none" && Number(style.opacity) < 0.3) continue;
      const r = element.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      // Only leaf-ish panels; containers spanning the whole screen are the
      // HUD root, not something that visually covers the subject.
      if (r.width > canvasRect.width * 0.95 && r.height > canvasRect.height * 0.95) continue;
      const ex = { left: r.left - canvasRect.left, right: r.right - canvasRect.left, top: r.top - canvasRect.top, bottom: r.bottom - canvasRect.top };
      const hit = ex.left < box.right && ex.right > box.left && ex.top < box.bottom && ex.bottom > box.top;
      if (hit) overlaps.push(`${element.tagName.toLowerCase()}#${element.id || "-"}.${(element.className || "").toString().split(" ")[0] || "-"}`);
    }
    return { projected: points.length, box, overlaps, canvas: { w: canvas.clientWidth, h: canvas.clientHeight } };
  });

  expect(framing.projected, "the squad must be projectable on screen for the evidence shot").toBeGreaterThan(0);
  expect(framing.overlaps, `HUD elements cover the squad in warrior-squad.png: ${JSON.stringify(framing.overlaps)}`).toEqual([]);

  await page.screenshot({ path: resolve(evidenceRoot, "warrior-squad.png"), fullPage: false });
  // Real formal-gameplay evidence: the actual arena, arena lighting, the
  // gameplay camera and the real spawn path -- not the review turntable.
  await page.screenshot({ path: resolve(evidenceRoot, "warrior-gameplay.png"), fullPage: false });
  writeFileSync(resolve(outputRoot, "squad-framing.json"), `${JSON.stringify(framing, null, 2)}\n`, "utf8");
});

test("runs a real 9 Warrior + 12 Grunt pressure scenario with genuine engagement", async ({ page }) => {
  // Longer than the other tests: this one steps ~12s of engagement AND then
  // waits out a quiet render-loop window whose length is fixed by the
  // performance monitor's rolling average, not by convenience. Shortening
  // that window would invalidate the measurement, so the budget moves
  // instead. CI's software renderer needs the headroom; locally this runs in
  // roughly a quarter of it.
  test.setTimeout(360_000);
  const output = resolve(process.cwd(), process.env.WARRIOR_RUNTIME_OUTPUT ?? ".runtime/warrior-runtime");
  mkdirSync(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`); });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown> | undefined;
    return Boolean((api?.assetsReady as (() => boolean) | undefined)?.() && (api?.assetStatus as ((key: string) => { loaded: boolean }) | undefined)?.("warrior")?.loaded);
  }, { timeout: 90_000, polling: 100 });

  // §12: `uiVerification=1` opens the debug-verify overlay by default; that is
  // the "large debug panel" that used to occlude evidence screenshots. Close
  // it before spawning so captures show the formal gameplay camera cleanly.
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    if ((api.isVerifyOpen as () => boolean)()) (api.toggleVerify as () => void)();
  });

  const setup = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.grant as (wood: number, stone: number, gold: number) => void)?.(0, 0, 1000);
    (api.startStage as (id: string) => void)("stage-1");
    const spawnAlly = api.spawnAlly as (id: string, x: number, z: number) => unknown;
    const spawnEnemy = api.spawnEnemy as (id: string, x: number, z: number) => unknown;
    // Close enough that warriors (move speed 3.6, melee range 2.2) reach the
    // grunts inside the warm-up window instead of drifting for tens of
    // seconds before the pressure window even starts.
    for (const x of [-3, 0, 3]) spawnAlly("warrior", x, 0);
    for (const x of [-6, -2, 2, 6]) spawnEnemy("grunt", x, 5);
    return { unitCounts: (api.unitCounts as () => unknown)() };
  });

  // Real, un-scripted engagement: step in 1-second chunks (manual dt, not
  // wall-clock) and observe rather than force. `manualSteppingUnreliable`
  // records that FPS read during manual stepping is a stepping artefact, not
  // real player framerate (Warrior-W2 §11).
  const timeline: Array<{ simSeconds: number; meleeAttackers: number; warriorAlive: number; gruntAlive: number; allyCorpses: number }> = [];
  let meleeAttackObserved = false;
  let anyDeathObserved = false;
  let simSeconds = 0;
  // Sampled at 0.2s, not 1s: a MeleeAttack clip is shorter than a second, so
  // coarser sampling steps over swings and under-reports engagement.
  const CHUNK_SECONDS = 0.2;
  const DT = 0.05;
  const STEPS_PER_CHUNK = Math.round(CHUNK_SECONDS / DT);
  const WARMUP_CHUNKS = 10; // 2s warm-up
  const ENGAGEMENT_CHUNKS = 50; // 10s of real engagement, well over the 5s floor.
  const initial = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    return {
      warriorAlive: (api.allUnitsOf as (id: string) => unknown[])("warrior").length,
      gruntAlive: (api.allUnitsOf as (id: string) => unknown[])("grunt").length,
    };
  });
  for (let chunk = 0; chunk < WARMUP_CHUNKS + ENGAGEMENT_CHUNKS; chunk++) {
    const sample = await page.evaluate(({ dt, steps }) => {
      const w = window as ReviewWindow;
      const api = w.frostbound?.api() as Record<string, unknown>;
      w.frostbound?.step(dt, steps, false);
      const warriorUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
      const gruntUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt");
      const bodies = (api.allyBodies as () => { living: number; corpses: number }) ();
      return {
        meleeAttackers: warriorUnits.filter((u) => u.currentAuthoredAnimation === "MeleeAttack").length,
        warriorAlive: warriorUnits.length,
        gruntAlive: gruntUnits.length,
        allyCorpses: bodies.corpses,
      };
    }, { dt: DT, steps: STEPS_PER_CHUNK });
    simSeconds += CHUNK_SECONDS;
    timeline.push({ simSeconds, ...sample });
    if (sample.meleeAttackers > 0) meleeAttackObserved = true;
    if (sample.gruntAlive < initial.gruntAlive || sample.warriorAlive < initial.warriorAlive || sample.allyCorpses > 0) anyDeathObserved = true;
  }
  expect(simSeconds, "pressure engagement must run well past a 30-frame snapshot").toBeGreaterThanOrEqual(5);
  await page.evaluate(() => (window as ReviewWindow).frostbound?.step(0, 1, true));

  // Perf-counter self-consistency (Warrior-W2 §11): `perf.totalUnits` must
  // equal `perf.allies + perf.enemies` by construction, and `perf.allies`
  // (which counts lingering death-animation corpses, same as the world
  // registry) must equal an independently-computed living+corpse tally.
  const final = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    const warriorUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    const gruntUnits = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt");
    return {
      warriorGlbCount: warriorUnits.filter((unit) => unit.modelSource === "GLB").length,
      warriorProceduralVisible: warriorUnits.reduce((sum, unit) => sum + Number(unit.proceduralVisibleMeshCount ?? 0), 0),
      warriorLodDistribution: warriorUnits.reduce((distribution: Record<string, number>, unit) => {
        const lod = String(unit.currentLod ?? "LOD0");
        distribution[lod] = (distribution[lod] ?? 0) + 1;
        return distribution;
      }, {}),
      warriorAlive: warriorUnits.length,
      gruntAlive: gruntUnits.length,
      squadSummary: (api.squadSummary as () => unknown)(),
      unitCounts: (api.unitCounts as () => unknown)(),
      perf: (api.perf as () => { allies: number; enemies: number; totalUnits: number; fps: number; frameMs: number; drawCalls: number; activeMeshes: number; totalVertices: number })(),
      allyBodies: (api.allyBodies as () => { living: number; corpses: number; squads: number })(),
    };
  });

  // --- manual-step sample (NOT a performance measurement) ---------------
  // Kept only as a smoke signal that stepping renders at all. It is paced by
  // Playwright round-trips, not by requestAnimationFrame, so it says nothing
  // about player-facing framerate and is labelled as such in the artifact.
  const stepFps: number[] = [];
  for (let i = 0; i < 20; i++) {
    const fps = await page.evaluate(() => {
      const w = window as ReviewWindow;
      w.frostbound?.step(0.016, 1, true);
      return ((w.frostbound?.api() as Record<string, unknown>).perf as () => { fps: number })().fps;
    });
    stepFps.push(fps);
  }
  stepFps.sort((a, b) => a - b);
  const percentile = (values: number[], p: number): number => values[Math.min(values.length - 1, Math.floor(p * values.length))];

  // --- real render-loop sample ------------------------------------------
  // The engine's own requestAnimationFrame loop has been running throughout;
  // the phase above merely stepped the simulation on top of it. To get a
  // number that means something, stop stepping entirely and let the loop run
  // alone for longer than the monitor's rolling window.
  //
  // PerformanceMonitor.avgFps5s is computed over the last 5 seconds of frame
  // times, so after an 8s quiet window it contains only frames the render
  // loop produced by itself -- the manual-step frames have aged out. That is
  // why no accumulator reset is needed, and why the wait has to exceed the
  // window rather than merely being "long enough to feel safe".
  const RENDER_WINDOW_SECONDS = 8;
  await page.waitForTimeout(RENDER_WINDOW_SECONDS * 1000);
  const renderLoop = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    const perf = (api.perf as () => Record<string, number>)();
    return {
      avgFps5s: perf.avgFps5s,
      avgFps30s: perf.avgFps30s,
      lowFps1pct: perf.lowFps1pct,
      frameMs: perf.frameMs,
      simulationMs: perf.simulationMs,
      renderMs: perf.renderMs,
      drawCalls: perf.drawCalls,
      activeMeshes: perf.activeMeshes,
      totalVertices: perf.totalVertices,
      allies: perf.allies,
      enemies: perf.enemies,
      totalUnits: perf.totalUnits,
      hardwareScaling: perf.hardwareScaling,
      qualityLevel: String((api.quality as () => unknown)()),
    };
  });
  // The window must have actually produced frames, otherwise the numbers
  // describe a stalled loop rather than a fast one.
  expect(renderLoop.avgFps5s, "the real render loop must have produced frames during the sample window").toBeGreaterThan(0);
  expect(renderLoop.drawCalls, "draw calls must be observable in the real render loop").toBeGreaterThan(0);

  expect(final.warriorGlbCount, "every Warrior must remain GLB-backed through combat").toBe(9);
  expect(final.warriorProceduralVisible, "procedural visible mesh count must stay 0").toBe(0);
  expect(meleeAttackObserved, "at least one Warrior must be observed playing MeleeAttack during real engagement").toBe(true);
  expect(anyDeathObserved, "at least one full death lifecycle (ally or enemy) must occur during real engagement").toBe(true);
  expect(final.perf.totalUnits, "perf.totalUnits must equal perf.allies + perf.enemies").toBe(final.perf.allies + final.perf.enemies);
  expect(final.perf.allies, "perf.allies must equal the independently-tallied living+corpse ally count").toBe(final.allyBodies.living + final.allyBodies.corpses);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);

  // Not one of the 8 canonical evidence PNGs kept in the repo (Warrior-W2
  // §14) -- goes to the git-ignored runtime output dir, same as the other
  // pressure/lifecycle JSON artifacts.
  await page.screenshot({ path: resolve(output, "warrior-gameplay-pressure.png"), fullPage: false });
  writeFileSync(
    resolve(output, "pressure-result.json"),
    `${JSON.stringify(
      {
        setup,
        timeline,
        simSeconds,
        meleeAttackObserved,
        anyDeathObserved,
        final,
        // Two clearly separated datasets. Only `renderLoop` may be cited as
        // performance; `manualStep` exists to show stepping renders at all.
        renderLoop: {
          source: "requestAnimationFrame",
          windowSeconds: RENDER_WINDOW_SECONDS,
          // Being precise about which fields the window actually cleans:
          // avgFps5s covers a rolling 5s and is fully inside the quiet
          // window. avgFps30s and lowFps1pct read longer history that still
          // contains manual-step frames, so they are reported but must not
          // be cited. Instantaneous fields (frameMs, drawCalls, activeMeshes)
          // describe the most recent real frame and are fine.
          citable: ["avgFps5s", "frameMs", "simulationMs", "renderMs", "drawCalls", "activeMeshes", "totalVertices"],
          contaminated: ["avgFps30s", "lowFps1pct"],
          contaminationNote: `The frame-time history is longer than the ${RENDER_WINDOW_SECONDS}s quiet window, so any statistic spanning more than 5s still includes manual-step frames.`,
          ...renderLoop,
        },
        manualStep: {
          source: "frostbound.step via Playwright round-trips",
          usableAsPerformanceEvidence: false,
          note: "Paced by test round-trips, not requestAnimationFrame. Smoke signal that stepping renders; says nothing about player-facing framerate.",
          fps: stepFps,
          fpsP50: percentile(stepFps, 0.5),
          fpsP95: percentile(stepFps, 0.95),
        },
        consoleErrors,
        pageErrors,
        requestFailures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});

test("drives a real Warrior combat lifecycle: engage, single death, squad wipe, re-recruit", async ({ page }) => {
  test.setTimeout(180_000);
  const output = resolve(process.cwd(), process.env.WARRIOR_RUNTIME_OUTPUT ?? ".runtime/warrior-runtime");
  mkdirSync(output, { recursive: true });
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => { if (!request.url().includes("favicon")) requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? "unknown"}`); });
  await page.goto("http://127.0.0.1:4173/?uiVerification=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as ReviewWindow).frostbound), { timeout: 90_000 });
  await page.waitForFunction(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown> | undefined;
    return Boolean((api?.assetsReady as (() => boolean) | undefined)?.() && (api?.assetStatus as ((key: string) => { loaded: boolean }) | undefined)?.("warrior")?.loaded);
  }, { timeout: 90_000, polling: 100 });

  const squadSummary = (): Promise<Array<{ def: string; alive: boolean; aliveCount: number; size: number }>> =>
    page.evaluate(() => (((window as ReviewWindow).frostbound?.api() as Record<string, unknown>).squadSummary as () => Array<{ def: string; alive: boolean; aliveCount: number; size: number }>)());

  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.grant as (wood: number, stone: number, gold: number) => void)?.(0, 0, 1000);
    (api.startStage as (id: string) => void)("stage-1");
  });

  // --- A. Engage and attack: one Warrior squad vs. a Grunt within reach ----
  const stepChunk = async (dt: number, steps: number) => {
    await page.evaluate(({ dt, steps }) => (window as ReviewWindow).frostbound?.step(dt, steps, false), { dt, steps });
  };
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    const spawnAlly = api.spawnAlly as (id: string, x: number, z: number) => unknown;
    const spawnEnemy = api.spawnEnemy as (id: string, x: number, z: number) => unknown;
    spawnAlly("warrior", 0, 0);
    spawnEnemy("grunt", 0, 4);
  });
  const gruntInitialHp = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    return ((api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt")[0]?.hp as number) ?? 0;
  });
  // A MeleeAttack clip only occupies a fraction of a second, so the observer
  // has to sample faster than the swing. Stepping a full second at a time
  // (as the first version of this test did) steps straight over the attack
  // and reports "never attacked" while combat is demonstrably happening.
  let meleeSeenA = false;
  let gruntDamagedA = false;
  for (let i = 0; i < 60; i++) {
    await stepChunk(0.05, 4); // 0.2s per sample
    const state = await page.evaluate(() => {
      const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
      return {
        warriors: (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior"),
        grunts: (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt"),
      };
    });
    if (state.warriors.some((u) => u.currentAuthoredAnimation === "MeleeAttack")) meleeSeenA = true;
    if (state.grunts.length === 0 || state.grunts.some((g) => (g.hp as number) < gruntInitialHp)) gruntDamagedA = true;
    if (meleeSeenA && gruntDamagedA) break;
  }
  const afterEngage = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    const warriors = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    const grunts = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt");
    return {
      warriorGlb: warriors.every((u) => u.modelSource === "GLB"),
      warriorProceduralVisible: warriors.reduce((sum, u) => sum + Number(u.proceduralVisibleMeshCount ?? 0), 0),
      gruntHp: grunts.length > 0 ? (grunts[0].hp as number) : 0,
      gruntAlive: grunts.length > 0,
    };
  });
  expect(meleeSeenA, "a Warrior must play MeleeAttack while genuinely engaging a Grunt").toBe(true);
  expect(afterEngage.gruntHp < gruntInitialHp || !afterEngage.gruntAlive, "the engaged Grunt's HP must drop (or the Grunt must die)").toBe(true);
  expect(afterEngage.warriorGlb, "Warrior must remain GLB-backed through combat").toBe(true);
  expect(afterEngage.warriorProceduralVisible, "procedural visible mesh count must stay 0").toBe(0);

  // Clear the scene before the squad-scoped phases below.
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.killAllEnemies as () => void)();
    (api.killAllAllies as () => void)();
  });
  await stepChunk(0.05, 40);

  // --- B. Single squad member death ---------------------------------------
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.spawnAlly as (id: string, x: number, z: number) => unknown)("warrior", 0, 0);
  });
  await stepChunk(0.05, 10);
  const squadBefore = await squadSummary();
  const warriorSquadBefore = squadBefore.find((sq) => sq.def === "warrior");
  expect(warriorSquadBefore?.aliveCount, "freshly recruited Warrior squad must start at full size").toBe(3);
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.damageUnit as (defId: string, amount: number) => boolean)("warrior", 1e9);
  });
  let deathSeen = false;
  for (let i = 0; i < 30; i++) {
    await stepChunk(0.05, 4); // 0.2s per chunk, fine-grained around the death lifecycle
    const summary = await squadSummary();
    const squad = summary.find((sq) => sq.def === "warrior");
    if (squad && squad.aliveCount === 2) { deathSeen = true; break; }
  }
  expect(deathSeen, "single-member death must reduce squad aliveCount from 3 to 2").toBe(true);

  // --- C. Full squad death, clear, and re-recruit -------------------------
  await page.evaluate(() => (((window as ReviewWindow).frostbound?.api() as Record<string, unknown>).killAllAllies as () => void)());
  await stepChunk(0.05, 60); // let the death lifecycle for the remaining members finish
  const wiped = await squadSummary();
  const wipedWarriorSquad = wiped.find((sq) => sq.def === "warrior");
  // SquadManager.prune() disposes and removes a squad from the roster once
  // `!squad.alive && members.every(readyToRemove)` -- a wiped squad does not
  // linger with aliveCount 0, it disappears from squadSummary() entirely.
  // That full disappearance (not a lingering alive:false entry) is what
  // "squad 正常清除" means for this codebase.
  expect(wipedWarriorSquad, "a fully wiped Warrior squad must be pruned from the roster, not linger with aliveCount 0").toBeUndefined();

  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.spawnAlly as (id: string, x: number, z: number) => unknown)("warrior", 0, 0);
  });
  await stepChunk(0.05, 10);
  const reRecruited = await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    const units = (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior");
    return {
      count: units.length,
      allGlb: units.every((u) => u.modelSource === "GLB"),
      proceduralVisible: units.reduce((sum, u) => sum + Number(u.proceduralVisibleMeshCount ?? 0), 0),
    };
  });
  expect(reRecruited.count, "re-recruiting must rebuild a full 3-member Warrior squad").toBe(3);
  expect(reRecruited.allGlb, "the re-recruited squad must be GLB-backed").toBe(true);
  expect(reRecruited.proceduralVisible, "the re-recruited squad must have 0 procedural visible meshes").toBe(0);

  // The re-recruited squad can move and attack: send another Grunt in and
  // confirm the same engage/attack contract holds for the fresh instances.
  await page.evaluate(() => {
    const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
    (api.spawnEnemy as (id: string, x: number, z: number) => unknown)("grunt", 0, 4);
  });
  let meleeSeenC = false;
  let enemyDownedC = false;
  for (let i = 0; i < 60; i++) {
    await stepChunk(0.05, 4); // 0.2s per sample, same reason as phase A
    const state = await page.evaluate(() => {
      const api = (window as ReviewWindow).frostbound?.api() as Record<string, unknown>;
      return {
        warriors: (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("warrior"),
        grunts: (api.allUnitsOf as (id: string) => Array<Record<string, unknown>>)("grunt"),
      };
    });
    if (state.warriors.some((u) => u.currentAuthoredAnimation === "MeleeAttack")) meleeSeenC = true;
    if (state.grunts.length === 0 || state.grunts.some((g) => (g.hp as number) < 100)) enemyDownedC = true;
    if (meleeSeenC && enemyDownedC) break;
  }
  expect(meleeSeenC, "the re-recruited squad must play MeleeAttack in real combat").toBe(true);
  expect(enemyDownedC, "the re-recruited squad must actually damage the enemy it engages").toBe(true);

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  writeFileSync(
    resolve(output, "lifecycle-result.json"),
    `${JSON.stringify(
      {
        engage: { meleeSeen: meleeSeenA, gruntDamaged: gruntDamagedA, gruntInitialHp, afterEngage },
        singleDeath: { warriorSquadBefore, deathSeen },
        fullWipe: { wipedWarriorSquad },
        reRecruit: reRecruited,
        reEngage: { meleeSeen: meleeSeenC, enemyDowned: enemyDownedC },
        consoleErrors,
        pageErrors,
        requestFailures,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
});
