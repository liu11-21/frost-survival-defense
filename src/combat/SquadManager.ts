import { Vector3 } from "@babylonjs/core";
import { FormationSlotManager } from "../ai/FormationSlotManager";
import { FriendlyBrain } from "../ai/FriendlyStateMachine";
import { validateTarget } from "../ai/TargetValidator";
import type { Faction, UnitDefinition } from "../data/CombatTypes";
import { ALLY_BY_ID } from "../data/UnitDefinitions";
import { ENEMY_BY_ID } from "../data/EnemyDefinitions";
import { ALLY_ENGAGE_RANGE } from "./UnitTargeting";
import { registerClaim, resetClaims } from "../ai/ThreatTracker";
import type { Building } from "../buildings/Building";
import type { BuildingManager } from "../buildings/BuildingManager";
import type { CombatContext } from "./CombatContext";
import { CombatUnit } from "./CombatUnit";
import type { Damageable } from "./Damageable";
import type { HumanoidTemplateCache } from "./LiteHumanoid";
import { Squad } from "./Squad";

/**
 * Owns every squad on the field, runs their updates, and keeps ally squads in a
 * loose formation around the rally point when they have nothing to fight.
 */
export class SquadManager {
  readonly allySquads: Squad[] = [];
  readonly enemySquads: Squad[] = [];
  readonly formation = new FormationSlotManager();
  /** Fired once when an ally squad loses its last member. */
  onSquadWiped: ((squad: Squad) => void) | null = null;
  /**
   * Set once after construction. `SquadManager` is built before
   * `BuildingManager` exists, so this cannot be a constructor dependency —
   * the engineer's repair target search is the only thing that needs it.
   */
  buildings: BuildingManager | null = null;

  private readonly anchor = new Vector3();
  private readonly member = new Vector3();
  private readonly fallbackRally = new Vector3();
  private claimTimer = 0;

  constructor(
    private readonly templates: HumanoidTemplateCache,
    private readonly ctx: CombatContext,
  ) {}

  /**
   * Recruitment capacity is measured in squads, never individual members.
   * A living three-person squad therefore consumes exactly one slot.
   */
  get allySquadSlotsUsed(): number {
    let n = 0;
    for (const s of this.allySquads) if (s.alive) n++;
    return n;
  }

  get livingEnemyUnits(): number {
    let n = 0;
    for (const s of this.enemySquads) n += s.aliveCount;
    return n;
  }

  get livingAllyUnits(): number {
    let n = 0;
    for (const s of this.allySquads) n += s.aliveCount;
    return n;
  }

  /** Every living friendly individual, for the watchdog and debug tools. */
  eachAlly(fn: (unit: CombatUnit) => void): void {
    for (const squad of this.allySquads) {
      for (const m of squad.members) if (m.alive) fn(m);
    }
  }

  recruit(defId: string, x: number, z: number): Squad | null {
    const def = ALLY_BY_ID.get(defId);
    if (!def) return null;
    const squad = this.spawnSquad(def, "ally", x, z, this.ctx.scaling.allyHealth, this.ctx.scaling.allyAttack);
    this.allySquads.push(squad);
    for (const m of squad.members) {
      m.attachBrain(
        new FriendlyBrain(m, {
          ctx: this.ctx,
          formation: this.formation,
          requestHeal: (unit) => this.beginHeal(unit),
          hasHealTarget: (unit) => this.findHealTarget(unit) !== null,
          findHealPosition: (unit) => this.findHealPosition(unit),
          releaseHeal: (unit) => this.releaseHeal(unit),
          findRepairTarget: (unit) => this.findRepairTarget(unit),
          requestRepair: (unit, target) => this.beginRepair(unit, target),
          releaseRepair: (unit) => this.releaseRepair(unit),
        }),
      );
      this.ctx.world.allies.push(m);
    }
    if (def.ambushOnSpawn) this.performAmbush(squad);
    return squad;
  }

  spawnEnemy(defId: string, x: number, z: number, laneIndex: number, extraHealthMul = 1, extraAttackMul = 1): Squad | null {
    const def = ENEMY_BY_ID.get(defId);
    if (!def) return null;
    const squad = this.spawnSquad(
      def,
      "enemy",
      x,
      z,
      this.ctx.scaling.enemyHealth * extraHealthMul,
      this.ctx.scaling.enemyAttack * extraAttackMul,
    );
    this.enemySquads.push(squad);
    for (const m of squad.members) {
      m.laneIndex = laneIndex;
      m.siegeMultiplier = def.siegeMultiplier ?? 1;
      this.ctx.world.enemies.push(m);
    }
    return squad;
  }

