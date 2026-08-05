# Frostbound Expanse — art production standard and roadmap

Written 2026-08-05. Grounded in a measured audit of all 42 authored assets,
not in impressions. Read `WARRIOR_W2_STATUS.md` in `docs/ai-sync/` for the
reference implementation this standard generalises from.

---

## 1. Where the library actually is

All 42 GLBs load and pass structural validation. That is not the bar. The
measured shape of the library:

| Asset | mesh nodes | primitives | materials | images | LOD0 tris |
|---|---:|---:|---:|---:|---:|
| grunt (typical of 25 units) | 95 | 118 | 13 | 12 | 12,160 |
| boss | 96 | 116 | 14 | 13 | 12,200 |
| hero | 27 | 29 | 4 | 1 | 18,080 |
| **warrior (W2 reference)** | **6** | **11** | **3** | **1** | **3,094** |

Library total at audit time: **458,874 LOD0 triangles**, median 12,300 per asset.
After Batches 0/1/3/4 this is **70,972**.

### The single most important finding

`scripts/blender/build_units.py` (1,070 lines) generates **25 of the 42
assets** — every ally and enemy except Hero and Warrior — from one shared
template with per-unit colour/crest/weapon/armor parameters:

```python
"grunt": {"faction": "enemy", "body": (...), "crest": "horn",
          "weapon": "club", "armor": "ragged"},
```

That is why they all land at ~12–13k triangles and all read as the same
generic placeholder with different hats. It is also why they cost ~118
primitives and 13 materials each: the body is a *stack of rigid primitives*,
not a skinned mesh.

**This is simultaneously the art problem and the performance problem, and
both have the same fix.** The 9-Warrior/12-Grunt pressure scenario measured
2,319 draw calls; the primitive counts above are where they come from.

Consequence for planning: rewriting `build_units.py`'s authoring language
upgrades 25 assets in one pass. Nothing else in this project has that
leverage. It is Batch 1.

---

## 2. What "commercial quality" costs, honestly

The Warrior went W1 → W2 in one long session: geometry language rewrite,
analytic two-bone IK, exported grip locators, three genuine bugs found
(left-handed IK basis, a false-positive verification, key-only IK solving),
materials, review lighting, tests. The result is **markedly better and fully
measurable — and still not commercial character art.**

The ceiling is structural, not effort-related. Every asset here is generated
by Python emitting primitives, with a single procedurally-painted 1024 atlas.
Commercial character art requires sculpted high-poly source, retopologised
game meshes, unwrapped UVs, and baked PBR sets (albedo / normal / roughness /
metallic / AO). **No amount of additional parameters in `build_*.py` crosses
that line**, and this document should not be read as claiming otherwise.

What this standard *can* deliver, and what the batches below target:

- clear, independent, role-readable silhouettes
- no primitive-stack / cylinder / box placeholder read
- believable material separation and surface structure
- correct rig, skin, LOD, collision and VFX integration in formal gameplay
- readable in snow, furnace light, melee and at distance
- affordable with many units on screen

Crossing into true commercial fidelity needs authored/sculpted source assets.
That is a different pipeline and should be planned as such, not smuggled in
as "one more pass".

---

## 3. Shared standard (applies to every asset)

### 3.1 Geometry authoring language

Bodies are **swept explicit cross-sections**, never lathes and never stacks
of rigid primitives. From `build_warrior.py`, to be promoted to a shared
module:

- `MeshBuilder.sweep(rings, surface, weight_fn)` — lofts explicit per-ring
  cross-sections. No rotational symmetry is imposed.
- `section(n, half_width, depth_front, depth_back, exponent, ...)` —
  superellipse with **independent front and back depth**. Exponent > 2 gives
  flat planes with rounded corners. This is what stops "turned on a lathe".
- `band(rings, ...)` — open shell over an arc, for collars/skirts/plates that
  must not close into a torus.
- `box(centre, dims, surface, weights, taper=)` — tapered, never a raw cube.
- `prism(points, ...)` — extruded silhouette for blades, plates, signage.

**Rule: silhouette is carried by cross-section shape, not by segment count.**
Do not add loops or subdivision to reach a triangle target.

### 3.2 Budgets (hard caps, not targets)

