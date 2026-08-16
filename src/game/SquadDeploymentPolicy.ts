import { Vector3 } from "@babylonjs/core";
import type { Squad } from "../combat/Squad";
import { LANES, nearestLanePoint, nearestPointOnLane, type LaneProjection } from "../data/BuildSlotDefinitions";
import { ENGINEER_RULES } from "../data/EngineerConfig";
import { FURNACE } from "../data/FurnaceUpgradeConfig";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import type { GameSystems } from "./GameSystems";

const RECRUIT_DROP_MAX_ROAD_DISTANCE = 4.5;
const GOLDEN_ANGLE = 2.399963229728653;

/** The fire-circle is a reserve deployment zone, separate from the four roads. */
export const CENTRAL_DEPLOYMENT_SQUAD_LIMIT = 2;

export type RecruitDeploymentZone = "central" | "lane";

export interface RecruitDeployment {
  zone: RecruitDeploymentZone;
  laneIndex: number;
  x: number;
  z: number;
  projection: LaneProjection;
}

export interface RecruitDeploymentResult {
  ok: boolean;
  message: string;
  deployment?: RecruitDeployment;
}

interface DeploymentMeta {
  zone: RecruitDeploymentZone;
  laneIndex: number;
  homeX: number;
  homeZ: number;
}

const deploymentBySquad = new WeakMap<Squad, DeploymentMeta>();
const fallbackHomeBySquad = new WeakMap<Squad, { x: number; z: number } | null>();

function centralLaneIndex(x: number, z: number): number {
  if (Math.abs(z) >= Math.abs(x)) return z >= 0 ? 0 : 2;
  return x >= 0 ? 1 : 3;
}

function safeCentralPoint(x: number, z: number, laneIndex: number): { x: number; z: number } {
  const radius = Math.hypot(x, z);
  const minimumRadius = FURNACE.radius + 1.1;
  if (radius >= minimumRadius) return { x, z };

  const lane = LANES[laneIndex];
  const inner = lane.path[Math.max(0, lane.path.length - 2)];
  const len = Math.hypot(inner.x, inner.z) || 1;
  return {
    x: (inner.x / len) * minimumRadius,
    z: (inner.z / len) * minimumRadius,
  };
}

function resolveDeployment(defId: string, x: number, z: number): RecruitDeploymentResult {
  const def = ALLY_BY_ID.get(defId);
  if (!def) return { ok: false, message: "未知兵種，無法部署" };

  const central = Math.hypot(x, z) <= FURNACE.healRadius;
  if (def.canRepair && !central) {
    return { ok: false, message: "工程兵只能部署在火爐回血範圍內" };
  }

  if (central) {
    const laneIndex = centralLaneIndex(x, z);
    const lane = LANES[laneIndex];
    const point = safeCentralPoint(x, z, laneIndex);
    return {
      ok: true,
      message: "",
      deployment: {
        zone: "central",
        laneIndex,
        x: point.x,
        z: point.z,
        projection: nearestPointOnLane(point.x, point.z, lane),
      },
    };
  }

  const projection = nearestLanePoint(x, z, RECRUIT_DROP_MAX_ROAD_DISTANCE);
  if (!projection) {
    return { ok: false, message: "請把兵種拖到火爐圓區或任一完整進攻路線上" };
  }
  return {
    ok: true,
    message: "",
    deployment: {
      zone: "lane",
      laneIndex: projection.laneIndex,
      x: projection.x,
      z: projection.z,
      projection,
    },
  };
}

function centralSquadsUsed(s: GameSystems): number {
  let count = 0;
  for (const squad of s.squads.allySquads) {
    if (!squad.alive || squad.isEngineerSquad || squad.isGroundSupportSquad) continue;
    if (deploymentBySquad.get(squad)?.zone === "central") count++;
  }
  return count;
}

function setSquadHome(squad: Squad, x: number, z: number): void {
  for (const member of squad.members) {
    if (!member.alive) continue;
    if (member.home) member.home.set(x, 0, z);
    else member.home = new Vector3(x, 0, z);
  }
}

function clearSquadHome(squad: Squad): void {
  for (const member of squad.members) {
    if (member.alive) member.home = null;
  }
}

function placeSquad(squad: Squad, deployment: RecruitDeployment): void {
  const lane = LANES[deployment.laneIndex];
  const from = lane.path[deployment.projection.segmentIndex];
  const to = lane.path[Math.min(lane.path.length - 1, deployment.projection.segmentIndex + 1)];
  const tx = to.x - from.x;
  const tz = to.z - from.z;
  const len = Math.hypot(tx, tz) || 1;
  const sideX = -tz / len;
  const sideZ = tx / len;
  const inwardYaw = Math.atan2(to.x - deployment.projection.x, to.z - deployment.projection.z);

  for (let i = 0; i < squad.members.length; i++) {
    const member = squad.members[i];
    const offset = (i - (squad.members.length - 1) * 0.5) * 0.9;
    const px = deployment.x + sideX * offset;
    const pz = deployment.z + sideZ * offset;
    member.laneIndex = deployment.laneIndex;
    member.setPosition(px, pz);
    member.setYaw(inwardYaw);
    member.home = member.position.clone();
  }

  deploymentBySquad.set(squad, {
    zone: deployment.zone,
    laneIndex: deployment.laneIndex,
    homeX: deployment.x,
    homeZ: deployment.z,
  });
}

