import type { BuildSlot } from "../buildings/BuildSlot";
import type { BuildingManager } from "../buildings/BuildingManager";
import { BUILDING_BY_ID } from "../data/BuildingDefinitions";
import { RESOURCE_LABELS } from "../data/EconomyConfig";
import type { Furnace } from "../heat/Furnace";
import type { HeroController } from "../hero/HeroController";
import type { NaturalResourceNode } from "../resources/NaturalResourceNode";
import type { ResourceNodeManager } from "../resources/ResourceNodeManager";
import type { RunController } from "../modes/RunController";

export type InteractionKind = "none" | "buildSlot" | "furnace" | "collect" | "node";

export interface Interaction {
  kind: InteractionKind;
  /** The `E` label, e.g. "E　建造設施". */
  label: string;
  /** Secondary line: cost, stock, or why it is unavailable. */
  detail: string;
  slot: BuildSlot | null;
  node: NaturalResourceNode | null;
  /** Blocked interactions still show, so the player learns the rule. */
  enabled: boolean;
}

const NONE: Interaction = {
  kind: "none",
  label: "",
  detail: "",
  slot: null,
  node: null,
  enabled: false,
};

const REACH = { slot: 3.4, furnace: 4.2, node: 3.0 };

/**
 * Decides the single most relevant thing the player can press `E` on.
 *
 * Only one prompt is ever shown — the nearest valid one — so the screen never
 * fills with competing hints.
 *
 * Every occupied slot resolves to `"buildSlot"` unless it has resources
 * waiting to be collected. That single kind is what opens the build panel,
 * and the build panel always shows a completed building's info card with its
 * demolish button (see `ActionPanels.renderBuild` / `BuildingInfoPanel`) —
 * regardless of whether the building can be attacked. Recruiting and the
 * auto-rebuild toggle both have their own always-available keys (`R` and
 * `T`), so routing `E` through the same info panel for the recruit hall and
 * the auto-rebuilder costs nothing and is what makes them demolishable at
 * all: previously `E` on those two ran their quick action instead of ever
 * opening a panel, so their demolish button was unreachable through the
 * prompt the game actually tells the player to use.
 */
export class ContextPrompt {
  private current: Interaction = NONE;

  constructor(
    private readonly buildings: BuildingManager,
    private readonly furnace: Furnace,
    private readonly nodes: ResourceNodeManager,
    private readonly run: RunController,
  ) {}

  get interaction(): Interaction {
    return this.current;
  }

  evaluate(hero: HeroController): Interaction {
    const x = hero.position.x;
    const z = hero.position.z;

    let best: Interaction = NONE;
    let bestDist = Infinity;

    const consider = (dist: number, make: () => Interaction): void => {
      if (dist >= bestDist) return;
      bestDist = dist;
      best = make();
    };

    // --- build slots -------------------------------------------------------
    const slot = this.nearestSlot(x, z);
    if (slot) {
      const dist = Math.hypot(slot.x - x, slot.z - z);
      if (dist <= REACH.slot) consider(dist, () => this.describeSlot(slot));
    }

    // --- the furnace -------------------------------------------------------
    const furnaceDist = Math.hypot(x, z);
    if (furnaceDist <= this.furnace.hitRadius + REACH.furnace) {
      consider(furnaceDist, () => this.describeFurnace());
    }

    // --- a resource node ---------------------------------------------------
    const node = this.nodes.findNearestAny(x, z, REACH.node);
    if (node) {
      const dist = Math.sqrt(node.distanceSqTo(x, z));
      consider(dist, () => this.describeNode(node));
    }

    this.current = best;
    return best;
  }

  private nearestSlot(x: number, z: number): BuildSlot | null {
    let best: BuildSlot | null = null;
    let bestDist = REACH.slot * REACH.slot;
    for (const slot of this.buildings.slots) {
      const dx = slot.x - x;
      const dz = slot.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestDist) {
        bestDist = d;
        best = slot;
      }
    }
    return best;
  }

  private describeSlot(slot: BuildSlot): Interaction {
    const building = slot.building;

    if (building?.alive) {
      const def = building.def;
      if (!building.isComplete) {
        return {
          kind: "buildSlot",
          label: `E　查看建造進度：${def.name}`,
          detail: `進度 ${(building.buildProgress * 100).toFixed(0)}% · 剩餘 ${building.buildRemaining.toFixed(1)} 秒`,
          slot,
          node: null,
          enabled: true,
        };
      }
      if (def.produces && building.storedAmount >= 1) {
        const label = RESOURCE_LABELS[def.produces];
        return {
          kind: "collect",
          label: `E　收取 ${Math.floor(building.storedAmount)} ${label}`,
          detail: building.storedAmount >= (def.bufferCap ?? 100) ? "暫存已滿" : def.name,
          slot,
          node: null,
          enabled: true,
        };
      }
      const hp = def.canBeAttacked
        ? `生命 ${Math.ceil(building.health)} / ${building.maxHealth}`
        : "不可被攻擊";
      return {
        kind: "buildSlot",
        label: `E　查看設施：${def.name}`,
        detail: `${hp} · 可拆除`,
        slot,
        node: null,
        enabled: true,
      };
    }

    // Empty slot: say exactly what may go here, or exactly why nothing can.
    const pending = this.buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
    if (pending >= 0) {
      const item = this.buildings.rebuildQueue.all[pending];
      const def = BUILDING_BY_ID.get(item.buildingType);
      return {
        kind: "buildSlot",
        label: "E　建造設施",
        detail: `等待自動重建：${def?.name ?? item.buildingType}（佇列第 ${pending + 1} 位）`,
        slot,
        node: null,
        enabled: true,
      };
    }

    const detail = slot.category === "wall" ? slot.name : `${slot.name} · 可建造任何一般設施`;
    return {
      kind: "buildSlot",
      label: "E　建造設施",
      detail,
      slot,
      node: null,
      enabled: true,
    };
  }

  private describeFurnace(): Interaction {
    if (!this.run.allowFurnaceUpgrade) {
      return {
        kind: "furnace",
        label: "E　查看火爐",
        detail: "本關卡禁止升級火爐",
        slot: null,
        node: null,
        enabled: true,
      };
    }
    const cost = this.run.furnaceUpgradeCost;
    return {
      kind: "furnace",
      label: "E　查看火爐升級",
      detail: `Lv.${this.furnace.currentLevel} · ${cost.wood ?? 0} 木 ${cost.stone ?? 0} 石 ${cost.gold ?? 0} 金`,
      slot: null,
      node: null,
      enabled: true,
    };
  }

  private describeNode(node: NaturalResourceNode): Interaction {
    const label = RESOURCE_LABELS[node.kind];
    if (node.isDepleted) {
      return {
        kind: "node",
        label: node.kind === "wood" ? "此樹木已耗盡" : "此礦點已耗盡",
        detail: "",
        slot: null,
        node,
        enabled: false,
      };
    }
    return {
      kind: "node",
      label: `靠近自動採集 ${label}`,
      detail: `剩餘 ${node.remaining} / ${node.capacity}`,
      slot: null,
      node,
      enabled: false,
    };
  }
}