  private spawnSquad(
    def: UnitDefinition,
    faction: Faction,
    x: number,
    z: number,
    healthMul: number,
    attackMul: number,
  ): Squad {
    const squad = new Squad(def, faction);
    const template = this.templates.get(def.visual);
    for (let i = 0; i < def.squadSize; i++) {
      const rig = template.spawn(def.scale);
      const unit = new CombatUnit(def, faction, rig, this.ctx, healthMul, attackMul, squad.id);
      this.formation.memberSlot(i, def.squadSize, x, z, this.member);
      unit.setPosition(this.member.x, this.member.z);
      unit.setYaw(Math.atan2(-x, -z));
      squad.add(unit);
      this.ctx.vfx.registerHealthBar(unit);
    }
    return squad;
  }

  /** Assault troopers blink onto the biggest threat the instant they arrive. */
  private performAmbush(squad: Squad): void {
    const world = this.ctx.world;
    let best: CombatUnit | null = null;
    let bestLevel = -1;
    let bestDist = Infinity;
    for (const enemy of world.enemies) {
      if (!enemy.alive) continue;
      const d = enemy.position.x * enemy.position.x + enemy.position.z * enemy.position.z;
      if (enemy.level > bestLevel || (enemy.level === bestLevel && d < bestDist)) {
        bestLevel = enemy.level;
        bestDist = d;
        best = enemy;
      }
    }
    // No legal target: the squad simply spawns normally and fights its way in.
    if (!best) return;

    const def = squad.def;
    let placed = 0;
    for (let i = 0; i < squad.members.length; i++) {
      const m = squad.members[i];
      const radius = best.hitRadius + m.hitRadius + 0.85;
      let landed = false;
      // Try several angles, then a wider ring, before giving up on this member.
      for (let attempt = 0; attempt < 8 && !landed; attempt++) {
        const angle = ((i + attempt) / 8) * Math.PI * 2;
        const r = radius + Math.floor(attempt / 4) * 0.8;
        const px = best.position.x + Math.sin(angle) * r;
        const pz = best.position.z + Math.cos(angle) * r;
        if (Math.hypot(px, pz) > 40) continue;
        m.setPosition(px, pz);
        m.setYaw(Math.atan2(best.position.x - px, best.position.z - pz));
        m.grantDamageReduction(def.ambushShieldFactor ?? 0.5, def.ambushShieldTime ?? 2);
        this.ctx.vfx.teleport(px, pz);
        landed = true;
        placed++;
      }
    }
    if (placed > 0) this.ctx.vfx.sound("assaultTeleport", 0.7);
  }

  /**
   * Runs every squad. `rally` is where ally squads gather when nothing is in
   * reach — normally the hero, falling back to the furnace when they are down,
   * which is what stops units from freezing with a null rally point.
   */
  /**
   * Runs every squad, including wiped ones.
   *
   * The `!squad.alive` skip that used to guard this loop is why dead friendlies
   * stayed on the field forever: once the last member of a squad fell, the squad
   * stopped being updated, so its members' corpse timers never advanced,
   * `readyToRemove` never became true, and neither the squad roster nor the
   * combat world ever recycled them. Enemy squads had no such guard, which is
   * exactly why only friendly bodies piled up.
   */
  update(dt: number, rally: Vector3 | null): void {
    this.formation.beginFrame();

    const point = rally ?? this.fallbackRally;
    let index = 0;
    for (const squad of this.allySquads) {
      if (squad.alive) {
        this.formation.rallySlot(index, point.x, point.z, this.anchor);
        squad.assignRally(this.anchor, this.formation);
        index++;
      } else if (!squad.wipeReported) {
        squad.wipeReported = true;
        this.onSquadWiped?.(squad);
      }
      squad.update(dt);
    }

    for (const squad of this.enemySquads) squad.update(dt);

    this.claimTimer -= dt;
    if (this.claimTimer <= 0) {
      this.claimTimer = 0.5;
      resetClaims();
      this.eachAlly((unit) => {
        const target = unit.currentTarget;
        if (target && target.alive && target.faction === "enemy") registerClaim(target.damageId);
      });
    }

    prune(this.allySquads);
    prune(this.enemySquads);
  }

  /** Notifies every friendly that the wave changed so nothing holds old state. */
  onWaveBoundary(): void {
    this.eachAlly((unit) => unit.aiBrain?.onWaveBoundary());
  }

  // -------------------------------------------------------------- heal -----

