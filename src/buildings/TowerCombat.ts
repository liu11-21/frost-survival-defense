import { Vector3 } from "@babylonjs/core";
import type { CombatContext } from "../combat/CombatContext";
import type { Damageable } from "../combat/Damageable";
import type { Building } from "./Building";

const aimPoint = new Vector3();
const comboByTower = new WeakMap<Building, { targetId: number; hits: number }>();

/**
 * One tower volley. Aims where the blast covers the most enemies, falling back
 * to the highest tier, and returns false when there is nothing worth firing at
 * so the caller keeps its cooldown ready.
 */
export function fireTower(tower: Building, ctx: CombatContext): boolean {
  const def = tower.def;
  const range = tower.isSky ? (def.attackRange ?? 10) * 1.5 : (def.attackRange ?? 10);
  const radius = def.areaRadius ?? 2.5;
  const maxTargets = tower.isSky ? 9 : (def.maxAreaTargets ?? 6);
  const candidates = ctx.world.queryUnits("enemy", tower.position.x, tower.position.z, range);
  if (candidates.length === 0) return false;

  let bestX = candidates[0].position.x;
  let bestZ = candidates[0].position.z;
  let bestScore = -1;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    let covered = 0;
    for (let j = 0; j < candidates.length; j++) {
      const o = candidates[j];
      const dx = o.position.x - c.position.x;
      const dz = o.position.z - c.position.z;
      if (dx * dx + dz * dz <= radius * radius) covered++;
    }
    const dx = tower.position.x - c.position.x;
    const dz = tower.position.z - c.position.z;
    const score = covered * 100 + c.level * 10 - Math.sqrt(dx * dx + dz * dz) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestX = c.position.x;
      bestZ = c.position.z;
    }
  }

  const power = tower.attackPower * ctx.scaling.towerAttack;
  const primary = candidates.find((candidate) => candidate.position.x === bestX && candidate.position.z === bestZ) ?? candidates[0];
  tower.aimAt(bestX, bestZ);
  tower.pulseRecoil();
  const previous = comboByTower.get(tower);
  const combo = tower.isSky && previous?.targetId === primary.damageId
    ? Math.min(previous.hits, 10)
    : 0;
  const volleyPower = power * (1 + combo * 0.05);
  ctx.vfx.burstAt("muzzleFlash", tower.position.x, tower.position.z, 22);
  if (tower.isSky && combo > 0) ctx.vfx.burstAt("pierce", bestX, bestZ, 10 + combo * 2);
  aimPoint.set(bestX, 0, bestZ);
  const aim: Damageable = {
    damageId: -1,
    faction: "enemy",
    position: aimPoint,
    alive: true,
    hitRadius: 0.2,
    kind: "unit",
    level: 0,
    threat: 0,
    health: 1,
    maxHealth: 1,
    applyDamage: () => {},
  };
  ctx.projectiles.fire("shell", tower.position.x, 3.3, tower.position.z, aim, (hx, hz) => {
    ctx.areaDamage("ally", hx, hz, radius, volleyPower, maxTargets, undefined, "ranged");
    if (tower.isSky) {
      if (primary.alive) {
        comboByTower.set(tower, {
          targetId: primary.damageId,
          hits: previous?.targetId === primary.damageId ? Math.min(10, (previous.hits ?? 0) + 1) : 1,
        });
      } else comboByTower.delete(tower);
    }
    ctx.vfx.areaBlast(hx, hz, radius);
  });
  ctx.vfx.sound("towerFire", 0.55, 0.9 + Math.random() * 0.2);
  return true;
}
