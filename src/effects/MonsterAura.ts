import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";

/**
 * The effect an elite or a boss carries with it, all the time.
 *
 * A bigger model is not a threat read. In a melee with a dozen figures on
 * screen the player has to know *before* resolving any silhouette which one
 * is the dangerous one, and the only thing that survives that much visual
 * noise is motion and light that nothing else on the field has.
 *
 * So this is deliberately not a particle system. It is a small number of
 * unlit meshes parented to the unit's own root, which means they inherit its
 * position, its facing and its death without a single per-frame lookup:
 *
 * - a **ground ring** of frost that breathes, so the footprint reads even
 *   when the body is hidden behind allies;
 * - **orbiting ice shards** at head height, the only orbital motion in the
 *   scene, which is what catches the eye first;
 * - a **core glow** inside the ribcage, so the fissure light reads through
 *   the body from any angle.
 *
 * Boss adds a second, wider and slower ring, and taller shards. Everything
 * scales off `tier`, so raising a unit to elite is one data change.
 *
 * Cost is three meshes plus `shards` for a unit type that is never numerous;
 * `dispose()` is called from the unit's own teardown.
 */
/**
 * Which enemies carry an aura, and at what strength.
 *
 * Kept here rather than in UnitDefinitions because it is an art-direction
 * decision about threat reading, not a balance number: raising a unit to
 * elite is one line, and nothing about its combat data changes.
 */
export const AURA_TIER: Record<string, AuraTier | undefined> = {
  icearmor: "elite",
  commander: "elite",
  flyingColossus: "elite",
  juggernaut: "elite",
  boss: "boss",
};

export type AuraTier = "elite" | "boss";

/**
 * Aura colour per unit. Violet is the faction note the enemy palette already
 * carries; the ice units shift toward cyan so their aura says which kind of
 * threat it is, not merely that there is one.
 */
const AURA_COLOUR: Record<string, [number, number, number]> = {
  icearmor: [0.46, 0.86, 1.00],
  flyingColossus: [0.52, 0.78, 1.00],
  commander: [0.86, 0.34, 0.98],
  juggernaut: [0.78, 0.34, 0.96],
  boss: [1.00, 0.26, 0.62],
};

export function auraColour(id: string): Color3 {
  return Color3.FromArray(AURA_COLOUR[id] ?? [0.72, 0.36, 0.98]);
}

const PROFILE: Record<AuraTier, {
  ring: number; ringWidth: number; shards: number; shardSize: number;
  orbit: number; orbitHeight: number; spin: number; pulse: number; core: number;
}> = {
  elite: { ring: 1.35, ringWidth: 0.16, shards: 4, shardSize: 0.17, orbit: 0.86, orbitHeight: 1.42, spin: 1.15, pulse: 1.9, core: 0.21 },
  boss: { ring: 2.30, ringWidth: 0.26, shards: 7, shardSize: 0.27, orbit: 1.42, orbitHeight: 2.05, spin: 0.78, pulse: 1.25, core: 0.36 },
};

export class MonsterAura {
  private readonly node: TransformNode;
  private readonly ring: Mesh;
  private readonly outerRing: Mesh | null;
  private readonly core: Mesh;
  private readonly shards: Mesh[] = [];
  private readonly profile: (typeof PROFILE)[AuraTier];
  private time = Math.random() * 10;

  constructor(scene: Scene, parent: TransformNode, tier: AuraTier, colour: Color3, scale = 1) {
    this.profile = PROFILE[tier];
    const p = this.profile;
    this.node = new TransformNode(`aura.${tier}`, scene);
    this.node.parent = parent;
    this.node.scaling.setAll(scale);

    // Unlit so the aura keeps its colour in furnace light, in daylight and in
    // shadow alike. A lit material would go dark exactly when the melee is
    // busiest and the read matters most.
    const glow = (name: string, intensity: number): StandardMaterial => {
      const material = new StandardMaterial(name, scene);
      material.disableLighting = true;
      material.emissiveColor = colour.scale(intensity);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.alpha = 0.68;
      material.backFaceCulling = false;
      return material;
    };

    this.ring = MeshBuilder.CreateTorus(`aura.${tier}.ring`, { diameter: p.ring, thickness: p.ringWidth, tessellation: 20 }, scene);
    this.ring.parent = this.node;
    this.ring.position.y = 0.05;
    this.ring.scaling.y = 0.16;
    this.ring.material = glow(`aura.${tier}.ringMat`, 1.0);
    this.ring.isPickable = false;

    this.outerRing = tier === "boss"
      ? MeshBuilder.CreateTorus(`aura.${tier}.ring2`, { diameter: p.ring * 1.55, thickness: p.ringWidth * 0.62, tessellation: 24 }, scene)
      : null;
    if (this.outerRing) {
      this.outerRing.parent = this.node;
      this.outerRing.position.y = 0.03;
      this.outerRing.scaling.y = 0.12;
      this.outerRing.material = glow(`aura.${tier}.ring2Mat`, 0.65);
      this.outerRing.isPickable = false;
    }

    this.core = MeshBuilder.CreateSphere(`aura.${tier}.core`, { diameter: p.core, segments: 8 }, scene);
    this.core.parent = this.node;
    this.core.position.y = p.orbitHeight * 0.52;
    this.core.material = glow(`aura.${tier}.coreMat`, 1.5);
    this.core.isPickable = false;

    const shardMaterial = glow(`aura.${tier}.shardMat`, 1.2);
    for (let i = 0; i < p.shards; i++) {
      const shard = MeshBuilder.CreatePolyhedron(`aura.${tier}.shard${i}`, { type: 1, size: p.shardSize }, scene);
      shard.parent = this.node;
      shard.material = shardMaterial;
      shard.isPickable = false;
      this.shards.push(shard);
    }
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.profile;

    const breathe = 1 + Math.sin(this.time * p.pulse) * 0.10;
    this.ring.scaling.x = breathe;
    this.ring.scaling.z = breathe;
    if (this.outerRing) {
      const slow = 1 + Math.sin(this.time * p.pulse * 0.55 + 1.1) * 0.07;
      this.outerRing.scaling.x = slow;
      this.outerRing.scaling.z = slow;
    }

    const corePulse = 1 + Math.sin(this.time * p.pulse * 1.7) * 0.22;
    this.core.scaling.setAll(corePulse);

    // Shards orbit and tumble. Both axes matter: the orbit is what is visible
    // at gameplay distance, the tumble is what reads in a close frame.
    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      const phase = (i / this.shards.length) * Math.PI * 2 + this.time * p.spin;
      shard.position.set(
        Math.cos(phase) * p.orbit,
        p.orbitHeight + Math.sin(phase * 2 + i) * 0.14,
        Math.sin(phase) * p.orbit,
      );
      shard.rotation.y = phase * 1.6;
      shard.rotation.x = this.time * 0.9 + i;
    }
  }

  setVisible(visible: boolean): void {
    this.node.setEnabled(visible);
  }

  /** World point a caster's beam or a ground wave should originate from. */
  get castOrigin(): Vector3 {
    this.core.computeWorldMatrix(true);
    return this.core.getAbsolutePosition();
  }

  dispose(): void {
    this.node.dispose(false, true);
  }
}
