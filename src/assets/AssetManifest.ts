import type { AssetSpec } from "./AssetTypes";
import { withBase } from "./basePath";

/**
 * The public URL paths intentionally mirror the source Blender folders. A
 * missing file is a supported state: the game keeps its procedural renderer.
 */
const UNIT_KEYS = [
  "warrior", "shield", "archer", "medic", "flagbearer", "mage", "assault", "engineer", "musketeer", "frostmage",
  "grunt", "slinger", "bruiser", "marksman", "juggernaut", "bombardier", "boss", "breacher", "icearmor", "commander", "bomber",
  "flyingMelee", "flyingEliteArcher", "flyingBomber", "flyingColossus",
] as const;

const ECONOMY_ASSETS = ["mine", "gold_mine", "lumberyard", "warehouse", "recruit_hall", "auto_collector", "auto_rebuilder"] as const;
const ATTACK_ASSETS = ["crossbow_tower", "frost_tower", "sniper_tower", "mortar"] as const;
const ALLY_MELEE_ANIMATIONS = ["Idle", "Walk", "Run", "MeleeAttack", "Hit", "Death"] as const;
const ALLY_RANGED_ANIMATIONS = [
  "Idle", "Walk", "Run", "RangedAttack", "MeleeAttack", "Hit", "Death",
] as const;

/**
 * Units whose model comes from the shared human pipeline rather than the
 * older procedural builders. The file name is explicit because the pipeline
 * writes `<name>_candidate.glb` and will not overwrite the procedural asset
 * of the same name -- the two coexist on disk and only this table decides
 * which one the game loads.
 */
const HUMAN_PIPELINE_UNITS = {
  musketeer: {
    fileName: "musketeer_candidate.glb",
    animations: ALLY_RANGED_ANIMATIONS,
  },
} as const;

/**
 * The assets that must be resolved before the first frame of a level.
 *
 * Everything else in the manifest loads in the background after this set
 * lands. That split is the whole of the startup cost problem: `preload` used
 * to `Promise.all` the entire manifest -- 44 files and 24.7 MB -- in one
 * parallel burst, and the five-second race in `Game.start` meant the game
 * appeared on time while those downloads carried on competing for bandwidth
 * behind it. This is what the player is actually looking at on frame one:
 * the hero, the furnace they defend, the two structures the tutorial builds,
 * and the trees and rocks that make up the map.
 *
 * `hero_female` is deliberately NOT here. Only one variant is ever on screen
 * and loading both cost 2.83 MB of the blocking set every single time.
 */
export const CRITICAL_ASSET_KEYS: readonly string[] = [
  "hero", "hero_male", "furnace", "turret_basic", "wall_gate",
  "resource_tree", "resource_rock",
];

