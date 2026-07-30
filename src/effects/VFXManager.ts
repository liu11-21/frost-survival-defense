import { AbstractMesh, Color4, ParticleSystem, Scene, Texture, Vector3 } from "@babylonjs/core";
import { BURSTS, type BurstOptions } from "./BurstDefinitions";
import { SpriteAtlas, type SpriteKind } from "./ParticleSprites";

/**
 * Every particle system in the game is created once and reused. One-shot bursts
 * move the emitter and set `manualEmitCount`; continuous systems only change
 * their emit rate.
 */
export class VFXManager {
  private readonly sprites: SpriteAtlas;
  private readonly bursts = new Map<string, ParticleSystem>();
  /** Set from `AdaptiveQualityManager.current.particleScale` — the quality
   * profile field that used to be defined but never actually read anywhere. */
  particleScale = 1;

  readonly flame: ParticleSystem;
  readonly emberSparks: ParticleSystem;
  readonly smoke: ParticleSystem;
  private readonly steam: ParticleSystem;
  private steamCenter = new Vector3();
  private steamRadius = 0;

  constructor(private readonly scene: Scene, furnaceEmitter: AbstractMesh) {
    this.sprites = new SpriteAtlas(scene);
    this.flame = this.createFlame(furnaceEmitter);
    this.emberSparks = this.createSparks(furnaceEmitter);
    this.smoke = this.createSmoke(furnaceEmitter);
    this.steam = this.createSteam();

    for (const spec of BURSTS) {
      this.registerBurst(spec.key, spec.sprite, spec.capacity, spec.options);
    }
  }

  private sprite(kind: SpriteKind): Texture {
    return this.sprites.get(kind);
  }

  private registerBurst(key: string, sprite: SpriteKind, capacity: number, o: BurstOptions): void {
    const ps = new ParticleSystem(`vfx.${key}`, capacity, this.scene);
    ps.particleTexture = this.sprite(sprite);
    ps.emitter = new Vector3(0, 0, 0);
    ps.color1 = o.color1;
    ps.color2 = o.color2;
    ps.colorDead = new Color4(o.color2.r, o.color2.g, o.color2.b, 0);
    ps.minSize = o.minSize;
    ps.maxSize = o.maxSize;
    ps.minLifeTime = o.minLifeTime;
    ps.maxLifeTime = o.maxLifeTime;
    ps.emitRate = 0;
    ps.minEmitPower = o.power[0];
    ps.maxEmitPower = o.power[1];
    ps.gravity = new Vector3(0, o.gravity, 0);
    ps.direction1 = new Vector3(-o.spread, 0.7, -o.spread);
    ps.direction2 = new Vector3(o.spread, 1.5, o.spread);
    ps.minAngularSpeed = -6;
    ps.maxAngularSpeed = 6;
    ps.blendMode = o.additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
    ps.updateSpeed = 0.016;
    ps.preWarmCycles = 0;
    ps.start();
    this.bursts.set(key, ps);
  }

  burst(key: string, position: Vector3, count: number): void {
    const ps = this.bursts.get(key);
    if (!ps) return;
    (ps.emitter as Vector3).copyFrom(position);
    const scaled = Math.round(count * this.particleScale);
    ps.manualEmitCount = Math.min(scaled, ps.getCapacity());
  }

