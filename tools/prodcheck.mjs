/**
 * Production build smoke check.
 *
 * Loads the built bundle from `vite preview`, lets it run on its own render
 * loop (no debug hooks exist in a production build), drives the player with
 * real key input and fails on any console error.
 *
 *   npm run build && npx vite preview --port 4173
 *   node tools/prodcheck.mjs --url http://localhost:4173
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const args = process.argv.slice(2);
const idx = args.indexOf("--url");
const url = idx >= 0 ? args[idx + 1] : "http://localhost:4173";
const outDir = resolve(process.cwd(), "playtest-shots");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const problems = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
  protocolTimeout: 600000,
  defaultViewport: { width: 960, height: 540 },
});

const page = await browser.newPage();
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("requestfailed", (r) => {
  const f = r.failure();
  if (f && !r.url().includes("favicon")) problems.push(`requestfailed: ${r.url()} ${f.errorText}`);
});

console.log(`> loading production bundle at ${url}`);
await page.goto(url, { waitUntil: "networkidle2", timeout: 90000 });
await page.waitForFunction(
  () => {
    const el = document.getElementById("loadingScreen");
    return !el || el.classList.contains("hidden");
  },
  { timeout: 120000 },
);
console.log("> production bundle booted");

console.log("> debug hook must NOT exist in a production build");
const hasHook = await page.evaluate(() => Boolean(window.frostbound));
if (hasHook) problems.push("dev-only debug hook leaked into the production build");

// real key input on the real render loop
await page.keyboard.down("KeyA");
await new Promise((r) => setTimeout(r, 20000));
await page.keyboard.up("KeyA");
await new Promise((r) => setTimeout(r, 8000));
await page.screenshot({ path: resolve(outDir, "prod-01-walking.png") });

await page.keyboard.down("KeyW");
await page.keyboard.down("ShiftLeft");
await new Promise((r) => setTimeout(r, 10000));
await page.keyboard.up("ShiftLeft");
await page.keyboard.up("KeyW");
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: resolve(outDir, "prod-02-sprint.png") });

await page.setViewport({ width: 1280, height: 720 });
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: resolve(outDir, "prod-03-resized.png") });

await browser.close();

console.log("\n=========================================");
if (problems.length === 0) {
  console.log("PROD CHECK PASSED — bundle boots, renders and takes input with no console errors.");
  process.exit(0);
}
console.log(`PROD CHECK FAILED — ${problems.length} problem(s):`);
for (const p of problems) console.log(` - ${p}`);
process.exit(1);
