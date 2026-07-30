import type { Scene } from "@babylonjs/core";
import type { SlotPicker } from "../ui/SlotPicker";

/** CSS-pixel movement under this is a click; at or above it, a drag. Small
 * enough that a 1-2px hand tremor never cancels a click, per the click-vs-drag
 * spec this router implements. */
const DRAG_THRESHOLD_CSS_PX = 6;

export type PointerClassification = "click" | "drag" | "none";

export interface PointerDebugState {
  downX: number;
  downY: number;
  upX: number;
  upY: number;
  displacementPx: number;
  classification: PointerClassification;
  hitWorldSlot: string | null;
  finalHandler: string;
  blocked: boolean;
  processingMs: number;
}

export interface PointerRouterCallbacks {
  /** False while a modal/panel/map/pause layer should swallow world clicks. */
  canActOnWorld(): boolean;
  onSlotClick(slotId: string): void;
}

/**
 * Canvas-level click/drag classification plus world hit-testing. DOM buttons
 * and panels never reach this: they sit in front on their own `pointer-events:
 * auto` layer and take the event first, which is what already implements most
 * of "modal > panels > HUD" priority — this router only owns what's left,
 * the canvas itself: world objects, then ground, then (if it ever exists)
 * camera drag.
 */
export class PointerRouter {
  readonly debug: PointerDebugState = {
    downX: 0,
    downY: 0,
    upX: 0,
    upY: 0,
    displacementPx: 0,
    classification: "none",
    hitWorldSlot: null,
    finalHandler: "none",
    blocked: false,
    processingMs: 0,
  };

  private downActive = false;
  private downX = 0;
  private downY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly scene: Scene,
    private readonly picker: SlotPicker,
    private readonly callbacks: PointerRouterCallbacks,
  ) {
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointerup", this.onPointerUp);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.downActive = true;
    this.downX = e.clientX;
    this.downY = e.clientY;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.downActive) return;
    this.downActive = false;
    const t0 = performance.now();

    // clientX/Y are CSS pixels on both ends, so this comparison is already
    // correct under browser zoom and high-DPI without any manual scaling —
    // the bug class that needs scaling is mixing these with canvas backing-
    // store pixels, which never happens here.
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    const displacement = Math.hypot(dx, dy);
    const classification: PointerClassification = displacement <= DRAG_THRESHOLD_CSS_PX ? "click" : "drag";

    this.debug.downX = this.downX;
    this.debug.downY = this.downY;
    this.debug.upX = e.clientX;
    this.debug.upY = e.clientY;
    this.debug.displacementPx = Number(displacement.toFixed(1));
    this.debug.classification = classification;
    this.debug.hitWorldSlot = null;

    if (classification !== "click") {
      this.debug.finalHandler = "drag";
      this.debug.blocked = false;
      this.debug.processingMs = Number((performance.now() - t0).toFixed(2));
      return;
    }

    if (!this.callbacks.canActOnWorld()) {
      this.debug.finalHandler = "blocked";
      this.debug.blocked = true;
      this.debug.processingMs = Number((performance.now() - t0).toFixed(2));
      return;
    }

    // Babylon already tracks its own pointer position in render-target space
    // from the same canvas events, correctly accounting for devicePixelRatio —
    // reusing it here avoids re-deriving (and possibly mismatching) that
    // conversion ourselves.
    const slotId = this.picker.pick(this.scene, this.scene.pointerX, this.scene.pointerY);
    this.debug.hitWorldSlot = slotId;
    this.debug.blocked = false;
    this.debug.finalHandler = slotId ? "slotClick" : "ground";
    if (slotId) this.callbacks.onSlotClick(slotId);
    this.debug.processingMs = Number((performance.now() - t0).toFixed(2));
  };

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
  }
}
