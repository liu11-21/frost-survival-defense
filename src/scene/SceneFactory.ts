import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  Engine,
  ImageProcessingConfiguration,
  Scene,
} from "@babylonjs/core";
import { COLORS, FOG_DENSITY } from "../game/GameConfig";
import { createSnowEnvironment } from "./EnvironmentTexture";

export interface SceneBundle {
  scene: Scene;
  pipeline: DefaultRenderingPipeline;
}

/**
 * Builds the render target: engine settings, fog, tone mapping and the
 * post-process stack that gives the furnace its glow.
 */
export function createEngine(canvas: HTMLCanvasElement): Engine {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
    powerPreference: "high-performance",
    failIfMajorPerformanceCaveat: false,
  });
  engine.setHardwareScalingLevel(Math.min(1, 1 / Math.min(window.devicePixelRatio || 1, 1.5)));
  return engine;
}

export function createScene(engine: Engine): SceneBundle {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(COLORS.fog[0] * 0.72, COLORS.fog[1] * 0.78, COLORS.fog[2] * 0.9, 1);
  scene.ambientColor = new Color3(0.14, 0.18, 0.26);

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = new Color3(...COLORS.fog);
  scene.fogDensity = FOG_DENSITY;

  // Metals reflect the environment or they reflect nothing; see the note in
  // EnvironmentTexture.ts for why every 0.86-metallic surface in this project
  // was rendering black without it.
  scene.environmentTexture = createSnowEnvironment(scene);
  scene.environmentIntensity = 0.85;

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  // The scene was sitting in the shoulder of the ACES curve, which is why it
  // read dark and why nothing fixed it. Measured against a fixed pixel mask of
  // the actual meshes: tripling the sky light moved facility luminance from
  // 111 to 123 and a 2.5x sun moved it to the same 123, but exposure alone
  // took it to 155. More light could not escape the compression; the frame was
  // simply under-exposed. Contrast came down with it, because 1.12 was pushing
  // the shadow end back down as fast as exposure lifted it. Swept seven pairs
  // and checked for blown highlights at each: snow sits at 189 with zero
  // clipped pixels, against 175 before.
  scene.imageProcessingConfiguration.exposure = 1.38;
  scene.imageProcessingConfiguration.contrast = 1.05;
  scene.imageProcessingConfiguration.vignetteEnabled = true;
  scene.imageProcessingConfiguration.vignetteWeight = 1.1;
  scene.imageProcessingConfiguration.vignetteColor = new Color4(0.03, 0.05, 0.1, 0);

  // Skip the automatic pointer picking work — nothing in this game is clickable.
  scene.skipPointerMovePicking = true;
  scene.autoClearDepthAndStencil = true;
  scene.blockMaterialDirtyMechanism = false;

  const pipeline = new DefaultRenderingPipeline("frostPipeline", true, scene, []);
  pipeline.fxaaEnabled = true;
  pipeline.samples = 1;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.92;
  pipeline.bloomWeight = 0.3;
  pipeline.bloomKernel = 34;
  pipeline.bloomScale = 0.5;
  pipeline.imageProcessingEnabled = true;

  return { scene, pipeline };
}
