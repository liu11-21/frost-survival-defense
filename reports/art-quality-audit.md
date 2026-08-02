# Art quality audit

Generated during the 2026-08-02 authored-asset iteration. The latest pass adds
shared third-round silhouette, construction and material-layer refinements to
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
- All other character GLBs now receive the shared tapered torso-front shell,
  back yoke and light-metal material separation without changing their
  `UnitSkeleton` or animation contracts.
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
