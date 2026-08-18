import {
  Color3,
  Color4,
  DefaultRenderingPipeline,
  Engine,
  ImageProcessingConfiguration,
  Scene,
  SSAO2RenderingPipeline,
} from "@babylonjs/core";
import { COLORS, FOG_DENSITY } from "../game/GameConfig";
import { createSnowEnvironment } from "./EnvironmentTexture";

export interface SceneBundle {
  scene: Scene;
  pipeline: DefaultRenderingPipeline;
  /**
   * Null where the device cannot run it. SSAO2 needs WebGL2 for the depth
   * and normal targets it reads, and asking for it on WebGL1 does not
   * degrade -- it throws during construction and takes the whole scene with
   * it. Everything downstream treats this as optional.
   */
  ssao: SSAO2RenderingPipeline | null;
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

  // AMBIENT OCCLUSION, and it is the one thing this stack did not have.
  //
  // Everything else here was already in place -- tone mapping, bloom, FXAA,
  // vignette, and a procedural snow environment driving image-based lighting
  // on every glTF material in the game. What was missing is contact: a
  // character standing on snow had no darkening where it meets the ground, no
  // occlusion under a coat hem or inside a hood, so figures read as pasted
  // onto the scene rather than standing in it.
  //
  // The parameters are chosen for a game seen from a middle-distance RTS
  // camera, not for an architectural still:
  //
  //   ssaoRatio 0.75   the AO buffer is cheap to blur and nobody sees its
  //                    resolution; the blur runs at full rate so edges stay put
  //   radius 1.8       TUNED, not guessed. At 0.9 -- a character's shoulder
  //                    width -- the on/off comparison came back with a mean
  //                    pixel difference of 0.451 out of 255, which is nothing.
  //                    Pushed to 2.6 it reached 2.71, which proved the effect
  //                    was reaching the screen and the first number was simply
  //                    too small for an RTS camera this far back. 1.8 sits
  //                    between them.
  //   totalStrength    1.45. The scene is snow and heavy AO reads as dirt, so
  //                    this is the ceiling before the ground starts looking
  //                    stained rather than occluded.
  //   maxZ 90          past that the terrain is fog anyway (FOG_DENSITY), so
  //                    sampling it is work thrown away
  let ssao: SSAO2RenderingPipeline | null = null;
  if (SSAO2RenderingPipeline.IsSupported) {
    ssao = new SSAO2RenderingPipeline("frostSSAO", scene, {
      ssaoRatio: 0.75,
      blurRatio: 1,
    }, []);
    ssao.radius = 1.8;
    ssao.totalStrength = 1.45;
    ssao.base = 0.12;
    ssao.samples = 12;
    ssao.maxZ = 90;
    ssao.minZAspect = 0.25;
    ssao.expensiveBlur = false;
  }

  return { scene, pipeline, ssao };
}
