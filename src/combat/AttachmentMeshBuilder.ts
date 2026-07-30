import { Mesh, MeshBuilder, Scene } from "@babylonjs/core";
import type { AttachmentSpec } from "../data/UnitVisuals";

/** Builds the one master mesh an `AttachmentSpec` describes. Never visible
 * itself — only its per-unit instances are, exactly like the base rig parts. */
export function buildAttachmentMesh(scene: Scene, spec: AttachmentSpec, name: string): Mesh {
  switch (spec.shape) {
    case "box":
      return MeshBuilder.CreateBox(name, { width: spec.size[0], height: spec.size[1], depth: spec.size[2] }, scene);
    case "cylinder":
      return MeshBuilder.CreateCylinder(
        name,
        { diameterTop: spec.size[0], height: spec.size[1], diameterBottom: spec.size[2] || spec.size[0], tessellation: 6 },
        scene,
      );
    case "sphere":
      return MeshBuilder.CreateSphere(name, { diameter: spec.size[0], segments: 8 }, scene);
    case "torus":
      return MeshBuilder.CreateTorus(name, { diameter: spec.size[0], thickness: spec.size[1], tessellation: 12 }, scene);
  }
}
