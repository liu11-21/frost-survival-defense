import type { BuildSlot } from "../buildings/BuildSlot";
import type { BuildingManager } from "../buildings/BuildingManager";
import { BUILDING_BY_ID } from "../data/BuildingDefinitions";
import type { Furnace } from "../heat/Furnace";
import type { HeroController } from "../hero/HeroController";
import { entityName, t } from "../localization";
import type { NaturalResourceNode } from "../resources/NaturalResourceNode";
import type { ResourceNodeManager } from "../resources/ResourceNodeManager";
import type { RunController } from "../modes/RunController";

export type InteractionKind = "none" | "buildSlot" | "furnace" | "collect" | "node";

export interface Interaction {
  kind: InteractionKind;
  label: string;
  detail: string;
  slot: BuildSlot | null;
  node: NaturalResourceNode | null;
  enabled: boolean;
}

const NONE: Interaction = { kind: "none", label: "", detail: "", slot: null, node: null, enabled: false };
const REACH = { slot: 3.4, furnace: 4.2, node: 3.0 };

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

    const slot = this.nearestSlot(x, z);
    if (slot) {
      const dist = Math.hypot(slot.x - x, slot.z - z);
      if (dist <= REACH.slot) consider(dist, () => this.describeSlot(slot));
    }

    const furnaceDist = Math.hypot(x, z);
    if (furnaceDist <= this.furnace.hitRadius + REACH.furnace) {
      consider(furnaceDist, () => this.describeFurnace());
    }

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
      const name = entityName("building", def.id, def.name);
      if (!building.isComplete) {
        return {
          kind: "buildSlot",
          label: t("prompt.buildProgress", { name }),
          detail: t("prompt.progressDetail", {
            progress: (building.buildProgress * 100).toFixed(0),
            seconds: building.buildRemaining.toFixed(1),
          }),
          slot,
          node: null,
          enabled: true,
        };
      }
      if (def.produces && building.storedAmount >= 1) {
        const resource = t(`resource.${def.produces}`);
        return {
          kind: "collect",
          label: t("prompt.collect", { amount: Math.floor(building.storedAmount), resource }),
          detail: building.storedAmount >= (def.bufferCap ?? 100) ? t("prompt.bufferFull") : name,
          slot,
          node: null,
          enabled: true,
        };
      }
      const status = def.canBeAttacked
        ? t("prompt.health", { health: Math.ceil(building.health), max: building.maxHealth })
        : t("prompt.invulnerable");
      return {
        kind: "buildSlot",
        label: t("prompt.inspect", { name }),
        detail: t("prompt.demolishable", { status }),
        slot,
        node: null,
        enabled: true,
      };
    }

    if (!slot.isUnlocked(this.furnace.currentLevel)) {
      return {
        kind: "buildSlot",
        label: t("prompt.unlock"),
        detail: t("prompt.unlockDetail", {
          level: slot.unlockLevel,
          sky: slot.surface === "sky" ? t("prompt.skyPlatform") : "",
        }),
        slot,
        node: null,
        enabled: false,
      };
    }

    const pending = this.buildings.rebuildQueue.all.findIndex((i) => i.slotId === slot.id);
    if (pending >= 0) {
      const item = this.buildings.rebuildQueue.all[pending];
      const def = BUILDING_BY_ID.get(item.buildingType);
      const name = def ? entityName("building", def.id, def.name) : item.buildingType;
      return {
        kind: "buildSlot",
        label: t("prompt.build"),
        detail: t("prompt.waitRebuild", { name, position: pending + 1 }),
        slot,
        node: null,
        enabled: true,
      };
    }

    const detail = slot.category === "wall"
      ? t("prompt.wallSlot")
      : slot.surface === "sky"
        ? t("prompt.skySlot")
        : t("prompt.generalSlot");
    return { kind: "buildSlot", label: t("prompt.build"), detail, slot, node: null, enabled: true };
  }

  private describeFurnace(): Interaction {
    if (!this.run.allowFurnaceUpgrade) {
      return {
        kind: "furnace",
        label: t("prompt.viewFurnace"),
        detail: t("prompt.upgradeDisabled"),
        slot: null,
        node: null,
        enabled: true,
      };
    }
    const cost = this.run.furnaceUpgradeCost;
    return {
      kind: "furnace",
      label: t("prompt.viewFurnaceUpgrade"),
      detail: t("prompt.upgradeCost", {
        level: this.furnace.currentLevel,
        wood: cost.wood ?? 0,
        stone: cost.stone ?? 0,
        gold: cost.gold ?? 0,
      }),
      slot: null,
      node: null,
      enabled: true,
    };
  }

  private describeNode(node: NaturalResourceNode): Interaction {
    const resource = t(`resource.${node.kind}`);
    if (node.isDepleted) {
      return {
        kind: "node",
        label: t(node.kind === "wood" ? "prompt.treeDepleted" : "prompt.oreDepleted"),
        detail: "",
        slot: null,
        node,
        enabled: false,
      };
    }
    return {
      kind: "node",
      label: t("prompt.autoCollect", { resource }),
      detail: t("prompt.remaining", { remaining: node.remaining, capacity: node.capacity }),
      slot: null,
      node,
      enabled: false,
    };
  }
}
