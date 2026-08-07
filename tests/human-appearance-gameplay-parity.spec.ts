import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  HUMAN_APPEARANCE_VARIANTS,
  hasAppearanceVariants,
  pickAppearance,
  resolveHumanAsset,
  resolveHumanCandidateAsset,
} from "../src/character/HumanAppearance";

/**
 * Appearance must never reach gameplay.
 *
 * The requirement is that `hero + male` and `hero + female` are one unit with
 * two skins. The way that breaks in practice is not a deliberate decision --
 * it is one `if (variant === "female")` added later inside a damage or speed
 * calculation, which nobody notices until the two are measurably different.
 *
 * So this suite gates the architecture rather than sampling numbers: the
 * simulation is asserted to have no way of knowing, which makes divergence
 * impossible instead of merely absent today.
 */
const SRC = resolve(process.cwd(), "src");

/** Directories that own simulation: stats, damage, targeting, AI, movement. */
const SIMULATION_DIRS = ["combat", "game", "systems", "ai", "units", "hero"];
/** Tokens that would mean gameplay is branching on appearance. */
const FORBIDDEN = [
  /\bappearanceVariant\b/,
  /\bHumanAppearanceVariant\b/,
  /["'`]female["'`]/,
  /["'`]male["'`]/,
  /\bisFemale\b/,
  /\bisMale\b/,
  /\bgender\b/i,
];

function sourceFiles(dir: string): string[] {
  const root = join(SRC, dir);
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(join(dir, entry.name));
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

test("appearance variants resolve to different assets for the same role", () => {
  expect(HUMAN_APPEARANCE_VARIANTS).toEqual(["male", "female"]);

  // Candidates exist and are reachable ONLY through the review path.
  expect(resolveHumanCandidateAsset("hero", "male")).toBe("hero_male");
  expect(resolveHumanCandidateAsset("hero", "female")).toBe("hero_female");

  // Nothing is approved yet, so gameplay still resolves to the legacy asset.
  // This is the gate that keeps an unreviewed bare body out of the build.
  expect(hasAppearanceVariants("hero")).toBe(false);
  const male = resolveHumanAsset("hero", "male");
  const female = resolveHumanAsset("hero", "female");
  expect(male).toBe("hero");
  expect(female).toBe("hero");

  // A role without variant assets keeps its legacy key, so the asset layer can
  // call this unconditionally while the migration is part-way through.
  expect(resolveHumanAsset("medic", "female")).toBe("medic");
  expect(resolveHumanAsset("medic", "male")).toBe("medic");
});

test("appearance selection is deterministic and unbiased", () => {
  // Same seed and index must always give the same answer -- replays and saves
  // depend on it, and so does any test that spawns a squad.
  for (let index = 0; index < 40; index++) {
    expect(pickAppearance(1234, index)).toBe(pickAppearance(1234, index));
  }
  // Different seeds must actually produce different squads, or the "random"
  // is decorative.
  const squadA = Array.from({ length: 24 }, (_, i) => pickAppearance(7, i)).join("");
  const squadB = Array.from({ length: 24 }, (_, i) => pickAppearance(8, i)).join("");
  expect(squadA).not.toBe(squadB);

  // Roughly even over a large sample, and not a checkerboard.
  let female = 0;
  const total = 4000;
  for (let i = 0; i < total; i++) if (pickAppearance(99, i) === "female") female += 1;
  expect(female / total).toBeGreaterThan(0.42);
  expect(female / total).toBeLessThan(0.58);

  const first = Array.from({ length: 20 }, (_, i) => pickAppearance(3, i));
  const alternating = first.every((v, i) => (i === 0 ? true : v !== first[i - 1]));
  expect(alternating, "strict alternation reads as a checkerboard, not a squad").toBe(false);
});

test("the simulation cannot branch on appearance", () => {
  const offenders: string[] = [];
  for (const dir of SIMULATION_DIRS) {
    for (const file of sourceFiles(dir)) {
      // The appearance module itself and anything under an explicit
      // `appearance` or `visual` name is allowed to know.
      if (/HumanAppearance|Appearance|Visual/i.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN) {
        if (pattern.test(text)) {
          offenders.push(`${file.replace(SRC, "src")}: ${pattern}`);
        }
      }
    }
  }
  expect(
    offenders,
    "gameplay code must not reference appearance or gender; resolve assets through resolveHumanAsset instead",
  ).toEqual([]);
});

test("no gameplay numbers are keyed by appearance", () => {
  // Stat tables are keyed by role. If a variant key ever appears in one, the
  // two appearances have stopped being the same unit.
  const definitions = sourceFiles("units").concat(sourceFiles("combat"));
  for (const file of definitions) {
    const text = readFileSync(file, "utf8");
    for (const variant of HUMAN_APPEARANCE_VARIANTS) {
      expect(
        new RegExp(`hero_${variant}\\s*:`).test(text),
        `${file} defines stats for hero_${variant}; stats must be keyed by role only`,
      ).toBe(false);
    }
  }
});
