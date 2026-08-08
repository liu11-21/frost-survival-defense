# Faction art — current state and the work queue

Written 2026-08-06 against `art/warrior-production-w1` @ `be9e4ee`+.
This file is the handoff. It exists so the next session does not have to
re-derive any of it, and so nothing here is claimed that the frames and
validators do not support.

## The standing direction

Two factions that a player separates by **silhouette, species, body
structure, animation attitude and VFX identity — colour last**.

- **Our side: human winter survivors.** Human proportions, cold-weather
  kit, profession-legible gear. Not one humanoid in different paint.
- **Their side: monsters.** Not humans recoloured. Four *structurally
  different* species are required, not parameter variants of one
  template:
  1. small swarming / crawling thing
  2. long-armed bipedal hunter
  3. quadruped or heavily armoured beast
  4. flying alien
- **Boss:** its own body plan. Not a scaled elite.
- **Elite and boss carry their own effect**, and it must read as light
  coming *out of the creature* — ribcage core, fissures, bone plating,
  ice spikes — not as a ring drawn around its feet.

## Verified green (do not re-do)

| | |
|---|---|
| HEAD | `d58ef31` |
| Hero Runtime Verification | success |
| Warrior Runtime Verification | success |
| Playwright | 7/7 |
| `npm run art:validate` | clean, 42 assets |
| `npm run art:validate:hero` | pass |
| Library | ~111k triangles all LODs (audit baseline 458,874) |

### Hero static contract, and why two checks were rewritten
Six checks were failing since the Batch 5 Hero rewrite. Four were root
extras that rewrite dropped — `orientationContract`, `feetGrounded`,
`commercialStage`/`commercialIteration`, `heroR7Stage`/`heroR7Iteration`
— restored in `build_hero.py`. Two encoded the pre-merge architecture and
could not coexist with it: `lodIdentity` required a separate mesh per
body part per tier, `triangleBudget` required 18,000–20,500 triangles at
LOD0 against the merged asset's 2,756. Both were **rewritten in
`scripts/validate-hero-commercial.mjs`, not loosened** — `triangleBudget`
now asserts a budget *plus* a strictly descending chain at ≤70% per tier,
which is stronger than a fixed window because it checks the tiers
actually decimate. If a future session sees these and thinks they were
weakened, read the comments in that file first.

### Evidence is now asserted, not hoped for
`tests/faction-evidence.spec.ts` spawns one representative of every
monster form plus the boss into a real run alongside eight human
recruits, and asserts **before capturing** that enemies are alive, the
enemy report lists them, an elite or boss is among them, and ≥6 humans
are on the field. It fails rather than emitting a misleading frame.
Output lands in `reports/faction-evidence/` with `capture-state.json`
recording the counts at shutter time. It also captures the same camera
with the aura suppressed and restored.

This exists because the previous faction frame was taken after all twelve
enemies were dead and showed one side alone in an empty arena.

## The work queue, in order

Ordered by how much each one moves "can a player tell these apart".

### 1. Aura rework — `src/effects/MonsterAura.ts`
Currently a torus at the feet, a sphere, and orbiting polyhedra. A close
capture confirms it reads as a debug gizmo, and at boss scale the ring
dominates the whole frame. Replace with light that belongs to the body:
a core inside the ribcage, emissive fissures along the dorsal spines and
bone plates that the monster builder already produces, and frost at the
feet as a low broken skirt rather than a complete geometric ring. Remove
the regular orbital crystals or make their motion irregular.

### 2. Four monster species — `scripts/blender/build_units.py`
`MONSTER_FORMS` (swarm / stalker / brute / elite / boss) currently feed
one `add_monster_body`, so every enemy is the same creature at different
settings. Split into distinct builders; the rig must stay the same
eighteen bones (`BONE_ORDER`) because every clip and runtime contract
hangs off it, but the geometry and weighting are free.

### 3. Boss body plan
Its own builder, not `MONSTER_FORMS["boss"]` scaling.

### 4. Warrior LOD0 — DONE
The head is now a human skull in a new `skin` surface -- cheekbone widest,
jaw narrowing to a chin -- under a separate open helm (bowl, rolled
`blade` rim, crest, nape guard, cheek guards), with a `beard` mass at the
jaw. Both new surfaces sit in atlas bands that previously duplicated
their column's first surface, so this cost no material and no texture
against caps of 3 and 1.

