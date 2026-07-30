import {
  Color3,
  DynamicTexture,
  Material,
  PBRMaterial,
  Scene,
  StandardMaterial,
  Texture,
} from "@babylonjs/core";

export interface PbrOptions {
  color: [number, number, number];
  roughness?: number;
  metallic?: number;
  emissive?: [number, number, number];
  emissiveIntensity?: number;
  alpha?: number;
  texture?: "bark" | "plank" | "rock" | "cloth" | "ice";
}

/**
 * Central material cache. Every mesh in the game asks for its material by key
 * so a colour is only ever uploaded to the GPU once.
 */
export class MaterialFactory {
  private readonly cache = new Map<string, Material>();
  private readonly textures = new Map<string, Texture>();

  constructor(private readonly scene: Scene) {}

  pbr(key: string, options: PbrOptions): PBRMaterial {
    const existing = this.cache.get(key);
    if (existing) return existing as PBRMaterial;

    const mat = new PBRMaterial(key, this.scene);
    mat.albedoColor = new Color3(...options.color);
    mat.metallic = options.metallic ?? 0.0;
    mat.roughness = options.roughness ?? 0.85;
    mat.environmentIntensity = 0.55;
    mat.specularIntensity = 0.5;
    if (options.emissive) {
      mat.emissiveColor = new Color3(...options.emissive);
      mat.emissiveIntensity = options.emissiveIntensity ?? 1;
    }
    if (options.alpha !== undefined && options.alpha < 1) {
      mat.alpha = options.alpha;
      mat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
    }
    if (options.texture) {
      mat.albedoTexture = this.proceduralTexture(options.texture);
      mat.useAlphaFromAlbedoTexture = false;
    }
    mat.freeze();
    this.cache.set(key, mat);
    return mat;
  }

  /** Unlit / emissive-only material for glowing accents and UI-ish decals. */
  unlit(key: string, color: [number, number, number], alpha = 1): StandardMaterial {
    const existing = this.cache.get(key);
    if (existing) return existing as StandardMaterial;
    const mat = new StandardMaterial(key, this.scene);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.emissiveColor = new Color3(...color);
    mat.disableLighting = true;
    if (alpha < 1) {
      mat.alpha = alpha;
    }
    this.cache.set(key, mat);
    return mat;
  }

  /** Soft dark ellipse used as a contact shadow underneath characters and props. */
  blobShadow(): StandardMaterial {
    const key = "mat.blobShadow";
    const existing = this.cache.get(key);
    if (existing) return existing as StandardMaterial;

    const size = 128;
    const tex = new DynamicTexture(key + ".tex", { width: size, height: size }, this.scene, false);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(10,16,30,0.55)");
    gradient.addColorStop(0.55, "rgba(10,16,30,0.28)");
    gradient.addColorStop(1, "rgba(10,16,30,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    tex.update(false);
    tex.hasAlpha = true;

    const mat = new StandardMaterial(key, this.scene);
    mat.diffuseTexture = tex;
    mat.opacityTexture = tex;
    mat.emissiveColor = Color3.Black();
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    mat.zOffset = -2;
    this.cache.set(key, mat);
    return mat;
  }

  private proceduralTexture(kind: NonNullable<PbrOptions["texture"]>): Texture {
    const cached = this.textures.get(kind);
    if (cached) return cached;

    const size = 256;
    const tex = new DynamicTexture(`tex.${kind}`, { width: size, height: size }, this.scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;

    switch (kind) {
      case "bark":
        paintBark(ctx, size);
        break;
      case "plank":
        paintPlank(ctx, size);
        break;
      case "rock":
        paintRock(ctx, size);
        break;
      case "cloth":
        paintCloth(ctx, size);
        break;
      case "ice":
        paintIce(ctx, size);
        break;
    }

    tex.update(false);
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    this.textures.set(kind, tex);
    return tex;
  }

  dispose(): void {
    for (const mat of this.cache.values()) mat.dispose();
    for (const tex of this.textures.values()) tex.dispose();
    this.cache.clear();
    this.textures.clear();
  }
}

function paintBark(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#8c8378";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 190; i++) {
    const x = Math.random() * size;
    const w = 1 + Math.random() * 4;
    const shade = 110 + Math.random() * 90;
    ctx.fillStyle = `rgba(${shade},${shade - 8},${shade - 20},0.55)`;
    ctx.fillRect(x, 0, w, size);
  }
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(60,52,44,${0.15 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 3, 10 + Math.random() * 40);
  }
}

function paintPlank(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#c9a877";
  ctx.fillRect(0, 0, size, size);
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y = (r * size) / rows;
    const tint = 175 + Math.random() * 45;
    ctx.fillStyle = `rgb(${tint},${tint - 32},${tint - 78})`;
    ctx.fillRect(0, y, size, size / rows - 2);
    ctx.fillStyle = "rgba(90,64,38,0.5)";
    ctx.fillRect(0, y + size / rows - 3, size, 3);
    for (let g = 0; g < 8; g++) {
      ctx.strokeStyle = "rgba(120,86,50,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const gy = y + Math.random() * (size / rows);
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(size * 0.3, gy + 4, size * 0.6, gy - 4, size, gy + 2);
      ctx.stroke();
    }
  }
}

function paintRock(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#6d7280";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const v = 80 + Math.random() * 90;
    ctx.fillStyle = `rgba(${v},${v + 4},${v + 14},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 5, 2 + Math.random() * 5);
  }
}

function paintCloth(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 3) {
    ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
    ctx.fillRect(0, i, size, 1);
    ctx.fillRect(i, 0, 1, size);
  }
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 4, 4);
  }
}

function paintIce(ctx: CanvasRenderingContext2D, size: number): void {
  ctx.fillStyle = "#cfe6f5";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 46; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.4})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      x += (Math.random() - 0.5) * 90;
      y += (Math.random() - 0.5) * 90;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
