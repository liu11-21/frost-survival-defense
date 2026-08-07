"""Build the same male body on three MPFB rigs and measure the difference.

The rig choice decides whether "hands that believably grip a weapon" and
"shoulders that do not collapse" are reachable at all, so it is settled by
measurement rather than by which rig sounds most game-oriented.

Identical inputs across all three: same macro dictionary, same height, same
scale, same base mesh, same pose. The only variable is the rig.

    node scripts/run-blender.mjs scripts/blender/mpfb_rig_comparison.py

Writes .runtime/mpfb/rig-comparison/<rig>.{glb,json} plus summary.json.
Nothing enters the game asset tree.
"""
import hashlib
import json
import math
import os
import sys

import bpy
from mathutils import Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, ".runtime", "mpfb", "rig-comparison")

RIGS = ("default", "game_engine", "mixamo")
MACRO_OVERRIDES = {
    "gender": 0.9, "age": 0.5, "muscle": 0.55,
    "weight": 0.5, "height": 0.6, "cupsize": 0.0, "firmness": 0.5,
}
DIGITS = ("thumb", "index", "middle", "ring", "pinky", "little", "finger")
# Joints driven for the deformation review. Each is a thing that a rig without
# the right bone gets visibly wrong while still passing every structural check.
POSES = (
    ("armOut90", ("upperarm", "upper_arm", "arm"), "R", (0, 0, 1), -90.0),
    ("armUp", ("upperarm", "upper_arm", "arm"), "R", (0, 0, 1), -150.0),
    ("forearmPronate", ("lowerarm", "lower_arm", "forearm"), "R", (0, 1, 0), 80.0),
    ("forearmSupinate", ("lowerarm", "lower_arm", "forearm"), "R", (0, 1, 0), -80.0),
    ("wristIn", ("hand", "wrist"), "R", (0, 0, 1), 35.0),
    ("wristOut", ("hand", "wrist"), "R", (0, 0, 1), -35.0),
    ("kneeLift", ("thigh", "upleg", "upperleg"), "R", (1, 0, 0), 55.0),
    ("heelRollBall", ("ball", "toe"), "R", (1, 0, 0), 35.0),
    ("heelRoll", ("foot",), "R", (1, 0, 0), 30.0),
    ("meleeWindup", ("upperarm", "upper_arm", "arm"), "R", (1, 0, 0), -70.0),
)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_bone(armature, tokens, side):
    """Best-effort bone lookup across three unrelated naming conventions.

    `default` uses upperarm01.R, `game_engine` uses upperarm01.R-style too,
    `mixamo` uses RightArm. Matching on tokens rather than exact names is the
    only way one comparison script can drive all three.
    """
    suffixes = ((".r", "_r", "right") if side == "R" else (".l", "_l", "left"))
    best = None
    for bone in armature.data.bones:
        low = bone.name.lower()
        if not any(low.endswith(s) or s in low for s in suffixes):
            continue
        for rank, token in enumerate(tokens):
            if token in low:
                score = (rank, len(low))
                if best is None or score < best[0]:
                    best = (score, bone.name)
                break
    return best[1] if best else None


