import type { HeroSkills } from "../hero/HeroSkills";

interface SkillSlotRefs {
  el: HTMLElement;
  fill: HTMLElement;
  cdText: HTMLElement;
}

/**
 * Renders the Q/R/F cooldown fills and countdown numbers. Reads straight from
 * `HeroSkills.states()` — the same source `tryUse` checks — so the HUD can
 * never show "ready" while a cast would actually still fail.
 */
export class HeroSkillHud {
  private readonly slots: SkillSlotRefs[];

  constructor(container: HTMLElement, private readonly skills: HeroSkills) {
    this.slots = Array.from(container.querySelectorAll<HTMLElement>(".skill-slot")).map((el) => ({
      el,
      fill: el.querySelector(".skill-bar > i") as HTMLElement,
      cdText: el.querySelector(".skill-cd-text") as HTMLElement,
    }));
  }

  update(): void {
    const states = this.skills.states();
    for (let i = 0; i < this.slots.length && i < states.length; i++) {
      const state = states[i];
      const { el, fill, cdText } = this.slots[i];
      const frac = state.cooldown > 0 ? 1 - state.remaining / state.cooldown : 1;
      fill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
      cdText.textContent = state.ready ? "" : state.remaining.toFixed(1);
      el.classList.toggle("ready", state.ready);
    }
  }
}
