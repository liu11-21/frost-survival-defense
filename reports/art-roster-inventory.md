# Authored art roster inventory

Updated 2026-08-02 after the full-roster QA pass. The authoritative machine
check is `reports/art-validation.json`.

## Current totals

- 26 character GLBs, all with one skeleton and six `UnitSkeleton` clips;
  `hero.glb` uses `HeroSkeleton` and seven clips.
- 14 facility GLBs, all with `BuildingRoot` except `FurnaceRoot`, with
  facility animation channels and no armature requirement.
- 2 environment GLBs: `resource_tree.glb` and `resource_rock.glb`.
- Static validation: 42/42 `ok`, zero blocked assets.

## Characters

All paths below are under `public/assets/models/characters/`.

`hero`, `warrior`, `shield`, `archer`, `medic`, `flagbearer`, `mage`,
`assault`, `engineer`, `musketeer`, `frostmage`, `grunt`, `slinger`, `bruiser`,
`marksman`, `juggernaut`, `bombardier`, `boss`, `breacher`, `icearmor`,
`commander`, `bomber`, `flyingMelee`, `flyingEliteArcher`, `flyingBomber`, and
`flyingColossus` each have a formal GLB. The ordinary units use
`Idle/Walk/Attack/Cast/Hit/Death`; the hero uses
`Idle/Walk/Run/MeleeAttack/RangedAttack/Hit/Death`.

## Facilities

All paths below are under `public/assets/models/buildings/`.

| Asset | Functional / moving nodes | Current visual note |
| --- | --- | --- |
| `mine.glb`, `gold_mine.glb` | `workPart`, `productionCore` | Resource-themed derrick and ore/gold accents |
| `lumberyard.glb` | `workPart`, `productionCore` | Timber frame and saw hardware |
| `warehouse.glb` | `workPart`, `productionCore` | Storage body, door and loading details |
| `recruit_hall.glb` | `workPart`, `productionCore` | Hall gate, flags and crest |
| `auto_collector.glb` | `workPart`, `productionCore` | Collector rings, arms and sensor hardware |
| `auto_rebuilder.glb` | `workPart`, `productionCore` | Crane frame, repair head and controls |
| `crossbow_tower.glb` | `yawPivot`, `pitchPivot`, `barrel`, `muzzle`, `recoilPart` | Siege head, magazine and bolt details |
| `frost_tower.glb` | `yawPivot`, `pitchPivot`, `barrel`, `muzzle`, `recoilPart` | Ice spire, rings and crystal emitters |
| `sniper_tower.glb` | `yawPivot`, `pitchPivot`, `barrel`, `muzzle`, `recoilPart` | Elevated deck, scope and counterweight |
| `mortar.glb` | `yawPivot`, `pitchPivot`, `barrel`, `muzzle`, `recoilPart` | Cradle, shields and shell hardware |
| `furnace.glb` | `workPart`, `productionCore`, `emitter` | Base focal prop with fire chamber and chimney |
| `turret_basic.glb` | `yawPivot`, `pitchPivot`, `barrel`, `muzzle`, `recoilPart` | Existing authored turret focal asset |
| `wall_gate.glb` | `gateRoot`, `gateDoorLeftPivot`, `gateDoorRightPivot` | GateOpen/GateClose plus damage states |

## Environment

- `public/assets/models/environment/resource_tree.glb`
- `public/assets/models/environment/resource_rock.glb`

## Still open

All assets are formally present and integrated, but formal GLB presence is not
the same as commercial-art sign-off. Remaining work is manual quality: bespoke
sculpted topology, authored PBR atlases, role-specific animation acting,
game-camera focal review, runtime all-manifest proof and performance profiling.
