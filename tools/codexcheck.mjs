/**
 * Main-menu codex checks: the entry point, the five categories, the search box,
 * navigation and the return path.
 */

export async function runCodexChecks(ctx) {
  const { check, shot, page } = ctx;
  console.log("\n> codex");

  const opened = await page.evaluate(() => {
    const btn = document.querySelector("[data-codex]");
    if (!btn) return { ok: false, reason: "no codex button on the main menu" };
    const started = performance.now();
    btn.click();
    return {
      ok: true,
      ms: performance.now() - started,
      tabs: [...document.querySelectorAll(".codex-tab")].map((t) => t.textContent),
      items: document.querySelectorAll(".codex-item").length,
      detail: document.querySelector(".codex-detail")?.textContent ?? "",
    };
  });
  check("the main menu has a codex entry point", opened.ok, opened.reason ?? "");
  check("the codex opens without stalling", (opened.ms ?? 999) < 400, `${(opened.ms ?? 0).toFixed(0)}ms`);
  check(
    "the codex has all five categories",
    (opened.tabs ?? []).join(",") === "友方兵種,敵方單位,建築設施,資源,戰鬥機制",
    JSON.stringify(opened.tabs),
  );
  check("the codex opens on a populated list", (opened.items ?? 0) >= 7, `items=${opened.items}`);
  check("the codex shows a detail pane", (opened.detail ?? "").length > 40, (opened.detail ?? "").slice(0, 40));
  await shot("v4-codex");

  const counts = await page.evaluate(() => {
    const out = {};
    for (const tab of document.querySelectorAll(".codex-tab")) {
      tab.click();
      out[tab.textContent] = document.querySelectorAll(".codex-item").length;
    }
    return out;
  });
  // v5 added 3 allies (engineer, musketeer, frostmage) and 4 enemies
  // (breacher, icearmor, commander, bomber): hero + 9 allies, 11 enemies.
  check("every ally including the hero is listed", counts["友方兵種"] === 10, JSON.stringify(counts));
  check("all ten enemy tiers plus the boss are listed", counts["敵方單位"] === 11, JSON.stringify(counts));
  check("all twelve buildings are listed", counts["建築設施"] === 12, JSON.stringify(counts));
  check("all three resources are listed", counts["資源"] === 3, JSON.stringify(counts));
  check("the combat mechanics are documented", counts["戰鬥機制"] >= 8, JSON.stringify(counts));

  const bossPage = await page.evaluate(() => {
    for (const tab of document.querySelectorAll(".codex-tab")) {
      if (tab.textContent === "敵方單位") tab.click();
    }
    const boss = [...document.querySelectorAll(".codex-item")].find((i) => i.textContent.includes("寒霜巨像"));
    boss?.click();
    return document.querySelector(".codex-detail")?.textContent ?? "";
  });
  check("the boss page lists all three phases", /第一階段/.test(bossPage) && /第二階段/.test(bossPage) && /第三階段/.test(bossPage));
  check("the boss page documents the slam", /震地/.test(bossPage), bossPage.slice(0, 60));
  check("the boss page documents its siege multiplier", /對建築倍率/.test(bossPage));

  const search = await page.evaluate(() => {
    const input = document.querySelector("#codex-q");
    if (!input) return { ok: false };
    input.value = "盾兵";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const after = document.querySelector("#codex-q");
    return {
      ok: true,
      items: document.querySelectorAll(".codex-item").length,
      first: document.querySelector(".codex-item")?.textContent ?? "",
      keptFocusValue: after?.value ?? "",
    };
  });
  check("the codex search filters", search.ok && search.items > 0 && /盾兵/.test(search.first), JSON.stringify(search));
  check("the search box keeps its text", search.keptFocusValue === "盾兵", search.keptFocusValue);

  const empty = await page.evaluate(() => {
    const input = document.querySelector("#codex-q");
    input.value = "zzzznothing";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return document.querySelector(".codex-empty")?.textContent ?? "";
  });
  check("an empty search says so rather than breaking", /沒有符合/.test(empty), empty);

  const stepped = await page.evaluate(() => {
    const input = document.querySelector("#codex-q");
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const firstTitle = document.querySelector(".codex-detail h2")?.textContent ?? "";
    document.querySelector("[data-next]")?.click();
    const nextTitle = document.querySelector(".codex-detail h2")?.textContent ?? "";
    document.querySelector("[data-prev]")?.click();
    const backTitle = document.querySelector(".codex-detail h2")?.textContent ?? "";
    return { firstTitle, nextTitle, backTitle };
  });
  check("next moves to another entry", stepped.nextTitle !== stepped.firstTitle, JSON.stringify(stepped));
  check("previous comes back", stepped.backTitle === stepped.firstTitle, JSON.stringify(stepped));

  const escaped = await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    return {
      codexGone: document.querySelectorAll(".codex-tab").length === 0,
      onMenu: Boolean(document.querySelector("[data-endless]")),
    };
  });
  check("Esc leaves the codex", escaped.codexGone);
  check("Esc returns to the main menu", escaped.onMenu);
}
