import type { BuildingType } from "../data/BuildingDefinitions";

/**
 * Literal building icons, drawn from the same shapes as the 3D models so the
 * panel entry and the thing on the field read as the same object. Generated in
 * code; no external or paid assets.
 */
export function buildingIcon(type: BuildingType, size = 26): string {
  const head = `width="${size}" height="${size}" viewBox="0 0 32 32" class="ricon" aria-hidden="true"`;
  switch (type) {
    case "mine":
      return `<svg ${head}>
        <rect x="3" y="24" width="26" height="5" rx="1" fill="#6a727c" stroke="#3f454d" stroke-width="1.2"/>
        <path d="M8 24 L8 12 L24 12 L24 24" fill="none" stroke="#6d451f" stroke-width="2.4"/>
        <path d="M10 24 L10 16 Q16 12 22 16 L22 24 Z" fill="#2b2f36"/>
        <rect x="14.6" y="7" width="2.8" height="5" fill="#8a5e33"/>
        <circle cx="16" cy="6" r="2.4" fill="#f0bc3f"/>
      </svg>`;
    case "goldMine":
      return `<svg ${head}>
        <rect x="3" y="24" width="26" height="5" rx="1" fill="#6a727c" stroke="#3f454d" stroke-width="1.2"/>
        <path d="M8 24 L8 12 L24 12 L24 24" fill="none" stroke="#6d451f" stroke-width="2.4"/>
        <path d="M10 24 L10 16 Q16 12 22 16 L22 24 Z" fill="#2b2f36"/>
        <circle cx="11" cy="22" r="2.4" fill="#f0bc3f" stroke="#8a5f11"/>
        <circle cx="16" cy="20" r="2.8" fill="#ffd964" stroke="#8a5f11"/>
        <circle cx="21" cy="22" r="2.3" fill="#f0bc3f" stroke="#8a5f11"/>
      </svg>`;
    case "lumberyard":
      return `<svg ${head}>
        <rect x="4" y="25" width="24" height="4" rx="1" fill="#8a5e33" stroke="#4a2f18" stroke-width="1.1"/>
        <path d="M4 16 L16 8 L28 16" fill="none" stroke="#59504a" stroke-width="3" stroke-linejoin="round"/>
        <rect x="7" y="16" width="3" height="9" fill="#6d451f"/>
        <rect x="22" y="16" width="3" height="9" fill="#6d451f"/>
        <circle cx="16" cy="20" r="5" fill="none" stroke="#b9c2ce" stroke-width="2"/>
        <path d="M16 15 L16 25 M11 20 L21 20" stroke="#b9c2ce" stroke-width="1.2"/>
      </svg>`;
    case "warehouse":
      return `<svg ${head}>
        <path d="M3 14 L16 6 L29 14 L29 28 L3 28 Z" fill="#9a6b3c" stroke="#4a2f18" stroke-width="1.4"/>
        <path d="M3 14 L16 6 L29 14" fill="#59504a" stroke="#3a3430" stroke-width="1.2"/>
        <rect x="12" y="18" width="8" height="10" fill="#4a3620" stroke="#2b1f12" stroke-width="1"/>
        <rect x="5" y="18" width="5" height="5" fill="#c99a63"/>
        <rect x="22" y="18" width="5" height="5" fill="#c99a63"/>
      </svg>`;
    case "recruitHall":
      return `<svg ${head}>
        <path d="M4 15 L16 5 L28 15 L28 28 L4 28 Z" fill="#6d5334" stroke="#3b2b18" stroke-width="1.4"/>
        <rect x="12.5" y="17" width="7" height="11" rx="3.5" fill="#2b2118"/>
        <path d="M8 12 L8 4 L11 5.5 L14 4 L14 12 Z" fill="#f0bc3f" stroke="#8a5f11" stroke-width="1"/>
        <path d="M18 12 L18 4 L21 5.5 L24 4 L24 12 Z" fill="#e05a3c" stroke="#7c2f1c" stroke-width="1"/>
      </svg>`;
    case "autoCollector":
      return `<svg ${head}>
        <ellipse cx="16" cy="27" rx="10" ry="3.2" fill="#6a727c" stroke="#3f454d" stroke-width="1.1"/>
        <path d="M13 26 L14.6 12 L17.4 12 L19 26 Z" fill="#9aa3ae" stroke="#535b64" stroke-width="1"/>
        <path d="M6 12 L26 12" stroke="#b9c2ce" stroke-width="2" stroke-linecap="round"/>
        <path d="M16 4 L16 12" stroke="#b9c2ce" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="9" r="3.4" fill="#74ffa6" stroke="#2f9d5f" stroke-width="1"/>
      </svg>`;
    case "autoRebuilder":
      return `<svg ${head}>
        <rect x="5" y="25" width="22" height="4" rx="1" fill="#6a727c" stroke="#3f454d" stroke-width="1.1"/>
        <path d="M9 25 L9 9 M23 25 L23 9 M9 9 L23 9" fill="none" stroke="#9aa3ae" stroke-width="2.2"/>
        <path d="M23 6 L23 9 L11 9" fill="none" stroke="#b9c2ce" stroke-width="1.8"/>
        <rect x="13" y="14" width="6" height="8" rx="1" fill="#4fd0ff" stroke="#1f7ea3" stroke-width="1"/>
      </svg>`;
    case "tower":
      return `<svg ${head}>
        <path d="M9 28 L11 12 L21 12 L23 28 Z" fill="#8c949f" stroke="#4d545d" stroke-width="1.4"/>
        <path d="M9 12 L9 7 L12 7 L12 10 L15 10 L15 7 L18 7 L18 10 L21 10 L21 7 L24 7 L24 12 Z"
              fill="#a4adb8" stroke="#4d545d" stroke-width="1.2"/>
        <rect x="14.6" y="1.5" width="2.8" height="6" rx="1" fill="#b9c2ce" stroke="#5d646d" stroke-width="1"/>
        <circle cx="16" cy="18" r="2.4" fill="#ffb45a"/>
      </svg>`;
    case "crossbowTower":
      return `<svg ${head}>
        <rect x="10" y="18" width="12" height="10" fill="#7a5a35" stroke="#4a3620" stroke-width="1.2"/>
        <path d="M4 14 L16 10 L28 14" fill="none" stroke="#6d451f" stroke-width="2.2"/>
        <path d="M8 15 Q16 8 24 15" fill="none" stroke="#c9a15f" stroke-width="1.4"/>
        <rect x="14.6" y="9" width="2.8" height="9" fill="#3f454d"/>
      </svg>`;
    case "frostTower":
      return `<svg ${head}>
        <path d="M16 4 L20 12 L28 14 L20 17 L16 26 L12 17 L4 14 L12 12 Z" fill="#8fd6ff" stroke="#3f8fb8" stroke-width="1.2"/>
        <circle cx="16" cy="14" r="3.4" fill="#eafcff" stroke="#3f8fb8" stroke-width="1"/>
        <rect x="12" y="24" width="8" height="4" fill="#5d99b8"/>
      </svg>`;
    case "sniperTower":
      return `<svg ${head}>
        <rect x="12" y="20" width="8" height="8" fill="#7a828c" stroke="#4d545d" stroke-width="1.2"/>
        <rect x="14.6" y="3" width="2.8" height="18" fill="#9aa3ae" stroke="#4d545d" stroke-width="1"/>
        <ellipse cx="16" cy="6" rx="4" ry="2.2" fill="#3f454d" stroke="#1f2226" stroke-width="1"/>
        <circle cx="16" cy="6" r="1" fill="#ff5a4a"/>
      </svg>`;
    case "mortar":
      return `<svg ${head}>
        <rect x="6" y="23" width="20" height="5" rx="1" fill="#6a727c" stroke="#3f454d" stroke-width="1.2"/>
        <path d="M11 23 L15 10 L23 13 L20 23 Z" fill="#4d545d" stroke="#2b2f36" stroke-width="1.2"/>
        <circle cx="15" cy="10" r="2.6" fill="#2b2f36"/>
        <path d="M18 8 Q24 4 27 9" fill="none" stroke="#ff8a3c" stroke-width="1.6" stroke-linecap="round"/>
      </svg>`;
    case "wall":
      return `<svg ${head}>
        <rect x="2" y="12" width="28" height="14" fill="#8c949f" stroke="#4d545d" stroke-width="1.4"/>
        <path d="M2 12 L2 7 L7 7 L7 12 M11 12 L11 7 L16 7 L16 12 M20 12 L20 7 L25 7 L25 12 M29 12 L29 7"
              fill="#8c949f" stroke="#4d545d" stroke-width="1.4"/>
        <path d="M2 18 L30 18 M9 12 L9 18 M16 18 L16 26 M23 12 L23 18"
              stroke="#5d646d" stroke-width="1"/>
        <rect x="2" y="26" width="28" height="3" fill="#6a727c"/>
      </svg>`;
  }
}
