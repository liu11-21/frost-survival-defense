"""Locate the MeleeAttack tearing: skin/bind problem, or animation problem?

A render cannot tell those apart -- a torn silhouette looks the same whether a
vertex is weighted to the wrong bone or the bone itself is being driven to a
nonsense transform. So this measures instead.

Three passes on the *shipped* candidate GLB, the exact file Babylon loads:

  manual   every animation muted, pose reset, then ONE bone rotated by hand.
           If the mesh tears here there is no animation involved at all and
           the fault is in the skin: bind pose, weights, or joint mapping.
  clip     the MeleeAttack action at the grip/windup/impact phases the
           Babylon evidence captures.
  report   for each pass, the edges whose posed length divides worst by their
           rest length, with the mesh they belong to and the four heaviest
           bones on each end. That names the bone and the vertices.

    node scripts/run-blender.mjs scripts/blender/hero_deform_diagnostic.py \\
        --input public/assets/models/characters/hero_male.glb
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)

OUT = os.path.join(ROOT, "reports", "human-candidates")

# The phases the Babylon capture uses, so the numbers here line up with the
# frames a person can look at.
PHASES = {"grip": 0.25, "windup": 0.25, "impact": 0.6}


def reset_animation(armature):
    """Mute every clip and put the rig back on its rest pose."""
    muted = 0
    data = armature.animation_data
    if data:
        for track in data.nla_tracks:
            track.mute = True
            muted += 1
        data.action = None
    for bone in armature.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return muted


def posed_vertices(obj, depsgraph):
    """Evaluated (skinned) vertex positions, in the object's own space."""
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    out = [v.co.copy() for v in mesh.vertices]
    evaluated.to_mesh_clear()
    return out


def top_weights(obj, index, count=4):
    vertex = obj.data.vertices[index]
    names = {g.index: g.name for g in obj.vertex_groups}
    pairs = sorted(((names.get(g.group, "?"), g.weight) for g in vertex.groups),
                   key=lambda p: -p[1])[:count]
    return [[n, round(w, 4)] for n, w in pairs]


def stretch(obj, rest, depsgraph, limit=20):
    """Per-edge posed/rest length ratio, worst `limit` edges."""
    posed = posed_vertices(obj, depsgraph)
    if len(posed) != len(rest):
        # A modifier changed the topology; ratios would be meaningless.
        return {"mesh": obj.name, "error": "evaluated vertex count %d != rest %d"
                % (len(posed), len(rest)), "worst": [], "maxRatio": None}
    worst = []
    peak = 1.0
    for edge in obj.data.edges:
        a, b = edge.vertices
        base = (rest[a] - rest[b]).length
        if base < 1e-6:
            continue
        length = (posed[a] - posed[b]).length
        ratio = length / base
        # Rank by how far the edge was actually dragged, not by ratio: a
        # 0.04 mm seam edge scores 1000x while moving half a millimetre.
        worst.append((length - base, ratio, a, b, base, length))
        if length - base > 0.002:
            peak = max(peak, ratio)
    worst.sort(key=lambda item: -item[0])
    detail = []
    for grew, ratio, a, b, base, length in worst[:limit]:
        detail.append({
            "ratio": round(ratio, 3),
            "grewMetres": round(grew, 5),
            "restLength": round(base, 5),
            "posedLength": round(length, 5),
            "v0": a, "v1": b,
            "v0Rest": [round(c, 4) for c in rest[a]],
            "v0Posed": [round(c, 4) for c in posed[a]],
            "v0Weights": top_weights(obj, a),
            "v1Weights": top_weights(obj, b),
        })
    return {"mesh": obj.name, "maxRatio": round(peak, 3),
            "maxGrowthMetres": round(worst[0][0], 5) if worst else 0.0,
            "edges": len(obj.data.edges), "worst": detail}


def survey(meshes, rests, depsgraph, limit=20):
    return [stretch(obj, rests[obj.name], depsgraph, limit) for obj in meshes]


