import { DynamicTexture, Scene, Texture } from "@babylonjs/core";

export type SpriteKind = "soft" | "chip" | "flake" | "shard" | "spark";

/**
 * Particle sprites are painted into small canvases at boot instead of shipping
 * image files. Each kind has its own silhouette so no two effects in the game
 * are built from the same blob.
 */
export class SpriteAtlas {
  private readonly cache = new Map<SpriteKind, Texture>();

  constructor(private readonly scene: Scene) {}

  get(kind: SpriteKind): Texture {
    const existing = this.cache.get(kind);
    if (existing) return existing;
    const tex = paint(this.scene, kind);
    this.cache.set(kind, tex);
    return tex;
  }

  dispose(): void {
    for (const tex of this.cache.values()) tex.dispose();
    this.cache.clear();
  }
}

function paint(scene: Scene, kind: SpriteKind): Texture {
  const size = 64;
  const tex = new DynamicTexture(`particle.${kind}`, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);

  switch (kind) {
    case "soft": {
      const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.45, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      break;
    }
    case "chip": {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(14, 24);
      ctx.lineTo(52, 18);
      ctx.lineTo(48, 44);
      ctx.lineTo(12, 40);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "flake": {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(32 - Math.cos(a) * 24, 32 - Math.sin(a) * 24);
        ctx.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
        ctx.stroke();
      }
      break;
    }
    case "shard": {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(32, 4);
      ctx.lineTo(50, 40);
      ctx.lineTo(30, 60);
      ctx.lineTo(16, 34);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "spark": {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 18);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.3, "rgba(255,220,150,0.9)");
      g.addColorStop(1, "rgba(255,140,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(32, 32, 18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  tex.update(false);
  tex.hasAlpha = true;
  return tex;
}
