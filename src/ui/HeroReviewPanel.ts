export type HeroReviewCamera = "gameplay" | "front" | "left-side" | "back" | "three-quarter" | "close-up";
export type HeroReviewAnimation = "Idle" | "Walk" | "Run" | "MeleeAttack" | "RangedAttack" | "Hit" | "Death";
export type HeroReviewLod = 0 | 1 | 2;

export interface HeroReviewPanelState {
  camera: HeroReviewCamera;
  animation: HeroReviewAnimation;
  lod: HeroReviewLod;
  modelSource: "GLB" | "procedural";
  drawCalls: number;
  activeMeshes: number;
  fps: number;
  authoredVisibleMeshCount: number;
  proceduralVisibleMeshCount: number;
}

export interface HeroReviewPanelCallbacks {
  setCamera(mode: HeroReviewCamera): void;
  setAnimation(animation: HeroReviewAnimation): void;
  setLod(lod: HeroReviewLod): void;
}

/** Small, deliberately neutral overlay for the formal Hero visual review. */
export class HeroReviewPanel {
  readonly element: HTMLDivElement;
  private readonly source: HTMLElement;
  private readonly cameraSelect: HTMLSelectElement;
  private readonly animationSelect: HTMLSelectElement;
  private readonly lodSelect: HTMLSelectElement;
  private readonly animation: HTMLElement;
  private readonly lod: HTMLElement;
  private readonly drawCalls: HTMLElement;
  private readonly activeMeshes: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly authoredMeshes: HTMLElement;
  private readonly proceduralMeshes: HTMLElement;

  constructor(root: HTMLElement, callbacks: HeroReviewPanelCallbacks) {
    document.body.classList.add("hero-review");
    this.element = document.createElement("div");
    this.element.id = "heroReviewPanel";
    this.element.className = "hero-review-panel";
    this.element.innerHTML = `
      <div class="hero-review-title">HERO REVIEW</div>
      <div class="hero-review-source" data-review-source>Hero Model Source: --</div>
      <label>Camera <select data-review-camera>
        <option value="gameplay">Gameplay</option>
        <option value="front">Front</option>
        <option value="left-side">Left side</option>
        <option value="back">Back</option>
        <option value="three-quarter">Three-quarter</option>
        <option value="close-up">Close-up</option>
      </select></label>
      <label>Animation <select data-review-animation>
        <option>Idle</option><option>Walk</option><option>Run</option>
        <option>MeleeAttack</option><option>RangedAttack</option><option>Hit</option><option>Death</option>
      </select></label>
      <label>LOD <select data-review-lod><option value="0">LOD0</option><option value="1">LOD1</option><option value="2">LOD2</option></select></label>
      <div class="hero-review-metrics">
        <span data-review-animation-value>animation: --</span>
        <span data-review-lod-value>LOD: --</span>
        <span data-review-draw-calls>draw calls: --</span>
        <span data-review-active-meshes>active meshes: --</span>
        <span data-review-fps>FPS: --</span>
        <span data-review-authored>authored meshes: --</span>
        <span data-review-procedural>procedural visible: --</span>
      </div>`;
    root.appendChild(this.element);

    const select = <T extends HTMLElement>(selector: string): T => {
      const value = this.element.querySelector<T>(selector);
      if (!value) throw new Error(`Hero review control ${selector} missing`);
      return value;
    };
    const camera = select<HTMLSelectElement>("[data-review-camera]");
    const animation = select<HTMLSelectElement>("[data-review-animation]");
    const lod = select<HTMLSelectElement>("[data-review-lod]");
    this.cameraSelect = camera;
    this.animationSelect = animation;
    this.lodSelect = lod;
    this.source = select("[data-review-source]");
    this.animation = select("[data-review-animation-value]");
    this.lod = select("[data-review-lod-value]");
    this.drawCalls = select("[data-review-draw-calls]");
    this.activeMeshes = select("[data-review-active-meshes]");
    this.fps = select("[data-review-fps]");
    this.authoredMeshes = select("[data-review-authored]");
    this.proceduralMeshes = select("[data-review-procedural]");

    camera.addEventListener("change", () => callbacks.setCamera(camera.value as HeroReviewCamera));
    animation.addEventListener("change", () => callbacks.setAnimation(animation.value as HeroReviewAnimation));
    lod.addEventListener("change", () => callbacks.setLod(Number(lod.value) as HeroReviewLod));
  }

  update(state: HeroReviewPanelState): void {
    this.cameraSelect.value = state.camera;
    this.animationSelect.value = state.animation;
    this.lodSelect.value = String(state.lod);
    this.source.textContent = `Hero Model Source: ${state.modelSource}`;
    this.animation.textContent = `animation: ${state.animation}`;
    this.lod.textContent = `LOD: LOD${state.lod}`;
    this.drawCalls.textContent = `draw calls: ${state.drawCalls}`;
    this.activeMeshes.textContent = `active meshes: ${state.activeMeshes}`;
    this.fps.textContent = `FPS: ${state.fps.toFixed(1)}`;
    this.authoredMeshes.textContent = `authored meshes: ${state.authoredVisibleMeshCount}`;
    this.proceduralMeshes.textContent = `procedural visible: ${state.proceduralVisibleMeshCount}`;
  }

  dispose(): void {
    this.element.remove();
    document.body.classList.remove("hero-review");
  }
}