| Class | LOD0 | LOD1 | LOD2 | Primitives L0/L1/L2 |
|---|---:|---:|---:|---|
| Ordinary unit | 7,500 | 3,200 | 1,100 | 6 / 4 / 2 |
| Hero / boss | 12,000 | 5,000 | 1,800 | 8 / 5 / 3 |
| Small facility | 6,000 | 2,600 | 900 | 6 / 4 / 2 |
| Large facility / furnace | 10,000 | 4,000 | 1,400 | 8 / 5 / 3 |
| Resource prop | 3,000 | 1,200 | 400 | 4 / 2 / 2 |

Materials ≤ 3 (hero/boss/furnace ≤ 4). Embedded images: **1 atlas**.
GLB ≤ 2.5 MB. Under-budget with good form is correct and must not be padded.

### 3.3 Materials and atlas

One 1024 atlas per asset, three material slots (cloth / leather-wood /
metal), sub-surfaces addressed as **atlas bands** inside each material's
column. Separate materials on all three axes that actually read:

- **value** — the lightest mass ~4× the luminance of the darkest
- **hue** — cool cloth, warm leather/wood, neutral metal
- **roughness** — matte ~0.9 / semi-gloss ~0.6 / specular ~0.3 at high metallic

`COLOR_0` is a **near-white multiplier** for directional shade only. Writing
absolute tints there multiplies against the atlas and crushes everything to
black. (This was a real bug; see W2 history.)

Atlas content must be authored structure — weave direction, grain, edge wear,
contact shadow at band boundaries — never a single noise field.

### 3.4 Rig, skin, weapons

- 18-bone contract for humanoids; consistent bone names across the roster.
- Every renderable primitive carries `JOINTS_0` + `WEIGHTS_0`.
- **Weapons are rigid**: 100% weight to one hand bone, or unskinned under a
  socket. Splitting a weapon across two hands is forbidden — it stretches.
- Two-handed weapons export `upper_grip`, `lower_grip`, `axe_tip`-equivalent
  locators **bone-parented to the holding bone**, and the support hand is
  solved onto the haft by IK **on every frame**, not only at keys.
- Required nodes: `UnitRoot`, `UnitSkeleton`, `weapon_socket`, `attackAnchor`,
  `LOD1`, `LOD2`, plus per-weapon locators.

### 3.5 Animation

Clips: `Idle`, `Walk`, `Run`, `Attack`/`MeleeAttack`, `Hit`, `Death`.
Authored **from the prop outward** where a prop exists: state where the grip
sits and which way it points, then solve the limbs. Hand-tuned Euler angles
cannot hold a two-handed grip, because the support hand's target is a
consequence of the other arm.

Attacks need four readable beats: settle → load → drive → recover.

### 3.6 VFX time signature

Every skill and impact must have **anticipation → release → impact →
sustain → dissipation**. A single-frame pop reads as "the result appeared"
rather than "the character did something".

Skills must differ in **colour, shape, direction, area and weight** — not
only colour. Current state: the four hero skills share one ring/column/
afterglow set tinted differently. That is an open gap (see §5).

Weapon swings trace their path from the weapon's own tip locator.

### 3.7 Performance

Draw calls are dominated by primitive count × instances. The 118-primitive
unit template is the main offender. Target after Batch 1: **≤ 6 primitives
per ordinary unit**.

#### Measuring it without lying to yourself

Two traps, both of which this project fell into and both of which are now
fixed. Any new perf reporting must avoid them.

**1. Manual stepping is not performance.** Driving the sim with
`frostbound.step()` from a test is paced by test round-trips, not by
`requestAnimationFrame`. Numbers from it are a smoke signal that rendering
happens at all — nothing more. Sample real performance by letting the
engine's own loop run alone, for **longer than the monitor's rolling
window** (`avgFps5s` needs > 5 s of quiet), then read it.

Be precise about which fields the quiet window actually cleans.
`avgFps30s` and `lowFps1pct` read longer history and stay contaminated
after an 8 s window; only `avgFps5s` and the instantaneous fields are
citable. `pressure-result.json` labels these explicitly.

**2. `drawCalls` was a running total, not a per-frame count.** Babylon's
draw-call `PerfCounter` accumulates into its `current` field and is only
rolled over by an explicit `fetchNewFrame()`, which nothing was calling. The
metric read **21,041 against 205 active meshes** — impossible for one frame —
and grew the longer a scenario ran. `PerformanceMonitor.beginSimulation()`
now rolls the counter, and the same scenario reports **207 draw calls against
201 active meshes**.

