/// <reference types="vite/client" />

import type { Game } from "./game/Game";

declare global {
  interface HeroReviewRuntimeState {
    ready: boolean;
    modelSource: "GLB" | "procedural";
    currentCamera: string;
    currentAnimation: string;
    currentLod: "LOD0" | "LOD1" | "LOD2";
    authoredVisibleMeshes: number;
    proceduralVisibleMeshes: number;
    visibleVertices: number;
    visibleTriangles: number;
    heroWorldPosition: { x: number; y: number; z: number };
    heroScreenBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
      visible: boolean;
    };
    animationGroups: string[];
    consoleErrors: string[];
    uiOccluded: boolean;
  }

  interface Window {
    /**
     * Development and heroReview-only handle used by the headless test
     * harness. It is intentionally exposed in production only for the
     * explicit ?heroReview=1 review entry point.
     */
    frostbound?: {
      game: Game;
      step(dt: number, frames?: number, render?: boolean): void;
      snapshot(): Record<string, number | string | boolean>;
      stopLoop(): void;
      api(): Record<string, unknown>;
    };
    __heroReviewState?: HeroReviewRuntimeState;
  }
}

export {};
