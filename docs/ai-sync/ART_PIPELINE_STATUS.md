# Art pipeline status — handoff

Written 2026-08-05. Read `docs/art/PRODUCTION_STANDARD.md` for the rules this
work follows and the batch plan it belongs to. Hand-authored; the `ai:sync`
generator does not overwrite `*_STATUS.md`.

## Where the library is

| | At audit | Now |
|---|---:|---:|
| LOD0 triangles (42 assets) | 458,874 | **70,972** |
| Mesh nodes | ~2,000+ | **316** |
| Primitives | ~2,832 (units alone) | **446** (whole library) |
| Embedded images | ~350+ | **52** |

Every one of the 42 assets still passes `npm run art:validate`.

## Batches done

- **0 — foundation.** `scripts/blender/authoring.py` holds the shared
  geometry language (`MeshBuilder.sweep/band/box/prism`, `section`), lifted
  verbatim out of the Warrior rebuild. `build_warrior.py` imports it rather
  than owning it, so the reference implementation cannot drift from the
  standard. Proof the extraction was behaviour-preserving: the rebuilt
  `warrior.glb` was byte-identical.
- **1 — 24 roster units.** `build_units.py` rewritten. 95→5.9 mesh nodes,
  118→10.1 primitives, 13→3 materials, 12→1 image per unit. Roles now differ
  by **archetype** (light / medium / heavy / caster / commander / flying),
  which changes height, shoulder-to-waist ratio, torso depth, stance and
  hunch — not palette. Casters get a robe instead of legs, flyers get wings.
- **3 — furnace + 11 facilities.** Furnace moved to its own generator
  (`build_furnace.py`, 94→9 nodes, 124→12 prims). All 7 economy and 4 attack
  facilities rebuilt (~548→76 nodes, ~740→87 prims), differing by footprint,
  wall height, roof style and role prop.
- **4 — turret_basic and wall_gate.** 33→7 and 52→5 nodes.

## The rule that governs facility merging

Static structure merges into one mesh per LOD. **Nodes the runtime drives
stay separate, and that is a contract, not a preference:**

- `yawPivot` / `pitchPivot` — the game aims emplacements by rotating these
- `muzzle` — projectiles spawn here
- `gateDoorLeft` / `gateDoorRight` — swung on their own hinge pivots
- `gateCollider` / `friendlyPassTrigger` — queried by gameplay
- `workPart` / `productionCore` — rotated and pulsed by the game
- `heatCore` / `furnaceCrown` / `emitter` — animated and used as a VFX origin

Scale was held to the previous assets in every case, so placement, collision
and firing offsets did not have to move.

## Repeated substitution worth knowing

Individually placed masonry blocks (10 on the furnace, 16 on the wall) were
replaced by staggered courses painted into the atlas. Cheaper, and it reads
better, because the joints follow the surface's curve and batter instead of
being boxes stuck onto a flat face.

## Still open

- **Batch 5** — Hero is at R7 and predates this standard (27 nodes, 29
  primitives, 18,080 LOD0 triangles — the largest single asset left).
- **Batch 6** — resource props. Their contract names every harvest stage as
  its own node (`resource_canopy0/1/2`, `resource_ore0/1/2`, …), so merging
  cannot cut node count here. The available win is materials 8→3 and images
  7→1, not draw calls.
- ~~**Batch 7**~~ — **done.** `SKILL_SHAPE` in `CombatFeedback` varies spread,
  wave count and cadence, vertical vs ground-borne, and linger per skill, each
  matched to what the skill does to the simulation. `infiniteFirepower` gets no
  ground wave or scorch at all, because it touches no ground. Verified by
  counting visible effect meshes at peak; `seismicWave` casts through the same
  path but was not visually inspected, because it only auto-casts.
- **Depth passes.** Batches 1, 3 and 4 each had one authoring pass. Silhouettes
  are separated and contracts hold, but none went through the
  rewrite → look → iterate loop the Warrior did, and the facilities were not
  inspected one by one.
- **The ceiling has not moved.** This is still procedural primitives plus a
  generated atlas. See §2 of the standard: crossing into real commercial
  character art needs sculpted source and baked PBR sets, and no further
  parameter work in `build_*.py` gets there.

## Close-range modelling pass (2026-08-06)

Seven items, each found by looking at a real gameplay frame and each
verified the same way before moving on. Not one of them would have been
caught by a test.

