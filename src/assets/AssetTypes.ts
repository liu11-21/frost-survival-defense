import type { AssetContainer, AnimationGroup, AbstractMesh, Node, Skeleton, TransformNode } from "@babylonjs/core";

/** Stable keys shared by Blender exports, the runtime manifest and tests. */
export type AssetKey = string;

export interface AssetSpec {
  key: AssetKey;
  rootUrl: string;
  fileName: string;
  /** Nodes that make the Babylon integration contract explicit. */
  requiredNodes: readonly string[];
  requiredAnimations: readonly string[];
  requiredSkeletons?: number;
  fallback: "procedural";
}

export interface AssetValidationReport {
  key: AssetKey;
  status: "loaded" | "missing" | "invalid" | "error";
  path: string;
  missingNodes: string[];
  missingAnimations: string[];
  meshCount: number;
  skeletonCount: number;
  warnings: string[];
  error?: string;
}

export interface AssetInstance {
  key: AssetKey;
  root: TransformNode;
  meshes: AbstractMesh[];
  /** All visible runtime meshes, including LOD1/LOD2 proxies for review tooling. */
  allMeshes?: AbstractMesh[];
  /** Optional runtime LOD override used by the isolated visual review. */
  setLodTier?: (tier: 0 | 1 | 2 | null) => void;
  nodes: Node[];
  skeletons: Skeleton[];
  animationGroups: AnimationGroup[];
  container: AssetContainer;
  dispose(): void;
}