def build(rig_name):
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in list(bpy.data.armatures):
        bpy.data.armatures.remove(block)

    macro = TargetService.get_default_macro_info_dict()
    macro.update(MACRO_OVERRIDES)
    basemesh = HumanService.create_human(
        mask_helpers=True, detailed_helpers=False, extra_vertex_groups=True,
        feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    armature = HumanService.add_builtin_rig(basemesh, rig_name)
    if armature is None:
        armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature for rig %r" % rig_name)
    bpy.context.view_layer.update()
    return basemesh, armature


def measure(basemesh, armature, rig_name):
    bones = list(armature.data.bones)
    names = [b.name for b in bones]

    def matching(tokens):
        return sorted(n for n in names if any(t in n.lower() for t in tokens))

    finger_bones = matching(DIGITS)
    chains = {}
    for digit in DIGITS[:6]:
        hits = sorted(n for n in names if digit in n.lower())
        if hits:
            chains[digit] = hits

    # Weight quality on the body mesh. A rig that leaves vertices unweighted
    # tears the moment it animates, and a rig that needs more than four
    # influences per vertex loses the extras in a glTF export.
    groups = {g.index: g.name for g in basemesh.vertex_groups}
    bone_names = set(names)
    unweighted = 0
    max_influences = 0
    for vertex in basemesh.data.vertices:
        active = [g for g in vertex.groups if g.weight > 1e-4 and groups.get(g.group) in bone_names]
        if not active:
            unweighted += 1
        max_influences = max(max_influences, len(active))

    triangles = sum(max(0, len(p.vertices) - 2) for p in basemesh.data.polygons)
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for corner in basemesh.bound_box:
        world = basemesh.matrix_world @ Vector(corner)
        lo = Vector((min(lo[i], world[i]) for i in range(3)))
        hi = Vector((max(hi[i], world[i]) for i in range(3)))

    return {
        "rig": rig_name,
        "totalBones": len(bones),
        "deformBones": len([b for b in bones if b.use_deform]),
        "rootBone": next((b.name for b in bones if b.parent is None), None),
        "pelvisCandidates": matching(("pelvis", "hips", "hip")),
        "clavicleBones": matching(("clavicle", "shoulder")),
        "fingerBoneCount": len(finger_bones),
        "fingerChains": chains,
        "thumbChain": sorted(n for n in names if "thumb" in n.lower()),
        "toeBones": matching(("toe", "ball")),
        "forearmTwistBones": matching(("twist",)),
        "spineBones": matching(("spine",)),
        "boneRolls": {b.name: round(b.matrix_local.to_quaternion().to_euler().y, 4)
                      for b in bones[:40]},
        "maxVertexInfluences": max_influences,
        "verticesLackingWeights": unweighted,
        "vertexCount": len(basemesh.data.vertices),
        "triangles": triangles,
        "heightMetres": round(hi[2] - lo[2], 4),
    }


def deformation(basemesh, armature, rig_name):
    """Pose the rig and measure whether the surface actually follows it.

    Bone names alone say nothing about deformation. Each entry drives a real
    joint and reports how far the skinned surface moved, so a rig that has a
    clavicle but does not weight it shows up as a small number instead of a
    reassuring name.
    """
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def surface_sample():
        evaluated = basemesh.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        step = max(1, len(mesh.vertices) // 400)
        points = [basemesh.matrix_world @ mesh.vertices[i].co
                  for i in range(0, len(mesh.vertices), step)]
        evaluated.to_mesh_clear()
        return points

    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()
    rest = surface_sample()

    results = {}
    for label, tokens, side, axis, degrees in POSES:
        name = find_bone(armature, tokens, side)
        if name is None:
            results[label] = {"ran": False, "reason": "no bone matching %s" % (tokens,)}
            continue
        pose_bone = armature.pose.bones.get(name)
        pose_bone.rotation_quaternion = Quaternion(axis, math.radians(degrees))
        bpy.context.view_layer.update()
        moved = surface_sample()
        deltas = [(moved[i] - rest[i]).length for i in range(min(len(rest), len(moved)))]
        pose_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bpy.context.view_layer.update()
        affected = [d for d in deltas if d > 1e-4]
        results[label] = {
            "ran": True,
            "bone": name,
            "degrees": degrees,
            "verticesMoved": len(affected),
            "maxDisplacement": round(max(deltas) if deltas else 0.0, 5),
            "meanDisplacement": round(sum(affected) / len(affected), 5) if affected else 0.0,
            # A joint that moves almost nothing is either unweighted or the
            # wrong bone -- both are the failure this test exists to surface.
            "deforms": bool(affected) and max(deltas) > 0.01,
        }
    return results


def forearm_test(basemesh, armature):
    """Judge forearm rotation by orientation and skin, not by hand travel.

    The old gate rotated the forearm and measured how far `hand.R`'s head
    moved. That is the wrong quantity: real pronation and supination turn the
    hand about the forearm axis with the wrist centre barely translating at
    all, so a correct rig scored near zero and "failed".

    What matters is whether the hand actually *reorients*, whether the
    elbow-to-wrist centreline stays put while it does, and whether the skin
    between them twists smoothly or collapses into a candy wrapper.
    """
    lower = find_bone(armature, ("lowerarm", "lower_arm", "forearm"), "R")
    hand = find_bone(armature, ("hand", "wrist"), "R")
    if lower is None or hand is None:
        return {"ran": False, "reason": "missing forearm (%s) or hand (%s)" % (lower, hand)}

    depsgraph = bpy.context.evaluated_depsgraph_get()
    lower_bone = armature.pose.bones[lower]
    hand_bone = armature.pose.bones[hand]

    def hand_frame():
        m = armature.matrix_world @ hand_bone.matrix
        return m.to_quaternion(), m.col[0].to_3d().normalized(), \
            m.col[1].to_3d().normalized(), m.col[2].to_3d().normalized()

    def forearm_surface():
        """Vertices lying between elbow and wrist, in forearm-local space."""
        evaluated = basemesh.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        origin = armature.matrix_world @ lower_bone.head
        tip = armature.matrix_world @ hand_bone.head
        axis = (tip - origin)
        length = axis.length
        axis = axis.normalized()
        points = []
        for vertex in mesh.vertices:
            world = basemesh.matrix_world @ vertex.co
            along = (world - origin).dot(axis)
            if 0.15 * length < along < 0.9 * length:
                radial = (world - origin) - axis * along
                points.append((along, radial.length, world.copy()))
        evaluated.to_mesh_clear()
        return points, origin.copy(), tip.copy()

    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()
    rest_quat, rest_x, rest_y, rest_z = hand_frame()
    rest_points, rest_origin, rest_tip = forearm_surface()

    results = {"ran": True, "forearmBone": lower, "handBone": hand,
               "sampledForearmVertices": len(rest_points)}
    for label, degrees in (("pronate", 80.0), ("supinate", -80.0)):
        lower_bone.rotation_quaternion = Quaternion((0, 1, 0), math.radians(degrees))
        bpy.context.view_layer.update()
        quat, x_axis, y_axis, z_axis = hand_frame()
        points, origin, tip = forearm_surface()

        orientation_delta = math.degrees(quat.rotation_difference(rest_quat).angle)
        axis_delta = max(
            math.degrees(rest_x.angle(x_axis)),
            math.degrees(rest_y.angle(y_axis)),
            math.degrees(rest_z.angle(z_axis)))
        centreline = max((origin - rest_origin).length, (tip - rest_tip).length)

        n = min(len(rest_points), len(points))
        surface = [(points[i][2] - rest_points[i][2]).length for i in range(n)]
        radial = [abs(points[i][1] - rest_points[i][1]) for i in range(n)]
        rest_radii = [rest_points[i][1] for i in range(n)]
        mean_radius = (sum(rest_radii) / n) if n else 1.0
        # Candy wrapper: the radius collapses toward the axis somewhere along
        # the forearm while the surface elsewhere still moves.
        collapse = (min(points[i][1] for i in range(n)) / mean_radius) if n and mean_radius else 1.0

        results[label] = {
            "degrees": degrees,
            "handOrientationDeltaDeg": round(orientation_delta, 2),
            "palmAxisDeltaDeg": round(axis_delta, 2),
            "centrelineDisplacement": round(centreline, 5),
            "surfaceMaxDisplacement": round(max(surface) if surface else 0.0, 5),
            "surfaceMeanDisplacement": round(sum(surface) / n, 5) if n else 0.0,
            "radialDistortionMax": round(max(radial) if radial else 0.0, 5),
            "minRadiusRatio": round(collapse, 4),
            "orientationPassed": orientation_delta > 45.0,
            "centrelineStable": centreline < 0.02,
            "surfaceDeformationPassed": bool(surface) and max(surface) > 0.002,
            "candyWrapperRisk": collapse < 0.55,
        }
        lower_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bpy.context.view_layer.update()

    both = [results[k] for k in ("pronate", "supinate") if k in results]
    results["orientationPassed"] = all(b["orientationPassed"] for b in both)
    results["centrelineStable"] = all(b["centrelineStable"] for b in both)
    results["surfaceDeformationPassed"] = all(b["surfaceDeformationPassed"] for b in both)
    results["candyWrapperRisk"] = any(b["candyWrapperRisk"] for b in both)
    # Absence of a twist bone is NOT a hard failure. It is a visual gate.
    results["hasTwistBone"] = bool([b for b in armature.data.bones if "twist" in b.name.lower()])
    return results


def main():
    os.makedirs(OUT, exist_ok=True)
    summary = []
    for rig_name in RIGS:
        basemesh, armature = build(rig_name)
        record = measure(basemesh, armature, rig_name)
        record["deformation"] = deformation(basemesh, armature, rig_name)
        record["forearmTest"] = forearm_test(basemesh, armature)
        glb = os.path.join(OUT, "%s.glb" % rig_name)
        bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                                  export_skins=True, export_yup=True)
        record["glbBytes"] = os.path.getsize(glb)
        record["glbSha256"] = sha256(glb)
        with open(os.path.join(OUT, "%s.json" % rig_name), "w", encoding="utf-8") as handle:
            json.dump(record, handle, indent=2, sort_keys=True)
            handle.write("\n")
        summary.append({
            "rig": rig_name,
            "bones": record["totalBones"],
            "deform": record["deformBones"],
            "clavicle": len(record["clavicleBones"]),
            "fingers": record["fingerBoneCount"],
            "thumb": len(record["thumbChain"]),
            "toes": len(record["toeBones"]),
            "twist": len(record["forearmTwistBones"]),
            "maxInfluences": record["maxVertexInfluences"],
            "unweighted": record["verticesLackingWeights"],
            "triangles": record["triangles"],
            "glbBytes": record["glbBytes"],
            "posesDefined": len(POSES),
            "posesRan": sum(1 for v in record["deformation"].values() if v.get("ran")),
            "posesPassed": sum(1 for v in record["deformation"].values() if v.get("deforms")),
            "posesSkipped": sorted(k for k, v in record["deformation"].items() if not v.get("ran")),
            "skipReasons": {k: v.get("reason") for k, v in record["deformation"].items()
                            if not v.get("ran")},
            "forearm": record.get("forearmTest", {}),
        })
        print("RIG %s" % json.dumps(summary[-1]))

    with open(os.path.join(OUT, "summary.json"), "w", encoding="utf-8") as handle:
        json.dump({"rigs": summary, "poses": [p[0] for p in POSES]}, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print("MPFB_RIG_COMPARISON_OK %d rigs" % len(summary))


if __name__ == "__main__":
    main()
