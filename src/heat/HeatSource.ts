/**
 * A heat source pushes the snow line outward. The snow shader reads at most
 * MAX_HEAT_SOURCES of these, so they are pooled rather than created freely.
 */
export class HeatSource {
  private _radius: number;
  private _strength: number;
  private _blend = 0;

  constructor(
    public readonly x: number,
    public readonly z: number,
    radius: number,
    strength = 1,
  ) {
    this._radius = radius;
    this._strength = strength;
  }

  get radius(): number {
    return this._radius;
  }

  get strength(): number {
    return this._strength;
  }

  setRadius(radius: number): void {
    this._radius = radius;
  }

  setStrength(strength: number): void {
    this._strength = strength;
  }

  /**
   * Smoothly grows the radius toward `target`. Returns true while it is still
   * moving, so the caller knows when the shader uniforms need re-uploading.
   */
  rampTo(target: number, speed: number, dt: number): boolean {
    if (this._blend >= 1) return false;
    this._blend = Math.min(1, this._blend + dt * speed);
    const eased = this._blend * this._blend * (3 - 2 * this._blend);
    this._radius = target * eased;
    return true;
  }

  /** Approximate CPU mirror of the shader's per-source falloff. */
  influenceAt(x: number, z: number): number {
    const dx = x - this.x;
    const dz = z - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const inner = this._radius * 0.42;
    if (d <= inner) return this._strength;
    if (d >= this._radius) return 0;
    const t = (d - inner) / (this._radius - inner);
    return this._strength * (1 - t * t * (3 - 2 * t));
  }
}
