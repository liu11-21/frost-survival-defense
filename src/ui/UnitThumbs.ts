import { UNIT_VISUALS, type UnitVisual, type WeaponKind } from "../data/UnitVisuals";

function hex(color: [number, number, number]): string {
  const to = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${to(color[0])}${to(color[1])}${to(color[2])}`;
}

/** The weapon silhouette, which is what separates the tiers at a glance. */
function weaponShape(kind: WeaponKind, metal: string, accent: string): string {
  switch (kind) {
    case "sword":
      return `<path d="M23 6 L23 18" stroke="${metal}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M20.5 16 L25.5 16" stroke="${accent}" stroke-width="1.8"/>`;
    case "dagger":
      return `<path d="M23 10 L23 17" stroke="${metal}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "club":
      return `<path d="M23 9 L23 19" stroke="${metal}" stroke-width="2.2"/>
              <circle cx="23" cy="8.5" r="2.6" fill="${metal}"/>`;
    case "bow":
      return `<path d="M23 6 Q28 14 23 22" fill="none" stroke="${metal}" stroke-width="2"/>
              <path d="M23 6 L23 22" stroke="${accent}" stroke-width="0.9"/>`;
    case "staff":
      return `<path d="M23 5 L23 22" stroke="${metal}" stroke-width="2"/>
              <circle cx="23" cy="5" r="2.8" fill="${accent}"/>`;
    case "iceStaff":
      return `<path d="M23 7 L23 22" stroke="${metal}" stroke-width="2"/>
              <path d="M23 2 L26 7 L23 11 L20 7 Z" fill="${accent}"/>`;
    case "shield":
      return `<path d="M22 8 L27 9.5 L27 15 Q24.5 19 22 15.5 Z" fill="${metal}" stroke="${accent}" stroke-width="1"/>`;
    case "cross":
      return `<path d="M23 8 L23 16 M20 12 L26 12" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>`;
    case "musket":
      return `<path d="M20 17 L28 11" stroke="${metal}" stroke-width="2.4" stroke-linecap="round"/>
              <path d="M20 17 L22.5 19" stroke="${metal}" stroke-width="2.2" stroke-linecap="round"/>`;
    case "wrench":
      return `<path d="M23 9 L23 19" stroke="${metal}" stroke-width="2"/>
              <circle cx="23" cy="8" r="2.2" fill="none" stroke="${metal}" stroke-width="1.4"/>`;
    case "banner":
      return `<path d="M23 4 L23 22" stroke="${metal}" stroke-width="1.6"/>
              <path d="M23 5 L28 7 L23 10 Z" fill="${accent}"/>`;
    case "none":
      return "";
  }
}

/**
 * A flat portrait built from the same palette and weapon the 3D rig uses, so a
 * codex entry and the fighter on the field are recognisably the same unit.
 *
 * A thumbnail rather than a live 3D preview on purpose: the codex opens from the
 * main menu, and instantiating a dozen rigs there would stall it.
 */
export function unitThumb(visualKey: string, size = 34): string {
  const v: UnitVisual = UNIT_VISUALS[visualKey] ?? UNIT_VISUALS.grunt;
  const body = hex(v.body);
  const limb = hex(v.limb);
  const head = hex(v.head);
  const crest = hex(v.crest);
  const accent = hex(v.accent);
  const cape = v.cape ? `<path d="M9 12 L7 24 L14 24 L14 12 Z" fill="${accent}" opacity="0.55"/>` : "";
  const offhand = v.offhand ? weaponShape(v.offhand, limb, accent) : "";

  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" class="uthumb" aria-hidden="true">
    ${cape}
    <rect x="12" y="12" width="9" height="11" rx="2" fill="${body}"/>
    <rect x="9.5" y="13" width="3" height="8" rx="1.4" fill="${limb}"/>
    <rect x="20.5" y="13" width="3" height="8" rx="1.4" fill="${limb}"/>
    <rect x="13" y="23" width="3" height="6" rx="1.2" fill="${limb}"/>
    <rect x="17" y="23" width="3" height="6" rx="1.2" fill="${limb}"/>
    <rect x="13" y="5.5" width="7" height="6.5" rx="2" fill="${head}"/>
    <path d="M12.4 6.5 Q16.5 2.6 20.6 6.5 Z" fill="${crest}"/>
    ${offhand}
    ${weaponShape(v.weapon, "#c8ced8", accent)}
  </svg>`;
}
