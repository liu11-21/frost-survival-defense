# Art quality audit

Generated during the 2026-08-02 authored-asset iteration. The latest pass adds
shared fourth-round silhouette, construction and material-layer refinements to
the complete character/facility library while preserving the runtime contract. This report
separates the runtime contract (which is machine-validated) from the visual
commercial-art sign-off (which still needs a human art review).

## Current inventory

`reports/art-validation.json` currently reports 42/42 assets as `ok`, with no
blocked or invalid GLBs and no validator warnings. All assets keep a
procedural fallback in the runtime, but no fallback is active while the
corresponding authored file passes validation.

### Characters (26)

| Asset | Runtime GLB | Contract |
| --- | --- | --- |
| hero | `public/assets/models/characters/hero.glb` | HeroSkeleton; Idle/Walk/Run/MeleeAttack/RangedAttack/Hit/Death |
| warrior | `public/assets/models/characters/warrior.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| shield | `public/assets/models/characters/shield.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| archer | `public/assets/models/characters/archer.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| medic | `public/assets/models/characters/medic.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| flagbearer | `public/assets/models/characters/flagbearer.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| mage | `public/assets/models/characters/mage.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| assault | `public/assets/models/characters/assault.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| engineer | `public/assets/models/characters/engineer.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| musketeer | `public/assets/models/characters/musketeer.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| frostmage | `public/assets/models/characters/frostmage.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| grunt | `public/assets/models/characters/grunt.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| slinger | `public/assets/models/characters/slinger.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| bruiser | `public/assets/models/characters/bruiser.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| marksman | `public/assets/models/characters/marksman.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| juggernaut | `public/assets/models/characters/juggernaut.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| bombardier | `public/assets/models/characters/bombardier.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| boss | `public/assets/models/characters/boss.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| breacher | `public/assets/models/characters/breacher.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| icearmor | `public/assets/models/characters/icearmor.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| commander | `public/assets/models/characters/commander.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| bomber | `public/assets/models/characters/bomber.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| flyingMelee | `public/assets/models/characters/flyingMelee.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| flyingEliteArcher | `public/assets/models/characters/flyingEliteArcher.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| flyingBomber | `public/assets/models/characters/flyingBomber.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |
| flyingColossus | `public/assets/models/characters/flyingColossus.glb` | UnitSkeleton; Idle/Walk/Attack/Cast/Hit/Death |

### Facilities and resident props (16)

| Asset | Runtime GLB | Functional nodes |
| --- | --- | --- |
| turret_basic | `public/assets/models/buildings/turret_basic.glb` | yawPivot, pitchPivot, muzzle, recoilPart |
| wall_gate | `public/assets/models/buildings/wall_gate.glb` | gateRoot, gateDoorLeft/Right, gateCollider |
| mine | `public/assets/models/buildings/mine.glb` | productionCore, workPart |
| gold_mine | `public/assets/models/buildings/gold_mine.glb` | productionCore, workPart |
| lumberyard | `public/assets/models/buildings/lumberyard.glb` | productionCore, workPart |
| warehouse | `public/assets/models/buildings/warehouse.glb` | productionCore, workPart |
| recruit_hall | `public/assets/models/buildings/recruit_hall.glb` | productionCore, workPart |
| auto_collector | `public/assets/models/buildings/auto_collector.glb` | productionCore, workPart |
| auto_rebuilder | `public/assets/models/buildings/auto_rebuilder.glb` | productionCore, workPart |
| crossbow_tower | `public/assets/models/buildings/crossbow_tower.glb` | yawPivot, pitchPivot, muzzle, recoilPart |
| frost_tower | `public/assets/models/buildings/frost_tower.glb` | yawPivot, pitchPivot, muzzle, recoilPart |
| sniper_tower | `public/assets/models/buildings/sniper_tower.glb` | yawPivot, pitchPivot, muzzle, recoilPart |
| mortar | `public/assets/models/buildings/mortar.glb` | yawPivot, pitchPivot, muzzle, recoilPart |
| furnace | `public/assets/models/buildings/furnace.glb` | heatCore, emitter, productionCore |
| resource_tree | `public/assets/models/environment/resource_tree.glb` | staged canopy/snow/stump meshes |
| resource_rock | `public/assets/models/environment/resource_rock.glb` | staged ore/body/remains meshes |

## Latest authored refinement

- `hero.glb`: face focal points, cheek and hood planes, a tapered chest shell,
  split coat tails, straps, guarded legs and a hand-bound grip/blade/guard/gem
  set; all authored facial pieces remain mapped to the head bone.