/**
 * Validates the drop before spending resources, then delegates the actual
 * recruit transaction to RunController. This keeps hall/cost/capacity rules
 * authoritative while giving deployment its own spatial contract.
 */
export function tryDeployRecruit(s: GameSystems, defId: string, x: number, z: number): RecruitDeploymentResult {
  const resolved = resolveDeployment(defId, x, z);
  if (!resolved.ok || !resolved.deployment) return resolved;

  const def = ALLY_BY_ID.get(defId);
  if (!def) return { ok: false, message: "未知兵種，無法部署" };

  if (
    resolved.deployment.zone === "central" &&
    !def.canRepair &&
    centralSquadsUsed(s) >= CENTRAL_DEPLOYMENT_SQUAD_LIMIT
  ) {
    return { ok: false, message: `火爐圓區最多部署 ${CENTRAL_DEPLOYMENT_SQUAD_LIMIT} 隊` };
  }

  const before = s.squads.allySquads.length;
  const failure = s.run.tryRecruit(defId);
  if (failure) return { ok: false, message: failure };

  const squad = s.squads.allySquads[s.squads.allySquads.length - 1];
  if (!squad || s.squads.allySquads.length <= before) {
    return { ok: false, message: "招募完成但部署失敗，請重新嘗試" };
  }

  placeSquad(squad, resolved.deployment);
  s.squadHud.markDirty();
  const lane = LANES[resolved.deployment.laneIndex];
  return {
    ok: true,
    message:
      resolved.deployment.zone === "central"
        ? `${squad.def.name}已部署至火爐防線（${lane.shortName}方向）`
        : `${squad.def.name}已部署至${lane.shortName}`,
    deployment: resolved.deployment,
  };
}

function recoveryAnchor(index: number): { x: number; z: number } {
  // Keep the farthest ranged/backline formation slot inside the real 9-unit
  // furnace heal aura: 6.4 anchor + 1.6 backline + 0.95 member spread < 9.
  const radius = 3.2 + (index % 3) * 1.6;
  const angle = index * GOLDEN_ANGLE;
  return { x: Math.sin(angle) * radius, z: Math.cos(angle) * radius };
}

function laneArmyCentre(s: GameSystems, laneIndex: number): { x: number; z: number } | null {
  let x = 0;
  let z = 0;
  let count = 0;
  for (const squad of s.squads.allySquads) {
    if (!squad.alive || squad.isEngineerSquad || squad.isGroundSupportSquad || squad.def.id === "flagbearer") continue;
    for (const member of squad.members) {
      if (!member.alive || member.laneIndex !== laneIndex) continue;
      x += member.position.x;
      z += member.position.z;
      count++;
    }
  }
  return count > 0 ? { x: x / count, z: z / count } : null;
}

function rememberFallbackHome(squad: Squad): void {
  if (deploymentBySquad.has(squad) || fallbackHomeBySquad.has(squad)) return;
  const home = squad.members.find((member) => member.alive && member.home)?.home ?? null;
  fallbackHomeBySquad.set(squad, home ? { x: home.x, z: home.z } : null);
}

function restoreCombatHome(squad: Squad): void {
  const meta = deploymentBySquad.get(squad);
  if (meta) {
    setSquadHome(squad, meta.homeX, meta.homeZ);
    return;
  }
  if (!fallbackHomeBySquad.has(squad)) return;
  const fallback = fallbackHomeBySquad.get(squad) ?? null;
  if (fallback) setSquadHome(squad, fallback.x, fallback.z);
  else clearSquadHome(squad);
}

/**
 * Updates only rally/home presentation metadata. Combat target selection,
 * repair acquisition, costs and wave state remain owned by their existing
 * systems.
 */
export function updateSquadDeploymentPolicy(s: GameSystems, enemiesPresent: boolean): void {
  if (!enemiesPresent) {
    let recoveryIndex = 0;
    for (const squad of s.squads.allySquads) {
      if (!squad.alive || squad.isGroundSupportSquad) continue;
      rememberFallbackHome(squad);
      const anchor = recoveryAnchor(recoveryIndex++);
      setSquadHome(squad, anchor.x, anchor.z);
    }
    return;
  }

  let engineerIndex = 0;
  for (const squad of s.squads.allySquads) {
    if (!squad.alive || squad.isGroundSupportSquad) continue;

    if (squad.isEngineerSquad) {
      const angle = engineerIndex * (Math.PI * 2 / 5);
      setSquadHome(
        squad,
        Math.sin(angle) * ENGINEER_RULES.furnaceIdleRadius,
        Math.cos(angle) * ENGINEER_RULES.furnaceIdleRadius,
      );
      engineerIndex++;
      continue;
    }

    if (squad.def.id === "flagbearer") {
      const laneIndex = squad.members.find((member) => member.alive)?.laneIndex ?? deploymentBySquad.get(squad)?.laneIndex ?? 0;
      const centre = laneArmyCentre(s, laneIndex);
      if (centre) setSquadHome(squad, centre.x, centre.z);
      else restoreCombatHome(squad);
      continue;
    }

    restoreCombatHome(squad);
  }
}
