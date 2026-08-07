#!/usr/bin/env node
/**
 * Fetch the official MakeHuman system assets pack and record its provenance.
 *
 * Deliberately NOT part of any build. This runs once, by hand, when the asset
 * pack needs acquiring or re-verifying. MakeHuman's own guidance is that the
 * secondary mirror has tighter traffic limits, so hammering both on every
 * build would be rude and slow.
 *
 *   node scripts/fetch-mpfb-system-assets.mjs            # mirror1, then mirror2
 *   node scripts/fetch-mpfb-system-assets.mjs --primary  # mirror1 only
 *
 * Two things the first attempt got wrong, both fixed here:
 *
 * - It buffered the whole 267 MB response with `arrayBuffer()` before writing.
 *   Two of those, on a ~250 KB/s link, against a 40-minute timeout: the
 *   process was killed part-way through the second mirror and never wrote its
 *   report, which then read as "still downloading" when nothing was running.
 *   This streams to disk and hashes as it goes.
 * - It ran both mirrors in one unbounded shot. Each mirror is now attempted
 *   once, with its own timeout, and a failure on the secondary is recorded
 *   rather than retried -- per MakeHuman's note about its traffic limits.
 */
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

const OUT = join(process.cwd(), ".runtime", "mpfb", "system-assets");
const SOURCE_PAGE = "https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html";
// Both resolved from the source page's own hyperlinks, never guessed.
const MIRRORS = {
  mirror1: "https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip",
  mirror2: "https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip",
};
const PER_MIRROR_TIMEOUT_MS = 55 * 60 * 1000;
const primaryOnly = process.argv.includes("--primary");

mkdirSync(OUT, { recursive: true });

async function download(label, url) {
  const dest = join(OUT, `${label}.zip`);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_MIRROR_TIMEOUT_MS);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!response.ok) return { url, status: response.status, error: `HTTP ${response.status}` };
    const digest = createHash("sha256");
    let bytes = 0;
    const source = Readable.fromWeb(response.body);
    source.on("data", (chunk) => {
      bytes += chunk.length;
      digest.update(chunk);
      if (bytes % (32 * 1024 * 1024) < chunk.length) {
        process.stdout.write(`  ${label}: ${(bytes / 1048576).toFixed(0)} MB\n`);
      }
    });
    await pipeline(source, createWriteStream(dest));
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      bytes,
      onDiskBytes: statSync(dest).size,
      sha256: digest.digest("hex"),
      path: dest,
      seconds: Math.round((Date.now() - started) / 1000),
    };
  } catch (error) {
    return { url, error: String(error).slice(0, 200), seconds: Math.round((Date.now() - started) / 1000) };
  } finally {
    clearTimeout(timer);
  }
}

const report = { retrievedAt: new Date().toISOString(), sourcePage: SOURCE_PAGE, mirrors: {} };

console.log(`mirror1 -> ${MIRRORS.mirror1}`);
report.mirrors.mirror1 = await download("mirror1", MIRRORS.mirror1);
console.log(`mirror1: ${report.mirrors.mirror1.error ?? `${report.mirrors.mirror1.bytes} bytes in ${report.mirrors.mirror1.seconds}s`}`);

if (primaryOnly) {
  report.mirrors.mirror2 = { url: MIRRORS.mirror2, skipped: "--primary requested" };
} else if (report.mirrors.mirror1.error) {
  // No point hammering the rate-limited secondary to compare against nothing.
  report.mirrors.mirror2 = { url: MIRRORS.mirror2, skipped: "primary failed; nothing to compare against" };
} else {
  console.log(`mirror2 -> ${MIRRORS.mirror2}`);
  report.mirrors.mirror2 = await download("mirror2", MIRRORS.mirror2);
  console.log(`mirror2: ${report.mirrors.mirror2.error ?? `${report.mirrors.mirror2.bytes} bytes in ${report.mirrors.mirror2.seconds}s`}`);
}

const a = report.mirrors.mirror1;
const b = report.mirrors.mirror2;
report.mirrorsAgree = Boolean(a?.sha256 && b?.sha256 && a.sha256 === b.sha256 && a.bytes === b.bytes);
report.provenance = report.mirrorsAgree
  ? "dual-mirror: bytes and SHA-256 identical across both official mirrors"
  : a?.sha256
    ? "single-mirror: official source page + primary official domain; secondary unavailable or not compared"
    : "FAILED: no official archive retrieved";
report.installCandidate = a?.sha256 ? a.path : null;

writeFileSync(join(OUT, "download-report.json"), `${JSON.stringify(report, null, 2)}\n`);
if (a?.sha256) writeFileSync(join(OUT, "archive-sha256.txt"), `${a.sha256}  makehuman_system_assets_cc0.zip\n`);

console.log(`\nmirrorsAgree=${report.mirrorsAgree}`);
console.log(report.provenance);
if (!a?.sha256) process.exit(1);
