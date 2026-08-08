import type { Scene } from "@babylonjs/core";
import type { SlotPicker } from "../ui/SlotPicker";
import { RECRUIT_DRAG_MIME } from "./RecruitDrag";

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
  canActOnWorld(): boolean;
  onSlotClick(slotId: string): void;
  /** A recruit icon was dropped onto a real world-space ground point. */
  onRecruitDrop?(defId: string, x: number, z: number): void;
}

/** Canvas click classification, slot hit-testing and roster drag/drop. */
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
    canvas.addEventListener("dragover", this.onDragOver);
    canvas.addEventListener("drop", this.onDrop);
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

    const point = this.renderPoint(e.clientX, e.clientY);
    const slotId = this.picker.pick(this.scene, point.x, point.y);
    this.debug.hitWorldSlot = slotId;
    this.debug.blocked = false;
    this.debug.finalHandler = slotId ? "slotClick" : "ground";
    if (slotId) this.callbacks.onSlotClick(slotId);
    this.debug.processingMs = Number((performance.now() - t0).toFixed(2));
  };

  private readonly onDragOver = (event: DragEvent): void => {
    if (!event.dataTransfer?.types.includes(RECRUIT_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = this.callbacks.canActOnWorld() ? "copy" : "none";
  };

  private readonly onDrop = (event: DragEvent): void => {
    const transfer = event.dataTransfer;
    if (!transfer) return;
    const defId = transfer.getData(RECRUIT_DRAG_MIME);
    if (!defId) return;
    event.preventDefault();
    if (!this.callbacks.canActOnWorld()) return;

    const point = this.renderPoint(event.clientX, event.clientY);
    const pick = this.scene.pick(point.x, point.y, (mesh) => mesh.name === "ground");
    const worldPoint = pick?.pickedPoint;
    if (!pick?.hit || !worldPoint) return;
    this.callbacks.onRecruitDrop?.(defId, worldPoint.x, worldPoint.z);
  };

  /** Convert DOM client coordinates into Babylon render-buffer coordinates.
   * Click picking and recruit drop must use the same conversion; relying on
   * Scene.pointerX/Y makes slot selection dependent on Babylon's last pointer
   * observable update and breaks under CSS/device scaling or synthetic input. */
  private renderPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const engine = this.scene.getEngine();
    return {
      x: (clientX - rect.left) * (engine.getRenderWidth() / Math.max(1, rect.width)),
      y: (clientY - rect.top) * (engine.getRenderHeight() / Math.max(1, rect.height)),
    };
  }

  dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("dragover", this.onDragOver);
    this.canvas.removeEventListener("drop", this.onDrop);
  }
}
