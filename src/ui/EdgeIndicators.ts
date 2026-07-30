import { Matrix, Vector3 } from "@babylonjs/core";
import type { GameCamera } from "../camera/GameCamera";
import type { CombatWorld } from "../combat/CombatWorld";
import { LANES } from "../data/BuildSlotDefinitions";

const REFRESH_INTERVAL = 0.2;
/** Inset from the viewport edge so the marker is never half off-screen. */
const MARGIN = 54;

interface LaneCluster {
  laneIndex: number;
  name: string;
  count: number;
  boss: boolean;
  nearest: number;
  x: number;
  z: number;
}

/**
 * Red markers pinned to the screen edge for enemies the camera cannot show.
 *
 * One marker per approach lane, not one per enemy: the player needs to know
 * "seven coming from 北方森林", not the position of each individual.
 */
export class EdgeIndicators {
  private timer = 0;
  private readonly elements = new Map<number, HTMLElement>();
  private readonly projected = new Vector3();

  constructor(
    private readonly host: HTMLElement,
    private readonly world: CombatWorld,
    private readonly camera: GameCamera,
  ) {}

  setVisible(visible: boolean): void {
    this.host.classList.toggle("show", visible);
    if (!visible) this.hideAll();
  }

  update(dt: number, width: number, height: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_INTERVAL;

    const clusters = this.cluster(width, height);
    for (const [index, el] of this.elements) {
      if (!clusters.has(index)) el.classList.remove("show");
    }
    for (const cluster of clusters.values()) this.place(cluster, width, height);
  }

  /** Groups off-screen enemies by lane and keeps the nearest of each. */
  private cluster(width: number, height: number): Map<number, LaneCluster> {
    const out = new Map<number, LaneCluster>();
    const transform = this.camera.camera.getScene().getTransformMatrix();
    const viewport = this.camera.camera.viewport.toGlobal(width, height);

    for (const enemy of this.world.enemies) {
      if (!enemy.alive) continue;
      Vector3.ProjectToRef(enemy.position, Matrix.IdentityReadOnly, transform, viewport, this.projected);
      const onScreen =
        this.projected.z > 0 &&
        this.projected.z < 1 &&
        this.projected.x > 0 &&
        this.projected.x < width &&
        this.projected.y > 0 &&
        this.projected.y < height;
      if (onScreen) continue;

      const laneIndex = enemy.laneIndex % LANES.length;
      const dist = Math.hypot(enemy.position.x, enemy.position.z);
      let cluster = out.get(laneIndex);
      if (!cluster) {
        cluster = {
          laneIndex,
          name: LANES[laneIndex].name,
          count: 0,
          boss: false,
          nearest: Infinity,
          x: enemy.position.x,
          z: enemy.position.z,
        };
        out.set(laneIndex, cluster);
      }
      cluster.count++;
      if (enemy.level >= 6) cluster.boss = true;
      if (dist < cluster.nearest) {
        cluster.nearest = dist;
        cluster.x = enemy.position.x;
        cluster.z = enemy.position.z;
      }
    }
    return out;
  }

  private place(cluster: LaneCluster, width: number, height: number): void {
    let el = this.elements.get(cluster.laneIndex);
    if (!el) {
      el = document.createElement("div");
      el.className = "edge-marker";
      this.host.appendChild(el);
      this.elements.set(cluster.laneIndex, el);
    }

    const transform = this.camera.camera.getScene().getTransformMatrix();
    const viewport = this.camera.camera.viewport.toGlobal(width, height);
    const point = new Vector3(cluster.x, 1, cluster.z);
    Vector3.ProjectToRef(point, Matrix.IdentityReadOnly, transform, viewport, this.projected);

    // Behind the camera projects inverted, so flip it back around the centre.
    let sx = this.projected.x;
    let sy = this.projected.y;
    if (this.projected.z > 1) {
      sx = width - sx;
      sy = height - sy;
    }
    const dx = sx - width / 2;
    const dy = sy - height / 2;
    const scale = Math.max(
      Math.abs(dx) / Math.max(1, width / 2 - MARGIN),
      Math.abs(dy) / Math.max(1, height / 2 - MARGIN),
      1,
    );
    const px = width / 2 + dx / scale;
    const py = height / 2 + dy / scale;

    el.style.left = `${px}px`;
    el.style.top = `${py}px`;
    el.style.setProperty("--angle", `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`);
    el.classList.toggle("boss", cluster.boss);
    el.textContent = cluster.boss ? `${cluster.name}　Boss` : `${cluster.name}　${cluster.count}`;
    el.classList.add("show");
  }

  private hideAll(): void {
    for (const el of this.elements.values()) el.classList.remove("show");
  }

  dispose(): void {
    for (const el of this.elements.values()) el.remove();
    this.elements.clear();
  }
}
