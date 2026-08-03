"""Fail-closed source validation for R4-C smooth skinning and joint coverage."""

import json
import os
import sys

import bpy


def _arg(name, default):
    if name not in sys.argv:
        return default
    index = sys.argv.index(name)
    return sys.argv[index + 1] if index + 1 < len(sys.argv) else default


def main():
    output = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r4", "R4-C", "deformation-contract.json")))
    lod0 = [obj for obj in bpy.data.objects if obj.type == "MESH" and not obj.name.startswith(("LOD1", "LOD2", "COL_"))]
    required_bones = {"root", "pelvis", "spine", "chest", "neck", "head", "upper_arm.L", "lower_arm.L", "hand.L", "upper_arm.R", "lower_arm.R", "hand.R", "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R"}
    skeleton = bpy.data.objects.get("HeroSkeleton")
    actual_bones = {bone.name for bone in skeleton.data.bones} if skeleton else set()
    per_mesh = []
    all_vertices_have_weights = True
    smooth_vertices = 0
    total_vertices = 0
    modifiers_ok = True
    for obj in lod0:
        modifier = obj.modifiers.get("HeroWeightedDeform")
        modifiers_ok = modifiers_ok and modifier is not None and modifier.type == "ARMATURE" and modifier.object == skeleton
        weighted_count = 0
        multi_weighted_count = 0
        for vertex in obj.data.vertices:
            # Blender's vertex-group API raises RuntimeError for a vertex that
            # is not a member of a group; inspect each deform group directly.
            non_zero = []
            for group in obj.vertex_groups:
                try:
                    value = group.weight(vertex.index)
                except RuntimeError:
                    continue
                if value > 0.001:
                    non_zero.append(value)
            total = sum(non_zero)
            total_vertices += 1
            if abs(total - 1.0) > 0.02:
                all_vertices_have_weights = False
            else:
                weighted_count += 1
            if len(non_zero) >= 2:
                multi_weighted_count += 1
                smooth_vertices += 1
        per_mesh.append({"name": obj.name, "vertices": len(obj.data.vertices), "weightedVertices": weighted_count, "multiInfluenceVertices": multi_weighted_count, "armatureModifier": bool(modifier)})

    report = {
        "stage": "R4-C",
        "status": "pass" if skeleton and required_bones.issubset(actual_bones) and modifiers_ok and all_vertices_have_weights and smooth_vertices > 0 else "fail",
        "skeleton": {"name": skeleton.name if skeleton else None, "boneCount": len(actual_bones), "requiredBones": sorted(required_bones), "requiredBonesPresent": required_bones.issubset(actual_bones)},
        "lod0": {"meshCount": len(lod0), "totalVertices": total_vertices, "smoothMultiInfluenceVertices": smooth_vertices, "perMesh": per_mesh},
        "checks": {"armatureModifiers": modifiers_ok, "normalizedWeights": all_vertices_have_weights, "smoothSkinningPresent": smooth_vertices > 0},
        "humanReviewNote": "Source weights and modifiers are verified structurally; the rendered pose sheets remain a human deformation/clipping review."
    }
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
