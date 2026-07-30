import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import { LANES, MAP, distanceToWall } from "../data/BuildSlotDefinitions";
import type { MaterialFactory } from "./MaterialFactory";

/** How long a lane stays lit after a warning. */
const WARN_TIME = 5;

interface LaneVisual {
  index: number;
  road: Mesh;
  arrows: Mesh[];
  warn: Mesh;
  warnTime: number;
}

/**
 * Makes each approach visible on the ground: a packed-snow road from the spawn
 * gate to the wall, arrows pointing the way in, and a red pulse when a wave is
 * about to come down it.
 *
 * "There are three lanes" told the player nothing they could act on. A road
 * they can see and a marker that lights up does.
 */
export class LaneMarkers {
  private readonly lanes: LaneVisual[] = [];
  private pulse = 0;
  private liveCount = 2;

  constructor(scene: Scene, materials: MaterialFactory) {
    const road = materials.pbr("mat.lane.road", { color: [0.62, 0.66, 0.74], roughness: 0.95 });
    const arrowMat = materials.unlit("mat.lane.arrow", [0.95, 0.55, 0.35], 0.55);
    const warnMat = new StandardMaterial("mat.lane.warn", scene);
    warnMat.diffuseColor = Color3.Black();
    warnMat.specularColor = Color3.Black();
    warnMat.emissiveColor = new Color3(1, 0.24, 0.18);
    warnMat.disableLighting = true;
    warnMat.alpha = 0;
    warnMat.backFaceCulling = false;

    for (const lane of LANES) {
      // The road runs from just outside the spawn gate to this lane's own
      // wall — the rectangle's four sides sit at different true distances
      // from the centre depending on bearing, not one shared ring radius.
      const wallDist = distanceToWall(lane.angle);
      const length = MAP.spawnRadius - wallDist + 4;
      const mid = (MAP.spawnRadius + wallDist) * 0.5;
      const strip = MeshBuilder.CreateGround(
        `lane${lane.index}.strip`,
        { width: 6.4, height: length },
        scene,
      );
      strip.position.set(Math.sin(lane.angle) * mid, 0.03, Math.cos(lane.angle) * mid);
      strip.rotation.y = lane.angle;
      strip.material = road;
      strip.isPickable = false;
      strip.receiveShadows = false;
      strip.freezeWorldMatrix();

      const arrows: Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const r = wallDist + 3 + i * 3.4;
        const arrow = MeshBuilder.CreateCylinder(
          `lane${lane.index}.arrow${i}`,
          { height: 0.06, diameterTop: 0, diameterBottom: 2.1, tessellation: 3 },
          scene,
        );
        arrow.position.set(Math.sin(lane.angle) * r, 0.06, Math.cos(lane.angle) * r);
        // Point inward, toward the base.
        arrow.rotation.y = lane.angle + Math.PI;
        arrow.rotation.x = Math.PI / 2;
        arrow.material = arrowMat;
        arrow.isPickable = false;
        arrows.push(arrow);
      }

      const warn = MeshBuilder.CreateGround(
        `lane${lane.index}.warn`,
        { width: 6.8, height: length },
        scene,
      );
      warn.position.set(Math.sin(lane.angle) * mid, 0.09, Math.cos(lane.angle) * mid);
      warn.rotation.y = lane.angle;
      warn.material = warnMat.clone(`mat.lane.warn${lane.index}`);
      warn.isPickable = false;
      warn.setEnabled(false);

      this.lanes.push({ index: lane.index, road: strip, arrows, warn, warnTime: 0 });
    }
    this.setLiveLaneCount(2);
  }

  /** Hides the roads of lanes this level never uses. */
  setLiveLaneCount(count: number): void {
    this.liveCount = Math.max(1, count);
    for (const lane of this.lanes) {
      const live = lane.index < this.liveCount;
      lane.road.setEnabled(live);
      for (const arrow of lane.arrows) arrow.setEnabled(live);
      if (!live && lane.warn.isEnabled()) lane.warn.setEnabled(false);
    }
  }

  /** Lights a lane red before a wave comes down it. */
  warn(laneIndex: number): void {
    const lane = this.lanes[laneIndex];
    if (!lane) return;
    lane.warnTime = WARN_TIME;
    lane.warn.setEnabled(true);
  }

  clearWarnings(): void {
    for (const lane of this.lanes) {
      lane.warnTime = 0;
      lane.warn.setEnabled(false);
    }
  }

  update(dt: number): void {
    this.pulse += dt * 4;
    const glow = 0.28 + Math.abs(Math.sin(this.pulse)) * 0.32;
    for (const lane of this.lanes) {
      if (lane.warnTime <= 0) continue;
      lane.warnTime -= dt;
      const mat = lane.warn.material as StandardMaterial;
      mat.alpha = lane.warnTime <= 0 ? 0 : glow * Math.min(1, lane.warnTime);
      if (lane.warnTime <= 0) lane.warn.setEnabled(false);
    }
  }
}
