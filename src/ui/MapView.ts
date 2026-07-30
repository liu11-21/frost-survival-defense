import type { GameSystems } from "../game/GameSystems";
import { MINIMAP } from "../game/GameConfig";
import { gatherMinimapSnapshot } from "./MinimapData";
import { MinimapRenderer, type TempMarker } from "./MinimapRenderer";
import type { UIRefs } from "./UIRoot";

/**
 * Owns both the always-on corner minimap and the `M`-toggled full tactical
 * map. Both are the same 2D canvas renderer at different sizes; opening the
 * full map never spins up a second 3D `Scene`, it just draws the shared
 * snapshot bigger and slower time keeps ticking underneath it.
 */
export class MapView {
  private readonly mini: MinimapRenderer;
  private readonly full: MinimapRenderer;
  private acc = 0;
  private time = 0;
  private opened = false;
  private readonly tempMarkers: TempMarker[] = [];

  constructor(private readonly refs: UIRefs) {
    this.mini = new MinimapRenderer(refs.minimapCanvas);
    this.full = new MinimapRenderer(refs.mapCanvas);
    refs.mapCanvas.addEventListener("click", this.onFullMapClick);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** 1 in normal play; slowed while the full map covers the action, so nothing
   * takes full-speed damage unseen. */
  get timeScale(): number {
    return this.opened ? MINIMAP.fullMapTimeScale : 1;
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  open(): void {
    this.opened = true;
    this.refs.mapOverlay.classList.add("show");
    this.refs.mapTimeLabel.textContent = `戰術地圖：時間減速 ${Math.round(MINIMAP.fullMapTimeScale * 100)}%`;
  }

  close(): void {
    this.opened = false;
    this.refs.mapOverlay.classList.remove("show");
  }

  /** `dt` is real wall-clock time, not the (possibly slowed) simulation time —
   * the map's own animations must stay smooth even while it slows the game. */
  update(dt: number, s: GameSystems): void {
    this.time += dt;
    this.acc += dt;
    const interval = 1 / MINIMAP.updateHz;
    if (this.acc < interval) return;
    this.acc = 0;

    const snap = gatherMinimapSnapshot(s);
    this.mini.draw(snap, { worldExtent: MINIMAP.miniWorldExtent, detailed: false, time: this.time });
    this.refs.minimap.classList.toggle("breach", snap.anyBreach);
    if (this.opened) {
      this.full.draw(snap, {
        worldExtent: MINIMAP.fullWorldExtent,
        detailed: true,
        time: this.time,
        tempMarkers: this.tempMarkers,
        tempMarkerLifetime: MINIMAP.tempMarkerLifetime,
      });
    }
  }

  private readonly onFullMapClick = (e: MouseEvent): void => {
    if (!this.opened) return;
    const rect = this.refs.mapCanvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const half = Math.min(rect.width, rect.height) / 2;
    const scale = (half / MINIMAP.fullWorldExtent) * 0.94;
    const worldX = (cssX - rect.width / 2) / scale;
    const worldZ = -(cssY - rect.height / 2) / scale;
    this.tempMarkers.push({ x: worldX, z: worldZ, bornAt: this.time });
    if (this.tempMarkers.length > 12) this.tempMarkers.shift();
  };

  dispose(): void {
    this.refs.mapCanvas.removeEventListener("click", this.onFullMapClick);
  }
}
