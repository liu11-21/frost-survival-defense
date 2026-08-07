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
    """Judge forearm rotation by orientation, weights and per-vertex radius.

    Two things were wrong with the first version and both inflated confidence:

    1. It re-selected the sampled vertex set *after* posing, by re-deriving
       the elbow-to-wrist axis and re-filtering. `points[i] - rest_points[i]`
       then compared two different vertices whenever membership shifted. The
       set is now chosen once, at rest, and only those indices are ever read.

    2. Candy wrapper was `min(posed radius) / mean(rest radius)`, which
       compares the naturally-thin wrist against the average of the whole
       forearm and reports a collapse that is just anatomy. Each vertex is now
       compared against *its own* rest radius, and the verdict comes from
       binned cross-sections along the bone.

    It also records the weights on the sampled vertices, because "the surface
    did not move" and "the surface is not weighted to the bone I rotated" are
    completely different findings and the previous test could not tell them
    apart.
    """
    lower = find_bone(armature, ("lowerarm", "lower_arm", "forearm"), "R")
    hand = find_bone(armature, ("hand", "wrist"), "R")
    if lower is None or hand is None:
        return {"ran": False, "reason": "missing forearm (%s) or hand (%s)" % (lower, hand)}

    upper = find_bone(armature, ("upperarm", "upper_arm", "arm"), "R")
    lower_bone = armature.pose.bones[lower]
    hand_bone = armature.pose.bones[hand]
    for pose_bone in armature.pose.bones:
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()
    # Everything below works in ONE space: the mesh object's own local space.
    #
    # The previous version put bone heads through `armature.matrix_world` and
    # mesh vertices through `basemesh.matrix_world`, then compared them. Those
    # two matrices are not the same here, so the "elbow to wrist" band landed
    # somewhere else entirely -- the diagnostic that caught it showed the
    # sampled vertices weighted to ball_r, calf_r and foot_r. The test was
    # measuring the leg and reporting it as a forearm that would not move.
    to_mesh_space = basemesh.matrix_world.inverted() @ armature.matrix_world

    def bone_head(pose_bone):
        return (to_mesh_space @ pose_bone.head).copy()

    def evaluated_coords():
        evaluated = basemesh.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        coords = [v.co.copy() for v in mesh.vertices]
        evaluated.to_mesh_clear()
        return coords

    # --- fixed sample set, chosen once at rest --------------------------
    origin = bone_head(lower_bone)
    tip = bone_head(hand_bone)
    axis_vector = tip - origin
    length = axis_vector.length
    if length < 1e-6:
        return {"ran": False, "reason": "degenerate forearm axis"}
    axis = axis_vector.normalized()

    rest_coords = evaluated_coords()
    groups = {g.index: g.name for g in basemesh.vertex_groups}

    # Selection is by VERTEX GROUP first, band second.
    #
    # Projecting onto the elbow-to-wrist axis and keeping everything in the
    # 15-90% range has no radial cutoff, and MPFB stands in an A-pose -- the
    # forearm axis points down and outward, so the legs project into exactly
    # the same band. The diagnostic that caught this showed the "forearm"
    # sample weighted to ball_r, calf_r and foot_r: the test was measuring a
    # shin. Requiring real weight on the forearm or hand bone makes that
    # impossible by construction.
    driven = {name for name in (lower, hand) if name}
    group_ids = {g.index for g in basemesh.vertex_groups if g.name in driven}

    samples = []
    for index, world in enumerate(rest_coords):
        vertex = basemesh.data.vertices[index]
        if not any(g.group in group_ids and g.weight > 1e-3 for g in vertex.groups):
            continue
        along = (world - origin).dot(axis) / length
        if not (0.15 <= along <= 0.90):
            continue
        radial = (world - origin) - axis * (along * length)
        radius = radial.length
        if radius < 1e-5:
            continue
        weights = {}
        for group in basemesh.data.vertices[index].groups:
            name = groups.get(group.group)
            if name and group.weight > 1e-4:
                weights[name] = group.weight
        samples.append({"index": index, "along": along, "radius": radius, "weights": weights})

    if not samples:
        return {"ran": False, "reason": "no forearm vertices in the 15-90% band"}

    def weight_on(sample, bone_name):
        return sample["weights"].get(bone_name, 0.0) if bone_name else 0.0

    lower_weights = [weight_on(s, lower) for s in samples]
    result = {
        "ran": True,
        "forearmBone": lower,
        "handBone": hand,
        "upperArmBone": upper,
        "sampleVertexCount": len(samples),
        "verticesWeightedToLowerarm": sum(1 for w in lower_weights if w > 1e-4),
        "verticesWeightedToHand": sum(1 for s in samples if weight_on(s, hand) > 1e-4),
        "verticesWeightedToUpperarm": sum(1 for s in samples if weight_on(s, upper) > 1e-4),
        "maxLowerarmWeight": round(max(lower_weights), 4),
        "meanLowerarmWeight": round(sum(lower_weights) / len(lower_weights), 4),
        "distinctInfluenceNames": sorted({n for s in samples for n in s["weights"]})[:14],
    }

    # --- does the armature modifier actually act? -----------------------
    raw = [v.co.copy() for v in basemesh.data.vertices]
    result["armatureModifiers"] = [m.name for m in basemesh.modifiers if m.type == "ARMATURE"]
    result["rawVsEvaluatedMaxDelta"] = round(
        max((raw[s["index"]] - rest_coords[s["index"]]).length for s in samples), 6)

    BINS = ((0.150, 0.275), (0.275, 0.400), (0.400, 0.525),
            (0.525, 0.650), (0.650, 0.775), (0.775, 0.900))

    def hand_frame():
        matrix = to_mesh_space @ hand_bone.matrix
        return (matrix.to_quaternion(),
                matrix.col[0].to_3d().normalized(),
                matrix.col[1].to_3d().normalized(),
                matrix.col[2].to_3d().normalized())

    rest_quat, rest_x, rest_y, rest_z = hand_frame()

    for label, degrees in (("pronate", 80.0), ("supinate", -80.0)):
        lower_bone.rotation_quaternion = Quaternion((0, 1, 0), math.radians(degrees))
        bpy.context.view_layer.update()
        posed = evaluated_coords()
        quat, x_axis, y_axis, z_axis = hand_frame()
        posed_origin = bone_head(lower_bone)
        posed_tip = bone_head(hand_bone)

        displacement, ratios = [], []
        bins = []
        for low, high in BINS:
            members = [s for s in samples if low <= s["along"] < high]
            if not members:
                bins.append({"range": [low, high], "vertexCount": 0})
                continue
            rest_radii, posed_radii, member_ratios = [], [], []
            for sample in members:
                world = posed[sample["index"]]
                along = (world - posed_origin).dot(axis) * 1.0
                radial = (world - posed_origin) - axis * along
                posed_radius = radial.length
                rest_radii.append(sample["radius"])
                posed_radii.append(posed_radius)
                # Each vertex against ITS OWN rest radius.
                member_ratios.append(posed_radius / sample["radius"])
                displacement.append((world - rest_coords[sample["index"]]).length)
            ratios.extend(member_ratios)
            mean_rest = sum(rest_radii) / len(rest_radii)
            mean_posed = sum(posed_radii) / len(posed_radii)
            variance = sum((r - mean_posed) ** 2 for r in posed_radii) / len(posed_radii)
            bins.append({
                "range": [low, high],
                "vertexCount": len(members),
                "restMeanRadius": round(mean_rest, 5),
                "posedMeanRadius": round(mean_posed, 5),
                "minRadiusRatio": round(min(member_ratios), 4),
                "maxRadiusRatio": round(max(member_ratios), 4),
                "radialVariance": round(variance, 8),
            })

        orientation_delta = math.degrees(quat.rotation_difference(rest_quat).angle)
        axis_delta = max(math.degrees(rest_x.angle(x_axis)),
                         math.degrees(rest_y.angle(y_axis)),
                         math.degrees(rest_z.angle(z_axis)))
        centreline = max((posed_origin - origin).length, (posed_tip - tip).length)
        # Candy wrapper is judged on the MIDDLE of the forearm only. The wrist
        # end is naturally thin and the elbow end naturally thick, and mixing
        # them in is what produced the previous false reading.
        middle = [b for b in bins if b.get("vertexCount") and 0.275 <= b["range"][0] < 0.775]
        worst_middle = min((b["minRadiusRatio"] for b in middle), default=1.0)

        result[label] = {
            "degrees": degrees,
            "handOrientationDeltaDeg": round(orientation_delta, 2),
            "palmAxisDeltaDeg": round(axis_delta, 2),
            "centrelineDisplacement": round(centreline, 5),
            "surfaceMaxDisplacement": round(max(displacement) if displacement else 0.0, 6),
            "surfaceMeanDisplacement": round(sum(displacement) / len(displacement), 6) if displacement else 0.0,
            "perVertexRadiusRatioMin": round(min(ratios), 4) if ratios else None,
            "perVertexRadiusRatioMax": round(max(ratios), 4) if ratios else None,
            "worstMiddleBinRatio": round(worst_middle, 4),
            "crossSections": bins,
            "orientationPassed": orientation_delta > 45.0,
            "centrelineStable": centreline < 0.02,
            "surfaceTracked": bool(displacement) and max(displacement) > 1e-4,
            "crossSectionStable": worst_middle > 0.75,
            "candyWrapperRisk": worst_middle < 0.60,
        }
        lower_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        bpy.context.view_layer.update()

    both = [result[k] for k in ("pronate", "supinate") if k in result]
    for key in ("orientationPassed", "centrelineStable", "surfaceTracked", "crossSectionStable"):
        result[key] = all(b[key] for b in both)
    result["candyWrapperRisk"] = any(b["candyWrapperRisk"] for b in both)
    result["hasTwistBone"] = bool([b for b in armature.data.bones if "twist" in b.name.lower()])
    return result


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
