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

  interface HeroGameplayReviewRuntimeState {
    ready: boolean;
    modelSource: "GLB" | "procedural";
    currentCamera: string;
    currentAnimation: string;
    currentLod: "LOD0" | "LOD1" | "LOD2";
    lighting: "snow-daylight" | "furnace-warm" | "studio-neutral";
    context: "alone" | "friends" | "battle";
    lod: 0 | 1 | 2;
    lodMode: "auto" | "forced";
    authoredVisibleMeshes: number;
    proceduralVisibleMeshes: number;
    allyCount: number;
    enemyCount: number;
    animationNormalized: number;
    boneTransforms: Record<string, {
      position: [number, number, number];
      rotation: [number, number, number, number];
    }>;
    animationGroups: string[];
    heroWorldPosition: { x: number; y: number; z: number };
    heroScreenBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
      right: number;
      bottom: number;
      visible: boolean;
    };
    consoleErrors: string[];
    uiOccluded: boolean;
  }

  interface WarriorReviewRuntimeState {
    ready: boolean;
    unit: "warrior";
    captureMode: "unitReview=warrior";
    modelSource: "GLB" | "procedural";
    currentCamera: string;
    currentAnimation: string;
    currentLod: "LOD0" | "LOD1" | "LOD2";
    authoredVisibleMeshes: number;
    proceduralVisibleMeshes: number;
    animationGroups: string[];
    consoleErrors: string[];
    heroScreenBounds: { x: number; y: number; width: number; height: number; right: number; bottom: number; visible: boolean };
    visible: boolean;
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
      renderReviewFrame(): void;
      api(): Record<string, unknown>;
    };
    __heroReviewState?: HeroReviewRuntimeState;
    __heroGameplayReviewState?: HeroGameplayReviewRuntimeState;
    __warriorReviewState?: WarriorReviewRuntimeState;
  }
}

export {};
