import type { AssetContainer } from "@babylonjs/core";
import type { AssetSpec, AssetValidationReport } from "./AssetTypes";

export function validateAssetContainer(spec: AssetSpec, container: AssetContainer): AssetValidationReport {
  const nodes = container.getNodes();
  const names = new Set(nodes.map((node) => node.name));
  const missingNodes = spec.requiredNodes.filter((name) => !names.has(name));
  const animationNames = new Set(container.animationGroups.map((group) => group.name));
  const missingAnimations = spec.requiredAnimations.filter((name) => !animationNames.has(name));
  const warnings: string[] = [];
  const skeletonCount = container.skeletons.length;
  const collisionMeshes = container.meshes.filter((mesh) => mesh.name.startsWith("COL_") || mesh.name.toLowerCase().includes("collision") || mesh.name.toLowerCase().includes("collider"));
  if (collisionMeshes.some((mesh) => mesh.isVisible || mesh.isEnabled())) {
    warnings.push("COL_ meshes are visible; runtime will hide them before instantiation.");
  }
  if (container.meshes.length === 0) warnings.push("The container has no renderable meshes.");
  if (container.cameras.length > 0) warnings.push("Cameras are present; export cameras are not required.");
  if (container.lights.length > 0) warnings.push("Lights are present; export lights are not required.");
  return {
    key: spec.key,
    status: missingNodes.length || missingAnimations.length || container.meshes.length === 0 || skeletonCount < (spec.requiredSkeletons ?? 0) ? "invalid" : "loaded",
    path: `${spec.rootUrl}${spec.fileName}`,
    missingNodes,
    missingAnimations,
    meshCount: container.meshes.length,
    skeletonCount,
    warnings,
  };
}
