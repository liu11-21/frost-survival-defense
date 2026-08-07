import { Effect, Scene, ShaderMaterial, Vector3 } from "@babylonjs/core";
import { COLORS, FOG_DENSITY, ROADS, ROAD_WIDTH } from "../game/GameConfig";

export const MAX_HEAT_SOURCES = 4;
/** Four lanes x eight segments. Keep this equal to the authored G1 road
 * contract so the shader cannot silently truncate the path list. */
export const MAX_ROADS = 32;

/**
 * Shared GLSL used by both stages: the snow coverage is evaluated in the vertex
 * shader (so melted ground physically sinks) and again in the fragment shader
 * (so the boundary stays crisp between vertices).
 */
const SNOW_FIELD = /* glsl */ `
#define HEAT_COUNT ${MAX_HEAT_SOURCES}
#define ROAD_COUNT ${MAX_ROADS}

uniform vec4 uHeat[HEAT_COUNT];   // xy = world xz, z = radius, w = strength
uniform vec4 uRoads[ROAD_COUNT];  // x1,z1,x2,z2
uniform float uRoadWidth;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + 17.3;
    a *= 0.5;
  }
  return v;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

float roadField(vec2 p) {
  float best = 1e4;
  for (int i = 0; i < ROAD_COUNT; i++) {
    vec4 r = uRoads[i];
    best = min(best, segDist(p, r.xy, r.zw));
  }
  // wobble the road edge so it never reads as a straight ribbon
  float wob = (fbm3(p * 0.42) - 0.5) * 1.3;
  return 1.0 - smoothstep(uRoadWidth * 0.32, uRoadWidth * 0.62 + wob, best);
}

float heatField(vec2 p) {
  float m = 0.0;
  for (int i = 0; i < HEAT_COUNT; i++) {
    vec4 h = uHeat[i];
    // NOTE: "active" is a reserved GLSL word, hence "enabled".
    float enabled = step(0.001, h.z);
    float d = distance(p, h.xy);
    float f = h.w * (1.0 - smoothstep(h.z * 0.42, h.z, d));
    m = max(m, f * enabled);
  }
  return m;
}

/** 1.0 = untouched snow, 0.0 = bare thawed ground. */
float snowCoverage(vec2 p, out float heat, out float road, out float drift) {
  heat = heatField(p);
  road = roadField(p);

  float coarse = fbm3(p * 0.075);
  float fine = fbm3(p * 0.29 + 41.7);

  // roads and the ground right around a heat source give way first
  float melt = heat * (1.0 + road * 0.85);
  melt += (coarse - 0.5) * 0.46 + (fine - 0.5) * 0.16;

  // stubborn drifts that survive well inside the thawed ring
  drift = smoothstep(0.66, 0.9, fine) * smoothstep(0.3, 0.75, coarse);
  melt -= drift * 0.34;

  return clamp(1.0 - smoothstep(0.34, 0.66, melt), 0.0, 1.0);
}
`;

const VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 viewProjection;

varying vec3 vWorld;
varying float vSnow;
varying float vHeat;
varying float vRoad;
varying float vDrift;
varying vec2 vUV;

${SNOW_FIELD}

