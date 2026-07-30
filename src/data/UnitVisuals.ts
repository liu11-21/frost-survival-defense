export type WeaponKind =
  | "sword"
  | "bow"
  | "staff"
  | "iceStaff"
  | "shield"
  | "club"
  | "dagger"
  | "cross"
  | "musket"
  | "wrench"
  | "banner"
  | "none";

/** One extra decorative part beyond the base torso/head/arm/leg/weapon rig. */
export interface AttachmentSpec {
  shape: "box" | "cylinder" | "sphere" | "torus";
  parent: "head" | "shoulderL" | "shoulderR" | "body" | "back" | "hipL" | "hipR";
  position: [number, number, number];
  rotation?: [number, number, number];
  /** width/height/depth for box, or diameter/height/diameterBottom for cylinder, or diameter for sphere/torus. */
  size: [number, number, number];
  material: "body" | "limb" | "head" | "crest" | "weapon" | "accent";
  /** Tags this part so it can be hidden independently — Ice Armor Heavy's break. */
  armorPlate?: boolean;
}

export interface UnitVisual {
  /** Coat / torso colour. */
  body: [number, number, number];
  /** Limbs, usually a darker shade of the body. */
  limb: [number, number, number];
  head: [number, number, number];
  /** Helmet, hood or crest — the silhouette read. */
  crest: [number, number, number];
  weapon: WeaponKind;
  /** Optional off-hand, currently only the shield trooper uses it. */
  offhand?: WeaponKind;
  /** Small emissive marker so factions are readable at a glance. */
  accent: [number, number, number];
  /** Adds a shoulder cape for higher-tier silhouettes. */
  cape?: boolean;
  /** Per-axis size multipliers so units stop sharing one body proportion. */
  torsoSize?: [number, number, number];
  headSize?: [number, number, number];
  limbSize?: [number, number, number];
  /** Extra silhouette parts: backpacks, goggles, banners, shoulder plates... */
  attachments?: AttachmentSpec[];
}

/**
 * Allies read warm, enemies read cold-violet. Each unit also gets a distinct
 * weapon silhouette so tiers are separable without reading any text.
 */
