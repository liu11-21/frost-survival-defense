import { LANES, MAP } from "../data/BuildSlotDefinitions";
import { BUILD_MENU_CATEGORY_NAMES, type BuildMenuCategory } from "../data/BuildMenuCategories";
import type { MinimapSnapshot } from "./MinimapData";

export interface TempMarker {
  x: number;
  z: number;
  bornAt: number;
}

export interface MinimapDrawOptions {
  /** World units mapped to the canvas half-size. */
  worldExtent: number;
  /** Draw slot-name labels and a finer road/lane readout (full map only). */
  detailed: boolean;
  /** Seconds, for the breach-warning flash and marker fade. */
  time: number;
  tempMarkers?: readonly TempMarker[];
  tempMarkerLifetime?: number;
}

const CATEGORY_COLOR: Record<BuildMenuCategory, string> = {
  production: "#caa46a",
  support: "#8aa8d8",
  defense: "#e08a6a",
  automation: "#6adfc0",
};

/** Shared 2D renderer for the always-on minimap and full tactical map. */
export class MinimapRenderer {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  private ensureBackingSize(): { w: number; h: number } {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || this.canvas.width;
    const cssH = this.canvas.clientHeight || this.canvas.height;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return { w, h };
  }

  draw(snap: MinimapSnapshot, opts: MinimapDrawOptions): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = this.ensureBackingSize();
    const cx = w / 2;
    const cy = h / 2;
    const scale = (Math.min(w, h) / 2 / opts.worldExtent) * 0.94;
    const toX = (x: number) => cx + x * scale;
    const toY = (z: number) => cy - z * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(8, 12, 22, 0.82)";
    ctx.fillRect(0, 0, w, h);

