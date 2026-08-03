import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const baseUrl = urlIndex >= 0 ? args[urlIndex + 1] : "http://127.0.0.1:5181";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const reviewRoot = resolve(process.cwd(), "reports/art-previews/hero-commercial/review");
const sequenceRoot = resolve(reviewRoot, "sequence");
await mkdir(sequenceRoot, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: "new",
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
  protocolTimeout: 900000,
  defaultViewport: { width: 1120, height: 630 },
});

const page = await browser.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console.error: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
page.on("requestfailed", (request) => {
  const failure = request.failure();
  if (failure && !request.url().includes("favicon")) problems.push(`requestfailed: ${request.url()} ${failure.errorText}`);
});

const reviewUrl = baseUrl.includes("?") ? `${baseUrl}&heroReview=1` : `${baseUrl}?heroReview=1`;
console.log(`> loading ${reviewUrl}`);
await page.goto(reviewUrl, { waitUntil: "networkidle2", timeout: 90000 });
await page.waitForFunction(() => Boolean(window.frostbound), { timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.frostbound?.api()?.heroReview),
  { timeout: 90000 },
);
await page.waitForFunction(
  () => {
    const loading = document.getElementById("loadingScreen");
    return !loading || loading.classList.contains("hidden");
  },
  { timeout: 90000 },
);
await page.evaluate(() => window.frostbound?.stopLoop());

const setReview = (camera, animation, lod) =>
  page.evaluate(
    (state) => {
      const review = window.frostbound?.api()?.heroReview;
      review?.setCamera(state.camera);
      review?.setAnimation(state.animation);
      review?.setLod(state.lod);
      window.frostbound?.step(0.016, 4, true);
    },
    { camera, animation, lod },
  );

const capture = async (name, state, frameCount = 5, directory = reviewRoot) => {
  await setReview(state.camera, state.animation, state.lod);
  await page.evaluate((frames) => window.frostbound?.step(0.016, frames, true), frameCount);
  const metadata = await page.evaluate(() => window.frostbound?.api()?.heroReview?.capture());
  if (!metadata) throw new Error(`Hero review metadata missing for ${name}`);
  const screenshot = resolve(directory, `${name}.png`);
  await page.screenshot({ path: screenshot });
  const record = {
    captureId: name,
    capturedAt: new Date().toISOString(),
    url: reviewUrl,
    screenshot: `reports/art-previews/hero-commercial/${directory === sequenceRoot ? "review/sequence/" : "review/"}${name}.png`,
    ...metadata,
  };
  await writeFile(resolve(directory, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(`  ${name}: ${metadata.modelSource} ${metadata.cameraMode} ${metadata.animation} LOD${metadata.lod} bbox=${metadata.screenSpaceBoundingBox.width}x${metadata.screenSpaceBoundingBox.height}`);
  if (metadata.captureMode !== "heroReview=1" || metadata.modelSource !== "GLB" || metadata.proceduralVisibleMeshCount !== 0 || metadata.authoredVisibleMeshCount <= 0) {
    throw new Error(`Invalid Hero review metadata for ${name}: ${JSON.stringify(metadata)}`);
  }
  if (metadata.uiOccluded || metadata.screenSpaceBoundingBox.width < 40 || metadata.screenSpaceBoundingBox.height < 80) {
    throw new Error(`Hero is not sufficiently visible for ${name}: ${JSON.stringify(metadata)}`);
  }
  return record;
};

const captures = [];
captures.push(await capture("hero-review-gameplay", { camera: "gameplay", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-front", { camera: "front", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-side", { camera: "left-side", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-back", { camera: "back", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-three-quarter", { camera: "three-quarter", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-close-up", { camera: "close-up", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-melee", { camera: "three-quarter", animation: "MeleeAttack", lod: 0 }, 3));
captures.push(await capture("hero-review-ranged", { camera: "three-quarter", animation: "RangedAttack", lod: 0 }, 3));
captures.push(await capture("hero-review-death", { camera: "three-quarter", animation: "Death", lod: 0 }, 3));
captures.push(await capture("hero-review-lod0", { camera: "front", animation: "Idle", lod: 0 }));
captures.push(await capture("hero-review-lod1", { camera: "front", animation: "Idle", lod: 1 }));
captures.push(await capture("hero-review-lod2", { camera: "front", animation: "Idle", lod: 2 }));

const sequence = [];
const sequenceStates = [
  ["idle", "Idle"],
  ["walk", "Walk"],
  ["run", "Run"],
  ["melee", "MeleeAttack"],
  ["ranged", "RangedAttack"],
  ["hit", "Hit"],
  ["death", "Death"],
];
let frame = 0;
for (const [label, animation] of sequenceStates) {
  for (let i = 0; i < 3; i++) {
    frame += 1;
    sequence.push(await capture(`sequence-${String(frame).padStart(3, "0")}-${label}-${i + 1}`, {
      camera: "three-quarter",
      animation,
      lod: 0,
    }, 6, sequenceRoot));
  }
}
await writeFile(resolve(sequenceRoot, "manifest.json"), `${JSON.stringify({
  captureMode: "heroReview=1",
  description: "Continuous runtime frames in order: Idle -> Walk -> Run -> MeleeAttack -> RangedAttack -> Hit -> Death.",
  frames: sequence,
}, null, 2)}\n`, "utf8");

await browser.close();
if (problems.length > 0) {
  console.error(`Hero review browser problems (${problems.length}):`);
  for (const problem of problems) console.error(` - ${problem}`);
  process.exitCode = 1;
}
console.log(`> wrote ${captures.length} required screenshots and ${sequence.length} sequence frames`);