Every draw-call figure in reports written before that fix is meaningless.

#### Current measured baseline

Real render loop, 9 Warriors, quality `high`, 1600×900:

| avgFps5s | frame | sim | render | draw calls | active meshes | vertices |
|---:|---:|---:|---:|---:|---:|---:|
| 71.2 | 9.80 ms | 0.60 ms | 9.20 ms | 207 | 201 | 490,022 |

This is the number Batch 1 must be measured against.

---

## 4. Batch plan, in dependency order

Ordered by player exposure per unit of work, as requested.

| Batch | Scope | Why first | Leverage |
|---|---|---|---|
| **0** ✅ | Shared authoring language in `scripts/blender/authoring.py`, this standard, acceptance system | Every later batch depends on it | Foundation |
| **1** ✅ | `build_units.py` rewrite — **24 units**. 95→5.9 mesh nodes, 118→10.1 primitives, 13→3 materials, 12→1 image per unit | One template drove 24 assets; also the draw-call fix | Highest in project |
| **2** | Grunt, shield, archer, medic + boss role passes on top of Batch 1 | Most-seen ally/enemy faces | High |
| **3** ✅ | Furnace (own generator, 94→9 mesh nodes, 124→12 primitives) + all 11 economy and attack facilities (~548→76 nodes, ~740→87 primitives) | Always on screen, centre of frame | High |
| **4** ✅ | `turret_basic` (33→7 nodes, 33→10 prims) and `wall_gate` (52→5 nodes, 52→9 prims) | Constantly in view during combat | Medium |
| **5** | Hero R8 pass to the new standard | Already "production validated" at R7; least broken | Medium |
| **6** | Resources (`resource_tree`, `resource_rock`). **Note:** their manifest contract names every harvest stage as its own node (`resource_canopy0/1/2`, `resource_ore0/1/2`, …), so merging cannot cut node count the way it did elsewhere — the win here is materials 8→3 and images 7→1, not draw calls | Background mass | Lower |
| **7** | Skill VFX differentiation — per-skill shape/direction/area language | Independent of the model pipeline; can run in parallel | High, parallel |

Batches 1–4 are the bulk of the visible upgrade.

---

## 5. Acceptance system

A batch is **not** accepted on green CI. Green CI means "it loads and the
contract holds". Every batch must produce:

1. **Formal-gameplay screenshots** — real arena, real lighting, real camera,
   HUD not covering the subject. Review mode alone is not evidence.
2. **Spec sheet** — LOD triangles, primitives, materials, textures, bones,
   GLB size, against the caps in §3.2.
3. **Performance sample** — draw calls, active meshes and frame cost from a
   **real render loop**. Manual-stepping numbers are labelled and may not be
   used to claim performance.
4. **Measured, not asserted, rig evidence** — grip residuals, arc lengths and
   pose deltas measured at real locators, with thresholds tight enough to
   fail when the thing they describe is broken.
5. **An honest open-issues list.**

Automated gates that must stay green alongside: `typecheck`, `build`,
`art:validate`, per-asset validators, `git diff --check`, Playwright suites.

### Verification lesson worth keeping

During W2, three separate checks reported a perfect two-hand grip while the
shipped GLB had the hand 1.41 m off the haft:

- the IK residual measured an in-memory pose, not the exported one
- the "baked" check re-read stale state instead of the action
- a left-handed basis matrix satisfied the position test while producing a
  meaningless rotation

It was only caught by writing an **independent forward-kinematics evaluator
over the exported glTF** that trusted neither Blender nor Babylon. Every
batch should carry at least one check that is independent of the tool that
produced the data.

---

## 6. Open gaps carried into this plan

- ~~Evidence images~~ — **closed.** `warrior-gameplay.png` and
  `warrior-squad.png` are now captured in the real arena; HUD occlusion is
  asserted by projecting the squad's bounds against every visible HUD rect
  (288 corners, 0 overlaps) rather than eyeballed; a LOD0/1/2 contact sheet
  is produced into the runtime output.
- ~~Performance separation~~ — **closed.** See §3.7.
- The four hero skills are not visually differentiated beyond colour.
- Hero is at R7 and predates this standard.
- The whole library, Warrior included, remains procedural-primitive art. See
  §2 on what that ceiling means.
