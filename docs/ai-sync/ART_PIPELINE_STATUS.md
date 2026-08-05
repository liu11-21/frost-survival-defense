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

## Measurement traps already paid for

Do not re-learn these (details in standard §3.7):

1. Manual stepping is not performance. Sample the engine's own loop, quiet,
   for longer than the monitor's rolling window — and note that `avgFps30s`
   and `lowFps1pct` stay contaminated even after an 8s quiet period.
2. Babylon's draw-call counter accumulates unless `fetchNewFrame()` is
   called. It read 21,041 against 205 active meshes before that was fixed.
   Every draw-call figure written before then is meaningless.
3. Verifying a Blender export inside Blender can pass while the GLB is
   wrong. The two-hand grip bug was only caught by an independent
   forward-kinematics evaluator over the exported glTF.
