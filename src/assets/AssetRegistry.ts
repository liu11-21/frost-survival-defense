import type { AbstractMesh, Scene } from "@babylonjs/core";
import { AssetContainer } from "@babylonjs/core";
import { AUTHORED_ASSET_MANIFEST, authoredAssetSpec } from "./AssetManifest";
import { validateAssetContainer } from "./AssetValidator";
import { ModelLoader } from "./ModelLoader";
import type { AssetInstance, AssetKey, AssetValidationReport } from "./AssetTypes";

/** Central cache and fallback boundary for all Blender-authored models. */
export class AssetRegistry {
  private readonly loader: ModelLoader;
  private readonly containers = new Map<AssetKey, AssetContainer>();
  private readonly loaded = new Map<AssetKey, AbstractMesh[]>();
  private readonly reports = new Map<AssetKey, AssetValidationReport>();
  private readonly unavailable = new Set<AssetKey>();
  private ready = false;

  constructor(scene: Scene) {
    this.loader = new ModelLoader(scene);
  }

  get isReady(): boolean { return this.ready; }
  get manifest(): readonly typeof AUTHORED_ASSET_MANIFEST[number][] { return AUTHORED_ASSET_MANIFEST; }

  async preload(): Promise<void> {
    for (const spec of AUTHORED_ASSET_MANIFEST) {
      const path = `${spec.rootUrl}${spec.fileName}`;
      try {
        // A GET probe (rather than HEAD) is supported by Vite's static server
        // and avoids an aborted HEAD request being reported as a browser
        // network error by the playtest harness. The body is consumed only on
        // a successful probe; missing files stay a clean HTTP fallback state.
        const response = await fetch(path, { method: "GET", cache: "no-store" });
        if (!response.ok) {
          this.markUnavailable(spec.key, "missing", path, `HTTP ${response.status}`);
          continue;
        }
        await response.arrayBuffer();
        const container = await this.loader.load(spec);
        const report = validateAssetContainer(spec, container);
        this.reports.set(spec.key, report);
        if (report.status !== "loaded") {
          this.unavailable.add(spec.key);
          console.warn(`[assets] ${path} failed the authored contract; procedural fallback remains active`, report);
          continue;
        }
        this.containers.set(spec.key, container);
        this.loaded.set(spec.key, container.meshes);
      } catch (error) {
        this.markUnavailable(spec.key, "error", path, error instanceof Error ? error.message : String(error));
      }
    }
    this.ready = true;
  }

  get(key: string): AbstractMesh[] | null { return this.loaded.get(key as AssetKey) ?? null; }
  report(key: AssetKey): AssetValidationReport | undefined { return this.reports.get(key); }
  has(key: AssetKey): boolean { return this.containers.has(key) && !this.unavailable.has(key); }

  instantiate(key: AssetKey, id: string): AssetInstance | null {
    const container = this.containers.get(key);
    if (!container || this.unavailable.has(key)) return null;
    return this.loader.instantiate(authoredAssetSpec(key), container, id);
  }

  dispose(): void {
    for (const meshes of this.loaded.values()) for (const mesh of meshes) mesh.setEnabled(false);
    for (const container of this.containers.values()) container.dispose();
    this.loaded.clear();
    this.containers.clear();
    this.reports.clear();
    this.unavailable.clear();
    this.loader.clear();
    this.ready = false;
  }

  private markUnavailable(key: AssetKey, status: "missing" | "error", path: string, error: string): void {
    this.unavailable.add(key);
    this.reports.set(key, {
      key,
      status,
      path,
      missingNodes: [],
      missingAnimations: [],
      meshCount: 0,
      warnings: ["Procedural fallback active."],
      error,
    });
    if (status === "error") console.warn(`[assets] ${path} unavailable; procedural fallback remains active`, error);
  }
}