    this.drawRoads(ctx, toX, toY, opts.detailed);
    this.drawBounds(ctx, toX, toY);
    this.drawWalls(ctx, snap, toX, toY, opts);
    this.drawSlots(ctx, snap, toX, toY, opts);
    this.drawFurnace(ctx, snap, toX, toY);
    this.drawClusters(ctx, snap.enemyClusters, "#ff5a46", toX, toY);
    this.drawClusters(ctx, snap.allyClusters, "#5a9bff", toX, toY);
    if (snap.boss) this.drawBoss(ctx, snap.boss, toX, toY, opts.time);
    if (snap.hero.alive) this.drawHero(ctx, snap.hero, toX, toY);
    this.drawCameraRect(ctx, snap.camera, toX, toY);
    if (opts.tempMarkers) {
      this.drawTempMarkers(ctx, opts.tempMarkers, opts.time, opts.tempMarkerLifetime ?? 6, toX, toY);
    }
  }

  /** The map now draws exactly the same path points EnemyNavigator follows. */
  private drawRoads(
    ctx: CanvasRenderingContext2D,
    toX: (x: number) => number,
    toY: (z: number) => number,
    detailed: boolean,
  ): void {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const lane of LANES) {
      if (lane.path.length < 2) continue;
      ctx.strokeStyle = "rgba(180, 160, 140, 0.46)";
      ctx.lineWidth = detailed ? 5 : 2.3;
      ctx.beginPath();
      ctx.moveTo(toX(lane.path[0].x), toY(lane.path[0].z));
      for (let i = 1; i < lane.path.length; i++) {
        ctx.lineTo(toX(lane.path[i].x), toY(lane.path[i].z));
      }
      ctx.stroke();

      // Direction chevrons are intentionally sparse: one at the remote mouth
      // and one near the wall, enough to make the attack direction unambiguous.
      const arrowIndices = [1, Math.max(1, lane.gatePointIndex - 2)];
      for (const index of arrowIndices) {
        const from = lane.path[Math.max(0, index - 1)];
        const to = lane.path[index];
        const dx = toX(to.x) - toX(from.x);
        const dy = toY(to.z) - toY(from.z);
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const x = toX(to.x);
        const y = toY(to.z);
        const size = detailed ? 7 : 4;
        ctx.fillStyle = "rgba(238, 206, 166, 0.78)";
        ctx.beginPath();
        ctx.moveTo(x + ux * size, y + uy * size);
        ctx.lineTo(x - ux * size * 0.7 + px * size * 0.55, y - uy * size * 0.7 + py * size * 0.55);
        ctx.lineTo(x - ux * size * 0.7 - px * size * 0.55, y - uy * size * 0.7 - py * size * 0.55);
        ctx.closePath();
        ctx.fill();
      }

      if (detailed) {
        const spawn = lane.path[0];
        ctx.fillStyle = "rgba(230, 235, 255, 0.86)";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(lane.shortName, toX(spawn.x), toY(spawn.z) - 8);
      }
    }
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
  }

  private drawBounds(ctx: CanvasRenderingContext2D, toX: (x: number) => number, toY: (z: number) => number): void {
    ctx.strokeStyle = "rgba(220, 230, 255, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      toX(-MAP.baseHalfWidth),
      toY(MAP.baseHalfDepth),
      toX(MAP.baseHalfWidth) - toX(-MAP.baseHalfWidth),
      toY(-MAP.baseHalfDepth) - toY(MAP.baseHalfDepth),
    );
  }

  private drawWalls(
    ctx: CanvasRenderingContext2D,
    snap: MinimapSnapshot,
    toX: (x: number) => number,
    toY: (z: number) => number,
    opts: MinimapDrawOptions,
  ): void {
    const flash = 0.55 + 0.45 * Math.sin(opts.time * 6);
    for (const wall of snap.wallSides) {
      const half = wall.length / 2;
      const dx = wall.axis === "x" ? half : 0;
      const dz = wall.axis === "z" ? half : 0;
      const ax = wall.x - dx;
      const az = wall.z - dz;
      const bx = wall.x + dx;
      const bz = wall.z + dz;
      ctx.lineWidth = wall.state === "sealed" ? 4 : 3;
      ctx.strokeStyle =
        wall.state === "open"
          ? "rgba(255, 120, 100, 0.55)"
          : wall.state === "sealed"
            ? "#8fe3b0"
            : `rgba(255, 90, 70, ${flash})`;
      ctx.beginPath();
      ctx.moveTo(toX(ax), toY(az));
      ctx.lineTo(toX(bx), toY(bz));
      ctx.stroke();
    }
  }

  private drawSlots(
    ctx: CanvasRenderingContext2D,
    snap: MinimapSnapshot,
    toX: (x: number) => number,
    toY: (z: number) => number,
    opts: MinimapDrawOptions,
  ): void {
    for (const slot of snap.emptySlots) {
      ctx.beginPath();
      ctx.arc(toX(slot.x), toY(slot.z), opts.detailed ? 4 : 2.4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200, 215, 255, 0.55)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    for (const structure of snap.structures) {
      const size = opts.detailed ? 7 : 4.4;
      const x = toX(structure.x);
      const y = toY(structure.z);
      ctx.fillStyle = CATEGORY_COLOR[structure.category];
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  private drawFurnace(
    ctx: CanvasRenderingContext2D,
    snap: MinimapSnapshot,
    toX: (x: number) => number,
    toY: (z: number) => number,
  ): void {
    const x = toX(0);
    const y = toY(0);
    ctx.fillStyle = snap.furnaceHealthPct < 0.3 ? "#ff8a4a" : "#ff9a3c";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 220, 180, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawClusters(
    ctx: CanvasRenderingContext2D,
    clusters: readonly { x: number; z: number; count: number }[],
    color: string,
    toX: (x: number) => number,
    toY: (z: number) => number,
  ): void {
    for (const cluster of clusters) {
      const x = toX(cluster.x);
      const y = toY(cluster.z);
      const r = Math.min(9, 3 + Math.sqrt(cluster.count) * 1.4);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (cluster.count > 1) {
        ctx.fillStyle = "#fff";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`×${cluster.count}`, x, y - r - 3);
      }
    }
  }

  private drawBoss(
    ctx: CanvasRenderingContext2D,
    boss: { x: number; z: number; healthPct: number },
    toX: (x: number) => number,
    toY: (z: number) => number,
    time: number,
  ): void {
    const x = toX(boss.x);
    const y = toY(boss.z);
    const pulse = 9 + Math.sin(time * 5) * 1.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "#ff2a1a";
    ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
    ctx.restore();
    ctx.strokeStyle = "#fff0ea";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - pulse / 2 - 1, y - pulse / 2 - 1, pulse + 2, pulse + 2);
  }

  private drawHero(
    ctx: CanvasRenderingContext2D,
    hero: { x: number; z: number },
    toX: (x: number) => number,
    toY: (z: number) => number,
  ): void {
    const x = toX(hero.x);
    const y = toY(hero.z);
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd76a";
    ctx.fill();
    ctx.strokeStyle = "#3a6bff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawCameraRect(
    ctx: CanvasRenderingContext2D,
    camera: { x: number; z: number; radius: number },
    toX: (x: number) => number,
    toY: (z: number) => number,
  ): void {
    if (camera.radius <= 0) return;
    const x0 = toX(camera.x - camera.radius);
    const y0 = toY(camera.z + camera.radius);
    const x1 = toX(camera.x + camera.radius);
    const y1 = toY(camera.z - camera.radius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);
  }

  private drawTempMarkers(
    ctx: CanvasRenderingContext2D,
    markers: readonly TempMarker[],
    time: number,
    lifetime: number,
    toX: (x: number) => number,
    toY: (z: number) => number,
  ): void {
    for (const marker of markers) {
      const age = time - marker.bornAt;
      if (age < 0 || age > lifetime) continue;
      const fade = 1 - age / lifetime;
      const x = toX(marker.x);
      const y = toY(marker.z);
      ctx.strokeStyle = `rgba(255, 214, 120, ${fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 8 * (1 + (1 - fade) * 0.6), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/** Human labels for the category legend, exported so a HUD legend can reuse it. */
export const CATEGORY_LEGEND: Array<{ category: BuildMenuCategory; name: string; color: string }> = (
  Object.keys(CATEGORY_COLOR) as BuildMenuCategory[]
).map((category) => ({ category, name: BUILD_MENU_CATEGORY_NAMES[category], color: CATEGORY_COLOR[category] }));
