import type { PointerRouter } from "../input/PointerRouter";

/**
 * `?inputDebug=1` only — never constructed otherwise, so there is no path
 * that shows this in normal play. Plain DOM, outside `#uiRoot`'s template,
 * so it can never be wiped by a HUD rebuild.
 */
export class InputDebugOverlay {
  private readonly el: HTMLDivElement;

  constructor(private readonly router: PointerRouter) {
    this.el = document.createElement("div");
    this.el.id = "input-debug-overlay";
    Object.assign(this.el.style, {
      position: "fixed",
      left: "8px",
      bottom: "8px",
      zIndex: "99999",
      background: "rgba(6, 10, 18, 0.82)",
      color: "#9fd9ff",
      font: "11px/1.5 monospace",
      padding: "8px 11px",
      borderRadius: "6px",
      whiteSpace: "pre",
      pointerEvents: "none",
      border: "1px solid rgba(140,178,230,0.4)",
    });
    document.body.appendChild(this.el);
  }

  update(): void {
    const d = this.router.debug;
    this.el.textContent =
      `[inputDebug]\n` +
      `down (${d.downX.toFixed(0)}, ${d.downY.toFixed(0)})  up (${d.upX.toFixed(0)}, ${d.upY.toFixed(0)})\n` +
      `displacement ${d.displacementPx}px -> ${d.classification}\n` +
      `hitWorldSlot: ${d.hitWorldSlot ?? "-"}\n` +
      `finalHandler: ${d.finalHandler}   blocked: ${d.blocked}\n` +
      `processing: ${d.processingMs}ms`;
  }

  dispose(): void {
    this.el.remove();
  }
}
