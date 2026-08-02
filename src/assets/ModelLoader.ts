import { AbstractMesh, AssetContainer, Scene, SceneLoader, TransformNode } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { AssetInstance, AssetSpec } from "./AssetTypes";

/** Loads an AssetContainer once and creates disposable scene-local instances. */
export class ModelLoader {
  private readonly cache = new Map<string, Promise<AssetContainer>>();

  constructor(private readonly scene: Scene) {}

  async load(spec: AssetSpec): Promise<AssetContainer> {
    const path = `${spec.rootUrl}${spec.fileName}`;
    const cached = this.cache.get(path);
    if (cached) return cached;
    const pending = SceneLoader.LoadAssetContainerAsync(spec.rootUrl, spec.fileName, this.scene).catch((error) => {
      this.cache.delete(path);
      throw error;
    });
    this.cache.set(path, pending);
    return pending;
  }

  instantiate(spec: AssetSpec, container: AssetContainer, id: string): AssetInstance {
    const entries = container.instantiateModelsToScene((name) => `${id}:${name}`, true);
    const root = new TransformNode(`${id}:root`, this.scene);
    for (const node of entries.rootNodes) node.parent = root;
    const nodes = root.getDescendants(false);
    const meshes = nodes.filter((node): node is AbstractMesh => node instanceof AbstractMesh);
    for (const mesh of meshes) {
      const collisionName = mesh.name.includes("COL_") || mesh.name.toLowerCase().includes("collision") || mesh.name.toLowerCase().includes("collider");
      if (collisionName) {
        mesh.isVisible = false;
        mesh.setEnabled(false);
        mesh.isPickable = false;
      }
    }
    const visibleMeshes = meshes.filter((mesh) => !mesh.name.includes("COL_") && !mesh.name.toLowerCase().includes("collision") && !mesh.name.toLowerCase().includes("collider"));
    return {
      key: spec.key,
      root,
      meshes: visibleMeshes,
      nodes,
      skeletons: entries.skeletons,
      animationGroups: entries.animationGroups,
      container,
      dispose: () => {
        for (const group of entries.animationGroups) group.stop();
        entries.dispose();
        if (!root.isDisposed()) root.dispose(false, false);
      },
    };
  }

  clear(): void {
    this.cache.clear();
  }
}