  private createFlame(emitter: AbstractMesh): ParticleSystem {
    const ps = new ParticleSystem("vfx.flame", 320, this.scene);
    ps.particleTexture = this.sprite("soft");
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-0.5, 0.4, -0.5);
    ps.maxEmitBox = new Vector3(0.5, 0.7, 0.5);
    ps.color1 = new Color4(1, 0.68, 0.22, 0.5);
    ps.color2 = new Color4(1, 0.3, 0.06, 0.42);
    ps.colorDead = new Color4(0.35, 0.06, 0.02, 0);
    ps.minSize = 0.3;
    ps.maxSize = 0.85;
    ps.minLifeTime = 0.24;
    ps.maxLifeTime = 0.62;
    ps.emitRate = 90;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 5.5, 0);
    ps.direction1 = new Vector3(-0.5, 3.2, -0.5);
    ps.direction2 = new Vector3(0.5, 5.0, 0.5);
    ps.minEmitPower = 0.4;
    ps.maxEmitPower = 1.3;
    ps.minAngularSpeed = -3;
    ps.maxAngularSpeed = 3;
    ps.start();
    return ps;
  }

  private createSparks(emitter: AbstractMesh): ParticleSystem {
    const ps = new ParticleSystem("vfx.sparks", 220, this.scene);
    ps.particleTexture = this.sprite("spark");
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-0.4, 0.8, -0.4);
    ps.maxEmitBox = new Vector3(0.4, 1.1, 0.4);
    ps.color1 = new Color4(1, 0.85, 0.5, 1);
    ps.color2 = new Color4(1, 0.45, 0.12, 1);
    ps.colorDead = new Color4(0.6, 0.15, 0.02, 0);
    ps.minSize = 0.05;
    ps.maxSize = 0.16;
    ps.minLifeTime = 1.0;
    ps.maxLifeTime = 2.4;
    ps.emitRate = 22;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0.4, 1.1, 0.2);
    ps.direction1 = new Vector3(-1.1, 3.4, -1.1);
    ps.direction2 = new Vector3(1.1, 6.2, 1.1);
    ps.minEmitPower = 0.6;
    ps.maxEmitPower = 1.9;
    ps.start();
    return ps;
  }

  private createSmoke(emitter: AbstractMesh): ParticleSystem {
    const ps = new ParticleSystem("vfx.smoke", 200, this.scene);
    ps.particleTexture = this.sprite("soft");
    ps.emitter = emitter;
    ps.minEmitBox = new Vector3(-0.35, 1.3, -0.35);
    ps.maxEmitBox = new Vector3(0.35, 1.6, 0.35);
    ps.color1 = new Color4(0.36, 0.35, 0.36, 0.3);
    ps.color2 = new Color4(0.2, 0.2, 0.23, 0.3);
    ps.colorDead = new Color4(0.16, 0.17, 0.2, 0);
    ps.minSize = 0.45;
    ps.maxSize = 1.5;
    ps.minLifeTime = 1.8;
    ps.maxLifeTime = 3.6;
    ps.emitRate = 9;
    ps.gravity = new Vector3(0.9, 2.4, 0.4);
    ps.direction1 = new Vector3(-0.3, 1.4, -0.3);
    ps.direction2 = new Vector3(0.5, 2.6, 0.3);
    ps.minEmitPower = 0.4;
    ps.maxEmitPower = 1.1;
    ps.minAngularSpeed = -1.2;
    ps.maxAngularSpeed = 1.2;
    ps.start();
    return ps;
  }

  private createSteam(): ParticleSystem {
    const ps = new ParticleSystem("vfx.steam", 260, this.scene);
    ps.particleTexture = this.sprite("soft");
    ps.emitter = Vector3.Zero();
    ps.color1 = new Color4(0.9, 0.94, 1.0, 0.17);
    ps.color2 = new Color4(0.74, 0.82, 0.93, 0.06);
    ps.colorDead = new Color4(0.74, 0.82, 0.93, 0);
    ps.minSize = 0.7;
    ps.maxSize = 2.2;
    ps.minLifeTime = 0.7;
    ps.maxLifeTime = 1.7;
    ps.emitRate = 0;
    ps.gravity = new Vector3(0, 1.0, 0);
    ps.direction1 = new Vector3(-0.3, 0.9, -0.3);
    ps.direction2 = new Vector3(0.3, 1.7, 0.3);
    ps.minEmitPower = 0.25;
    ps.maxEmitPower = 0.8;
    // Steam belongs on the melt *boundary*, so particles spawn on an annulus
    // that tracks the current front instead of filling the whole thawed disc.
    ps.startPositionFunction = (worldMatrix, positionToUpdate) => {
      const angle = Math.random() * Math.PI * 2;
      const r = this.steamRadius * (0.87 + Math.random() * 0.17);
      Vector3.TransformCoordinatesFromFloatsToRef(
        this.steamCenter.x + Math.sin(angle) * r,
        0.05 + Math.random() * 0.25,
        this.steamCenter.z + Math.cos(angle) * r,
        worldMatrix,
        positionToUpdate,
      );
    };
    ps.start();
    return ps;
  }

  /** Drives the melt-front steam ring during the territory expansion. */
  setSteamRing(center: Vector3, radius: number, rate: number): void {
    this.steamCenter.copyFrom(center);
    this.steamRadius = radius;
    this.steam.emitRate = rate;
  }

  setFurnaceLevel(level: number): void {
    const boost = level >= 2 ? 1 : 0;
    this.flame.emitRate = 90 + boost * 120;
    this.flame.maxSize = 0.85 + boost * 0.5;
    this.flame.maxLifeTime = 0.62 + boost * 0.22;
    this.emberSparks.emitRate = 22 + boost * 56;
    this.emberSparks.maxLifeTime = 2.4 + boost * 1.1;
    this.smoke.emitRate = 9 + boost * 16;
    this.smoke.maxSize = 1.5 + boost * 0.8;
  }

  /** Momentarily squashes the flame before an upgrade flare. */
  setFlameScale(scale: number): void {
    this.flame.emitRate = 90 * scale;
    this.flame.maxSize = 0.85 * Math.max(0.25, scale);
  }

  dispose(): void {
    this.flame.dispose();
    this.emberSparks.dispose();
    this.smoke.dispose();
    this.steam.dispose();
    for (const ps of this.bursts.values()) ps.dispose();
    this.sprites.dispose();
  }
}

