/// <reference types="vite/client" />

import type { Game } from "./game/Game";

declare global {
  interface Window {
    /**
     * Development-only handle used by the headless test harness. Tree-shaken
     * out of production builds.
     */
    frostbound?: {
      game: Game;
      step(dt: number, frames?: number, render?: boolean): void;
      snapshot(): Record<string, number | string | boolean>;
      stopLoop(): void;
      api(): Record<string, unknown>;
    };
  }
}

export {};
