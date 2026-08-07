/**
 * Appearance variants for the human faction.
 *
 * The whole point of this module is that it is the *only* place that knows a
 * human character has a gendered appearance. Combat, AI, stats, targeting and
 * collision must never branch on it — they know roles ("hero", "warrior") and
 * nothing else. A `if (male)` anywhere in the simulation is a bug, because the
 * moment one exists the two variants stop being the same unit.
 *
 * The split is deliberate:
 *
 *   role              what the unit *is*      → drives every gameplay number
 *   appearanceVariant what the unit looks like → drives which GLB is loaded
 *
 * so `hero + male` and `hero + female` are one unit with two skins, not two
 * units. `resolveHumanAsset` is the seam, and it is the only function that
 * turns the pair into an asset key.
 */
export type HumanAppearanceVariant = "male" | "female";

export const HUMAN_APPEARANCE_VARIANTS: readonly HumanAppearanceVariant[] = ["male", "female"];

/**
 * Two separate states, because they mean different things.
 *
 * CANDIDATE: per-variant assets exist and can be loaded in an isolated review
 * path. They are not production art and must not reach normal gameplay --
 * right now they are bare MPFB bodies with a placeholder material.
 *
 * READY: a human has looked at the variants and approved them. Only then does
 * the gameplay asset resolver start returning them, and only then does the
 * legacy single-appearance asset stop being what players see.
 *
 * Collapsing these into one set is how an unreviewed nude base ends up in the
 * shipping build, so the promotion is deliberately a separate edit.
 */
export const VARIANT_CANDIDATE_ROLES: ReadonlySet<string> = new Set(["hero"]);
export const VARIANT_READY_ROLES: ReadonlySet<string> = new Set<string>();

export interface HumanAppearance {
  readonly role: string;
  readonly appearanceVariant: HumanAppearanceVariant;
}

/**
 * Asset key for a role/appearance pair.
 *
 * Returns the legacy key untouched for roles without variant assets, so this
 * can be called unconditionally from the asset layer without every call site
 * needing to know how far the migration has got.
 */
export function resolveHumanAsset(role: string, variant: HumanAppearanceVariant): string {
  return VARIANT_READY_ROLES.has(role) ? `${role}_${variant}` : role;
}

/**
 * Asset key for the isolated review path. Returns null when the role has no
 * candidate, so a review screen can say so rather than silently showing the
 * production asset and implying the candidate was fine.
 */
export function resolveHumanCandidateAsset(
  role: string,
  variant: HumanAppearanceVariant,
): string | null {
  return VARIANT_CANDIDATE_ROLES.has(role) ? `${role}_${variant}` : null;
}

/** True when the role has a distinct asset per appearance variant. */
export function hasAppearanceVariants(role: string): boolean {
  return VARIANT_READY_ROLES.has(role);
}

/**
 * Deterministic appearance for a spawned unit.
 *
 * Not `Math.random()`: squads have to be reproducible for tests, for replays
 * and for any save that stores a seed. Not strict alternation either — a line
 * of male/female/male/female reads as a checkerboard rather than as people.
 *
 * This is a hash of (seed, index), which gives an unbiased 50/50 over a run of
 * spawns while being fixed for any given pair.
 */
export function pickAppearance(seed: number, index: number): HumanAppearanceVariant {
  // xorshift-style mix; integer-only so it behaves identically everywhere.
  let hash = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2545f491) >>> 0;
  hash ^= hash >>> 13;
  return (hash & 1) === 0 ? "male" : "female";
}

/**
 * The appearance the player chose for their Hero.
 *
 * Stored separately from any gameplay state on purpose: changing it must
 * change which model loads and nothing else. There is no `PlayerController`
 * variant, no stat table lookup, and no branch anywhere in the simulation.
 */
const HERO_APPEARANCE_KEY = "frostbound.heroAppearance";

export function loadHeroAppearance(storage: Pick<Storage, "getItem"> | null = safeStorage()): HumanAppearanceVariant {
  const stored = storage?.getItem(HERO_APPEARANCE_KEY);
  return stored === "female" || stored === "male" ? stored : "male";
}

export function saveHeroAppearance(
  variant: HumanAppearanceVariant,
  storage: Pick<Storage, "setItem"> | null = safeStorage(),
): void {
  storage?.setItem(HERO_APPEARANCE_KEY, variant);
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Private-mode browsers throw on access rather than returning null.
    return null;
  }
}