def main():
    parser = argparse.ArgumentParser()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser.add_argument("--input", required=True)
    parser.add_argument("--label", default="hero_male")
    parser.add_argument("--angle", type=float, default=35.0)
    args = parser.parse_args(argv)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, args.input))

    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature in %s" % args.input)
    # LOD0 only: the review renders LOD0 and the other tiers are decimated
    # copies of the same skin, so they would just repeat the finding.
    meshes = [o for o in bpy.data.objects
              if o.type == "MESH" and o.name.upper().startswith("LOD0")]
    if not meshes:
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    muted = reset_animation(armature)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    # Rest is taken with every clip muted and the pose cleared, so it is the
    # bind pose and not frame 1 of whatever imported last.
    rests = {obj.name: posed_vertices(obj, depsgraph) for obj in meshes}
    baseline = survey(meshes, rests, depsgraph, limit=3)

    bones = sorted(b.name for b in armature.pose.bones)
    report = {
        "input": args.input,
        "label": args.label,
        "mutedTracks": muted,
        "meshes": [{"name": o.name, "vertices": len(o.data.vertices),
                    "groups": len(o.vertex_groups)} for o in meshes],
        "restBaseline": baseline,
        "manual": {},
        "clip": {},
    }

    # --- 1. Manual single-bone rotation, no animation anywhere in the scene.
    # Both naming conventions: MPFB authors `upperarm_r`, but the candidate is
    # retargeted onto the reference rig, which uses `upper_arm.R`.
    for bone_name in ("upper_arm.R", "lower_arm.R", "upperarm_r", "lowerarm_r"):
        bone = armature.pose.bones.get(bone_name)
        if bone is None:
            report["manual"][bone_name] = {"error": "bone not found",
                                           "available": bones}
            continue
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (math.radians(args.angle), 0.0, 0.0)
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        report["manual"][bone_name] = {
            "angleDeg": args.angle,
            "result": survey(meshes, rests, depsgraph),
        }
        bone.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()

    # --- 2. The MeleeAttack clip at the phases the evidence captures.
    action = next((a for a in bpy.data.actions if "MeleeAttack" in a.name), None)
    if action is None:
        report["clip"] = {"error": "no MeleeAttack action",
                          "actions": sorted(a.name for a in bpy.data.actions)}
    else:
        if armature.animation_data is None:
            armature.animation_data_create()
        armature.animation_data.action = action
        # Blender 5.x slotted actions: an assigned action animates nothing
        # until a slot is bound, so the pose would silently stay at rest.
        if hasattr(armature.animation_data, "action_slot") and action.slots:
            armature.animation_data.action_slot = action.slots[0]
        start, end = action.frame_range
        for label, phase in PHASES.items():
            frame = start + (end - start) * phase
            bpy.context.scene.frame_set(int(round(frame)))
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            report["clip"][label] = {
                "frame": int(round(frame)),
                "range": [round(start, 2), round(end, 2)],
                "result": survey(meshes, rests, depsgraph),
            }

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "deform-%s.json" % args.label)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    def peak(entry):
        results = entry.get("result", [])
        values = [r["maxRatio"] for r in results if r.get("maxRatio")]
        return max(values) if values else None

    print("DEFORM_REST %s" % json.dumps(
        {r["mesh"]: r["maxRatio"] for r in baseline}))
    for bone_name, entry in report["manual"].items():
        print("DEFORM_MANUAL %s peak=%s" % (bone_name, peak(entry)))
    for label, entry in report["clip"].items() if isinstance(report["clip"], dict) else []:
        if isinstance(entry, dict) and "result" in entry:
            print("DEFORM_CLIP %s peak=%s per=%s" % (
                label, peak(entry),
                json.dumps({r["mesh"]: r["maxRatio"] for r in entry["result"]})))
    print("DEFORM_REPORT %s" % os.path.relpath(path, ROOT).replace("\\", "/"))


if __name__ == "__main__":
    main()
