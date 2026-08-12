import type { CombatVfx } from "../combat/CombatContext";
import type { Damageable } from "../combat/Damageable";
import type { AudioManager, SfxName } from "../effects/AudioManager";
import type { HeroController } from "../hero/HeroController";

/**
 * Audio-only adapter around the existing CombatFeedback. It preserves every
 * visual call while giving combat code one positional sound hook. No gameplay
 * state, damage or targeting logic is owned here.
 */
export class AudioCombatFeedbackAdapter implements CombatVfx {
  private heroGetter: (() => HeroController) | null = null;

  constructor(
    private readonly inner: CombatVfx,
    private readonly audio: AudioManager,
  ) {}

  bindHero(getHero: () => HeroController): void {
    this.heroGetter = getHero;
  }

  meleeHit(x: number, z: number): void {
    this.inner.meleeHit(x, z);
    // Enemy impact/death is emitted from CombatDirector where target faction is
    // known. This layer only adds the Hero's close hit on the actual hit frame.
    const hero = this.heroGetter?.();
    const target = hero?.currentTarget;
    if (!hero?.alive || !hero.inMelee || !target) return;
    if (Math.hypot(target.position.x - x, target.position.z - z) > 1.4 + target.hitRadius) return;
    this.audio.playAt("heroMeleeHit", x, z, 0.62, 1, 24);
  }

  rangedHit(x: number, z: number): void {
    this.inner.rangedHit(x, z);
  }

  areaBlast(x: number, z: number, radius: number): void {
    this.inner.areaBlast(x, z, radius);
    this.audio.playAt("artilleryExplosion", x, z, Math.min(0.85, 0.48 + radius * 0.05), 1, 8);
  }
  heal(x: number, z: number): void { this.inner.heal(x, z); }
  repair(x: number, z: number): void { this.inner.repair(x, z); }
  burstAt(key: string, x: number, z: number, count: number): void { this.inner.burstAt(key, x, z, count); }
  heroSkill(
    kind: "airSupport" | "infiniteFirepower" | "groundSupport" | "seismicWave",
    x: number,
    z: number,
    radius: number,
  ): void { this.inner.heroSkill(kind, x, z, radius); }
  airStrike(x: number, z: number, radius: number): void { this.inner.airStrike(x, z, radius); }
  groundFire(x: number, z: number, radius: number, duration: number): void { this.inner.groundFire(x, z, radius, duration); }
  supportAura(x: number, z: number, radius: number): void { this.inner.supportAura(x, z, radius); }
  taunt(x: number, z: number, radius: number): void { this.inner.taunt(x, z, radius); }
  teleport(x: number, z: number): void { this.inner.teleport(x, z); }
  unitDeath(x: number, z: number, level: number): void { this.inner.unitDeath(x, z, level); }
  buildingHit(x: number, z: number): void { this.inner.buildingHit(x, z); }

  /** UI / non-world events intentionally remain centred/non-positional. */
  sound(name: string, volume = 1, pitch = 1): void {
    this.audio.play(name as SfxName, volume, pitch);
  }

  soundAt(name: string, x: number, z: number, volume = 1, pitch = 1, priorityBoost = 0): void {
    this.audio.playAt(name as SfxName, x, z, volume, pitch, priorityBoost);
  }

  damageNumber(x: number, y: number, z: number, amount: number, kind: "damage" | "heal"): void {
    this.inner.damageNumber(x, y, z, amount, kind);
  }
  healthChanged(target: Damageable): void { this.inner.healthChanged(target); }
  registerHealthBar(target: Damageable): void { this.inner.registerHealthBar(target); }
}
