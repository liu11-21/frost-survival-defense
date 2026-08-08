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
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
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
// From the mirror's own content-length header.
const EXPECTED_BYTES = 280737770;
const primaryOnly = process.argv.includes("--primary");

mkdirSync(OUT, { recursive: true });

async function download(label, url) {
  const dest = join(OUT, `${label}.zip`);
  const started = Date.now();
  // Resume. The mirror delivers ~11 KB/s to this machine and the archive is
  // 267 MB, so a single uninterrupted transfer would need about six and a
  // half hours -- longer than any one run gets. The server answers Range
  // requests with 206 and `accept-ranges: bytes`, so each run appends to what
  // the last one left and progress accumulates instead of being thrown away.
  let already = existsSync(dest) ? statSync(dest).size : 0;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_MIRROR_TIMEOUT_MS);
  try {
    const headers = already > 0 ? { Range: `bytes=${already}-` } : {};
    const response = await fetch(url, { redirect: "follow", signal: controller.signal, headers });
    if (already > 0 && response.status !== 206) {
      // The server ignored the range; start clean rather than corrupt the file
      // by appending a second copy of the whole archive onto a partial one.
      already = 0;
    }
    if (!response.ok && response.status !== 206) {
      return { url, status: response.status, error: `HTTP ${response.status}`, bytesOnDisk: already };
    }
    const total = already + Number(response.headers.get("content-length") || 0);
    let received = 0;
    const source = Readable.fromWeb(response.body);
    source.on("data", (chunk) => {
      received += chunk.length;
      if (received % (16 * 1024 * 1024) < chunk.length) {
        process.stdout.write(`  ${label}: ${((already + received) / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB
`);
      }
    });
    await pipeline(source, createWriteStream(dest, already > 0 ? { flags: "a" } : {}));

    const bytes = statSync(dest).size;
    const complete = EXPECTED_BYTES > 0 ? bytes === EXPECTED_BYTES : false;
    const result = {
      url,
      finalUrl: response.url,
      status: response.status,
      resumedFrom: already,
      bytes,
      expectedBytes: EXPECTED_BYTES,
      complete,
      seconds: Math.round((Date.now() - started) / 1000),
      path: dest,
    };
    if (!complete) {
      result.note = `incomplete: ${bytes} of ${EXPECTED_BYTES} bytes; re-run to resume`;
      return result;
    }
    // Hash only once the file is whole. Hashing incrementally across resumed
    // runs would produce a digest of the last chunk, not of the archive.
    const digest = createHash("sha256");
    await pipeline(createReadStream(dest), async function* (chunks) {
      for await (const chunk of chunks) { digest.update(chunk); yield chunk; }
    }, async function* (chunks) { for await (const _ of chunks) { /* drain */ } });
    result.sha256 = digest.digest("hex");
    return result;
  } catch (error) {
    return {
      url,
      error: String(error).slice(0, 200),
      bytesOnDisk: existsSync(dest) ? statSync(dest).size : 0,
      resumable: true,
      seconds: Math.round((Date.now() - started) / 1000),
    };
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
} else if (report.mirrors.mirror1.error || !report.mirrors.mirror1.complete) {
  // No point hammering the rate-limited secondary to compare against nothing.
  report.mirrors.mirror2 = { url: MIRRORS.mirror2, skipped: "primary not yet complete; nothing to compare against" };
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
if (!a?.sha256) {
  console.log(`primary on disk: ${(a?.bytes ?? a?.bytesOnDisk ?? 0)} / ${EXPECTED_BYTES} bytes -- re-run to resume`);
  process.exit(1);
}
