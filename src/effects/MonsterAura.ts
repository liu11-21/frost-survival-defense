import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";

/**
 * The light an elite or a boss gives off.
 *
 * The first version of this was a torus at the feet, a sphere, and four
 * polyhedra on a perfectly regular orbit. It read as a debug gizmo, and at
 * boss scale the ring dominated the whole frame — an audit called it exactly
 * that and was right. A complete geometric ring and evenly spaced orbiting
 * crystals are the visual language of an editor overlay, not of a creature.
 *
 * This version is built from the body outward instead. Everything is placed
 * against the parts `add_monster_body` actually produces:
 *
 * - a **core** deep in the ribcage, so the light reads as coming from inside;
 * - **fissures** — thin quads down the dorsal line, sitting where the builder
 *   puts its spines and back plates, so the glow looks like it is escaping
 *   between plates rather than floating near them;
 * - **frost shards** at the feet as a broken, uneven skirt of spikes with
 *   randomised angle, radius and length, with a wedge left open at the front;
 * - **breath**, a few motes drifting up from the jaw.
 *
 * Nothing here is a closed circle and nothing orbits at a constant radius.
 * The skirt is deliberately irregular and the motes drift rather than
 * revolve. That is the whole difference between "creature" and "selection
 * marker".
 *
 * Parented to the unit's rig root, so it inherits position, facing and
 * teardown with no per-frame lookup. `dispose()` runs from the unit's own
 * teardown.
 */
export type AuraTier = "elite" | "boss";

/**
 * Which enemies carry an aura, and at what strength. Kept here rather than in
 * UnitDefinitions because it is an art-direction decision about threat
 * reading, not a balance number.
 */
export const AURA_TIER: Record<string, AuraTier | undefined> = {
  icearmor: "elite",
  commander: "elite",
  flyingColossus: "elite",
  juggernaut: "elite",
  boss: "boss",
};

/**
 * Aura colour per unit. Violet is the faction note the enemy palette carries;
 * the ice units shift toward cyan so the aura says which kind of threat it is,
 * not merely that there is one.
 */
const AURA_COLOUR: Record<string, [number, number, number]> = {
  icearmor: [0.46, 0.86, 1.0],
  flyingColossus: [0.52, 0.78, 1.0],
  commander: [0.86, 0.34, 0.98],
  juggernaut: [0.78, 0.34, 0.96],
  boss: [1.0, 0.26, 0.62],
};

export function auraColour(id: string): Color3 {
  return Color3.FromArray(AURA_COLOUR[id] ?? [0.72, 0.36, 0.98]);
}

const PROFILE: Record<AuraTier, {
  coreY: number; coreSize: number; fissures: number; fissureLen: number;
  shards: number; shardRadius: number; shardSize: number; motes: number;
  jawY: number; pulse: number;
}> = {
  elite: { coreY: 1.02, coreSize: 0.20, fissures: 5, fissureLen: 0.28, shards: 7, shardRadius: 0.58, shardSize: 0.14, motes: 2, jawY: 1.26, pulse: 1.7 },
  boss: { coreY: 1.50, coreSize: 0.32, fissures: 8, fissureLen: 0.42, shards: 11, shardRadius: 0.96, shardSize: 0.22, motes: 3, jawY: 1.92, pulse: 1.15 },
};

