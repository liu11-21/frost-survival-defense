import type { Damageable } from "../combat/Damageable";

/**
 * Beyond this distance from the camera, a bar is not drawn at all.
 *
 * The camera sits 44-50 units from the arena at the default framing, so this
 * is set well past that — it exists only to protect the far extreme of manual
 * zoom-out, not to gate ordinary play. Bars are otherwise permanent: every
 * living entity this policy applies to keeps its bar for as long as it is
 * alive, not just while damaged, targeted or hovered.
 */
export const CULL_DISTANCE = 95;
/** Beyond this distance the bar shows the ratio only — no text. */
export const TEXT_DISTANCE = 52;
/** Below this health fraction the fill turns into a warning colour. */
export const CRITICAL_BELOW = 0.25;

export type BarStyle = "ally" | "hero" | "enemy" | "structure";

export interface BarPolicy {
  style: BarStyle;
  height: number;
  width: number;
  /** Bosses are excluded: they already own the large bar at the top. */
  suppressed: boolean;
}

/** Bars sit above the model, so tall structures need more clearance. */
function barHeight(target: Damageable): number {
  switch (target.kind) {
    case "unit":
      return 1.9 + Math.min(1.6, target.hitRadius * 1.6);
    case "hero":
      return 2.15;
    case "wall":
      return 3.2;
    case "tower":
      return 4.2;
    case "furnace":
      return 4.4;
    default:
      return 3.4;
  }
}

/**
 * Decides how a given thing's bar behaves. Centralised so the colours and the
 * exclusions cannot drift apart between the world bars, the combat feedback
 * and the tests.
 */
export function barPolicy(target: Damageable): BarPolicy {
  const structural = target.kind !== "unit" && target.kind !== "hero";
  const style: BarStyle = structural
    ? "structure"
    : target.kind === "hero"
      ? "hero"
      : target.faction === "ally"
        ? "ally"
        : "enemy";
  return {
    style,
    height: barHeight(target),
    width: structural ? 1.9 : target.kind === "hero" ? 1.35 : 1.0 + Math.min(0.9, target.hitRadius),
    // The boss has the screen-wide bar; a second one over its head is noise.
    suppressed: target.level >= 6,
  };
}

/** The one-line caption above the bar. Plain text only — never markup. */
export function barLabel(target: Damageable): string {
  const named = target as { displayName?: string };
  const name = named.displayName ?? "";
  if (target.kind === "unit" && target.faction === "enemy") {
    return `Lv.${target.level}${name ? ` ${name}` : ""}`;
  }
  if (target.kind === "hero") return name ? `★ ${name}` : "★ 主角";
  if (target.kind === "unit") return name;
  const hp = `${Math.ceil(target.health)}/${target.maxHealth}`;
  return name ? `${name} ${hp}` : hp;
}

/** Placeholder for a pooled slot that has not been bound to anything yet. */
export const DEFAULT_POLICY: BarPolicy = {
  style: "enemy",
  height: 1.9,
  width: 1,
  suppressed: false,
};
