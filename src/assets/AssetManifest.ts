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
  ...UNIT_KEYS.map((key): AssetSpec => ({
    key,
    rootUrl: withBase("assets/models/characters/"),
    fileName: `${key}.glb`,
    requiredNodes: key === "warrior"
      ? ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2", "upper_grip", "lower_grip", "axe_tip"]
      : ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"],
    requiredAnimations: key === "warrior" ? ALLY_MELEE_ANIMATIONS : ["Idle", "Walk", "Attack", "Cast", "Hit", "Death"],
    fallback: "procedural",
  })),
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