void main(void) {
  vec4 wp = world * vec4(position, 1.0);
  float heat, road, drift;
  float snow = snowCoverage(wp.xz, heat, road, drift);
  // Snow level *is* y = 0 so every character and prop sits correctly on it;
  // thawed ground drops away instead of snow rising.
  wp.y -= (1.0 - snow) * 0.11 + road * (1.0 - snow) * 0.04;
  wp.y += drift * 0.07;
  vWorld = wp.xyz;
  vSnow = snow;
  vHeat = heat;
  vRoad = road;
  vDrift = drift;
  vUV = uv;
  gl_Position = viewProjection * wp;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

varying vec3 vWorld;
varying float vSnow;
varying float vHeat;
varying float vRoad;
varying float vDrift;
varying vec2 vUV;

uniform vec3 uSnowColor;
uniform vec3 uSnowShadow;
uniform vec3 uDirtColor;
uniform vec3 uWetColor;
uniform vec3 uRoadColor;
uniform vec3 uFogColor;
uniform vec3 uWarmColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCameraPos;
uniform float uFogDensity;
uniform float uTime;

${SNOW_FIELD}

void main(void) {
  vec2 p = vWorld.xz;

  // cheap normal from the snow height field
  float e = 0.9;
  float h0 = fbm3(p * 0.29 + 41.7);
  float hx = fbm3((p + vec2(e, 0.0)) * 0.29 + 41.7);
  float hz = fbm3((p + vec2(0.0, e)) * 0.29 + 41.7);
  vec3 n = normalize(vec3((h0 - hx) * (0.9 + vSnow * 1.6), 1.0, (h0 - hz) * (0.9 + vSnow * 1.6)));

  // --- ground albedo ---------------------------------------------------
  float grit = fbm3(p * 1.35);
  float wetness = clamp(vHeat * 1.35 + vRoad * 0.3, 0.0, 1.0);
  vec3 ground = mix(uDirtColor, uWetColor, wetness);
  ground *= 0.72 + grit * 0.62;
  // packed gravel road reads lighter than the churned mud around it
  ground = mix(ground, uRoadColor * (0.78 + grit * 0.55), vRoad * 0.92);
  // a damp rim right where the snow gives way
  float rim = smoothstep(0.02, 0.3, vSnow) * (1.0 - smoothstep(0.3, 0.62, vSnow));
  ground = mix(ground, uWetColor * 0.6, rim * 0.85);

  vec3 snowAlbedo = mix(uSnowShadow, uSnowColor, 0.3 + 0.7 * vSnow);
  snowAlbedo += vDrift * 0.05;

  vec3 albedo = mix(ground, snowAlbedo, vSnow);

  // --- lighting --------------------------------------------------------
  float ndl = max(dot(n, -normalize(uSunDir)), 0.0);
  vec3 ambient = mix(vec3(0.21, 0.26, 0.37), vec3(0.12, 0.11, 0.12), 1.0 - vSnow);
  vec3 color = albedo * (ambient + uSunColor * ndl * (0.5 + 0.4 * vSnow));

  // furnace warmth bleeding onto the ground
  float warm = pow(clamp(vHeat, 0.0, 1.0), 1.35);
  color += uWarmColor * warm * (0.3 + 0.32 * (1.0 - vSnow)) * albedo * 1.7;

  // snow sparkle
  float sparkle = pow(vnoise(p * 26.0 + floor(uTime * 3.0) * 0.13), 26.0);
  color += vec3(0.75, 0.85, 1.0) * sparkle * vSnow * 0.45;

  // wet specular on thawed ground
  vec3 viewDir = normalize(uCameraPos - vWorld);
  vec3 h = normalize(viewDir - normalize(uSunDir));
  float spec = pow(max(dot(n, h), 0.0), 48.0) * wetness * (1.0 - vSnow);
  color += uSunColor * spec * 0.6;

  // --- fog -------------------------------------------------------------
  float dist = length(uCameraPos - vWorld);
  float fogAmount = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  color = mix(color, uFogColor, clamp(fogAmount, 0.0, 0.86));

  gl_FragColor = vec4(color, 1.0);
}
`;

Effect.ShadersStore["frostGroundVertexShader"] = VERTEX;
Effect.ShadersStore["frostGroundFragmentShader"] = FRAGMENT;

export function createSnowMaterial(scene: Scene): ShaderMaterial {
  const mat = new ShaderMaterial(
    "frostGround",
    scene,
    { vertex: "frostGround", fragment: "frostGround" },
    {
      attributes: ["position", "uv"],
      uniforms: [
        "world",
        "viewProjection",
        "uSnowColor",
        "uSnowShadow",
        "uDirtColor",
        "uWetColor",
        "uRoadColor",
        "uFogColor",
        "uWarmColor",
        "uSunDir",
        "uSunColor",
        "uCameraPos",
        "uFogDensity",
        "uTime",
        "uRoadWidth",
        "uHeat",
        "uRoads",
      ],
    },
  );

  mat.setVector3("uSnowColor", new Vector3(...COLORS.snow));
  mat.setVector3("uSnowShadow", new Vector3(...COLORS.snowShadow));
  mat.setVector3("uDirtColor", new Vector3(...COLORS.dirt));
  mat.setVector3("uWetColor", new Vector3(...COLORS.wetDirt));
  mat.setVector3("uRoadColor", new Vector3(...COLORS.road));
  mat.setVector3("uFogColor", new Vector3(...COLORS.fog));
  mat.setVector3("uWarmColor", new Vector3(...COLORS.warm));
  mat.setVector3("uSunColor", new Vector3(...COLORS.sun));
  mat.setFloat("uFogDensity", FOG_DENSITY);
  mat.setFloat("uRoadWidth", ROAD_WIDTH);

  const roads = new Float32Array(MAX_ROADS * 4);
  for (let i = 0; i < MAX_ROADS; i++) {
    const seg = ROADS[i] ?? [0, 0, 0, 0];
    roads.set(seg, i * 4);
  }
  mat.setArray4("uRoads", Array.from(roads));
  mat.backFaceCulling = true;
  // Fog is applied inside the fragment shader, so Babylon must not inject its
  // own FOG define and uniforms on top.
  mat.fogEnabled = false;
  return mat;
}
