import type { BuildSlot } from "../buildings/BuildSlot";
import type { NaturalResourceNode } from "../resources/NaturalResourceNode";
import type { GameSystems } from "./GameSystems";

const SLOT_REACH = 3.4;

/**
 * The per-frame UI refresh: the contextual prompt, the nearest build slot, the
 * boss bar and the tutorial card. Pure presentation — no rules live here.
 */
export function updateFrameUi(s: GameSystems, workingNode: NaturalResourceNode | null): void {
  updateSlotFocus(s);
  updatePrompt(s);
  trackBoss(s);
  updateBossBar(s);
  updateTutorial(s, workingNode);
}

/** Refreshes the single on-screen interaction hint. */
function updatePrompt(s: GameSystems): void {
  const it = s.prompt.evaluate(s.hero);
  s.hud.setPrompt(it.label, it.detail, it.enabled);
}

/** Binds the boss controller to whichever boss is currently on the field. */
function trackBoss(s: GameSystems): void {
  if (s.boss.active) return;
  for (const unit of s.world.enemies) {
    if (unit.alive && unit.def.id === "boss") {
      s.boss.attach(unit);
      return;
    }
  }
}

function updateBossBar(s: GameSystems): void {
  const boss = s.boss.boss;
  s.hud.setBoss(
    s.boss.active && boss !== null,
    boss?.def.name ?? "",
    s.boss.currentPhase,
    boss?.health ?? 0,
    boss?.maxHealth ?? 1,
    s.boss.slamProgress,
    s.boss.hasTowerResistance,
  );
}

function updateTutorial(s: GameSystems, workingNode: NaturalResourceNode | null): void {
  const step = s.tutorial.currentStep;
  s.hud.setTutorial(step?.title ?? "", step?.body ?? "", s.tutorial.progress);
  if (!step) return;
  // Progress is reported by doing, not by dismissing a message.
  if (s.input.hasMoveInput) s.tutorial.report("moved");
  if (workingNode) s.tutorial.report(workingNode.kind === "wood" ? "choppedWood" : "minedStone");
}

function updateSlotFocus(s: GameSystems): void {
  let nearest: BuildSlot | null = null;
  let bestDist = SLOT_REACH * SLOT_REACH;
  for (const slot of s.buildings.slots) {
    const dx = slot.x - s.hero.position.x;
    const dz = slot.z - s.hero.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      nearest = slot;
    }
  }
  s.panels.setNearbySlot(nearest);
  s.arena.setSelected(nearest?.id ?? null);
}

