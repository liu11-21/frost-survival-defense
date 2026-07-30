import { FURNACE } from "../data/FurnaceUpgradeConfig";
import { GATHER } from "../data/ResourceNodeConfig";
import type { NaturalResourceNode } from "../resources/NaturalResourceNode";
import type { GameSystems } from "./GameSystems";

/**
 * The per-frame odds and ends that are not combat, construction or waves:
 * the furnace aura, its self-repair, and the hero's hand gathering.
 */
export class SupportSystems {
  private healTimer = 0;
  private lastFurnaceHealth = 0;

  private gatherTimer = 0;
  private activeNode: NaturalResourceNode | null = null;
  private awayTimer = 0;
  private swingArmed = false;

  reset(furnaceHealth: number): void {
    this.healTimer = 0;
    this.lastFurnaceHealth = furnaceHealth;
    this.releaseNode();
  }

  /** The node the hero is currently working, for prompts and the tutorial. */
  get workingNode(): NaturalResourceNode | null {
    return this.activeNode;
  }

  update(dt: number, s: GameSystems): void {
    this.updateFurnace(dt, s);
    this.updateGathering(dt, s);
  }

  /** Furnace aura healing, self-repair, and the damage-event gate. */
  private updateFurnace(dt: number, s: GameSystems): void {
    const healed = s.furnace.update(dt);
    if (healed) s.audio.play("furnaceHeal", 0.25);
    if (s.furnace.health < this.lastFurnaceHealth - 0.5) {
      s.events.emit("furnaceDamaged", { health: s.furnace.health, maxHealth: s.furnace.maxHealth });
      s.healthBars.reveal(s.furnace);
    }
    this.lastFurnaceHealth = s.furnace.health;

    this.healTimer += dt;
    if (this.healTimer < FURNACE.healTick) return;
    const elapsed = this.healTimer;
    this.healTimer = 0;
    if (!s.furnace.alive) return;

    const rate = s.run.furnaceHealRate;
    const allies = s.world.queryUnits("ally", 0, 0, FURNACE.healRadius);
    for (const unit of allies) {
      if (!unit.alive) continue;
      const perSecond = Math.max(FURNACE.healMinimum, unit.maxHealth * FURNACE.healFraction);
      unit.heal(perSecond * elapsed * rate);
    }
    const hero = s.hero;
    if (hero.alive && hero.position.length() <= FURNACE.healRadius) {
      const perSecond = Math.max(FURNACE.healMinimum, hero.maxHealth * FURNACE.healFraction);
      hero.heal(perSecond * elapsed * rate);
    }
  }

  /**
   * Hand gathering.
   *
   * Resources are produced strictly on the tool's hit frame against a finite
   * node — there is no independent timer that could keep paying out, and
   * walking away stops production within `releaseDelay`.
   */
  private updateGathering(dt: number, s: GameSystems): void {
    if (!s.hero.alive) {
      this.releaseNode();
      return;
    }

    const node = s.nodes.findNearest(s.hero.position.x, s.hero.position.z, GATHER.range);

    if (!node) {
      // Grace period so a step sideways does not cancel a swing in progress.
      this.awayTimer += dt;
      if (this.awayTimer >= GATHER.releaseDelay) this.releaseNode();
      return;
    }

    this.awayTimer = 0;
    if (this.activeNode !== node) {
      this.releaseNode();
      this.activeNode = node;
      node.markHarvesting(true);
      // The first strike lands quickly so gathering feels immediate.
      const interval = node.kind === "wood" ? GATHER.woodInterval : GATHER.stoneInterval;
      const firstHit = node.kind === "wood" ? GATHER.woodFirstHit : GATHER.stoneFirstHit;
      this.gatherTimer = Math.max(0, interval - firstHit);
      this.swingArmed = false;
    }

    s.hero.faceGatherTarget(node.position.x, node.position.z, dt);

    const interval = node.kind === "wood" ? GATHER.woodInterval : GATHER.stoneInterval;
    this.gatherTimer += dt;
    if (this.gatherTimer < interval) return;

    // Start one swing; the payout happens when the tool actually connects.
    if (!this.swingArmed) {
      this.swingArmed = s.hero.beginGatherSwing();
      if (!this.swingArmed) return;
      this.gatherTimer = interval;
      return;
    }

    if (!s.hero.consumeGatherHit()) return;
    this.swingArmed = false;
    this.gatherTimer = 0;

    const yielded = node.extractOne();
    if (yielded <= 0) {
      s.hud.toast(node.kind === "wood" ? "此樹木已耗盡" : "此礦點已耗盡");
      this.releaseNode();
      return;
    }

    const stored = s.store.add(node.kind, yielded);
    if (stored > 0) {
      s.feedback.resourceGain(node.position.x, node.position.z, node.kind, yielded);
      if (node.kind === "wood") s.feedback.burstAt("treeSnow", node.position.x, node.position.z, 10);
      s.audio.play(node.kind === "wood" ? "gatherWood" : "gatherStone", 0.5, 0.9 + Math.random() * 0.2);
    } else {
      s.hud.toast("已達資源上限，建造倉庫可解除");
    }
  }

  private releaseNode(): void {
    this.activeNode?.markHarvesting(false);
    this.activeNode = null;
    this.gatherTimer = 0;
    this.awayTimer = 0;
    this.swingArmed = false;
  }
}