Garment cut lines are real geometry: an off-centre front closure (leather
under-facing, wool storm flap lapping over it, toggles down the edge), a
shoulder yoke, a three-panel coat skirt with front and side vents and a
longer back panel, hip pocket flaps, sleeve-head seams, elbow patches,
vambraces, knee patches and bloused breeches. Boots are lofted along +Z
via the new `MeshBuilder.sweep_z` -- heel, seat, arch, ball, toe with a
sole slab and a lofted steel toe cap -- replacing three tapered boxes.

LOD0 2,756 -> 6,544 tris (cap 7,500). LOD1 2,926 (cap 3,200), LOD2 968
(cap 1,100), a 45%/33% decimation chain. That was reached with the new
`authoring.thin()`, which drops **rings** rather than points: lowering
point counts rounds every section back toward the circle the superellipse
exponent exists to escape, so the silhouette goes soft everywhere at
once, while a torso or a boot can lose half its rings and keep its
outline.

### 5. Close-range evidence discipline — DONE
`tests/warrior-runtime.spec.ts` ended with a bare screenshot that
inherited whatever the last `select()` had left, which was
`select("front", "Idle", 2, 0.5)` a hundred and fifty lines earlier. It
landed in the CI artifact under the same name as the LOD0 file in
`reports/`, so `warrior-front.png` shipped as front art evidence while
actually being LOD2.

Now: filenames state the tier (`warrior-LOD0-<camera>.png`), the LOD is
asserted per frame, and the caption burned into the image is read back
out of live review state rather than typed, so it cannot describe a frame
that was not taken. `close-range-evidence.json` records the set.

A **`head` camera** was added to `WarriorReviewMode`. Every other preset
frames the whole figure, at which point the head is sixty pixels and any
claim about a face is unfalsifiable. It earned itself immediately: it
showed the first attempt's eyes and brow sitting 17mm *inside* the skull,
rendering as a blank plane -- the masked look the pass existed to remove,
reintroduced by arithmetic. `ready`/`visible`/`uiOccluded` are computed
against the whole-body box, so the head frame skips those and gets its
own check that the review HUD is clear of the centre of the canvas.

### 6. Known open
- The reframed melee capture still has HUD over the fight;
  `visibility: hidden` on `document.body` children does not reach it.
- Facility props (headframe, sawblade, banner mast) are thin enough that
  LOD1/LOD2 drop them at gameplay distance.
- Pipeline ceiling unmoved: procedural primitives plus a generated atlas.
  Sculpted source and baked PBR sets are not reachable by parameter work
  in `build_*.py`.

## Traps already paid for — do not re-learn

**Blender exits 0 from `--background --python` even when the script
fails.** The `.glb` keeps its previous contents, `art:validate` passes,
Playwright passes, and a commit goes out claiming work the artifact does
not contain. Four shapes, three now guarded:

1. rename breaks an import → `scripts/validate-build-scripts.mjs`
2. runtime exception → `scripts/run-blender.mjs`, traceback match
3. compile-time error, which prints **no** traceback → same runner,
   matching the exception line itself
4. builds fine, wrong shape → **nothing catches this**; only looking does

**`spawnEnemy(id, x, z)` needs coordinates.** Calling it with the id
alone puts the unit at NaN and crashes the next `step()`. This was
misreported once as a pre-existing engine bug; it is a caller error.

**Screen-luminance figures are framing-dependent.** Two probes with
different camera offsets read the same facilities at 86 and 114. Only
before/after pairs from one probe are comparable.

**A gesture can be authored perfectly and point the wrong way.**
`CharacterFactory.reviewGestureReach` reports each hand's offset in the
rig root's own frame; the Hero suite asserts every attack clip drives the
right hand past +0.12 forward. Two clips had shipped built entirely
behind the back with a valid GLB and a green suite.

**The preview serves `dist/`, not `public/`.** Rebuilding a `.glb` and
then running Playwright verifies the *previous* asset, silently and with
every test green. This cost a full review iteration: two rounds of
geometry fixes were judged against renders of the build before them, and
"the fixes landed" was said about frames that did not contain them. After
any `run-blender.mjs`, run `npm run build` before capturing. It is the
same failure family as the four below -- a green pipeline describing an
artifact that is not the one on disk.

**Verifying a Blender export inside Blender can pass while the GLB is
wrong.** The two-hand grip bug was only caught by an independent forward
kinematics evaluator over the exported glTF.
