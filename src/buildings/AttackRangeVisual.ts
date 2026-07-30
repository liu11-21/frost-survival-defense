import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import type { LaneCoverageEntry } from "./AttackRangeGeometry";

const MAX_LOS_MARKERS = 6;

/**
 * The ground-projected attack-range overlay: a translucent fill between the
 * building's minimum and maximum range (an ordinary tower's minimum is 0, so
 * the fill is just a full disc) plus two sharp-edged boundary rings, and a
 * small dark marker over any live lane a line-of-sight weapon currently
 * cannot actually reach.
 *
 * A torus's tube diameter and thickness aren't independently reachable via
 * mesh scaling without distorting the ring into an ellipse, so the band and
 * ring meshes are rebuilt (not rescaled) whenever the min/max range actually
 * changes — cheap, since that only happens when the active slot changes, not
 * every frame.
 *
 * One instance is reused for whichever slot is currently "active" (hovered,
 * selected, or being previewed before a build is confirmed) — never one per
 * building, since only one is ever shown at a time per the brief.
 */
export class AttackRangeVisual {
  private readonly fillMat: StandardMaterial;
  private readonly ringMat: StandardMaterial;
  private readonly losMat: StandardMaterial;

  private band: Mesh | null = null;
  private outerRing: Mesh | null = null;
  private innerRing: Mesh | null = null;
  private readonly losMarkers: Mesh[] = [];

  private lastMax = -1;
  private lastMin = -1;

  constructor(private readonly scene: Scene) {
    this.fillMat = new StandardMaterial("mat.rangeBand", scene);
    this.fillMat.emissiveColor = new Color3(0.98, 0.62, 0.28);
    this.fillMat.diffuseColor = Color3.Black();
    this.fillMat.specularColor = Color3.Black();
    this.fillMat.disableLighting = true;
    this.fillMat.alpha = 0.14;
    this.fillMat.backFaceCulling = false;

    this.ringMat = new StandardMaterial("mat.rangeRing", scene);
    this.ringMat.emissiveColor = new Color3(1.0, 0.72, 0.35);
    this.ringMat.diffuseColor = Color3.Black();
    this.ringMat.specularColor = Color3.Black();
    this.ringMat.disableLighting = true;
    this.ringMat.alpha = 0.9;
    this.ringMat.backFaceCulling = false;

    this.losMat = new StandardMaterial("mat.rangeLos", scene);
    this.losMat.emissiveColor = new Color3(0.25, 0.25, 0.28);
    this.losMat.diffuseColor = Color3.Black();
    this.losMat.specularColor = Color3.Black();
    this.losMat.disableLighting = true;
    this.losMat.alpha = 0.65;

    for (let i = 0; i < MAX_LOS_MARKERS; i++) {
      const marker = MeshBuilder.CreateDisc(`rangeLos${i}`, { radius: 0.55, tessellation: 24 }, scene);
      marker.material = this.losMat;
      this.groundify(marker, 0.06);
      this.losMarkers.push(marker);
    }
  }

  private groundify(mesh: Mesh, y: number): void {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = y;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.setEnabled(false);
  }

  private rebuildRings(maxRange: number, minRange: number): void {
    this.band?.dispose();
    this.outerRing?.dispose();
    this.innerRing?.dispose();

    // diameter = max+min, thickness = max-min places the torus's inner and
    // outer edges at exactly minRange and maxRange; minRange 0 collapses
    // this to an ordinary filled disc, with no separate mesh needed.
    this.band = MeshBuilder.CreateTorus(
      "rangeBand",
      { diameter: Math.max(0.05, maxRange + minRange), thickness: Math.max(0.05, maxRange - minRange), tessellation: 72 },
      this.scene,
    );
    this.band.material = this.fillMat;
    this.groundify(this.band, 0.03);

    this.outerRing = MeshBuilder.CreateTorus("rangeOuterRing", { diameter: maxRange * 2, thickness: 0.14, tessellation: 96 }, this.scene);
    this.outerRing.material = this.ringMat;
    this.groundify(this.outerRing, 0.05);

    if (minRange > 0) {
      this.innerRing = MeshBuilder.CreateTorus("rangeInnerRing", { diameter: minRange * 2, thickness: 0.14, tessellation: 64 }, this.scene);
      this.innerRing.material = this.ringMat;
      this.groundify(this.innerRing, 0.05);
    } else {
      this.innerRing = null;
    }

    this.lastMax = maxRange;
    this.lastMin = minRange;
  }

  show(x: number, z: number, maxRange: number, minRange: number, coverage: readonly LaneCoverageEntry[]): void {
    if (maxRange <= 0) {
      this.hide();
      return;
    }
    if (maxRange !== this.lastMax || minRange !== this.lastMin) this.rebuildRings(maxRange, minRange);

    this.band!.position.x = x;
    this.band!.position.z = z;
    this.band!.setEnabled(true);
    this.outerRing!.position.x = x;
    this.outerRing!.position.z = z;
    this.outerRing!.setEnabled(true);
    if (this.innerRing) {
      this.innerRing.position.x = x;
      this.innerRing.position.z = z;
      this.innerRing.setEnabled(true);
    }

    let i = 0;
    for (const entry of coverage) {
      if (!entry.inRange || !entry.losBlocked) continue;
      if (i >= this.losMarkers.length) break;
      const marker = this.losMarkers[i++];
      marker.position.x = entry.sampleX;
      marker.position.z = entry.sampleZ;
      marker.setEnabled(true);
    }
    for (; i < this.losMarkers.length; i++) this.losMarkers[i].setEnabled(false);
  }

  hide(): void {
    this.band?.setEnabled(false);
    this.outerRing?.setEnabled(false);
    this.innerRing?.setEnabled(false);
    for (const marker of this.losMarkers) marker.setEnabled(false);
  }

  /** Read by the debug API / automated tests only. */
  get debugState(): { bandOn: boolean; outerOn: boolean; innerOn: boolean; maxRange: number; minRange: number; losMarkerCount: number } {
    return {
      bandOn: this.band?.isEnabled() ?? false,
      outerOn: this.outerRing?.isEnabled() ?? false,
      innerOn: this.innerRing?.isEnabled() ?? false,
      maxRange: this.lastMax,
      minRange: this.lastMin,
      losMarkerCount: this.losMarkers.filter((m) => m.isEnabled()).length,
    };
  }

  dispose(): void {
    this.band?.dispose();
    this.outerRing?.dispose();
    this.innerRing?.dispose();
    for (const marker of this.losMarkers) marker.dispose();
    this.fillMat.dispose();
    this.ringMat.dispose();
    this.losMat.dispose();
  }
}