/** Deterministic jitter, so a given unit's skirt is uneven but stable. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 127.1 + 43.7) * 43758.5453;
  return x - Math.floor(x);
}

export class MonsterAura {
  private readonly node: TransformNode;
  private readonly core: Mesh;
  private readonly fissures: Mesh[] = [];
  private readonly shards: Mesh[] = [];
  private readonly motes: Mesh[] = [];
  private readonly moteBase: number[] = [];
  private readonly profile: (typeof PROFILE)[AuraTier];
  private time = Math.random() * 10;

  constructor(scene: Scene, parent: TransformNode, tier: AuraTier, colour: Color3, scale = 1) {
    this.profile = PROFILE[tier];
    const p = this.profile;
    this.node = new TransformNode(`aura.${tier}`, scene);
    this.node.parent = parent;
    this.node.scaling.setAll(scale);

    // Unlit, so the aura keeps its colour in furnace light, in daylight and in
    // shadow alike. A lit material would go dark exactly when the melee is
    // busiest and the read matters most.
    const glow = (name: string, intensity: number, alpha: number): StandardMaterial => {
      const material = new StandardMaterial(name, scene);
      material.disableLighting = true;
      material.emissiveColor = colour.scale(intensity);
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.alpha = alpha;
      material.backFaceCulling = false;
      return material;
    };

    const coreMat = glow(`aura.${tier}.coreMat`, 1.7, 0.9);
    const fissureMat = glow(`aura.${tier}.fissureMat`, 1.35, 0.72);
    const shardMat = glow(`aura.${tier}.shardMat`, 0.9, 0.55);
    const moteMat = glow(`aura.${tier}.moteMat`, 1.1, 0.42);

    // Core, inside the ribcage rather than floating in front of it.
    this.core = MeshBuilder.CreateSphere(`aura.${tier}.core`, { diameter: p.coreSize, segments: 8 }, scene);
    this.core.parent = this.node;
    this.core.position.y = p.coreY;
    this.core.material = coreMat;
    this.core.isPickable = false;

    // Fissures down the dorsal line, where the builder puts spines and plates.
    for (let i = 0; i < p.fissures; i++) {
      const t = (i + 0.5) / p.fissures;
      const quad = MeshBuilder.CreatePlane(`aura.${tier}.fissure${i}`, {
        width: 0.05 + 0.03 * jitter(i),
        height: p.fissureLen * (0.6 + 0.7 * Math.sin(t * Math.PI)),
      }, scene);
      quad.parent = this.node;
      quad.position.set(
        (jitter(i * 3) - 0.5) * p.coreSize * 1.6,
        p.coreY * (0.55 + 0.85 * t),
        -p.coreSize * (0.7 + 0.5 * jitter(i * 5)),
      );
      quad.rotation.z = (jitter(i * 7) - 0.5) * 0.7;
      quad.material = fissureMat;
      quad.isPickable = false;
      this.fissures.push(quad);
    }

    // Frost at the feet: an uneven skirt of spikes, never a closed ring. The
    // open wedge and the varying height are what stop it reading as a marker.
    for (let i = 0; i < p.shards; i++) {
      const spike = MeshBuilder.CreateCylinder(`aura.${tier}.shard${i}`, {
        height: p.shardSize * (1.2 + 1.6 * jitter(i * 11)),
        diameterTop: 0,
        diameterBottom: p.shardSize * (0.5 + 0.5 * jitter(i * 13)),
        tessellation: 4,
      }, scene);
      spike.parent = this.node;
      const angle = (i / p.shards) * Math.PI * 1.72 + jitter(i * 17) * 0.5 + Math.PI * 0.14;
      const radius = p.shardRadius * (0.72 + 0.5 * jitter(i * 19));
      spike.position.set(Math.cos(angle) * radius, p.shardSize * 0.5, Math.sin(angle) * radius);
      spike.rotation.z = (jitter(i * 23) - 0.5) * 0.8;
      spike.rotation.x = (jitter(i * 29) - 0.5) * 0.8;
      spike.material = shardMat;
      spike.isPickable = false;
      this.shards.push(spike);
    }

    // Breath from the jaw, drifting rather than orbiting.
    for (let i = 0; i < p.motes; i++) {
      const mote = MeshBuilder.CreateSphere(`aura.${tier}.mote${i}`, { diameter: p.coreSize * 0.32, segments: 6 }, scene);
      mote.parent = this.node;
      mote.material = moteMat;
      mote.isPickable = false;
      this.motes.push(mote);
      this.moteBase.push(jitter(i * 31));
    }
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.profile;

    // The core is the only thing that pulses hard; a body lit from inside
    // breathes, it does not strobe.
    this.core.scaling.setAll(1 + Math.sin(this.time * p.pulse) * 0.18);

    for (let i = 0; i < this.fissures.length; i++) {
      // Each fissure runs on its own phase, so the back never flickers as one
      // block. That uniformity was part of what made the old version read as a
      // single UI element rather than as a surface.
      const flicker = 0.55 + 0.45 * Math.abs(Math.sin(this.time * (p.pulse * 0.8 + i * 0.23) + i));
      this.fissures[i].scaling.y = flicker;
      this.fissures[i].scaling.x = 0.8 + 0.4 * flicker;
    }

    for (let i = 0; i < this.shards.length; i++) {
      this.shards[i].scaling.y = 0.85 + 0.3 * Math.abs(Math.sin(this.time * 0.9 + i * 1.7));
    }

    for (let i = 0; i < this.motes.length; i++) {
      // Rise from the jaw, fade, restart. `t` wraps, so no allocation and no
      // particle system for what is three spheres.
      const t = (this.time * 0.42 + this.moteBase[i]) % 1;
      const drift = this.moteBase[i] - 0.5;
      this.motes[i].position.set(drift * p.coreSize * 1.4, p.jawY + t * p.coreSize * 3.2, p.coreSize * (1.1 + t * 0.9));
      this.motes[i].scaling.setAll(Math.max(0.05, 1 - t) * (0.7 + 0.5 * Math.sin(t * Math.PI)));
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
