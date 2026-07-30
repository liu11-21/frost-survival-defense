import type { ActionKey } from "../player/PlayerInput";
import type { PanelResult } from "../ui/ActionPanels";
import type { MenuChoice } from "../ui/GameMenus";
import type { GameSystems } from "./GameSystems";

export interface InputHandlers {
  action(key: ActionKey): void;
  menu(choice: MenuChoice): void;
  balance(action: string): void;
  resize(): void;
  result(result: PanelResult): void;
}

/**
 * All the wiring between the DOM, the input reader and the game.
 *
 * Kept out of `Game` so the frame loop and the rules glue stay readable; this
 * file is pure hookup and contains no gameplay decisions.
 */
export function bindGameInput(
  s: GameSystems,
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
): void {
  // Browsers only allow audio after a gesture, so any input unlocks it.
  s.input.onAnyKey = () => s.audio.unlock();
  canvas.addEventListener("pointerdown", () => s.audio.unlock());
  s.refs.root.addEventListener("pointerdown", () => s.audio.unlock());

  s.input.onAction = (action) => handlers.action(action);
  s.menus.onChoice = (choice) => handlers.menu(choice);
  s.onBalanceAction = (action) => handlers.balance(action);

  s.hero.onFootstep = () => s.audio.play("footstep", 0.6, 0.85 + Math.random() * 0.4);
  s.hero.onDeath = () => {
    s.run.onHeroDeath();
    s.events.emit("heroDown", {});
  };
  s.hero.onRevive = () => s.events.emit("heroRevived", {});

  s.panels.onResult = (result) => handlers.result(result);
  s.panels.onToast = (text) => s.hud.toast(text);
  s.panels.onBuilt = (type) => {
    if (type === "mine" || type === "lumberyard") s.tutorial.report("builtProduction");
  };

  // A short state-lock, not a long debounce: prevents the classic double
  // fire from one physical click landing as two DOM click events (or a very
  // fast double-click) without delaying a legitimate second, deliberate press.
  s.refs.upgradeButton.addEventListener("click", () => lockThenRun(s.refs.upgradeButton, () => handlers.action("upgrade")));
  s.refs.callWaveButton.addEventListener("click", () => lockThenRun(s.refs.callWaveButton, () => handlers.action("callWave")));
  s.refs.rebuildToggle.addEventListener("click", () => lockThenRun(s.refs.rebuildToggle, () => handlers.action("toggleRebuild")));

  // The tutorial's skip button is re-created with the card, so delegate.
  s.refs.tutorial.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.id === "ui-tut-skip") s.tutorial.skip();
  });

  window.addEventListener("resize", handlers.resize);
}

const LOCK_MS = 180;
/** Tracks its own lock state rather than the `disabled` attribute — these
 * buttons' real enabled/disabled state is already owned by `GameHud`
 * (auto-rebuilder built yet? furnace upgrade affordable?), so this must not
 * fight that by writing `disabled` itself. `.loading` is purely a transient
 * visual cue on top. */
const locked = new WeakSet<HTMLButtonElement>();

/** A short state-lock, not a long debounce: stops one physical click from
 * firing the action twice (double DOM click, very fast double-click) without
 * delaying a legitimate second, deliberate press on a different control. */
function lockThenRun(button: HTMLButtonElement, run: () => void): void {
  if (locked.has(button)) return;
  run();
  locked.add(button);
  button.classList.add("loading");
  window.setTimeout(() => {
    locked.delete(button);
    button.classList.remove("loading");
  }, LOCK_MS);
}
