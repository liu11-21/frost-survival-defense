/**
 * Every timed status a unit can carry that is not the death/corpse state:
 * Musketeer's stacking slow, Frost Sorcerer's refreshing slow, and Freeze
 * Zone's stun with its post-stun immunity window. Pulled out of `CombatUnit`
 * so that file stays about the unit itself rather than every ability's timers.
 */
export class UnitStatusEffects {
  private slowStacks: Array<{ amount: number; timer: number }> = [];
  private refreshSlow = { amount: 0, timer: 0 };
  private stunTimer = 0;
  private pendingCcImmunity = 0;
  private ccImmuneTimer = 0;

  /** Combined stacking + refreshing slow, as a fraction removed from move speed. */
  get slowFactor(): number {
    let sum = 0;
    for (const s of this.slowStacks) sum += s.amount;
    if (this.refreshSlow.timer > 0) sum += this.refreshSlow.amount;
    return Math.min(0.9, sum);
  }

  get isStunned(): boolean {
    return this.stunTimer > 0;
  }

  /** Musketeer's on-hit slow. Oldest stack is dropped once `maxStacks` is exceeded. */
  applySlowStack(amount: number, duration: number, maxStacks: number): void {
    this.slowStacks.push({ amount, timer: duration });
    while (this.slowStacks.length > maxStacks) this.slowStacks.shift();
  }

  /** Frost Sorcerer's normal-attack slow. Refreshes the timer, never stacks. */
  applySlowRefresh(amount: number, duration: number): void {
    this.refreshSlow.amount = amount;
    this.refreshSlow.timer = duration;
  }

  /**
   * Freeze Zone's stun. A target that just recovered from one is immune for
   * `ccImmunity` seconds, so the same unit cannot be chain-stunned forever.
   */
  applyStun(duration: number, ccImmunity: number): boolean {
    if (this.ccImmuneTimer > 0) return false;
    this.stunTimer = Math.max(this.stunTimer, duration);
    this.pendingCcImmunity = ccImmunity;
    return true;
  }

  /**
   * Advances every timer by `dt`. Returns `"stunned"` while the unit should be
   * fully frozen this frame, `"free"` otherwise.
   */
  tick(dt: number): "stunned" | "free" {
    if (this.ccImmuneTimer > 0) this.ccImmuneTimer -= dt;
    for (let i = this.slowStacks.length - 1; i >= 0; i--) {
      this.slowStacks[i].timer -= dt;
      if (this.slowStacks[i].timer <= 0) this.slowStacks.splice(i, 1);
    }
    if (this.refreshSlow.timer > 0) {
      this.refreshSlow.timer -= dt;
      if (this.refreshSlow.timer <= 0) this.refreshSlow.amount = 0;
    }
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) this.ccImmuneTimer = this.pendingCcImmunity;
      return "stunned";
    }
    return "free";
  }
}