- `warrior.glb`: layered breastplate, tapered shared torso shell, abdomen,
  hip guards, rivets, collar, shoulder guards, chest seal and readable
  scabbard silhouette; the sword blade now has a tapered profile, fuller and
  pommel.
- `flyingColossus.glb`: mirrored multi-panel wing membranes, wing spars and
  ribs, chest shell, brow, mantle, horns, eyes, tail, claws and knee guards.
- `furnace.glb`: alternating masonry courses, recessed fire chamber, rim,
  door frame/handle, flue, collar, cap and chimney blocks; all new parts are
  parented under `FurnaceRoot` so their placement follows the building
  instance.
- `crossbow_tower.glb`: shaped bow limbs, string, grip, winch, stock profile,
  bolt rail/head, draw wheels and diagonal deck braces; braces remain under
  `BuildingRoot`.
- All 26 character GLBs now have a role-specific focal kit in addition to the
  shared tapered torso-front shell and back yoke: shield boss/chevron, archery
  bracers and arrowheads, medic satchel/vials, banner harness, mage robe and
  rune belt, assault rig, engineer goggles/tools, musketeer lapels/bayonet,
  frost mantle, enemy armour breaks, ammunition and flight harnesses.
- These role kits are separate low-poly meshes with named material layers,
  remain bound to the existing `UnitSkeleton`, and preserve the Idle/Walk/
  Attack/Cast/Hit/Death clips used by Babylon.
- All 26 character GLBs: added collar and jaw planes, waist and chest seams,
  cuffs, boot soles/rivets, faction badges, weapon grip wraps and role-specific
  shoulder hardware. Flying units now use layered membrane panels and wing
  joints instead of only flat bars.
- All 12 general facility GLBs: added foundation courses, service plates,
  fasteners and role-specific construction details such as mine winches,
  lumber saw hubs, warehouse windows, collector arms, repair cables, tower
  hardware and furnace heat pipes.
- `turret_basic.glb` and `wall_gate.glb`: added barrel bands, muzzle crown,
  support bolts, masonry courses, gate armour bands and hinge plates while
  preserving the existing pivot/collider node names.
- `resource_tree.glb` and `resource_rock.glb`: added branch collars, needle
  rings, stump rings, rock facets and ore-vein frames for the resident resource
  props.

## Still not a commercial-art sign-off

The shared pass now adds authored silhouette panels, props, bevels, snow/metal
separation, functional structure and a consistent material hierarchy across all
42 assets. This is still a stylized procedural Blender authoring pass rather
than a hand-sculpted, retopologized and texture-painted production pack. The
five assets most in need of manual refinement remain:

1. `hero.glb` — hand-shaped face, coat folds, weapon/hand contact and texture breakup.
2. `warrior.glb` — replace the broad torso block with sculpted layered armour and a fitted sword grip.
3. `flyingColossus.glb` — wing membrane/feather topology and a more readable boss silhouette.
4. `furnace.glb` — stronger masonry construction, flame chamber depth and hero prop readability.
5. `crossbow_tower.glb` — better bow limb, string, winch and deck support topology.

These are explicit follow-up items, not hidden behind the passing validator.

## Fourth-pass construction upgrade (2026-08-02)

- Added a bodycraft layer to all 26 characters: inset torso panels, centre and
  back seams, eye sockets/irises, a nose bridge and mouth plate, cuffs,
  fasteners, shin plates, boot buckles, waist hardware and asymmetrical utility
  pouches. These pieces are bound to the existing UnitSkeleton/HeroSkeleton,
  so the visual pass does not trade away animation compatibility.
- The hero now has a harness clasp, coat pleats, hood lace, eye highlights,
  gauntlet plates and shoulder rings. The warrior has collar hardware,
  shoulder straps, knee bands and a pommel gem. The flying colossus has a
  muzzle/jaw assembly, chest core frame, wing tips and tail ring.
- Facilities now have a service-panel construction language. Mine, lumberyard,
  warehouse/recruit hall, collector, rebuilder, frost, sniper and mortar props
  received structural service details. The crossbow tower gained cheek plates,
  a bolt magazine, string guide and deck rivets. The furnace gained an inset
  ember bed, grate bars, side buttresses, a service crown and a visible ember
  core.
- Updated the shared Principled material helper with guarded Blender 4/5 PBR
  coat, sheen and specular response. Metal and enamel surfaces now carry a
  tighter highlight while cloth and leather receive a softer sheen; the
  authored palette and GLB material count remain bounded.
