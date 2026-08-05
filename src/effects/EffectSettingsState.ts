/**
 * Cross-cutting cosmetic toggles read directly by the handful of low-level
 * spots that need them (`GameCamera.shake`, `CombatFeedback.damageNumber`,
 * `CombatAnimator`'s hit-recoil). Threading a settings object through every
 * `CombatAnimator` instance's constructor (one per unit, pooled and recycled)
 * would touch far more files for a purely cosmetic knob than a single shared,
 * mutable module — `GameSystems` is the only writer, on settings-menu choices.
 *
 * This codebase has no per-unit colour/emissive hit-flash: `LiteHumanoid`
 * instances share their template's material, so a per-instance colour pulse
 * would need a per-instance colour buffer that does not exist (the same
 * limitation `UnitDeath.fadeCorpse` documents for corpse alpha). "Flash
 * intensity" is implemented against the one per-hit visual cue that *does*
 * exist instead — `CombatAnimator`'s hit-recoil dip — scaling how pronounced
 * that flinch reads, rather than claiming a colour flash that isn't there.
 */
export const EffectSettingsState = {
  screenShakeEnabled: true,
  damageNumbersEnabled: true,
  /** 0.6 / 1.0 / 1.5 for low / medium / high. */
  flashIntensity: 1,
  /** Weapon swoosh ribbons. Each active trail rebuilds a small strip of
   * geometry per frame, so this is the knob that turns them off on low
   * quality rather than paying for one per simultaneously-swinging unit. */
  weaponTrailsEnabled: true,
};
