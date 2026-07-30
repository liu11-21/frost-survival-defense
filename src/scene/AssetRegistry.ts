import { AbstractMesh, Scene, SceneLoader } from "@babylonjs/core";
// Registering the glTF loader keeps the pipeline ready for authored props:
// dropping a .glb into `public/models/` and listing it in MANIFEST below is all
// that is needed to replace a procedural asset.
import "@babylonjs/loaders/glTF";

export interface ExternalModel {
  key: string;
  /** Path relative to the site root, e.g. "models/". */
  rootUrl: string;
  fileName: string;
}

/**
 * No .glb ships with this prototype — every mesh is generated at runtime — so
 * the manifest is empty and `get()` always returns null, which is exactly the
 * signal the factories use to fall back to their procedural builders.
 */
const MANIFEST: ExternalModel[] = [];

export class AssetRegistry {
  private readonly loaded = new Map<string, AbstractMesh[]>();
  private ready = false;

  constructor(private readonly scene: Scene) {}

  get isReady(): boolean {
    return this.ready;
  }

  async preload(): Promise<void> {
    for (const entry of MANIFEST) {
      try {
        const result = await SceneLoader.ImportMeshAsync("", entry.rootUrl, entry.fileName, this.scene);
        for (const mesh of result.meshes) mesh.setEnabled(false);
        this.loaded.set(entry.key, result.meshes);
      } catch (error) {
        console.warn(`[assets] "${entry.key}" unavailable, using the procedural build instead`, error);
      }
    }
    this.ready = true;
  }

  /** Returns the loaded meshes for a key, or null when the procedural path applies. */
  get(key: string): AbstractMesh[] | null {
    return this.loaded.get(key) ?? null;
  }

  dispose(): void {
    for (const meshes of this.loaded.values()) {
      for (const mesh of meshes) mesh.dispose();
    }
    this.loaded.clear();
  }
}