- The latest Blender batch exports all 42 GLBs. `art:validate` remains 42/42
  `ok`; the review sheets were regenerated after export. v9 (75/75), v10
  (12/12), `npm run typecheck` and `npm run build` all pass.

This is a measurable construction and presentation improvement, but it remains
an authored stylized low-poly pass. It is not a substitute for a final human
art-direction review, texture/UV polish, or hand-sculpted commercial asset
sign-off. The manual top-five list above remains open.

## Fifth-pass surface response (2026-08-02)

- Applied weighted surface-normal modifiers to every authored mesh after the
  existing bevel pass. The modifier is exported into the GLB normals, so the
  Babylon runtime receives broad, stable highlights on plates, braces and
  faceted construction pieces instead of a runtime-only shading adjustment.
- Re-exported all 42 runtime GLBs with Blender 5.2.0 LTS. The direct filesystem
  inventory is 13,879,248 bytes; the validator still reports 42/42 `ok`, with
  no blocked assets or warnings. The representative `hero.glb` remains 11,288
  triangles, 10 materials, one skeleton and seven named clips.
- Babylon smoke evidence after the export: v9 is 75/75 and v10 is 12/12;
  `npm run typecheck` and the production Vite build pass. The build still emits
  the known large-chunk advisory (~5.8 MB), which is not an asset failure.

This pass improves authored surface readability but does not change the
commercial-art boundary above: UV layout, hand-painted texture breakup,
sculpted facial/cloth forms and final art-direction sign-off remain pending.

## Sixth-pass authored value breakup (2026-08-02)

- Added deterministic top/underside material variation to the authored unit,
  facility and hero parts. The pass reuses the existing palette (light/dark
  cloth, leather, metal, wood, stone and accent variants), so it adds readable
  planar value breaks without introducing external textures or unbounded
  material counts.
- Re-exported the complete 42-asset library with Blender 5.2.0 LTS and
  regenerated both review sheets. The latest direct inventory is 42 GLBs /
  14,748,308 bytes; `reports/art-validation.json` is 42/42 `ok` with no
  warnings or blocked assets.
- Runtime regression remains green after the material-slot changes: v9 is
  75/75, v10 is 12/12, `npm run typecheck` passes, and the production Vite
  build passes with the existing large-chunk advisory.
- This is still a stylized authored low-poly presentation pass, not final UV,
  hand-painted texture, hand-sculpted facial/cloth or human art-direction
  sign-off. The manual top-five refinement list above remains open.

## Seventh-pass glTF surface contract and orientation audit (2026-08-02)

- Added deterministic planar `UVMap` data and a restrained `ArtTint` corner
  colour layer to every authored render mesh. The Blender 5.2 glTF exporter
  now emits `TEXCOORD_0` and `COLOR_0` for all 42 runtime GLBs without
  external image URIs. A packed texture experiment was removed because the
  nested shader graph made Blender drop `COLOR_0`; the shipped graph stays on
  the exporter-compatible Vertex Color -> Mix -> Base Color path.
- Rebuilt and exported the full library with Blender 5.2.0 LTS. The direct
  inventory is 42 GLBs / 27,446,080 bytes; `reports/art-validation.json` is
  42/42 `ok`, with zero blocked assets, zero external images and no missing
  `TEXCOORD_0`/`COLOR_0` attributes.
- Representative contracts: `hero.glb` is 784,876 bytes / 111 nodes / 85
  meshes / 10 materials / one skeleton / 12,168 triangles / seven clips;
  `turret_basic.glb` is 281,564 bytes / 33 nodes / 27 meshes / eight
  materials / 5,272 triangles / five clips; `wall_gate.glb` is 331,804 bytes
  / 54 nodes / 44 meshes / seven materials / 5,344 triangles / four clips.
- The hero's authored face markers (`head.nose`, `head.eye.L/R`) point along
  local +Z, matching `yawFromDirection` and the movement vector. The camera
  follows from the south (negative Z), so walking north toward the furnace
  makes the camera see the hero's back. This is a camera-side view, not a
  reversed input, velocity or animation direction; the runtime front
  calibration remains in `src/hero/HeroController.ts`.
- Regression evidence after the pass: v9 75/75, v10 12/12,
  `npm run typecheck`, and `npm run build` pass. The review sheets were
  regenerated after the final export.

This contract improves runtime-ready asset data and documents the apparent
rear-facing view, but it does not close the manual UV layout, hand-painted
texture, hand-sculpted form or human commercial art-direction sign-off items
listed above.

