export type ActionKey =
  | "interact"
  | "build"
  | "recruit"
  | "upgrade"
  | "callWave"
  | "toggleRebuild"
  | "pause"
  | "confirm"
  | "perfPanel"
  | "aiPanel"
  | "stressPanel"
  | "balancePanel"
  | "verifyPanel"
  | "map"
  | "skill1"
  | "skill2"
  | "skill3";

const MOVE_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);

const ACTION_KEYS: Record<string, ActionKey> = {
  KeyE: "interact",
  Enter: "confirm",
  F3: "perfPanel",
  F6: "verifyPanel",
  F7: "aiPanel",
  F8: "stressPanel",
  F9: "balancePanel",
  KeyB: "build",
  // Recruit stays on G while the hero's three manual skills use the number row.
  KeyG: "recruit",
  KeyU: "upgrade",
  KeyN: "callWave",
  KeyT: "toggleRebuild",
  KeyM: "map",
  Digit1: "skill1",
  Digit2: "skill2",
  Digit3: "skill3",
  Escape: "pause",
};

/**
 * Movement is WASD only; every command verb is a single key so the player never
 * has to hunt through nested menus mid-wave.
 */
export class PlayerInput {
  private readonly keys = new Set<string>();
  private wheelDelta = 0;
  private disposed = false;

  onAction: ((action: ActionKey) => void) | null = null;
  onAnyKey: (() => void) | null = null;

  private readonly keyDown = (e: KeyboardEvent): void => {
    const action = ACTION_KEYS[e.code];
    if (action) {
      e.preventDefault();
      this.onAnyKey?.();
      this.onAction?.(action);
      return;
    }
    if (MOVE_KEYS.has(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
      this.onAnyKey?.();
    }
  };

  private readonly keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly blur = (): void => {
    this.keys.clear();
  };

  private readonly wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.wheelDelta += Math.sign(e.deltaY);
  };

  /** Canvas-relative cursor position, used for hover inspection. */
  private pointerX = -1;
  private pointerY = -1;
  private pointerInside = false;

  private readonly pointerMove = (e: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = e.clientX - rect.left;
    this.pointerY = e.clientY - rect.top;
    this.pointerInside = true;
  };

  private readonly pointerLeave = (): void => {
    this.pointerInside = false;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerleave", this.pointerLeave);
  }

  /** Null when the cursor is not over the game canvas. */
  get pointer(): { x: number; y: number } | null {
    return this.pointerInside ? { x: this.pointerX, y: this.pointerY } : null;
  }

  get moveX(): number {
    return (
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0)
    );
  }

  get moveZ(): number {
    return (
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) -
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0)
    );
  }

  get sprinting(): boolean {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  }

  get hasMoveInput(): boolean {
    return this.moveX !== 0 || this.moveZ !== 0;
  }

  consumeWheel(): number {
    const value = this.wheelDelta;
    this.wheelDelta = 0;
    return value;
  }

  clear(): void {
    this.keys.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blur);
    this.canvas.removeEventListener("wheel", this.wheel);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerleave", this.pointerLeave);
  }
}
