import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const script = process.argv[2];
const args = process.argv.slice(3);
if (!script) {
  console.error("Usage: node scripts/run-blender.mjs scripts/blender/<script>.py [args]");
  process.exit(1);
}

function findBlender() {
  const configured = process.env.BLENDER_PATH;
  if (configured && existsSync(configured)) return configured;
  const command = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(command, ["blender"], { encoding: "utf8" });
  const found = result.status === 0 ? result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : undefined;
  if (found && existsSync(found)) return found;

  // A newly installed user-scoped Blender may not be visible to this already
  // running terminal. Search common roots dynamically instead of committing a
  // version-specific absolute path into the project.
  const roots = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Blender Foundation") : "",
    "C:\\Program Files\\Blender Foundation",
    "C:\\Program Files (x86)\\Blender Foundation",
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const candidates = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name, "blender.exe"));
    for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  }
  return "blender";
}

const blender = findBlender();
const probe = spawnSync(blender, ["--version"], { encoding: "utf8" });
if (probe.status !== 0) {
  console.error("Blender was not found. Install Blender LTS from https://www.blender.org/download/ or set BLENDER_PATH to blender.exe.");
  console.error("Windows example: $env:BLENDER_PATH='C:\\Program Files\\Blender Foundation\\Blender 4.x\\blender.exe'");
  process.exit(2);
}

const result = spawnSync(blender, ["--background", "--python", join(process.cwd(), script), "--", ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