| | What was wrong | Commit |
|---|---|---|
| 1 | Faces were a blank plane with two painted slits | `3242ded` |
| 2 | Pauldron was one smooth dome; belt had no buckle | `236fece` |
| 3 | Boots were two flat boxes -- skis, on all 25 figures | `fbf82ee` |
| 4 | Shield had no rim; the Hero's cape was a flat signboard | `9464c83` |
| 5 | Bow was four stacked boxes; dagger had no guard | `1aba5d8` |
| 6 | Arms ended in a mitten | `5f51067` |
| 7 | Enemies were the same colour as allies | `45829e9` |

Cost: 97,690 -> 110,720 triangles across all LODs, against 458,874 at the
original audit.

## The stale-artifact trap, all four shapes

This cost more time than any modelling work, so do not re-learn it.

Blender exits **0** from `--background --python` even when the script
fails. The `.glb` on disk keeps its previous contents, `art:validate`
passes, the Playwright suites pass, and the commit goes out claiming work
the artifact does not contain. It happened three times in one session.

1. **Rename breaks an import.** `build_hero.py` imported names that
   `build_units.py` no longer had. Caught by
   `scripts/validate-build-scripts.mjs`, which resolves every
   cross-module import statically.
2. **Runtime exception.** A weight dict passed where a weight function
   was wanted. Caught by `scripts/run-blender.mjs`, which now captures
   Blender's output and fails on it.
3. **Compile-time error.** An `IndentationError` produces *no*
   `Traceback` header, because the module never starts executing -- so
   the first version of the run-blender guard sailed straight past it and
   `5f51067` shipped a commit message that was wrong about the roster.
   The guard now matches the exception line itself.
4. **Builds fine, wrong shape.** Nothing catches this. It is the entire
   reason for the close-range pass above.

Both guards were verified in both directions: clean build exits 0, the
same build with the defect re-injected exits 1.

## Assertions that encode a defect rather than a number

- `CharacterFactory.reviewGestureReach` reports each hand's offset in the
  rig root's own frame, forward positive along the local +Z that is the
  gameplay heading. The Hero suite asserts every clip whose name says it
  attacks drives the right hand past +0.12. Two clips had shipped
  authored entirely behind the back -- the Hero's RangedAttack and the
  roster's Cast -- with a valid GLB, a correct silhouette and a green
  suite. Bone-local transforms cannot show this: they are relative to the
  parent bone and say nothing about which way the body points.
- `validate-build-scripts.mjs` additionally fails any clip whose name
  says it strikes if no `upper_arm` key reaches forward, catching the
  same defect in the source before a build.
- Hero screen-bounds readability is asserted on the box **diagonal**, not
  height. The old height floor had never once been evaluated against a
  real animated pose, because the bounding box was never refreshed for
  the skeleton.

## Lighting, and why the palette work alone could not fix "too dark"

Measured against a red-tint pixel mask of the real meshes in a live
match. Characters sat at 99 median luminance and facilities at 72,
against snow at 174.

- `sky.groundColor` was a dirt-bounce value on a settlement built on
  snow. That term is the light arriving from below and fills every
  surface facing away from the sun.
- The frame was **under-exposed, not under-lit**: tripling the sky light
  moved facilities 111 -> 123, a 2.5x sun landed on the same 123, and
  exposure alone took it to 155. The scene sat in the shoulder of the
  ACES curve where more light cannot escape the compression.
- `scene.environmentTexture` was unset while every metal is authored at
  0.86-0.88 metallic. A metal has no diffuse response at all, so those
  surfaces reflected nothing and rendered black.

Near-miss worth keeping: dropping all nine facility materials to 0.2
metallic at runtime moved facility luminance by **nothing**, and the idea
was nearly filed as disproved. That test ran on a wide frame where metal
is a sliver of the pixels. On a character, where the axe *is* the
silhouette, the cost is obvious -- and the environment turned out to be
worth 20 points to the facilities too, because it feeds ambient specular
to every PBR material, not only to metals.

Final: characters 133, facilities 118, facility p10 37 -> 80, snow 190
with zero clipped pixels.

## Measurement traps already paid for

Do not re-learn these (details in standard §3.7):

1. Manual stepping is not performance. Sample the engine's own loop,
   quiet, for longer than the monitor's rolling window.
2. Babylon's draw-call counter accumulates unless `fetchNewFrame()` is
   called. It read 21,041 against 205 active meshes before that was
   fixed.
3. Verifying a Blender export inside Blender can pass while the GLB is
   wrong. The two-hand grip bug was only caught by an independent
   forward-kinematics evaluator over the exported glTF.
4. Screen-luminance figures are **framing-dependent**. Two probes with
   different camera offsets read the same facilities at 86 and 114. Only
   before/after pairs from one probe are comparable.
