import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * First Babylon runtime evidence for the MPFB human candidates.
 *
 * Isolated review path -- `?humanCandidateReview=1` returns before the game is
 * constructed, so nothing here touches the production Hero. The candidates are
 * bare bodies with a placeholder material and every frame is labelled as such.
 */
const OUT = resolve(process.cwd(), "reports/human-candidates/babylon");

interface ReviewWindow extends Window {
  __humanCandidateReview?: {
    ready: boolean; variant: string; assetKey: string | null; loaded: boolean;
    meshCount: number; triangleCount: number; boneCount: number;
    animations: string[]; currentAnimation: string; materialNames: string[];
    boundingBox: { min: number[]; max: number[]; height: number };
    camera: string; error: string | null; materialNote: string;
  };
  frostboundHumanCandidate?: {
    setVariant(variant: string): Promise<void>;
    setCamera(name: string): void;
    play(name: string, normalized?: number): void;
    render(): void;
  };
}

const SHOTS: Array<{ camera: string; animation?: string; phase?: number; label: string }> = [
  { camera: "front", label: "front" },
  { camera: "three-quarter", label: "three-quarter" },
  { camera: "side", label: "side" },
  { camera: "head", label: "head" },
  { camera: "hand", label: "hand-open" },
  { camera: "hand", animation: "MeleeAttack", phase: 0.25, label: "grip" },
  { camera: "three-quarter", animation: "MeleeAttack", phase: 0.25, label: "melee-windup" },
  { camera: "three-quarter", animation: "MeleeAttack", phase: 0.6, label: "melee-impact" },
  { camera: "three-quarter", animation: "RangedAttack", phase: 0.5, label: "ranged" },
  { camera: "front", animation: "Walk", phase: 0.3, label: "walk" },
];

test("captures Babylon runtime evidence for both human candidates", async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.setViewportSize({ width: 900, height: 1200 });
  await page.goto("http://127.0.0.1:4173/?humanCandidateReview=1", { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => (window as ReviewWindow).__humanCandidateReview?.ready === true, { timeout: 90_000 });

  const captured: Array<Record<string, unknown>> = [];
  for (const variant of ["male", "female"]) {
    await page.evaluate((v) => (window as ReviewWindow).frostboundHumanCandidate!.setVariant(v), variant);
    await page.waitForFunction(
      (v) => {
        const s = (window as ReviewWindow).__humanCandidateReview;
        return s?.loaded === true && s.variant === v;
      }, variant, { timeout: 60_000 });

    const state = await page.evaluate(() => (window as ReviewWindow).__humanCandidateReview!);
    // These are the claims the frames are supposed to support.
    expect(state.loaded, `${variant} candidate must load in Babylon`).toBe(true);
    expect(state.error).toBeNull();
    expect(state.boneCount, `${variant} must carry the game_engine rig`).toBeGreaterThanOrEqual(50);
    expect(state.animations.length, `${variant} must ship all seven clips`).toBeGreaterThanOrEqual(7);
    expect(state.triangleCount).toBeGreaterThan(1000);

    for (const shot of SHOTS) {
      await page.evaluate(({ camera, animation, phase }) => {
        const api = (window as ReviewWindow).frostboundHumanCandidate!;
        api.setCamera(camera);
        if (animation) api.play(animation, phase ?? 0);
        api.render();
      }, shot);
      await page.waitForTimeout(260);
      // Hide everything that is not the canvas. index.html ships the HUD
      // statically and the canvas is nested, so a body-children sweep in the
      // app keeps its wrapper and the HUD with it.
      await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (el === canvas || el.contains(canvas) || el.id === "candidate-label") continue;
          (el as HTMLElement).style.display = "none";
        }
      });
      // Label burned in, read back from live state rather than typed.
      await page.evaluate((label) => {
        const s = (window as ReviewWindow).__humanCandidateReview!;
        const el = document.getElementById("candidate-label") ?? document.createElement("div");
        el.id = "candidate-label";
        el.style.cssText = "position:fixed;left:14px;bottom:14px;z-index:99999;font:600 13px/1.45 ui-monospace,monospace;color:#eef3ff;background:rgba(8,12,20,.86);padding:7px 11px;border-radius:5px;white-space:pre;pointer-events:none";
        el.textContent = `hero_${s.variant} (CANDIDATE) — Babylon runtime — ${s.camera} — ${s.currentAnimation} — ${label}\n${s.materialNote}`;
        if (!el.isConnected) document.body.appendChild(el);
      }, shot.label);
      const file = `hero_${variant}-${shot.label}.png`;
      await page.screenshot({ path: resolve(OUT, file) });
      captured.push({ file, variant, ...shot, boneCount: state.boneCount, triangles: state.triangleCount });
    }
    captured.push({ variant, state });
  }

  writeFileSync(resolve(OUT, "capture-state.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), captured, pageErrors: errors }, null, 2)}\n`, "utf8");
  expect(errors, "no page errors during candidate review").toEqual([]);
});
