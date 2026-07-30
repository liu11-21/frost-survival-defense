import type { GameEvents } from "../game/GameEvents";

export type TutorialTrigger =
  | "moved"
  | "choppedWood"
  | "minedStone"
  | "openedBuildMenu"
  | "builtProduction"
  | "openedRecruit"
  | "openedFurnace"
  | "waveCleared";

export interface TutorialStep {
  id: TutorialTrigger;
  title: string;
  body: string;
  /** What to highlight in the world while this step is active. */
  highlight: "none" | "tree" | "stone" | "slot" | "recruitHall" | "furnace" | "enemies";
}

/**
 * One task at a time, advanced by actually doing the thing — never by reading a
 * wall of text. Every step is short and the whole sequence can be skipped.
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "moved",
    title: "移動",
    body: "使用 W、A、S、D 移動主角。",
    highlight: "none",
  },
  {
    id: "choppedWood",
    title: "砍伐樹木",
    body: "靠近樹木，主角會自動砍伐。每棵樹的木材是有限的。",
    highlight: "tree",
  },
  {
    id: "minedStone",
    title: "開採石頭",
    body: "靠近天然礦石，主角會自動採集石頭。",
    highlight: "stone",
  },
  {
    id: "openedBuildMenu",
    title: "打開建造選單",
    body: "靠近發光的建築點位並按 E。",
    highlight: "slot",
  },
  {
    id: "builtProduction",
    title: "建造生產設施",
    body: "選擇礦場或伐木場並確認。紅色數字表示資源不足。",
    highlight: "slot",
  },
  {
    id: "openedRecruit",
    title: "招募小隊",
    body: "建造招募所後靠近它按 E，可花費金幣召集戰鬥小隊。",
    highlight: "recruitHall",
  },
  {
    id: "openedFurnace",
    title: "火爐升級",
    body: "靠近中央火爐按 E，查看升級效果與成本。",
    highlight: "furnace",
  },
  {
    id: "waveCleared",
    title: "防守",
    body: "保護中央火爐。火爐被摧毀即失敗。",
    highlight: "enemies",
  },
];

/**
 * Tracks progress through the tutorial. It is a pure state holder — the game
 * reports what the player did and asks what to show next.
 */
export class TutorialController {
  private index = -1;
  private _active = false;
  private _completed = false;

  constructor(private readonly events: GameEvents) {}

  get active(): boolean {
    return this._active;
  }
  get completed(): boolean {
    return this._completed;
  }
  get currentStep(): TutorialStep | null {
    return this._active && this.index >= 0 && this.index < TUTORIAL_STEPS.length
      ? TUTORIAL_STEPS[this.index]
      : null;
  }
  get progress(): string {
    return this._active ? `${this.index + 1} / ${TUTORIAL_STEPS.length}` : "";
  }

  start(): void {
    this._active = true;
    this._completed = false;
    this.index = 0;
    this.announce();
  }

  skip(): void {
    if (!this._active) return;
    this._active = false;
    this._completed = true;
    this.events.emit("tutorialComplete", {});
  }

  stop(): void {
    this._active = false;
    this.index = -1;
  }

  /** The player did something; advance if it satisfies the current step. */
  report(trigger: TutorialTrigger): void {
    const step = this.currentStep;
    if (!step || step.id !== trigger) return;
    this.index += 1;
    if (this.index >= TUTORIAL_STEPS.length) {
      this._active = false;
      this._completed = true;
      this.events.emit("tutorialComplete", {});
      return;
    }
    this.announce();
  }

  private announce(): void {
    const step = this.currentStep;
    if (!step) return;
    this.events.emit("tutorialStep", {
      index: this.index,
      total: TUTORIAL_STEPS.length,
      title: step.title,
      body: step.body,
    });
  }
}
