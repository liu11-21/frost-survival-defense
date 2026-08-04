# Warrior-W2 status — handoff for the other agent

Written by Claude Code, 2026-08-04. Read this before touching anything Warrior.

## Ownership has changed

The `CLAUDE_CODE_WARRIOR_W2_HANDOFF.md` split gave Blender/GLB/`build_warrior.py`
to Codex and forbade Claude Code from touching them. **The user cancelled that
split on 2026-08-04** and gave Claude Code full authority over modelling,
animation and skill VFX. Claude Code has therefore edited files that document
previously listed as Codex-owned.

If you are Codex: do not re-run your own Warrior asset work on top of this
without reading the diff first. `scripts/blender/build_warrior.py` was rewritten,
not patched.

## Branch state

- Branch: `art/warrior-production-w1`
- HEAD at time of writing: `c138bea0965ad8d54c7f340be291c3d223c4a82a`
- Draft PR #3 → base `production/hero-r6`. Still Draft, still unmerged.
- Hero (PR #2, `production/hero-r6`) untouched.
- Grunt and every other unit untouched. Grunt remains not started.

## What changed this round

### 1. Modelling language: lathe → explicit cross-sections

W1 built the body from `lathe()` at `seg=80` — bodies of revolution with
circular cross-sections. That is the direct cause of the "high-segment lathe /
turned toy" finding; it was not a texturing or lighting problem.

`MeshBuilder.sweep()` now lofts explicit per-ring cross-sections, and
`section()` generates superellipses with **independent front and back depth**.
Surfaces therefore have flat planes with rounded corners and are not
symmetric about the coronal plane.

Rebuilt on that basis: torso (broad chest / tucked waist / flared hem), head
(nine explicit skull rings + hood brim + cheek guards), fur collar (open shawl
via `MeshBuilder.band()`, capped at the arc ends — W1's collar read as a torus
because it *was* a closed ring), arms and legs (14-point sections with real
elbow/wrist and hip/knee/ankle transitions), boots (three layers: ankle cuff,
foot upper with toe extension, wider tapered sole), pauldron (shallow skirting
plate, not a wedge).

### 2. Rigid ice axe — the W1 blocker

W1 skinned every axe vertex `{hand.L: 0.5, hand.R: 0.5}`, so the weapon
stretched between the hands. This was found by decoding the GLB's
`JOINTS_0`/`WEIGHTS_0` accessors directly, then encoded as a validator rule.

The axe is now weighted **100% to `hand.R`** and carries all seven required
components: blade, rear ice pick, eye/connector, solid handle, upper grip,
lower grip, pommel. The shaft axis is authored to pass through the right
hand's bind position and is kicked outward so the head clears the arm in a
front view. The left hand is brought onto the shaft by animation, per contract.

`npm run art:validate:warrior` reports `rigid-hand.R` on all three LODs.

### 3. Review lighting — the reason nothing could be judged

The review parks the Warrior at the world origin, which is exactly where the
arena's furnace point light sits (2.6 m up, **intensity 130**). Every W1
evidence frame was lit from directly overhead at close range: cap, collar and
shoulders clipped to pure white, coat crushed to near-black.

`WarriorReviewMode` now saves render state on enter and restores on dispose:
furnace muted to 0, key light 1.45 (slightly cool), hemispheric fill 0.62,
bloom/tone-mapping/vignette off, exposure 0.92, dark matte review ground.
Gameplay lighting and the Hero review are untouched — both Hero tests pass.

### 4. Two runtime bugs found and fixed along the way

- **`WarriorReviewMode.capture()` never refreshed skinned bounding boxes.**
  Every animation's `screenSpaceBoundingBox` silently described the *rest
  pose*. Idle and Death-final bounds were bit-for-bit identical. Every
  visible/bounds assertion in the suite had been checking a frozen box.
  Fixed with `refreshBoundingInfo({ applySkeleton: true })`.
- **`reviewWeaponEvidence` missed the axe entirely.** Babylon's glTF loader
  splits a multi-primitive mesh into `<name>_primitive0/1`, so an exact-name
  lookup for `LOD0_PROD_axe` returned nothing and `axeWorldCenter` was `null`.

### 5. Test sampling defect (mine, from the previous round)

The lifecycle and pressure tests advanced a full second between observations
while a `MeleeAttack` clip lasts well under that, so the observer stepped over
swings and concluded the squad never attacked. Direct instrumentation showed
combat *was* happening throughout (grunt HP 100 → 90 → 80 → 20 → dead in the
same window). Earlier passes were luck of timing. Sampling is now 0.2 s.

## Current contract

| Item | LOD0 | LOD1 | LOD2 | Hard cap |
|---|---:|---:|---:|---|
| Triangles | 1,828 | 1,110 | 702 | 7,500 / 3,200 / 1,100 |
| Primitives | 5 | 4 | 2 | 6 / 4 / 2 |

Materials 3, embedded textures 1, bones 18, GLB 1.17 MB (cap 2.5 MB),
animations 6 (`Idle`, `Walk`, `Run`, `MeleeAttack`, `Hit`, `Death`).

Triangle counts sit **below** the doc's suggested 4,500–7,000 band. Per the
doc's own instruction this was not padded with loops: the shape is carried by
the cross-sections, not by segment count. If a human reviewer wants more
density, add it as *form* (more rings, more silhouette features), not as
subdivision.

## Verified

`npm run typecheck`, `npm run build`, `npm run art:validate`,
`npm run art:validate:warrior`, `git diff --check`, all four
`tests/warrior-runtime.spec.ts` tests, plus `tests/hero-runtime.spec.ts` and
`tests/hero-gameplay-review.spec.ts` as Hero regression cover. All pass locally.

Measured evidence: axe travel between wind-up and impact ≈ 1.07 world units;
`hand.R` grip distance ≈ 0.17 and near-constant (as expected for a rigid
attachment); `hand.L` 0.50–0.71 (was 0.92–1.10); pose deltas 0.03–0.64.

GitHub Actions is still the remote gate and had not been observed for these
commits at the time of writing.

## NOT done — still open

1. **Skill-cast VFX is not started.** `src/effects/` (VFXManager,
   BurstDefinitions, CombatFeedback, ParticleSprites) and
   `src/hero/HeroSkills.ts` are untouched this round. This was part of the
   user's request and remains outstanding.
2. **Human art review still required.** The doc's completion bar has not been
   met and `Ready for human Warrior art review` must not be claimed yet.
   Honest assessment: this is a large, verifiable improvement over W1 — the
   lathe symmetry, torus collar, box boots, split-hand axe and blown-out
   lighting are all genuinely gone — but the asset is generated from
   procedural Python primitives and that approach has a real ceiling well
   short of "commercial quality" character art. Closing that gap needs
   authored/sculpted geometry, not more parameters in `build_warrior.py`.
3. The pauldron still reads heavier than intended from some angles.
4. `hand.L` contact is measured against the axe bounding-box centre, a coarse
   proxy — the axe has no separate upper/lower grip locator node yet.

## Prohibitions still in force

Do not modify Hero. Do not start Grunt or Archer. Do not change gameplay
balance (Warrior HP 400, Attack 10, Squad 3, Recruit 15, Move 3.6, Scale 0.95).
Do not merge PR #2 or PR #3, do not mark them Ready, do not push to `main`,
do not force-push or rewrite history, do not open PR #4.
