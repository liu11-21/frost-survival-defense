import { DynamicTexture, Mesh, MeshBuilder, Scene, StandardMaterial } from "@babylonjs/core";
import type { BarStyle } from "./HealthBarPolicy";

const TEX_WIDTH = 192;
const TEX_HEIGHT = 48;

const TEXT_COLOR: Record<BarStyle, string> = {
  ally: "#bce4ff",
  hero: "#ffe9a8",
  enemy: "#ffcfc4",
  structure: "#ffe0b0",
};

/**
 * A caption plane above one health bar.
 *
 * The texture is only redrawn when the text actually changes, so a caption that
 * says "Lv.3 精銳射手" for eight seconds costs one canvas paint, not one per
 * frame. Created lazily: bars that never come close enough to show text never
 * allocate a texture at all.
 */
export class HealthBarLabel {
  private plane: Mesh | null = null;
  private texture: DynamicTexture | null = null;
  private lastText = "";
  private lastStyle: BarStyle | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly parent: Mesh,
    private readonly index: number,
  ) {}

  /** Draws `text`, creating the plane on first use. Empty text hides it. */
  set(text: string, style: BarStyle): void {
    if (!text) {
      this.hide();
      return;
    }
    if (!this.plane) this.create();
    const plane = this.plane;
    const texture = this.texture;
    if (!plane || !texture) return;

    if (text !== this.lastText || style !== this.lastStyle) {
      this.lastText = text;
      this.lastStyle = style;
      const ctx = texture.getContext() as CanvasRenderingContext2D;
      ctx.clearRect(0, 0, TEX_WIDTH, TEX_HEIGHT);
      ctx.font = "600 26px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(4, 8, 16, 0.9)";
      ctx.strokeText(text, TEX_WIDTH / 2, TEX_HEIGHT / 2, TEX_WIDTH - 8);
      ctx.fillStyle = TEXT_COLOR[style];
      ctx.fillText(text, TEX_WIDTH / 2, TEX_HEIGHT / 2, TEX_WIDTH - 8);
      texture.update(false);
    }
    if (!plane.isEnabled()) plane.setEnabled(true);
  }

  /**
   * Keeps the caption in world space instead of parenting it below the
   * billboarded health bar. A plane below another billboard can be rendered
   * from either side as the camera crosses an axis, which is why only some
   * names looked mirrored in play. Its own billboard has one unambiguous
   * camera-facing front face.
   */
  syncPosition(): void {
    if (!this.plane || !this.plane.isEnabled()) return;
    const p = this.parent.getAbsolutePosition();
    this.plane.position.set(p.x, p.y + 0.28, p.z);
  }

  hide(): void {
    if (this.plane?.isEnabled()) this.plane.setEnabled(false);
  }

  dispose(): void {
    this.plane?.dispose(false, true);
    this.texture?.dispose();
    this.plane = null;
    this.texture = null;
  }

  private create(): void {
    const texture = new DynamicTexture(
      `hpLabel${this.index}`,
      { width: TEX_WIDTH, height: TEX_HEIGHT },
      this.scene,
      true,
    );
    texture.hasAlpha = true;
    const mat = new StandardMaterial(`mat.hpLabel${this.index}`, this.scene);
    mat.diffuseTexture = texture;
    mat.opacityTexture = texture;
    mat.emissiveTexture = texture;
    mat.disableLighting = true;
    mat.backFaceCulling = false;

    const plane = MeshBuilder.CreatePlane(
      `hpLabelPlane${this.index}`,
      { width: 1.5, height: 0.375 },
      this.scene,
    );
    plane.material = mat;
    // Deliberately no parent: see `syncPosition()` above. The label owns its
    // own billboard so it is never a mirrored back-face of the bar plane.
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    plane.position.set(0, 0, 0);
    plane.isPickable = false;
    plane.renderingGroupId = 1;
    plane.setEnabled(false);

    this.plane = plane;
    this.texture = texture;
  }
}
