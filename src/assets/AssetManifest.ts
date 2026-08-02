import type { AssetSpec } from "./AssetTypes";

/**
 * The public URL paths intentionally mirror the source Blender folders. A
 * missing file is a supported state: the game keeps its procedural renderer.
 */
export const AUTHORED_ASSET_MANIFEST: readonly AssetSpec[] = [
  {
    key: "hero",
    rootUrl: "/assets/models/characters/",
    fileName: "hero.glb",
    requiredNodes: ["HeroRoot", "weapon_socket.R", "ranged_socket"],
    requiredAnimations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"],
    fallback: "procedural",
  },
  {
    key: "turret_basic",
    rootUrl: "/assets/models/buildings/",
    fileName: "turret_basic.glb",
    requiredNodes: ["TurretRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart"],
    requiredAnimations: ["Idle", "Aim", "Fire", "Recoil", "Reload"],
    fallback: "procedural",
  },
  {
    key: "wall_gate",
    rootUrl: "/assets/models/buildings/",
    fileName: "wall_gate.glb",
    requiredNodes: ["WallGateRoot", "gateRoot", "gateDoorLeft", "gateDoorRight", "gateCollider", "friendlyPassTrigger"],
    requiredAnimations: ["GateOpen", "GateClose", "Damaged", "Destroyed"],
    fallback: "procedural",
  },
];

export function authoredAssetSpec(key: AssetSpec["key"]): AssetSpec {
  const spec = AUTHORED_ASSET_MANIFEST.find((entry) => entry.key === key);
  if (!spec) throw new Error(`Unknown authored asset key: ${key}`);
  return spec;
}