  /**
   * The single most-wounded friendly squad on the whole field, or null.
   * Shared by the medic brain's "is there anything to do" check and the heal
   * itself, so the two can never disagree. Not range-limited: a medic finds
   * its patient anywhere and walks to them (through a gate if it must),
   * rather than only ever healing whoever happens to already be nearby.
   */
  private findHealTarget(healer: CombatUnit): Squad | null {
    let best: Squad | null = null;
    let bestPct = Infinity;
    let bestDist = Infinity;

    for (const squad of this.allySquads) {
      if (!squad.alive || !squad.needsHealing) continue;
      squad.centre(this.member);
      const dx = this.member.x - healer.position.x;
      const dz = this.member.z - healer.position.z;
      const dist = dx * dx + dz * dz;
      const pct = squad.healthPercent();
      if (pct < bestPct - 0.0001 || (Math.abs(pct - bestPct) <= 0.0001 && dist < bestDist)) {
        bestPct = pct;
        bestDist = dist;
        best = squad;
      }
    }
    return best;
  }

  /** The actual world position a medic should stand at to reach `findHealTarget`'s pick. */
  private findHealPosition(healer: CombatUnit): { x: number; z: number } | null {
    const squad = this.findHealTarget(healer);
    if (!squad) return null;
    squad.centre(this.member);
    return { x: this.member.x, z: this.member.z };
  }

  /**
   * Arms one squad-wide heal. The healer's animation hit frame applies it, so
   * three medics in a squad still produce exactly one event per interval.
   */
  private beginHeal(healer: CombatUnit): boolean {
    const squad = this.allySquads.find((s) => s.id === healer.squadId);
    if (!squad || !squad.canHealNow()) return false;
    const target = this.findHealTarget(healer);
    if (!target) return false;
    squad.armHeal(target, this.ctx);
    return true;
  }

  private releaseHeal(healer: CombatUnit): boolean {
    const squad = this.allySquads.find((s) => s.id === healer.squadId);
    return squad ? squad.releaseHeal(this.ctx) : false;
  }

  // ------------------------------------------------------------- repair ----

  /**
   * The single weakest attackable, complete, non-demolishing structure in
   * range — never the furnace, never a building that cannot be attacked at
   * all, which rules it out as damaged in the first place.
   *
   * The search radius is the same generous engagement range every other ally
   * uses to spot a fight, not the engineer's melee `attackRange` — otherwise
   * it could only ever notice a building it was already standing next to.
   */
  private findRepairTarget(engineer: CombatUnit): Damageable | null {
    const buildings = this.buildings;
    if (!buildings) return null;
    let best: Building | null = null;
    let bestPct = Infinity;
    let bestDist = Infinity;
    const range = ALLY_ENGAGE_RANGE;

    for (const slot of buildings.slots) {
      const b = slot.building;
      if (!b || !b.alive || !b.def.canBeAttacked || !b.isComplete || b.isDemolishing) continue;
      if (b.health >= b.maxHealth) continue;
      const dx = b.position.x - engineer.position.x;
      const dz = b.position.z - engineer.position.z;
      const dist = dx * dx + dz * dz;
      if (dist > range * range) continue;
      const pct = b.health / b.maxHealth;
      if (pct < bestPct - 0.0001 || (Math.abs(pct - bestPct) <= 0.0001 && dist < bestDist)) {
        bestPct = pct;
        bestDist = dist;
        best = b;
      }
    }
    return best;
  }

  /**
   * Arms one squad-wide repair. Mirrors `beginHeal`: only one engineer per
   * squad can be armed at a time, so three engineers repair at one rate
   * rather than three times the rate.
   */
  private beginRepair(engineer: CombatUnit, target: Damageable): boolean {
    const squad = this.allySquads.find((s) => s.id === engineer.squadId);
    if (!squad || !squad.canRepairNow()) return false;
    squad.armRepair(target as Building);
    return true;
  }

  private releaseRepair(engineer: CombatUnit): boolean {
    const squad = this.allySquads.find((s) => s.id === engineer.squadId);
    return squad ? squad.releaseRepair(this.ctx) : false;
  }

  clearAll(): void {
    for (const s of this.allySquads) s.dispose();
    for (const s of this.enemySquads) s.dispose();
    this.allySquads.length = 0;
    this.enemySquads.length = 0;
  }

  clearEnemies(): void {
    for (const s of this.enemySquads) s.dispose();
    this.enemySquads.length = 0;
  }

  /** Drops references to anything that is no longer a legal target. */
  scrubInvalidTargets(): void {
    this.eachAlly((unit) => {
      const t = unit.currentTarget;
      if (t && validateTarget(unit, t) !== "ok") unit.setTarget(null);
    });
  }
}

function prune(list: Squad[]): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const squad = list[read];
    const gone = !squad.alive && squad.members.every((m) => m.readyToRemove);
    if (gone) squad.dispose();
    else list[write++] = squad;
  }
  list.length = write;
}
