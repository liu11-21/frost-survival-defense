import type { HeroSkills } from "../hero/HeroSkills";
import { t } from "../localization";

interface SkillSlotRefs {
  el: HTMLElement;
  key: HTMLElement;
  name: HTMLElement;
  description: HTMLElement;
  count: HTMLElement;
  fill: HTMLElement;
  cdText: HTMLElement;
}

/** Localized presentation over the same HeroSkills runtime state. */
export class HeroSkillHud {
  private readonly slots: SkillSlotRefs[];

  constructor(container: HTMLElement, private readonly skills: HeroSkills) {
    this.slots = Array.from(container.querySelectorAll<HTMLElement>(".skill-slot")).map((el) => ({
      el,
      key: el.querySelector(".skill-key") as HTMLElement,
      name: el.querySelector(".skill-name") as HTMLElement,
      description: el.querySelector(".skill-description") as HTMLElement,
      count: el.querySelector(".skill-count") as HTMLElement,
      fill: el.querySelector(".skill-bar > i") as HTMLElement,
      cdText: el.querySelector(".skill-cd-text") as HTMLElement,
    }));
  }

  update(): void {
    const states = this.skills.states();
    for (let i = 0; i < this.slots.length && i < states.length; i++) {
      const state = states[i];
      const { el, key, name, description, count, fill, cdText } = this.slots[i];
      key.textContent = state.keyLabel;
      name.textContent = t(`skill.${state.id}.name`);
      description.textContent = t(`skill.${state.id}.short`);
      count.textContent = state.activeAttackBuildings === undefined ? "" : String(state.activeAttackBuildings);
      count.classList.toggle("show", state.activeAttackBuildings !== undefined);
      const frac = state.cooldown > 0 ? 1 - state.remaining / state.cooldown : 1;
      fill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
      cdText.textContent = state.activeRemaining > 0
        ? t("skill.active", { seconds: state.activeRemaining.toFixed(1) })
        : state.ready
          ? ""
          : state.remaining.toFixed(1);
      el.classList.toggle("ready", state.ready);
      el.classList.toggle("active", state.activeRemaining > 0);
    }
  }
}
