import { AbstractMesh, AssetContainer, Scene, SceneLoader, TransformNode, Vector3 } from "@babylonjs/core";
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
    const proxyLevel = (mesh: AbstractMesh): 0 | 1 | 2 => {
      const segments = mesh.name.split(":");
      const name = segments[segments.length - 1] ?? mesh.name;
      if (name.startsWith("LOD1_PROXY")) return 1;
      if (name.startsWith("LOD2_PROXY")) return 2;
      return 0;
    };
    const lodMeshes: [AbstractMesh[], AbstractMesh[], AbstractMesh[]] = [[], [], []];
    for (const mesh of visibleMeshes) lodMeshes[proxyLevel(mesh)].push(mesh);
    const setTier = (tier: 0 | 1 | 2): void => {
      for (let index = 0; index < lodMeshes.length; index += 1) {
        const enabled = index === tier;
        for (const mesh of lodMeshes[index]) {
          mesh.isVisible = enabled;
          mesh.setEnabled(enabled);
        }
      }
    };
    setTier(0);
    const lodObserver = this.scene.onBeforeRenderObservable.add(() => {
      const camera = this.scene.activeCamera;
      if (!camera || root.isDisposed()) return;
      const distance = Vector3.Distance(camera.globalPosition, root.getAbsolutePosition());
      setTier(distance >= 34 ? 2 : distance >= 18 ? 1 : 0);
    });
    return {
      key: spec.key,
      root,
      // Consumers receive authored LOD0 meshes only. Proxy tiers are managed
      // internally so construction stages and character attachments cannot
      // accidentally re-enable distance proxies as part of their body list.
      meshes: lodMeshes[0],
      nodes,
      skeletons: entries.skeletons,
      animationGroups: entries.animationGroups,
      container,
      dispose: () => {
        this.scene.onBeforeRenderObservable.remove(lodObserver);
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
