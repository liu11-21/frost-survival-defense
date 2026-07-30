import type { CombatWorld } from "./CombatWorld";
import type { CombatUnit } from "./CombatUnit";
import type { Squad } from "./Squad";
import type { SquadManager } from "./SquadManager";

/**
 * Advances only corpse visuals while pause, upgrade or result menus have
 * halted the main simulation. This deliberately does not tick combat,
 * cooldowns, movement or economy.
 */
export function updateHaltedDeathLifecycle(squads: SquadManager, world: CombatWorld, dt: number): void {
  advanceDead(world.allies, dt);
  advanceDead(world.enemies, dt);
  world.removeDead();

  for (const squad of squads.allySquads) {
    if (!squad.alive && !squad.wipeReported) {
      squad.wipeReported = true;
      squads.onSquadWiped?.(squad);
    }
    squad.pruneExpiredMembers();
  }
  for (const squad of squads.enemySquads) squad.pruneExpiredMembers();

  pruneSquads(squads.allySquads);
  pruneSquads(squads.enemySquads);
}

function advanceDead(list: CombatUnit[], dt: number): void {
  for (const unit of list) {
    if (!unit.alive) unit.update(dt);
  }
}

function pruneSquads(list: Squad[]): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const squad = list[read];
    const gone = !squad.alive && squad.members.length === 0;
    if (gone) squad.dispose();
    else list[write++] = squad;
  }
  list.length = write;
}
