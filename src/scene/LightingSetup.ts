import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  PointLight,
  Scene,
  ShadowGenerator,
  Vector3,
} from "@babylonjs/core";
import { COLORS } from "../game/GameConfig";

export class LightingSetup {
  readonly sun: DirectionalLight;
  readonly sky: HemisphericLight;
  readonly furnaceLight: PointLight;
  readonly shadows: ShadowGenerator;

  constructor(scene: Scene) {
    // Low winter sun, raking across the settlement from the north-west.
    this.sun = new DirectionalLight("sun", new Vector3(-0.45, -0.72, 0.53), scene);
    this.sun.position = new Vector3(28, 42, -34);
    this.sun.intensity = 1.18;
    this.sun.diffuse = new Color3(...COLORS.sun);
    this.sun.specular = new Color3(0.55, 0.62, 0.78);
    this.sun.shadowMinZ = 8;
    this.sun.shadowMaxZ = 130;

    this.sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
    this.sky.intensity = 0.62;
    this.sky.diffuse = new Color3(0.5, 0.6, 0.8);
    // Snow bounce, not dirt bounce. groundColor is the light arriving from
    // below, and this settlement stands on snow -- one of the most reflective
    // natural surfaces there is. It was set to 0.1/0.12/0.17, a value that
    // suits dark ground, so every surface facing away from the sun fell into
    // near-black: vertical walls, undersides, and the shaded half of every
    // character. Measured in a live match, the cast sat at 57% of the
    // background's luminance and the buildings at 41%, and no amount of
    // lifting the albedo maps fixed it, because the problem was never the
    // paint. Kept below the sky colour so the light still reads as coming
    // from above.
    this.sky.groundColor = new Color3(0.40, 0.44, 0.52);
    this.sky.specular = new Color3(0.1, 0.12, 0.16);

    this.furnaceLight = new PointLight("furnaceLight", new Vector3(0, 2.6, 0), scene);
    this.furnaceLight.diffuse = new Color3(1.0, 0.56, 0.2);
    this.furnaceLight.specular = new Color3(1.0, 0.7, 0.35);
    this.furnaceLight.intensity = 130;
    this.furnaceLight.range = 26;

    this.shadows = new ShadowGenerator(2048, this.sun);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0015;
    this.shadows.normalBias = 0.012;
    this.shadows.darkness = 0.42;
    this.shadows.transparencyShadow = false;
  }

  addCaster(mesh: Mesh, includeChildren = true): void {
    this.shadows.addShadowCaster(mesh, includeChildren);
  }

  /** Bulk registration; children are handled by the caller's own mesh lists. */
  addCasters(meshes: ReadonlyArray<Mesh>): void {
    for (const mesh of meshes) this.shadows.addShadowCaster(mesh, false);
  }

  removeCaster(mesh: Mesh): void {
    this.shadows.removeShadowCaster(mesh, true);
  }

  /** Called by the furnace when it flares or gets upgraded. */
  setFurnaceGlow(intensity: number, range: number, color: Color3): void {
    this.furnaceLight.intensity = intensity;
    this.furnaceLight.range = range;
    this.furnaceLight.diffuse = color;
  }

  get sunDirection(): Vector3 {
    return this.sun.direction;
  }
}
