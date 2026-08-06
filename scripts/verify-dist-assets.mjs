#!/usr/bin/env node
/**
 * Verify that what `dist/` serves is what `public/` holds.
 *
 * This exists because of a specific, repeated, expensive mistake. The preview
 * server and every Playwright run read `dist/`, but the Blender pipeline writes
 * `public/`. Rebuilding a `.glb` and then running the suite therefore verifies
 * the *previous* asset -- silently, with every test green and every validator
 * passing. It cost a full review cycle once: two rounds of geometry fixes were
 * judged against renders of the build before them, and "the fixes landed" was
 * said about frames that did not contain them.
 *
 * No amount of care prevents that, because nothing about it looks wrong. So it
 * is a check instead: hash both trees and refuse to agree that a run is
 * meaningful when they disagree.
 *
 *   node scripts/verify-dist-assets.mjs             # all model assets
 *   node scripts/verify-dist-assets.mjs hero.glb    # just one
 *
 * Exit code 1 means `npm run build` has not been run since the last asset
 * rebuild, and any screenshot taken from this dist is evidence about an older
 * asset.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PUBLIC_ROOT = join(ROOT, "public", "assets", "models");
const DIST_ROOT = join(ROOT, "dist", "assets", "models");
const only = process.argv.slice(2);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : entry.name.endsWith(".glb") ? [full] : [];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const sources = walk(PUBLIC_ROOT).filter((p) => !only.length || only.some((n) => p.endsWith(n)));
if (!sources.length) {
  console.error(only.length ? `no matching .glb under public/ for: ${only.join(", ")}` : "no .glb found under public/assets/models");
  process.exit(1);
}

const rows = sources.map((source) => {
  const rel = relative(PUBLIC_ROOT, source);
  const dist = join(DIST_ROOT, rel);
  if (!existsSync(dist)) return { rel, state: "MISSING_IN_DIST", publicSha: sha256(source), distSha: null };
  const publicSha = sha256(source);
  const distSha = sha256(dist);
  return {
    rel,
    state: publicSha === distSha ? "MATCH" : "STALE",
    publicSha,
    distSha,
    publicMtime: statSync(source).mtime.toISOString(),
    distMtime: statSync(dist).mtime.toISOString(),
  };
});

const bad = rows.filter((r) => r.state !== "MATCH");
console.log(JSON.stringify({ checked: rows.length, mismatched: bad.length, assets: rows }, null, 2));

if (bad.length) {
  console.error("");
  for (const row of bad) console.error(`  ${row.state}  ${row.rel}`);
  console.error("");
  console.error("dist/ does not match public/. Run `npm run build`, then re-capture.");
  console.error("Any screenshot taken from this dist describes an older asset.");
  process.exit(1);
}
console.log(`\ndist matches public for all ${rows.length} model assets.`);
