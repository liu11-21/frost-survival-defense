/**
 * Static check that every Blender build script can still resolve what it
 * imports from its sibling modules.
 *
 * Why this exists
 * ---------------
 * `art:validate` validates the *artifacts* in public/assets, not the pipeline
 * that produces them. When `build_units.py` was rewritten, the names
 * `add_armature_clip` and `make_skeleton` changed, and `build_hero.py` —
 * which imported both — started failing with an ImportError. Nothing caught
 * it: `hero.glb` was already on disk, so the asset validator and both Hero
 * Playwright suites kept passing against a stale artifact for several
 * commits while the script could no longer run at all.
 *
 * Actually running the scripts would need Blender and minutes per asset, so
 * this does the cheap half: parse each script's `from <sibling> import ...`
 * statements and confirm every imported name is defined at module level in
 * the target. That is exactly the failure above, caught in milliseconds and
 * with no Blender dependency.
 *
 * It deliberately does not try to type-check signatures — a changed arity is
 * not detectable this way, and pretending otherwise would be worse than not
 * claiming it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const dir = resolve(process.cwd(), "scripts/blender");
const files = readdirSync(dir).filter((f) => f.endsWith(".py"));

/** Module-level `def name(` / `class name(` / `NAME = ` bindings. */
function exportedNames(source) {
  const names = new Set();
  for (const line of source.split("\n")) {
    let m = /^(?:def|class)\s+([A-Za-z_]\w*)/.exec(line);
    if (m) { names.add(m[1]); continue; }
    m = /^([A-Za-z_]\w*)\s*(?::[^=]+)?=/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

const sources = new Map();
for (const file of files) sources.set(file.replace(/\.py$/, ""), readFileSync(join(dir, file), "utf8"));

const problems = [];
for (const [module, source] of sources) {
  // `from sibling import a, b` and the parenthesised multi-line form.
  const re = /^from\s+([A-Za-z_]\w*)\s+import\s+(\(([^)]*)\)|[^\n#]+)/gm;
  let match;
  while ((match = re.exec(source)) !== null) {
    const target = match[1];
    if (!sources.has(target)) continue; // stdlib or bpy, not ours
    // Strip comments per line before splitting on commas. The parenthesised
    // form routinely carries a `# noqa: E402` on its opening line, which
    // otherwise leaks into the first imported name and reports a phantom
    // failure.
    const imported = (match[3] ?? match[2])
      .split("\n")
      .map((line) => line.replace(/#.*$/, ""))
      .join(" ")
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const available = exportedNames(sources.get(target));
    for (const name of imported) {
      if (name === "*") continue;
      if (!available.has(name)) problems.push(`${module}.py imports '${name}' from ${target}.py, which does not define it`);
    }
  }
}

const checked = [...sources.keys()].length;
if (problems.length > 0) {
  console.error(`build-script import check FAILED (${checked} scripts):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`build-script import check passed (${checked} scripts)`);