export const AUTHORED_ASSET_MANIFEST: readonly AssetSpec[] = [
  {
    key: "hero",
    rootUrl: withBase("assets/models/characters/"),
    fileName: "hero.glb",
    requiredNodes: ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
    fallback: "procedural",
  },
  // The MPFB Hero appearance variants. They ship the same seven clips as the
  // authored hero, but they are a different asset with a different contract:
  // the node names above belong to the hand-authored hero.glb, and this
  // pipeline produces `UnitRoot` over `LOD{n}_PROD_hero_{variant}_{i}` meshes
  // driven by `Human.rig`. Declaring hero.glb's nodes here would fail the
  // contract check on every load and silently leave the procedural fallback
  // active -- which looks like "the new Hero did nothing" rather than a
  // configuration error.
  //
  // `weapon_socket.R` and `ranged_socket` are deliberately absent: nothing in
  // HeroController reads them, and claiming a node the file does not contain
  // is how a validator stops meaning anything.
  ...(["male", "female"] as const).map((variant) => ({
    key: `hero_${variant}`,
    rootUrl: withBase("assets/models/characters/"),
    fileName: `hero_${variant}.glb`,
    requiredNodes: ["UnitRoot", "Human.rig", `LOD0_PROD_hero_${variant}_4`],
    requiredAnimations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
    fallback: "procedural" as const,
  })),
  {
    key: "turret_basic",
    rootUrl: withBase("assets/models/buildings/"),
    fileName: "turret_basic.glb",
    requiredNodes: ["TurretRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Aim", "Fire", "Recoil", "Reload"],
    fallback: "procedural",
  },
  {
    key: "wall_gate",
    rootUrl: withBase("assets/models/buildings/"),
    fileName: "wall_gate.glb",
    requiredNodes: ["WallGateRoot", "gateRoot", "gateDoorLeft", "gateDoorRight", "gateCollider", "friendlyPassTrigger", "LOD1", "LOD2"],
    requiredAnimations: ["GateOpen", "GateClose", "Damaged", "Destroyed"],
    fallback: "procedural",
  },
  // Characters built on the shared human pipeline load their `_candidate`
  // file and carry the full ally contract; everything else is still the older
  // procedural asset and keeps the generic six-clip requirement.
  //
  // The Musketeer is the first RANGED unit on the pipeline, and its contract
  // differs from the Warrior's in two ways that matter. Its weapon is rigid to
  // hand.L, so `weapon_socket` sits at the LEFT hand -- nothing in the manifest
  // names a side, and nothing should, but a reader who assumes right-handed
  // would misread a pass here. And `RangedAttack` is a required animation
  // rather than an optional one: it is this unit's primary combat clip, it was
  // authored for the musket, and an asset missing it must fall back rather
  // than silently play a melee swing.
  ...UNIT_KEYS.map((key): AssetSpec => {
    const pipeline = HUMAN_PIPELINE_UNITS[key as keyof typeof HUMAN_PIPELINE_UNITS];
    if (pipeline) {
      return {
        key,
        rootUrl: withBase("assets/models/characters/"),
        fileName: pipeline.fileName,
        requiredNodes: ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor",
                        "LOD1", "LOD2", "upper_grip", "lower_grip", "axe_tip"],
        requiredAnimations: pipeline.animations,
        fallback: "procedural",
      };
    }
    // The Warrior keeps its own contract. Its model is still `warrior.glb` --
    // the procedural asset, which the pipeline is forbidden from overwriting --
    // and that file ships the axe locators and the melee clip set. Folding it
    // into the generic branch would have quietly dropped `upper_grip`,
    // `lower_grip` and `axe_tip` from the requirements of an asset that has
    // them and is validated against them.
    if (key === "warrior") {
      return {
        key,
        rootUrl: withBase("assets/models/characters/"),
        fileName: "warrior.glb",
        requiredNodes: ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor",
                        "LOD1", "LOD2", "upper_grip", "lower_grip", "axe_tip"],
        requiredAnimations: ALLY_MELEE_ANIMATIONS,
        fallback: "procedural",
      };
    }
    return {
      key,
      rootUrl: withBase("assets/models/characters/"),
      fileName: `${key}.glb`,
      requiredNodes: ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"],
      requiredAnimations: ["Idle", "Walk", "Attack", "Cast", "Hit", "Death"],
      fallback: "procedural",
    };
  }),
  ...ECONOMY_ASSETS.map((key): AssetSpec => ({
    key,
    rootUrl: withBase("assets/models/buildings/"),
    fileName: `${key}.glb`,
    requiredNodes: ["BuildingRoot", "productionCore", "workPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Operate", "Damaged", "Destroyed"],
    fallback: "procedural",
  })),
  ...ATTACK_ASSETS.map((key): AssetSpec => ({
    key,
    rootUrl: withBase("assets/models/buildings/"),
    fileName: `${key}.glb`,
    requiredNodes: ["BuildingRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Aim", "Fire", "Recoil", "Damaged", "Destroyed"],
    fallback: "procedural",
  })),
  {
    key: "furnace",
    rootUrl: withBase("assets/models/buildings/"),
    fileName: "furnace.glb",
    requiredNodes: ["FurnaceRoot", "heatCore", "furnaceCrown", "emitter", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Operate", "Damaged", "Destroyed"],
    fallback: "procedural",
  },
  {
    key: "resource_tree",
    rootUrl: withBase("assets/models/environment/"),
    fileName: "resource_tree.glb",
    requiredNodes: ["ResourceTreeRoot", "resource_trunk", "resource_canopy0", "resource_canopy1", "resource_canopy2", "resource_snow0", "resource_snow1", "resource_snow2", "resource_stump", "LOD1", "LOD2"],
    requiredAnimations: [],
    fallback: "procedural",
  },
  {
    key: "resource_rock",
    rootUrl: withBase("assets/models/environment/"),
    fileName: "resource_rock.glb",
    requiredNodes: ["ResourceRockRoot", "resource_rock_base", "resource_rock_face", "resource_rock_snow", "resource_ore0", "resource_ore1", "resource_ore2", "resource_rubble", "LOD1", "LOD2"],
    requiredAnimations: [],
    fallback: "procedural",
  },
];

export function authoredAssetSpec(key: AssetSpec["key"]): AssetSpec {
  const spec = AUTHORED_ASSET_MANIFEST.find((entry) => entry.key === key);
  if (!spec) throw new Error(`Unknown authored asset key: ${key}`);
  return spec;
}
