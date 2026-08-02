import type { AssetSpec } from "./AssetTypes";

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

export const AUTHORED_ASSET_MANIFEST: readonly AssetSpec[] = [
  {
    key: "hero",
    rootUrl: "/assets/models/characters/",
    fileName: "hero.glb",
    requiredNodes: ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
    fallback: "procedural",
  },
  {
    key: "turret_basic",
    rootUrl: "/assets/models/buildings/",
    fileName: "turret_basic.glb",
    requiredNodes: ["TurretRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Aim", "Fire", "Recoil", "Reload"],
    fallback: "procedural",
  },
  {
    key: "wall_gate",
    rootUrl: "/assets/models/buildings/",
    fileName: "wall_gate.glb",
    requiredNodes: ["WallGateRoot", "gateRoot", "gateDoorLeft", "gateDoorRight", "gateCollider", "friendlyPassTrigger", "LOD1", "LOD2"],
    requiredAnimations: ["GateOpen", "GateClose", "Damaged", "Destroyed"],
    fallback: "procedural",
  },
  ...UNIT_KEYS.map((key): AssetSpec => ({
    key,
    rootUrl: "/assets/models/characters/",
    fileName: `${key}.glb`,
    requiredNodes: ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Walk", "Attack", "Cast", "Hit", "Death"],
    fallback: "procedural",
  })),
  ...ECONOMY_ASSETS.map((key): AssetSpec => ({
    key,
    rootUrl: "/assets/models/buildings/",
    fileName: `${key}.glb`,
    requiredNodes: ["BuildingRoot", "productionCore", "workPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Operate", "Damaged", "Destroyed"],
    fallback: "procedural",
  })),
  ...ATTACK_ASSETS.map((key): AssetSpec => ({
    key,
    rootUrl: "/assets/models/buildings/",
    fileName: `${key}.glb`,
    requiredNodes: ["BuildingRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Aim", "Fire", "Recoil", "Damaged", "Destroyed"],
    fallback: "procedural",
  })),
  {
    key: "furnace",
    rootUrl: "/assets/models/buildings/",
    fileName: "furnace.glb",
    requiredNodes: ["FurnaceRoot", "heatCore", "furnaceCrown", "emitter", "LOD1", "LOD2"],
    requiredAnimations: ["Idle", "Operate", "Damaged", "Destroyed"],
    fallback: "procedural",
  },
];

export function authoredAssetSpec(key: AssetSpec["key"]): AssetSpec {
  const spec = AUTHORED_ASSET_MANIFEST.find((entry) => entry.key === key);
  if (!spec) throw new Error(`Unknown authored asset key: ${key}`);
  return spec;
}
