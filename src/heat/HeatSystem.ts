import { Mesh, MeshBuilder, Scene, ShaderMaterial, Vector3 } from "@babylonjs/core";
import { WORLD } from "../game/GameConfig";
import { HeatSource } from "./HeatSource";
import { MAX_HEAT_SOURCES, createSnowMaterial } from "./SnowMaterial";

/**
 * Owns the ground mesh + its snow shader and keeps the shader's heat uniforms
 * in sync with the live heat sources.
 */
export class HeatSystem {
  readonly ground: Mesh;
  private readonly material: ShaderMaterial;
  private readonly sources: HeatSource[] = [];
  private readonly buffer = new Array<number>(MAX_HEAT_SOURCES * 4).fill(0);
  private time = 0;
  private dirty = true;

  constructor(scene: Scene) {
    this.material = createSnowMaterial(scene);
    this.ground = MeshBuilder.CreateGround(
      "ground",
      {
        width: WORLD.groundSize,
        height: WORLD.groundSize,
        subdivisions: WORLD.groundSubdivisions,
        updatable: false,
      },
      scene,
    );
    this.ground.material = this.material;
    this.ground.isPickable = false;
    this.ground.receiveShadows = false;
    this.ground.alwaysSelectAsActiveMesh = true;
    this.uploadHeat();
  }

  addSource(source: HeatSource): HeatSource {
    if (this.sources.length >= MAX_HEAT_SOURCES) {
      throw new Error(`HeatSystem supports at most ${MAX_HEAT_SOURCES} sources`);
    }
    this.sources.push(source);
    this.dirty = true;
    return source;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Combined coverage used by gameplay code (1 = deep snow, 0 = bare ground). */
  snowAt(x: number, z: number): number {
    let heat = 0;
    for (const s of this.sources) heat = Math.max(heat, s.influenceAt(x, z));
    // Slightly ahead of the shader threshold: surface snow props should give
    // way just before the ground itself finishes thawing.
    const t = Math.max(0, Math.min(1, (heat - 0.18) / 0.34));
    return 1 - t * t * (3 - 2 * t);
  }

  setSunDirection(dir: Vector3): void {
    this.material.setVector3("uSunDir", dir);
  }

  update(dt: number, cameraPosition: Vector3): void {
    this.time += dt;
    this.material.setFloat("uTime", this.time);
    this.material.setVector3("uCameraPos", cameraPosition);
    if (this.dirty) {
      this.uploadHeat();
      this.dirty = false;
    }
  }

  /** Radius of the largest source — used to aim the expansion camera and VFX. */
  get primaryRadius(): number {
    return this.sources.length > 0 ? this.sources[0].radius : 0;
  }

  private uploadHeat(): void {
    for (let i = 0; i < MAX_HEAT_SOURCES; i++) {
      const s = this.sources[i];
      const base = i * 4;
      this.buffer[base] = s ? s.x : 0;
      this.buffer[base + 1] = s ? s.z : 0;
      this.buffer[base + 2] = s ? s.radius : 0;
      this.buffer[base + 3] = s ? s.strength : 0;
    }
    this.material.setArray4("uHeat", this.buffer);
  }

  dispose(): void {
    this.ground.dispose();
    this.material.dispose();
  }
}
