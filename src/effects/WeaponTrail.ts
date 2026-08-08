import { Color3, Observer, Scene, StandardMaterial, TrailMesh, TransformNode } from "@babylonjs/core";
import type { AssetInstance } from "../assets/AssetTypes";
import { EffectSettingsState } from "./EffectSettingsState";

/**
 * A swoosh ribbon that follows the authored weapon's cutting edge.
 *
 * A melee swing reads as *powerful* mainly through the path the blade takes,
 * not through the pose at the moment of contact. The Warrior's authored
 * MeleeAttack already moves the blade tip ~2.4m, but with nothing tracing
 * that path the impact frame is all the player actually perceives.
 *
 * This hangs off the `axe_tip` locator the GLB exports bone-parented to
 * `hand.R`, so the ribbon follows the real cutting edge of the real rigid
 * weapon -- there is no second, approximate notion of "where the axe is".
 */
export class WeaponTrail {
  private trail: TrailMesh | null = null;
  private syncObserver: Observer<Scene> | null = null;
  private running = false;

  private constructor(
    private readonly scene: Scene,
    private readonly generator: TransformNode,
    private readonly material: StandardMaterial,
  ) {}

  static create(scene: Scene, generator: TransformNode): WeaponTrail {
    const material = new StandardMaterial("mat.weaponTrail", scene);
    // Unlit and additive: the trail is a light streak, not a surface. Cold
    // steel-blue so it reads against the warm furnace light without looking
    // like a magic effect.
    material.disableLighting = true;
    material.emissiveColor = new Color3(0.62, 0.78, 0.95);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.alpha = 0.5;
    material.alphaMode = 2; // ALPHA_ADD
    material.backFaceCulling = false;
    material.freeze();
    return new WeaponTrail(scene, generator, material);
  }

  start(): void {
    if (this.running || !EffectSettingsState.weaponTrailsEnabled) return;
    if (this.generator.isDisposed()) return;
    if (!this.trail) {
      // Short and thin: this is a blade edge, not a comet. 24 segments over a
      // ~0.4s swing is roughly one segment per frame at 60fps.
      this.trail = new TrailMesh("vfx.weaponTrail", this.generator, this.scene, 0.13, 24, false);
      this.trail.material = this.material;
      this.trail.isPickable = false;
      this.trail.renderingGroupId = 1;
      // The locator is a bone-parented TransformNode with no mesh of its own,
      // so nothing else in the frame forces its world matrix to be current.
      // Without this the ribbon lags a frame behind the blade, or does not
      // move at all when the scene is stepped manually.
      this.syncObserver = this.scene.onBeforeRenderObservable.add(() => {
        if (!this.generator.isDisposed()) this.generator.computeWorldMatrix(true);
      });
    }
    this.trail.setEnabled(true);
    this.trail.start();
    this.running = true;
  }

  stop(): void {
    if (!this.running || !this.trail) return;
    this.trail.stop();
    this.trail.setEnabled(false);
    this.running = false;
  }

  dispose(): void {
    if (this.syncObserver) this.scene.onBeforeRenderObservable.remove(this.syncObserver);
    this.syncObserver = null;
    this.trail?.dispose();
    this.trail = null;
    this.material.dispose();
  }
}

/**
 * One trail per authored instance, created on first use and disposed with the
 * instance it belongs to. Returns null for assets with no `axe_tip` locator,
 * which is every unit except the Warrior today.
 */
const trails = new WeakMap<AssetInstance, WeaponTrail | null>();

export function weaponTrailFor(authored: AssetInstance): WeaponTrail | null {
  const existing = trails.get(authored);
  if (existing !== undefined) return existing;
  const stripped = (name: string) => name.split(":").pop() ?? name;
  const tip = authored.nodes.find((node) => stripped(node.name) === "axe_tip") as TransformNode | undefined;
  if (!tip) {
    trails.set(authored, null);
    return null;
  }
  const trail = WeaponTrail.create(tip.getScene(), tip);
  authored.root.onDisposeObservable.add(() => {
    trail.dispose();
    trails.delete(authored);
  });
  trails.set(authored, trail);
  return trail;
}