## Eighth-pass focal silhouette and brush refinement (2026-08-02)

- The next focal pass adds layered and role-readable construction to five
  assets instead of changing the runtime contract: hero cape/scarf/rib/guard
  pieces, warrior cloak/gorget/chest/sword hardware, flying-colossus
  crown/core/wing/tusk details, furnace rods/vents/window/crown fasteners,
  and crossbow mount/draw/bolt/fletching details. The pieces are still rigid
  parts bound to the existing authored skeleton or facility animation pivot.
- `author_surface_paint(..., textured=True)` now creates a small deterministic
  colour-aware brush image only for hero, warrior, flyingColossus, furnace and
  crossbowTower. The images are packed into the `.blend` and GLB; the
  exporter-compatible `ArtTint` path remains present so every asset keeps
  `TEXCOORD_0` and `COLOR_0`. There are no external image URIs.
- Blender 5.2.0 LTS regenerated all 42 assets and both preview sheets.
  The latest filesystem inventory is 42 GLBs / 28,003,628 bytes. The
  validator reports 42/42 `ok`, zero blocked, zero invalid and 54 embedded
  images. The focal GLBs remain within their authored validation budgets and
  retain their required clips/skeletons (see `reports/art-validation.json`).
- Browser evidence remains green: v9 75/75 and v10 12/12. TypeScript
  no-emit and the Vite production build also pass; the build's known large
  chunk warning is unchanged.

This is a measurable authored construction and surface-breakup improvement,
but the preview remains stylized low-poly. Manual UV layout, hand-painted
texture breakup, hand-sculpted facial/cloth refinement and final human
commercial art-direction sign-off remain open rather than being implied by
the validator.

## Ninth-pass full-roster construction and brush surface (2026-08-02)

- The tertiary construction pass now covers every authored asset rather than
  only the focal review set: 26 character GLBs, 14 facility GLBs and two
  environment props. Character additions are role-specific equipment and
  silhouette breaks; facility additions are functional service geometry and
  structural fasteners. No required node, socket, skeleton or animation
  contract was removed.
- All 42 assets now use the same deterministic packed brush-image path in
  addition to the exporter-safe ArtTint vertex colour path. The GLB inventory
  is 30,989,344 bytes with 487 embedded images and zero external image or
  buffer URIs. `reports/art-validation.json` is 42/42 `ok`, with no blocked,
  invalid, missing UV/colour attributes or warnings.
- Representative latest contracts are `hero.glb` 910,348 bytes / 123 nodes /
  97 meshes / 10 materials / one skeleton / 14,000 triangles / seven clips;
  `turret_basic.glb` 351,956 bytes / 39 nodes / 33 meshes / eight materials /
  6,104 triangles / five clips; and `wall_gate.glb` 383,896 bytes / 62 nodes /
  52 meshes / seven materials / 6,180 triangles / four clips. All three have
  identity root translation and scale, packed images, `TEXCOORD_0`,
  `COLOR_0` and no external URI.
- Babylon loading and runtime evidence remains green: v9 75/75 and v10 12/12;
  TypeScript no-emit and the production build pass. The build still reports
  the known informational large-chunk advisory. There is no `npm test` script
  in the current package manifest.
- Hero orientation was rechecked against the source and live runtime. The
  face marker (`head.nose` / `head.eye.*`) is on +Z, the movement vector and
  `yawFromDirection` use +Z, and the camera follows from -Z. The apparent
  backward walk is the expected rear view of a south-side follow camera, not
  an inverted movement or animation. Changing it would be a camera/design
  choice rather than a corrective code patch.

The pass improves construction density and surface breakup across the complete
roster, but it remains stylized procedural low-poly work. Manual UV layout,
hand-painted texture authoring, sculpted facial/cloth forms and final human
commercial art-direction sign-off remain open.

## Tenth-pass projected UV and material-aware brush surface (2026-08-02)

This pass addresses the most visible remaining technical surface weakness in
the ninth-pass previews: the previous UV coordinates projected every face from
global X/Z bounds, so vertical panels had little meaningful height variation.
`author_surface_paint` now chooses a dominant face plane (X/Y for Z-facing
faces, Z/Y for X-facing faces, X/Z otherwise) and maps each polygon to its
local bounds. The result keeps the same runtime mesh and animation contracts,
but gives side walls, torsos and caps usable surface coordinates.

