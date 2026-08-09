export type MusicState = "MENU" | "PREPARATION" | "WARNING" | "COMBAT" | "INTENSE" | "WAVE_CLEAR";

export interface MusicTrackDefinition {
  readonly assetPath: string;
  readonly loop: boolean;
}

export const DEFAULT_MUSIC_VOLUME = 0.4;
export const MUSIC_CROSSFADE_SECONDS = 1.2;

export const MUSIC_TRACKS: Readonly<Record<MusicState, MusicTrackDefinition>> = {
  MENU: { assetPath: "assets/audio/music/menu-idle.mp3", loop: true },
  PREPARATION: { assetPath: "assets/audio/music/preparation.mp3", loop: true },
  WARNING: { assetPath: "assets/audio/music/warning.mp3", loop: true },
  COMBAT: { assetPath: "assets/audio/music/combat.mp3", loop: true },
  INTENSE: { assetPath: "assets/audio/music/intense.mp3", loop: true },
  WAVE_CLEAR: { assetPath: "assets/audio/music/wave-clear.mp3", loop: false },
};

export function resolveMusicAssetPath(state: MusicState, basePath = import.meta.env.BASE_URL): string {
  const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${base}${MUSIC_TRACKS[state].assetPath}`;
}
