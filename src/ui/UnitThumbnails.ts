const BODY = `
  <circle cx="29" cy="12" r="5.2" fill="url(#skin)" stroke="#30445c" stroke-width="1.4"/>
  <path d="M22 20 Q29 16 36 20 L38 34 Q29 38 20 34 Z" fill="url(#coat)" stroke="#30445c" stroke-width="1.5"/>
  <path d="M23 34 L20 44 M35 34 L38 44" stroke="#9db7cf" stroke-width="3.3" stroke-linecap="round"/>
  <path d="M22 22 L15 31 M36 22 L43 31" stroke="#b9cce0" stroke-width="3" stroke-linecap="round"/>
`;

const DEFS = `<defs>
  <linearGradient id="coat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d6e6f4"/><stop offset=".5" stop-color="#718ba5"/><stop offset="1" stop-color="#344a62"/></linearGradient>
  <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f0cfb4"/><stop offset="1" stop-color="#b98e73"/></linearGradient>
  <linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e7fbff"/><stop offset=".55" stop-color="#72ccff"/><stop offset="1" stop-color="#4478d4"/></linearGradient>
</defs>`;

/**
 * Consistent roster thumbnails for the compact recruit panel. These are not
 * font glyphs: each role gets a readable weapon/tool silhouette while keeping
 * one frozen-survivor palette and framing language across the roster.
 */
export function unitThumbnailSvg(id: string): string {
  const extra = accessory(id);
  return `<svg class="recruit-glyph" viewBox="0 0 64 48" width="52" height="44" aria-hidden="true">
    ${DEFS}
    <path d="M7 43 Q32 37 57 43" fill="none" stroke="#d9edff" stroke-width="2" opacity=".18"/>
    ${BODY}
    ${extra}
  </svg>`;
}

function accessory(id: string): string {
  switch (id) {
    case "warrior":
      return `<path d="M43 29 L55 9" stroke="#d9e7f4" stroke-width="2.7" stroke-linecap="round"/>
        <path d="M52 8 L58 5 L55 12 Z" fill="#eaf5ff" stroke="#55708b" stroke-width="1"/>
        <circle cx="15" cy="31" r="7" fill="#526d88" stroke="#d4e6f6" stroke-width="1.6"/><circle cx="15" cy="31" r="2" fill="#ffb257"/>`;
    case "shield":
      return `<path d="M9 19 Q17 15 24 19 L23 36 Q17 42 11 36 Z" fill="#54728f" stroke="#d9e9f6" stroke-width="1.8"/>
        <path d="M16.5 20 L16.5 38" stroke="#9ec7e8" stroke-width="1.2"/>
        <path d="M41 17 L49 8" stroke="#d3e3ef" stroke-width="2.5" stroke-linecap="round"/>`;
    case "archer":
      return `<path d="M47 10 Q57 24 47 39" fill="none" stroke="#d5b36c" stroke-width="2.2"/>
        <path d="M47 10 L47 39" stroke="#a9d8ff" stroke-width="1"/>
        <path d="M40 26 L57 21" stroke="#e7f4ff" stroke-width="1.8"/><path d="M56 19 L61 21 L57 24 Z" fill="#e7f4ff"/>`;
    case "medic":
      return `<rect x="41" y="24" width="12" height="11" rx="2" fill="#d8e4ec" stroke="#5b7895" stroke-width="1.5"/>
        <path d="M47 26 V33 M43.5 29.5 H50.5" stroke="#e65e5a" stroke-width="2.2"/>
        <path d="M18 19 L18 11 L23 11" fill="none" stroke="#e65e5a" stroke-width="2"/>`;
    case "flagbearer":
      return `<path d="M46 4 V43" stroke="#b9cde0" stroke-width="2.4"/>
        <path d="M47 7 L60 11 L47 19 Z" fill="#ffb257" stroke="#805f32" stroke-width="1"/>
        <path d="M49 10 L55 12.2 L49 15 Z" fill="#edf7ff" opacity=".75"/>`;
    case "mage":
      return `<path d="M46 43 L50 10" stroke="#97b8d3" stroke-width="2.5"/>
        <circle cx="51" cy="8" r="5" fill="#9b7cff" stroke="#e9e2ff" stroke-width="1.3"/>
        <path d="M47 7 L51 1 L55 7 L51 13 Z" fill="none" stroke="#d6c8ff" stroke-width="1" opacity=".9"/>`;
    case "assault":
      return `<path d="M43 32 L55 10" stroke="#aabfd1" stroke-width="3" stroke-linecap="round"/>
        <path d="M49 10 Q56 5 61 9 L55 15 Z" fill="#d5e4ee" stroke="#536a7d" stroke-width="1.2"/>
        <path d="M11 31 L18 23" stroke="#ffb257" stroke-width="2.5" stroke-linecap="round"/>`;
    case "engineer":
      return `<path d="M42 35 L55 18" stroke="#d6e2ea" stroke-width="3" stroke-linecap="round"/>
        <path d="M52 14 Q57 11 60 14 L56 19 L51 18 Z" fill="#8ea8bd" stroke="#dbe8f2" stroke-width="1.2"/>
        <rect x="10" y="28" width="10" height="8" rx="1.5" fill="#d49445" stroke="#70491d" stroke-width="1.2"/>`;
    case "musketeer":
      return `<path d="M39 27 L59 17" stroke="#c8d8e5" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M43 29 L37 35" stroke="#916439" stroke-width="3" stroke-linecap="round"/>
        <rect x="50" y="16" width="8" height="3" rx="1" fill="#738aa0"/>`;
    case "frostmage":
      return `<path d="M46 43 L49 13" stroke="#9fc4de" stroke-width="2.4"/>
        <path d="M49 2 L55 10 L49 16 L43 10 Z" fill="url(#ice)" stroke="#e8fbff" stroke-width="1.1"/>
        <path d="M10 17 L15 17 M12.5 14.5 L12.5 19.5 M53 27 L58 27 M55.5 24.5 L55.5 29.5" stroke="#b8ecff" stroke-width="1.2"/>`;
    default:
      return `<path d="M43 31 L53 18" stroke="#d5e4ef" stroke-width="2.6" stroke-linecap="round"/>`;
  }
}
