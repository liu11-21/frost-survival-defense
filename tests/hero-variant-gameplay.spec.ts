import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), "reports/hero-gameplay");

for (const variant of ["male", "female"] as const) {
  test(`hero ${variant} in real gameplay`, async ({ page }) => {
    test.setTimeout(180_000);
    mkdirSync(OUT, { recursive: true });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    // Separate page per variant: a full load, never a same-page swap.
    await page.goto(`http://127.0.0.1:4173/?uiVerification=1&heroVariant=${variant}`,
      { waitUntil: "domcontentloaded", timeout: 90_000 });
    // The hero exists before the GLB preload resolves, so waiting on its mere
    // presence catches it while the procedural fallback is still active. Wait
    // for the authored asset to actually be attached.
    await page.waitForFunction(
      () => (window as any).frostbound?.game?.s?.hero?.modelSource === "GLB",
      null, { timeout: 90_000 });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => {
      const h = (window as any).frostbound.game.s.hero;
      const names = [...(h.authoredMeshes || [])].map((m: any) => m.name);
      return { modelSource: h.modelSource, authored: h.authoredVisibleMeshCount,
               procedural: h.proceduralVisibleMeshCount, names,
               anims: [...(h.authoredAnimationNames || [])].length };
    });
    expect(info.modelSource).toBe("GLB");
    expect(info.procedural).toBe(0);
    expect(info.anims).toBe(7);
    expect(info.names.some((n: string) => n.includes(`hero_${variant}`))).toBe(true);
    const other = variant === "male" ? "female" : "male";
    expect(info.names.some((n: string) => n.includes(`hero_${other}`))).toBe(false);

    // Actually enter a level: the menu screenshot proves the asset bound but
    // shows no character.
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")]
        .find((b) => /第一關/.test(b.textContent || ""));
      (btn as HTMLButtonElement | undefined)?.click();
    });
    await page.waitForFunction(() => (window as any).frostbound.snapshot().inMenu === false,
      null, { timeout: 30_000 });
    await page.waitForTimeout(2500);
    // Drop the verification overlay so the frame shows the game, not the HUD
    // panel that only exists because uiVerification is on.
    await page.evaluate(() => {
      // Hide everything that is NOT the canvas or one of its ancestors. Matching
      // the overlay by its text caught a parent that also contained the canvas,
      // and the frame came out empty.
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el === canvas || el.contains(canvas)) continue;
        (el as HTMLElement).style.display = "none";
      }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(OUT, `hero-${variant}-gameplay.png`) });
    // Melee close-up: drive the authored clip, then frame it.
    await page.evaluate(() => {
      const h = (window as any).frostbound.game.s.hero;
      h.setReviewAnimation("MeleeAttack"); h.seekReviewAnimation(0.2);
      (window as any).frostbound.renderReviewFrame?.();
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(OUT, `hero-${variant}-melee.png`) });
    expect(errors, "no page errors").toEqual([]);
  });
}