export const UNIT_VISUALS: Record<string, UnitVisual> = {
  hero: {
    body: [0.82, 0.31, 0.16],
    limb: [0.55, 0.2, 0.12],
    head: [0.85, 0.68, 0.54],
    crest: [0.96, 0.72, 0.28],
    weapon: "sword",
    accent: [1.0, 0.78, 0.35],
    cape: true,
    attachments: [
      // A small crown spike so the hero reads unmistakably even without the
      // ground ring or beam, per the always-on hero-marker requirement.
      { shape: "box", parent: "head", position: [0, 0.3, 0.05], size: [0.08, 0.16, 0.08], material: "accent" },
    ],
  },
  warrior: {
    body: [0.86, 0.52, 0.2],
    limb: [0.5, 0.3, 0.16],
    head: [0.82, 0.65, 0.5],
    crest: [0.72, 0.74, 0.78],
    weapon: "sword",
    accent: [1.0, 0.82, 0.4],
    attachments: [
      { shape: "box", parent: "shoulderR", position: [0, 0.1, 0], size: [0.24, 0.14, 0.22], material: "crest" },
      { shape: "box", parent: "shoulderL", position: [0, 0.1, 0], size: [0.24, 0.14, 0.22], material: "crest" },
    ],
  },
  shield: {
    body: [0.62, 0.55, 0.28],
    limb: [0.38, 0.34, 0.2],
    head: [0.8, 0.63, 0.48],
    crest: [0.85, 0.87, 0.9],
    weapon: "club",
    offhand: "shield",
    accent: [1.0, 0.86, 0.45],
  },
  archer: {
    body: [0.42, 0.6, 0.34],
    limb: [0.26, 0.38, 0.22],
    head: [0.82, 0.66, 0.52],
    crest: [0.55, 0.72, 0.42],
    weapon: "bow",
    accent: [0.86, 1.0, 0.6],
    // A quiver on the back — the archer's own silhouette marker, so the same
    // "bow" weapon shape it shares with the enemy marksman doesn't read as
    // the same unit at a glance.
    attachments: [
      { shape: "cylinder", parent: "back", position: [-0.08, 0.95, -0.14], rotation: [0.3, 0, 0.15], size: [0.16, 0.5, 0.1], material: "limb" },
      { shape: "box", parent: "back", position: [-0.06, 1.18, -0.16], rotation: [0.3, 0, 0.15], size: [0.03, 0.3, 0.03], material: "accent" },
      { shape: "box", parent: "back", position: [-0.1, 1.16, -0.13], rotation: [0.3, 0, -0.1], size: [0.03, 0.28, 0.03], material: "crest" },
    ],
  },
  medic: {
    body: [0.9, 0.9, 0.92],
    limb: [0.66, 0.68, 0.72],
    head: [0.84, 0.68, 0.54],
    crest: [0.9, 0.32, 0.3],
    weapon: "cross",
    accent: [0.5, 1.0, 0.7],
  },
  mage: {
    body: [0.36, 0.34, 0.72],
    limb: [0.24, 0.22, 0.5],
    head: [0.82, 0.66, 0.52],
    crest: [0.58, 0.5, 0.95],
    weapon: "staff",
    accent: [0.7, 0.62, 1.0],
    cape: true,
  },
  assault: {
    body: [0.24, 0.24, 0.28],
    limb: [0.16, 0.16, 0.2],
    head: [0.78, 0.62, 0.5],
    crest: [0.9, 0.25, 0.22],
    weapon: "dagger",
    accent: [1.0, 0.35, 0.3],
  },

  // ---------------------------------------------------------------- v5 ally

  engineer: {
    body: [0.78, 0.44, 0.12],
    limb: [0.22, 0.2, 0.2],
    head: [0.8, 0.63, 0.48],
    crest: [0.3, 0.3, 0.32],
    weapon: "wrench",
    accent: [1.0, 0.7, 0.15],
    torsoSize: [0.48, 0.5, 0.34],
    attachments: [
      // Tool belt.
      { shape: "box", parent: "body", position: [0, 0.62, 0], size: [0.5, 0.09, 0.34], material: "crest" },
      // Big tool backpack.
      { shape: "box", parent: "back", position: [0, 0.9, -0.2], size: [0.32, 0.4, 0.2], material: "limb" },
      // Goggles.
      { shape: "box", parent: "head", position: [0, 0.14, 0.14], size: [0.28, 0.07, 0.05], material: "accent" },
      // Armband.
      { shape: "torus", parent: "shoulderR", position: [0, -0.05, 0], size: [0.17, 0.03, 0.17], material: "accent" },
    ],
  },
  musketeer: {
    body: [0.34, 0.28, 0.24],
    limb: [0.24, 0.2, 0.18],
    head: [0.82, 0.65, 0.5],
    crest: [0.22, 0.18, 0.15],
    weapon: "musket",
    accent: [0.95, 0.78, 0.3],
    torsoSize: [0.42, 0.58, 0.28],
    attachments: [
      // Thick shoulder pads.
      { shape: "box", parent: "shoulderR", position: [0, 0.12, 0], size: [0.26, 0.16, 0.24], material: "crest" },
      { shape: "box", parent: "shoulderL", position: [0, 0.12, 0], size: [0.26, 0.16, 0.24], material: "crest" },
      // Ammo bandolier across the chest.
      { shape: "box", parent: "body", position: [0.05, 0.95, 0.12], rotation: [0, 0, 0.5], size: [0.1, 0.5, 0.06], material: "accent" },
      // Powder pouch on the belt.
      { shape: "box", parent: "body", position: [-0.16, 0.62, 0.1], size: [0.14, 0.16, 0.12], material: "limb" },
      // Backup rifle strapped to the back.
      { shape: "cylinder", parent: "back", position: [0, 0.9, -0.16], rotation: [1.4, 0, 0], size: [0.05, 0.7, 0.05], material: "weapon" },
    ],
  },
  frostmage: {
    // Pushed well away from the Mage's violet-blue into a pale ice-cyan, and
    // built on "iceStaff" rather than "staff" — a crystalline, hexagonal
    // shape with a pronounced faceted head, not the Mage's smooth taper. No
    // cape either: the Mage already owns that silhouette among ally casters.
    body: [0.58, 0.8, 0.92],
    limb: [0.44, 0.68, 0.82],
    head: [0.82, 0.66, 0.52],
    crest: [0.85, 0.95, 1.0],
    weapon: "iceStaff",
    accent: [0.55, 0.95, 1.0],
    headSize: [0.3, 0.3, 0.29],
    attachments: [
      // High spell-hood collar.
      { shape: "torus", parent: "head", position: [0, -0.02, 0], size: [0.22, 0.05, 0.22], material: "crest" },
      // A large floating crystal above the shoulder — the Frost Sorcerer's
      // own silhouette marker, readable even when the staff is occluded.
      { shape: "sphere", parent: "back", position: [0, 1.35, -0.12], size: [0.26, 0.26, 0.26], material: "accent" },
      // Ice-shard pauldrons stand in for the cape the Mage already claims.
      { shape: "box", parent: "shoulderR", position: [0, 0.14, 0], size: [0.2, 0.22, 0.18], material: "crest" },
      { shape: "box", parent: "shoulderL", position: [0, 0.14, 0], size: [0.2, 0.22, 0.18], material: "crest" },
      // Waist scroll.
      { shape: "cylinder", parent: "body", position: [0.18, 0.62, 0.05], rotation: [1.5, 0, 0], size: [0.05, 0.26, 0.05], material: "limb" },
    ],
  },

  grunt: {
    body: [0.34, 0.3, 0.46],
    limb: [0.22, 0.2, 0.32],
    head: [0.56, 0.58, 0.68],
    crest: [0.5, 0.4, 0.68],
    weapon: "club",
    accent: [0.62, 0.4, 0.95],
    attachments: [
      { shape: "box", parent: "head", position: [0.12, 0.12, 0], rotation: [0, 0, 0.5], size: [0.05, 0.18, 0.05], material: "crest" },
    ],
  },
  slinger: {
    body: [0.3, 0.32, 0.5],
    limb: [0.2, 0.22, 0.36],
    head: [0.54, 0.58, 0.7],
    crest: [0.42, 0.46, 0.72],
    weapon: "bow",
    accent: [0.6, 0.5, 1.0],
  },
  bruiser: {
    body: [0.28, 0.26, 0.4],
    limb: [0.18, 0.17, 0.28],
    head: [0.5, 0.52, 0.64],
    crest: [0.66, 0.68, 0.76],
    weapon: "shield",
    offhand: "club",
    accent: [0.72, 0.46, 1.0],
  },
  marksman: {
    body: [0.26, 0.34, 0.52],
    limb: [0.17, 0.23, 0.36],
    head: [0.52, 0.58, 0.7],
    crest: [0.36, 0.62, 0.8],
    weapon: "bow",
    accent: [0.45, 0.8, 1.0],
    // A longer torso reads as a duster coat, and a spare-bolt case on the hip
    // stands in for the archer's quiver — same weapon shape, different build
    // and a different marker so the two are never confused at a glance.
    torsoSize: [0.42, 0.66, 0.3],
    attachments: [
      { shape: "box", parent: "hipR", position: [0.1, 0.15, 0], rotation: [0, 0, -0.1], size: [0.12, 0.3, 0.09], material: "limb" },
      { shape: "box", parent: "shoulderL", position: [0, 0.1, 0.02], size: [0.2, 0.12, 0.16], material: "crest" },
    ],
  },
  juggernaut: {
    body: [0.2, 0.22, 0.34],
    limb: [0.14, 0.15, 0.24],
    head: [0.44, 0.48, 0.6],
    crest: [0.78, 0.8, 0.86],
    weapon: "club",
    offhand: "shield",
    accent: [0.85, 0.5, 1.0],
    cape: true,
  },
  bombardier: {
    body: [0.4, 0.24, 0.44],
    limb: [0.26, 0.16, 0.3],
    head: [0.54, 0.5, 0.64],
    crest: [0.72, 0.36, 0.8],
    weapon: "staff",
    accent: [1.0, 0.45, 0.9],
    cape: true,
  },
  boss: {
    body: [0.16, 0.18, 0.3],
    limb: [0.11, 0.12, 0.2],
    head: [0.4, 0.46, 0.62],
    crest: [0.55, 0.85, 1.0],
    weapon: "club",
    accent: [0.5, 0.95, 1.0],
    cape: true,
  },

  // --------------------------------------------------------------- v5 enemy

  breacher: {
    body: [0.22, 0.24, 0.3],
    limb: [0.16, 0.17, 0.22],
    head: [0.42, 0.46, 0.58],
    crest: [0.6, 0.68, 0.78],
    weapon: "club",
    accent: [0.7, 0.82, 1.0],
    torsoSize: [0.56, 0.6, 0.36],
    attachments: [
      // Wide iron shoulder frame.
      { shape: "box", parent: "back", position: [0, 1.0, -0.1], size: [0.6, 0.14, 0.1], material: "crest" },
      { shape: "box", parent: "shoulderR", position: [0, 0.14, 0], size: [0.3, 0.2, 0.28], material: "crest" },
      { shape: "box", parent: "shoulderL", position: [0, 0.14, 0], size: [0.3, 0.2, 0.28], material: "crest" },
      // Frost coating on the boots.
      { shape: "box", parent: "hipL", position: [0, -0.5, 0.02], size: [0.2, 0.12, 0.24], material: "accent" },
      { shape: "box", parent: "hipR", position: [0, -0.5, 0.02], size: [0.2, 0.12, 0.24], material: "accent" },
    ],
  },
  icearmor: {
    body: [0.5, 0.68, 0.82],
    limb: [0.4, 0.56, 0.72],
    head: [0.46, 0.5, 0.62],
    crest: [0.72, 0.9, 1.0],
    weapon: "club",
    offhand: "shield",
    accent: [0.65, 0.92, 1.0],
    torsoSize: [0.5, 0.58, 0.34],
    attachments: [
      // Large ice-crystal shoulder plates, tagged so they can vanish on break.
      { shape: "box", parent: "shoulderR", position: [0, 0.16, 0], size: [0.3, 0.24, 0.28], material: "crest", armorPlate: true },
      { shape: "box", parent: "shoulderL", position: [0, 0.16, 0], size: [0.3, 0.24, 0.28], material: "crest", armorPlate: true },
      { shape: "box", parent: "body", position: [0, 0.9, 0.16], size: [0.4, 0.36, 0.1], material: "crest", armorPlate: true },
    ],
  },
  commander: {
    body: [0.28, 0.22, 0.4],
    limb: [0.2, 0.16, 0.3],
    head: [0.5, 0.5, 0.62],
    crest: [0.85, 0.72, 0.3],
    weapon: "banner",
    accent: [1.0, 0.82, 0.35],
    cape: true,
    headSize: [0.32, 0.36, 0.3],
    attachments: [
      // Tall helmet crest.
      { shape: "box", parent: "head", position: [0, 0.32, -0.02], size: [0.08, 0.22, 0.08], material: "accent" },
      // Horn at the belt.
      { shape: "cylinder", parent: "body", position: [-0.2, 0.6, 0.08], rotation: [1.2, 0.4, 0], size: [0.04, 0.24, 0.09], material: "weapon" },
    ],
  },
  bomber: {
    body: [0.3, 0.5, 0.68],
    limb: [0.22, 0.4, 0.56],
    head: [0.4, 0.5, 0.6],
    crest: [0.55, 0.85, 1.0],
    weapon: "none",
    accent: [0.65, 1.0, 1.0],
    torsoSize: [0.36, 0.42, 0.26],
    attachments: [
      // Glowing internal ice core, brightens as the countdown progresses.
      { shape: "sphere", parent: "body", position: [0, 0.86, 0.1], size: [0.22, 0.22, 0.22], material: "accent" },
    ],
  },
};
