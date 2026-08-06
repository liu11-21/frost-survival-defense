import { Constants, RawCubeTexture, Scene, Vector3 } from "@babylonjs/core";

/**
 * A generated cube map so metals have something to reflect.
 *
 * Every `metal` and `iron` material in this project is authored at 0.86-0.88
 * metallic. A metal has no diffuse response at all -- its whole appearance is
 * reflected environment -- so with `scene.environmentTexture` unset they
 * rendered as near-black glossy blobs. That is why the Warrior's axe head and
 * pauldron, the mine headframe, the sawblade and every weapon read as cut-outs
 * rather than as steel.
 *
 * Measuring this on a wide gameplay frame was misleading: dropping all nine
 * facility materials to 0.2 metallic at runtime moved facility luminance by
 * nothing at all, because metal is a small share of those pixels. It is only
 * on a character, where the axe is the silhouette, that the cost is obvious.
 *
 * This is generated rather than loaded so it costs no asset, no request and no
 * CDN: 32px faces of a sky-to-snow gradient with a warm lobe where the sun
 * sits, matching the DirectionalLight in LightingSetup. It is not a captured
 * HDR and does not pretend to be -- it exists so a metal surface samples the
 * sky above and the snow below instead of sampling nothing.
 */
const FACE = 32;

/** Sun direction in LightingSetup, negated: the direction light arrives FROM. */
const SUN_FROM = new Vector3(0.45, 0.72, -0.53).normalize();

const SKY = [0.42, 0.54, 0.78] as const;
const HORIZON = [0.60, 0.66, 0.76] as const;
const SNOW = [0.74, 0.78, 0.84] as const;
const SUN = [1.0, 0.96, 0.86] as const;

/** Direction through the centre of texel (u, v) on cube face `face`. */
function direction(face: number, u: number, v: number): Vector3 {
  // u, v run -1..1 across the face. Axis order matches WebGL cube face order:
  // +X, -X, +Y, -Y, +Z, -Z.
  switch (face) {
    case 0: return new Vector3(1, -v, -u);
    case 1: return new Vector3(-1, -v, u);
    case 2: return new Vector3(u, 1, v);
    case 3: return new Vector3(u, -1, -v);
    case 4: return new Vector3(u, -v, 1);
    default: return new Vector3(-u, -v, -1);
  }
}

function faceData(face: number): Uint8Array {
  const data = new Uint8Array(FACE * FACE * 4);
  for (let y = 0; y < FACE; y++) {
    for (let x = 0; x < FACE; x++) {
      const u = ((x + 0.5) / FACE) * 2 - 1;
      const v = ((y + 0.5) / FACE) * 2 - 1;
      const dir = direction(face, u, v).normalize();

      // Vertical blend: snow below, horizon at eye level, sky above.
      const up = dir.y;
      let rgb: number[];
      if (up >= 0) {
        const t = Math.pow(up, 0.7);
        rgb = [0, 1, 2].map((i) => HORIZON[i] + (SKY[i] - HORIZON[i]) * t);
      } else {
        const t = Math.pow(-up, 0.6);
        rgb = [0, 1, 2].map((i) => HORIZON[i] + (SNOW[i] - HORIZON[i]) * t);
      }

      // A broad warm lobe where the sun is, so a curved metal surface catches a
      // travelling highlight as it turns instead of staying evenly lit.
      const toSun = Math.max(0, Vector3.Dot(dir, SUN_FROM));
      const lobe = Math.pow(toSun, 24) * 0.9 + Math.pow(toSun, 4) * 0.16;
      rgb = [0, 1, 2].map((i) => Math.min(1, rgb[i] + (SUN[i] - rgb[i]) * Math.min(1, lobe)));

      const o = (y * FACE + x) * 4;
      data[o] = Math.round(rgb[0] * 255);
      data[o + 1] = Math.round(rgb[1] * 255);
      data[o + 2] = Math.round(rgb[2] * 255);
      data[o + 3] = 255;
    }
  }
  return data;
}

export function createSnowEnvironment(scene: Scene): RawCubeTexture {
  const faces = [0, 1, 2, 3, 4, 5].map(faceData);
  const texture = new RawCubeTexture(
    scene,
    faces,
    FACE,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_INT,
    true,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
  );
  texture.name = "snowEnvironment";
  // The gradient above is authored in linear light, not sRGB.
  texture.gammaSpace = false;
  return texture;
}