The packed brush layer is now 64x64 and material-aware. Metal families receive
directional grain and scratches; wood/leather receive grain; stone/brick gets
flecks; cloth/snow/skin gets a weave-like breakup; and ice/glass/glow gets
crystal variation. Images remain packed into the GLB and the vertex-colour
`ArtTint` path remains available for Babylon.js.

Evidence:

- 42 GLBs rebuilt and exported with Blender 5.2.0 LTS.
- 36,223,108 bytes total, 487 embedded images, zero external image URIs.
- `reports/art-validation.json`: 42/42 `ok`, zero blocked, zero invalid.
- Review sheets regenerated at `reports/art-previews/unit-sheet.png` and
  `reports/art-previews/facility-sheet.png`.
- Babylon/browser regression: v9 75/75 and v10 12/12.
- `npm run typecheck` and `npm run build` pass; Vite still reports its known
  informational large-chunk advisory.

Quality boundary: the new projection and brush breakup are measurable
improvements, but the library is still stylized procedural low-poly art. It
does not yet constitute hand-painted UV atlases, sculpted facial/cloth forms or
final human commercial art-direction approval. Those manual review items stay
open.

## Eleventh-pass organic body volumes and current difficulty inventory (2026-08-02)

The latest geometry pass changes the shared construction rather than merely
adding another decoration layer. `common.py` now provides an explicit
low-poly `ellipsoid`; the unit builder uses it for every authored unit's torso,
arms and legs. `apply_style` also gives broad cube-shaped architectural masses
a bounded adaptive bevel, while leaving small bolts and trims at their
original widths. The goal is a softer, more designed silhouette with the
existing skeleton, sockets, collision roots and animation contracts untouched.

Current evidence is technically healthy:

- 26 character GLBs, 14 building GLBs and two environment GLBs are present.
- Every character reports one skeleton and the required six named clips;
  hero retains its seven named clips. Facilities retain their required
  moving-node and animation contracts.
- The current library is 38,180,784 bytes with 487 embedded images and zero
  external image or buffer URIs.
- `reports/art-validation.json` is 42/42 `ok`; v9 is 75/75 and v10 is 12/12
  after the geometry rebuild.

The remaining difficulty is visual quality, not file existence:

1. The source is still a deterministic primitive construction system. The
   unit builder contains 125 `box` and 68 `prism` calls; the building builder
   contains 115 `box` and 30 `prism` calls. Rounded volumes reduce the blockout
   feeling but do not provide hand-sculpted topology, facial planes or bespoke
   cloth folds.
2. The 487 packed layers are 64x64 material-aware brush images. They provide
   surface variation but are not hand-painted UV atlases and do not include
   authored normal/roughness/detail maps.
3. Visual QA coverage is incomplete: the current sheets render six of 26
   characters and four of 14 facilities, with labels that are hard to read.
   This is insufficient evidence for a full-roster commercial sign-off.
4. The GLB animation contract proves clips and channels exist, not that each
   role has convincing acting, attack anticipation, recoil, cloth response or
   weapon follow-through. Those require per-asset Babylon review.
5. The runtime keeps procedural visuals as a deliberate fallback. No missing
   GLB is reported by the static validator, but a dedicated all-manifest
   runtime report and performance profile are still needed to prove that every
   authored instance is active under real wave load.
6. The current exported inventory is about 38 MB and 488k triangles. It passes
   the present limits, but simultaneous wave, HUD and roster stress has not
   been measured against a commercial frame-time target.

The five manual-quality priorities remain hero, warrior, flyingColossus,
furnace and crossbow/turret. The latest geometry pass is an improvement, not a
claim that these assets have reached final hand-authored commercial quality.

## Checkpoint: 2026-08-02 visual-effects implementation

Work was intentionally stopped at a safe checkpoint. The in-progress complete
character roster preview finished writing to
`reports/art-previews/unit-roster-full.png`; the facility roster preview was
not started. No additional effect type, material framework, asset family, or
refactor was added after the stop request.

The authored sources and GLBs completed before the checkpoint were preserved.
Export roots and animation/control pivots now use non-rendering plain-axis
empties, preventing helper cubes from appearing as art. Direct Blender 5.2.0
LTS export completed, while the Node Blender wrapper is still environment-
blocked by Windows `spawnSync ... EPERM` in this managed session.

Verification at this checkpoint: `npm run typecheck` passed and `npm run build`
passed with one elevated retry; Vite continues to emit the existing large
chunk advisory. Commercial-art sign-off remains open for the unresolved
primitive-driven topology, authored texture-map, bespoke animation, runtime
all-manifest, and performance-review gaps documented above.
