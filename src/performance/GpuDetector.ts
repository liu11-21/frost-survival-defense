export interface GpuInfo {
  renderer: string;
  vendor: string;
  /** True when the string matches a known CPU rasteriser. */
  softwareRendering: boolean;
  /** False when the browser withheld the unmasked strings. */
  detailAvailable: boolean;
  webglVersion: string;
}

const SOFTWARE_MARKERS = [
  "swiftshader",
  "llvmpipe",
  "microsoft basic render",
  "software renderer",
  "softpipe",
  "mesa offscreen",
  "google inc. (google)",
];

/**
 * Best-effort GPU identification.
 *
 * `WEBGL_debug_renderer_info` is not available in every browser or privacy
 * configuration, so every step degrades safely: a missing extension yields a
 * "detail unavailable" result rather than throwing.
 */
export function detectGpu(gl: WebGLRenderingContext | WebGL2RenderingContext | null): GpuInfo {
  const unknown: GpuInfo = {
    renderer: "未知",
    vendor: "未知",
    softwareRendering: false,
    detailAvailable: false,
    webglVersion: "unknown",
  };
  if (!gl) return unknown;

  let renderer = "";
  let vendor = "";
  let detailAvailable = false;

  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) {
      const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      const v = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
      if (typeof r === "string" && r.length > 0) {
        renderer = r;
        detailAvailable = true;
      }
      if (typeof v === "string" && v.length > 0) vendor = v;
    }
  } catch {
    // Extension blocked; fall through to the masked parameters.
  }

  try {
    if (!renderer) {
      const r = gl.getParameter(gl.RENDERER);
      if (typeof r === "string") renderer = r;
    }
    if (!vendor) {
      const v = gl.getParameter(gl.VENDOR);
      if (typeof v === "string") vendor = v;
    }
  } catch {
    // Nothing more to try.
  }

  let webglVersion = "unknown";
  try {
    const version = gl.getParameter(gl.VERSION);
    if (typeof version === "string") webglVersion = version;
  } catch {
    // ignore
  }

  const haystack = `${renderer} ${vendor}`.toLowerCase();
  const softwareRendering = SOFTWARE_MARKERS.some((marker) => haystack.includes(marker));

  return {
    renderer: renderer || "未知",
    vendor: vendor || "未知",
    softwareRendering,
    detailAvailable,
    webglVersion,
  };
}

/** Reads the GL context out of a Babylon engine without depending on its type. */
export function glFromEngine(engine: {
  _gl?: WebGLRenderingContext;
  getRenderingCanvas?: () => HTMLCanvasElement | null;
}): WebGLRenderingContext | WebGL2RenderingContext | null {
  if (engine._gl) return engine._gl;
  try {
    const canvas = engine.getRenderingCanvas?.();
    if (!canvas) return null;
    return (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGL2RenderingContext | null;
  } catch {
    return null;
  }
}
