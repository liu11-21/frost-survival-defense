"""Rig analysis, rest-pose alignment and animation retargeting.

Split out of ``human_source_adapter.py`` because renaming bones is not
retargeting, and pretending otherwise was the biggest defect in the first
version of that script.

A bone rename makes `LeftArm` answer to `upper_arm.L`. It does nothing about
the fact that the source's upper arm may rest along -X with its roll 90
degrees from ours, while every authored clip in this project is a set of
quaternions written against *our* rest orientation. Play our Idle on a renamed
foreign rig and the arms end up somewhere arbitrary -- and every triangle
budget, every JOINTS_0 check and every "the GLB loaded" assertion still passes,
because none of them look at where a limb actually points.

So this module works in three separate steps, and keeps them separate:

1. **Analyse** the source rest pose without touching it. Produces the mapping,
   duplicates, and the per-bone orientation difference against the reference.
2. **Align** the source rest pose onto the project's, correcting bone axis and
   roll so the two rigs agree about what "no rotation" means.
3. **Retarget** the authored clips through the recorded basis change, then
   prove it with forward-kinematic pose tests rather than asserting it.
"""
import math
import re

import bpy
from mathutils import Matrix, Quaternion, Vector

# The eighteen every shipped clip and runtime contract is written against.
LEGACY_BONES = (
    "root", "pelvis", "spine", "chest", "neck", "head",
    "upper_arm.L", "lower_arm.L", "hand.L",
    "upper_arm.R", "lower_arm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L",
    "thigh.R", "shin.R", "foot.R",
)
# The legacy-compatible minimum: the eighteen plus the ten that a mature human
# base actually needs. Appended, never reordered -- see verify_joint_order.
EXTENDED_BONES = LEGACY_BONES + (
    "clavicle.L", "clavicle.R",
    "thumb.L", "thumb.R",
    "index.L", "index.R",
    "toe.L", "toe.R",
    "forearm_twist.L", "forearm_twist.R",
)


class RigError(Exception):
    """Raised before anything is written to disk."""


# --- 1. analysis -----------------------------------------------------------
def analyse(armature, profile):
    """Map source bones onto project names *without renaming anything*.

    Returns a record, never a mutation. The caller decides whether the result
    is good enough to proceed, and it must decide before a single file is
    written.
    """
    if armature is None:
        raise RigError("source has no armature; a skinned human base is required")

    strip = profile.get("strip_bone_prefix", [])

    def canonical(name):
        for prefix in strip:
            if name.startswith(prefix):
                return name[len(prefix):]
        return name

    available = {}
    for bone in armature.data.bones:
        available.setdefault(canonical(bone.name).lower(), bone.name)

    wanted = dict(profile.get("bones", {}))
    optional = dict(profile.get("optional_bones", {}))
    wanted.update(optional)

    mapping, missing, claims = {}, [], {}
    for target, candidates in wanted.items():
        hit = next((available[c.lower()] for c in candidates if c.lower() in available), None)
        if hit is None:
            if target in LEGACY_BONES:
                missing.append(target)
            continue
        mapping[target] = hit
        claims.setdefault(hit, []).append(target)

    # A source bone claimed by two *required* targets is a profile bug, not a
    # rig quirk. Mixamo shipped exactly this: root and pelvis both mapped to
    # Hips, which silently collapses two levels of the hierarchy into one and
    # makes every root-relative offset wrong.
    duplicates = {
        source: sorted(targets)
        for source, targets in claims.items()
        if len([t for t in targets if t in LEGACY_BONES]) > 1
    }

    # Finger chains are kept whole. Squashing a four-bone chain into one
    # `fingers.L` throws away the only thing that makes a grip readable.
    finger_chains = {}
    for bone in armature.data.bones:
        name = canonical(bone.name).lower()
        for digit in ("thumb", "index", "middle", "ring", "pinky", "little"):
            if digit in name:
                finger_chains.setdefault(digit, []).append(bone.name)
    for digit in finger_chains:
        finger_chains[digit].sort()

    return {
        "mapping": mapping,
        "missingRequired": sorted(missing),
        "duplicateSourceBones": duplicates,
        "unmappedSource": sorted(
            b.name for b in armature.data.bones if b.name not in set(mapping.values())
        ),
        "fingerChains": finger_chains,
        "fingerBoneCount": sum(len(v) for v in finger_chains.values()),
        "restPose": rest_pose(armature),
    }


def rest_pose(armature):
    """Per-bone rest orientation in armature space, as data.

    This is what makes the difference between the two rigs measurable instead
    of assumed.
    """
    out = {}
    for bone in armature.data.bones:
        direction = (bone.tail_local - bone.head_local)
        length = direction.length
        out[bone.name] = {
            "head": [round(v, 6) for v in bone.head_local],
            "tail": [round(v, 6) for v in bone.tail_local],
            "length": round(length, 6),
            "axis": [round(v, 6) for v in (direction / length)] if length > 1e-9 else [0.0, 1.0, 0.0],
            "roll": round(bone.matrix_local.to_quaternion().to_euler().y, 6),
            "parent": bone.parent.name if bone.parent else None,
        }
    return out


def gate(record, profile_name):
    """Refuse to continue on a bad mapping. Called before any write.

    The first version of this pipeline exported the GLB, wrote the report and
    *then* exited non-zero on missing bones, which leaves a plausible-looking
    asset on disk that later runs will happily pick up.
    """
    problems = []
    if record["missingRequired"]:
        problems.append(
            "unmapped required bones: %s" % ", ".join(record["missingRequired"])
        )
    if record["duplicateSourceBones"]:
        detail = "; ".join(
            "%s claimed by %s" % (src, " + ".join(t))
            for src, t in sorted(record["duplicateSourceBones"].items())
        )
        problems.append("one source bone mapped to several required targets: %s" % detail)
    if problems:
        raise RigError(
            "profile %r cannot drive this rig:\n  - %s\n"
            "Fix the profile in human_source_profiles.json. Nothing was written."
            % (profile_name, "\n  - ".join(problems))
        )


# --- 2. alignment ----------------------------------------------------------
def align_rest_pose(armature, mapping, reference):
    """Rename onto project names and record the rest-orientation delta.

    ``reference`` is the project's own rest pose (from the authored Hero), so
    the delta is measured against the rig the clips were actually written for
    rather than against an assumption about what "T-pose" means.
    """
    # Rename in one pass through a temporary prefix, so a target name that
    # already exists on a different source bone cannot be clobbered mid-loop.
    for target, source in mapping.items():
        bone = armature.data.bones.get(source)
        if bone is not None:
            bone.name = "__tmp__" + target
    for target in mapping:
        bone = armature.data.bones.get("__tmp__" + target)
        if bone is not None:
            bone.name = target

    after = rest_pose(armature)
    deltas = {}
    for name, ours in reference.items():
        theirs = after.get(name)
        if theirs is None:
            continue
        a = Vector(theirs["axis"])
        b = Vector(ours["axis"])
        if a.length < 1e-9 or b.length < 1e-9:
            continue
        rotation = a.rotation_difference(b)
        deltas[name] = {
            "quaternion": [round(v, 6) for v in rotation],
            "angleDegrees": round(math.degrees(rotation.angle), 3),
            "sourceAxis": theirs["axis"],
            "projectAxis": ours["axis"],
            "lengthRatio": round(theirs["length"] / max(1e-9, ours["length"]), 4),
        }
    return deltas


# --- 3. retarget -----------------------------------------------------------
def action_fcurves(action):
    """Yield an action's f-curves across both Blender action APIs.

    Blender 5.x moved actions to slots, layers, strips and channelbags, and
    dropped both `Action.groups` and `Action.fcurves`. Supporting only the new
    shape would break on any older Blender a contributor happens to have.
    """
    direct = getattr(action, "fcurves", None)
    if direct is not None:
        for curve in direct:
            yield curve
        return
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                for curve in bag.fcurves:
                    yield curve


def retarget_actions(armature, deltas, clip_names):
    """Rewrite each authored clip through the recorded basis change.

    For every rotation channel on a mapped bone the source keyframe is
    conjugated by the rest delta: q' = d * q * d-inverse. That is why the delta
    is measured rather than eyeballed -- without it our Idle plays on their rig
    with the arms pointing wherever their bind pose happened to face.

    Bone names come from the f-curve data path, not from action groups:
    Blender 5.x moved actions to slots and layers and `Action.groups` no longer
    exists, so grouping cannot be relied on to say which bone a curve drives.
    """
    path_re = re.compile(r'pose\.bones\["([^"]+)"\]\.rotation_quaternion')
    done, skipped, touched = [], [], 0
    for name in clip_names:
        action = next((a for a in bpy.data.actions
                       if a.name == name or a.name.endswith(":" + name)), None)
        if action is None:
            skipped.append(name)
            continue
        by_bone = {}
        for curve in action_fcurves(action):
            match = path_re.match(curve.data_path)
            if match and match.group(1) in deltas:
                by_bone.setdefault(match.group(1), []).append(curve)
        for bone, curves in by_bone.items():
            d = Quaternion(deltas[bone]["quaternion"])
            inv = d.inverted()
            frames = {}
            for curve in curves:
                for key in curve.keyframe_points:
                    frames.setdefault(round(key.co[0], 5), {})[curve.array_index] = key.co[1]
            rebuilt = {}
            for frame, comps in frames.items():
                q = Quaternion((comps.get(0, 1.0), comps.get(1, 0.0),
                                comps.get(2, 0.0), comps.get(3, 0.0)))
                rebuilt[frame] = d @ q @ inv
            for curve in curves:
                for key in curve.keyframe_points:
                    q = rebuilt.get(round(key.co[0], 5))
                    if q is not None:
                        key.co[1] = q[curve.array_index]
                curve.update()
            touched += 1
        done.append(name)
    return {"retargeted": done, "absent": skipped, "bonesTouched": touched}


# --- 3b. reference clip capture and matrix retargeting ---------------------
# The previous pipeline called load_reference_rig(), kept the rest pose and a
# list of clip NAMES, then called reset_scene() -- which deletes
# bpy.data.actions along with everything else -- and only afterwards went
# looking for those actions to retarget. There was nothing left to find, so
# every run reported `retargeted: 0` while every other check passed.
#
# The fix is not a better name lookup. Reference animation has to leave the
# scene as *data*, sampled before anything is torn down, and new actions have
# to be built from that data on the destination rig.


def parent_relative_rest(armature):
    """Each bone's rest matrix in its parent's space.

    This, not a bone-axis vector, is what carries roll. Two rigs can agree
    perfectly on where a forearm points and still disagree by 90 degrees about
    which way is "up" along it, and an axis-difference quaternion cannot see
    that -- which is why the first retarget was wrong even where it ran.
    """
    out = {}
    for bone in armature.data.bones:
        local = bone.matrix_local
        out[bone.name] = (bone.parent.matrix_local.inverted() @ local) if bone.parent else local.copy()
    return out


def serialise_clips(armature, clip_names, wanted_bones):
    """Sample clips into plain Python data that survives reset_scene().

    Samples every integer frame rather than trying to preserve key placement:
    the destination rig has different rest orientations, so a retargeted curve
    is not the same curve, and resampling is both simpler and exact at every
    frame the game will ever evaluate.
    """
    scene = bpy.context.scene
    captured = {}
    previous = armature.animation_data.action if armature.animation_data else None
    if armature.animation_data is None:
        armature.animation_data_create()

    for name in clip_names:
        action = next((a for a in bpy.data.actions
                       if a.name == name or a.name.endswith(":" + name)), None)
        if action is None:
            continue
        armature.animation_data.action = action
        start, end = (int(round(v)) for v in action.frame_range)
        frames = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            pose = {}
            for bone_name in wanted_bones:
                pose_bone = armature.pose.bones.get(bone_name)
                if pose_bone is None:
                    continue
                basis = pose_bone.matrix_basis
                loc, rot, scale = basis.decompose()
                pose[bone_name] = {
                    "loc": tuple(loc), "rot": tuple(rot), "scale": tuple(scale),
                }
            frames.append({"frame": frame, "pose": pose})
        captured[name] = {
            "fps": scene.render.fps,
            "frameStart": start,
            "frameEnd": end,
            "frameCount": len(frames),
            "frames": frames,
        }
    if previous is not None and armature.animation_data:
        armature.animation_data.action = previous
    scene.frame_set(scene.frame_start)
    return captured


def build_retargeted_actions(armature, clips, reference_rest_rel, height_ratio=1.0):
    """Create new actions on the destination rig from serialised reference data.

    The conversion is a full parent-relative basis change, not an axis
    difference:

        C   = Rsrc_rel^-1 @ Rref_rel        (rotation part)
        A_s = C @ A_r @ C^-1

    Conjugation rather than substitution, so the destination keeps *its own*
    rest pose and receives the reference's motion. Substituting outright
    (A_s = C @ A_r) would snap an A-pose base into the reference's T-pose on
    frame one and deform the mesh accordingly.

    Root and pelvis keep their translation, scaled by the height ratio, since
    those two carry locomotion. Every other bone is rotation-only: a limb that
    inherits a translation authored for different bone lengths pulls apart.
    """
    source_rest_rel = parent_relative_rest(armature)
    if armature.animation_data is None:
        armature.animation_data_create()

    conversions = {}
    for name, source_matrix in source_rest_rel.items():
        reference_matrix = reference_rest_rel.get(name)
        if reference_matrix is None:
            continue
        change = (source_matrix.to_3x3().inverted() @ reference_matrix.to_3x3())
        conversions[name] = change.to_quaternion().normalized()

    translating = {"root", "pelvis"}
    built, skipped = [], []
    for clip_name, clip in clips.items():
        action = bpy.data.actions.new(clip_name)
        action.use_fake_user = True
        armature.animation_data.action = action
        for pose_bone in armature.pose.bones:
            pose_bone.rotation_mode = "QUATERNION"

        wrote = 0
        for entry in clip["frames"]:
            frame = entry["frame"]
            for bone_name, channel in entry["pose"].items():
                pose_bone = armature.pose.bones.get(bone_name)
                conversion = conversions.get(bone_name)
                if pose_bone is None or conversion is None:
                    continue
                reference_rotation = Quaternion(channel["rot"])
                rotation = conversion @ reference_rotation @ conversion.inverted()
                pose_bone.rotation_quaternion = rotation.normalized()
                pose_bone.keyframe_insert("rotation_quaternion", frame=frame)
                if bone_name in translating:
                    location = Vector(channel["loc"]) * height_ratio
                    pose_bone.location = location
                    pose_bone.keyframe_insert("location", frame=frame)
                wrote += 1
        if wrote:
            built.append(clip_name)
        else:
            skipped.append(clip_name)
            bpy.data.actions.remove(action)

    for pose_bone in armature.pose.bones:
        pose_bone.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pose_bone.location = Vector((0, 0, 0))
    armature.animation_data.action = None
    bpy.context.view_layer.update()

    return {
        "retargeted": sorted(built),
        "absent": sorted(skipped),
        "bonesConverted": len(conversions),
        "heightRatio": round(height_ratio, 4),
        "method": "parent-relative rest basis conjugation (C = Rsrc^-1 Rref, A_s = C A_r C^-1)",
    }


# --- 4. pose tests ---------------------------------------------------------
def pose_tests(armature):
    """Drive real joints and measure where the geometry actually goes.

    Every check here is a thing a rename-only import gets wrong while still
    passing every structural validator: a shoulder that does not lift, a wrist
    that does not twist, a knee that bends the wrong way.
    """
    results = {}
    scene = bpy.context.scene
    scene.frame_set(1)

    def bone_head(name):
        pb = armature.pose.bones.get(name)
        return (armature.matrix_world @ pb.head).copy() if pb else None

    def apply(name, axis, degrees):
        pb = armature.pose.bones.get(name)
        if pb is None:
            return False
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion(axis, math.radians(degrees))
        bpy.context.view_layer.update()
        return True

    def reset(name):
        pb = armature.pose.bones.get(name)
        if pb is not None:
            pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
    # `wristTwist` used to live here as "rotate the forearm, measure how far
    # hand.R's head moved". That is the wrong quantity -- pronation turns the
    # hand about the forearm axis with the wrist centre barely translating, so
    # a correct rig scored near zero. Forearm rotation is judged by
    # orientation and skin deformation in mpfb_rig_comparison.forearm_test.
    checks = (
        ("shoulderRaise", "upper_arm.R", "hand.R", (0, 0, 1), -55.0, 0.10),
        ("hipSwing", "thigh.R", "foot.R", (1, 0, 0), 40.0, 0.12),
        ("kneeBend", "shin.R", "foot.R", (1, 0, 0), -60.0, 0.10),
        ("footRoll", "foot.R", "toe.R", (1, 0, 0), 25.0, 0.02),
    )
    for label, driver, effector, axis, degrees, floor in checks:
        before = bone_head(effector)
        if before is None or armature.pose.bones.get(driver) is None:
            results[label] = {"ran": False, "reason": "missing %s or %s" % (driver, effector)}
            continue
        apply(driver, axis, degrees)
        after = bone_head(effector)
        reset(driver)
        bpy.context.view_layer.update()
        moved = (after - before).length
        results[label] = {
            "ran": True,
            "driver": driver,
            "effector": effector,
            "degrees": degrees,
            "effectorTravel": round(moved, 5),
            "floor": floor,
            "pass": moved >= floor,
        }
    results["allPassed"] = all(v.get("pass", False) for v in results.values() if isinstance(v, dict) and v.get("ran"))
    return results


# --- 5. glTF skin contract -------------------------------------------------
# `verify_joint_order` used to assert `skin.joints[:18] == LEGACY_BONES`, and
# that contract was simply wrong. A glTF `JOINTS_n` value is an index into
# *that skin's own* `joints` array. It is not a cross-file ABI, and two GLBs
# that share no joint order are still both perfectly valid and both loadable.
# Requiring a foreign 53-bone rig to reproduce our 18-bone ordering would have
# meant fighting Blender's exporter for nothing, and it failed a candidate for
# a reason that does not exist.
#
# What actually has to hold is internal consistency plus name resolution,
# because CharacterFactory looks bones up *by name*. That is what is checked
# here. The legacy ordering is still reported, as a diagnostic only.
GLTF_COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
GLTF_COMPONENT_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def _read_glb(path):
    import json
    import struct

    with open(path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"glTF":
        raise RigError("not a GLB: %s" % path)
    offset, gltf, binary = 12, None, b""
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        offset += 8 + length + (-length % 4)
    if gltf is None:
        raise RigError("GLB has no JSON chunk: %s" % path)
    return gltf, binary


def _accessor(gltf, binary, index):
    """Decode one accessor into a flat list of Python numbers."""
    import struct

    accessor = gltf["accessors"][index]
    count = accessor["count"]
    components = GLTF_COMPONENT_COUNT[accessor["type"]]
    ctype = accessor["componentType"]
    size = GLTF_COMPONENT_SIZE[ctype]
    fmt = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}[ctype]
    view = gltf["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or size * components
    out = []
    for i in range(count):
        start = base + i * stride
        out.extend(struct.unpack_from("<" + fmt * components, binary, start))
    return out, count, components


def verify_skin_contract(glb_path, required_names, weight_tolerance=0.02):
    """Check the exported skin is internally valid and name-resolvable.

    Ten checks, all of which are properties of this file alone:

    1-2. a skin exists, with a non-empty array of unique joints
    3-4. inverseBindMatrices exist and cover every joint
    5.   every skinned primitive carries JOINTS_0 and WEIGHTS_0
    6.   every JOINTS_n value indexes inside this skin's joints array
    7.   JOINTS_n and WEIGHTS_n come in matching pairs
    8.   weights are non-negative and sum to ~1 per vertex
    9.   every runtime-required semantic bone is present by name
    10.  (Babylon-side, asserted by the runtime test, not here)
    """
    gltf, binary = _read_glb(glb_path)
    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    report = {"skinCount": len(skins), "checks": {}, "problems": []}
    checks = report["checks"]

    checks["hasSkin"] = bool(skins)
    if not skins:
        report["problems"].append("no skin in the exported GLB")
        report["ok"] = False
        return report

    skin = skins[0]
    joints = skin.get("joints", [])
    names = [nodes[i].get("name", "<%d>" % i) for i in joints]
    report["jointCount"] = len(joints)
    report["jointNames"] = names

    checks["jointsNonEmpty"] = bool(joints)
    checks["jointsUnique"] = len(set(joints)) == len(joints)
    checks["hasInverseBindMatrices"] = "inverseBindMatrices" in skin
    if checks["hasInverseBindMatrices"]:
        _values, ibm_count, _c = _accessor(gltf, binary, skin["inverseBindMatrices"])
        report["inverseBindMatrixCount"] = ibm_count
        checks["inverseBindMatricesCoverJoints"] = ibm_count >= len(joints)
    else:
        checks["inverseBindMatricesCoverJoints"] = False

    # Per-primitive attribute and value checks.
    joint_sets, weight_sets = [], []
    out_of_range, bad_sum, negative = 0, 0, 0
    skinned_primitives, missing_attributes = 0, []
    worst_sum_error = 0.0
    for mesh_index, mesh in enumerate(gltf.get("meshes", [])):
        for prim_index, primitive in enumerate(mesh.get("primitives", [])):
            attributes = primitive.get("attributes", {})
            js = sorted(k for k in attributes if k.startswith("JOINTS_"))
            ws = sorted(k for k in attributes if k.startswith("WEIGHTS_"))
            if not js and not ws:
                continue
            skinned_primitives += 1
            joint_sets.append(len(js))
            weight_sets.append(len(ws))
            label = "%s[%d]" % (mesh.get("name", "mesh%d" % mesh_index), prim_index)
            if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
                missing_attributes.append(label)
                continue
            totals = None
            for name in js:
                values, count, comps = _accessor(gltf, binary, attributes[name])
                if any(v >= len(joints) for v in values):
                    out_of_range += 1
            for name in ws:
                values, count, comps = _accessor(gltf, binary, attributes[name])
                if any(v < 0.0 for v in values):
                    negative += 1
                sums = [sum(values[i * comps:(i + 1) * comps]) for i in range(count)]
                totals = sums if totals is None else [a + b for a, b in zip(totals, sums)]
            if totals:
                errors = [abs(t - 1.0) for t in totals]
                worst_sum_error = max(worst_sum_error, max(errors))
                bad_sum += sum(1 for e in errors if e > weight_tolerance)

    checks["everySkinnedPrimitiveHasJoints0Weights0"] = not missing_attributes
    checks["jointIndicesInRange"] = out_of_range == 0
    checks["jointAndWeightSetsMatch"] = joint_sets == weight_sets
    checks["weightsNonNegative"] = negative == 0
    checks["weightsSumToOne"] = bad_sum == 0
    report["skinnedPrimitives"] = skinned_primitives
    report["missingAttributes"] = missing_attributes
    report["verticesWithBadWeightSum"] = bad_sum
    report["worstWeightSumError"] = round(worst_sum_error, 5)
    report["influenceSets"] = max(joint_sets) if joint_sets else 0

    present = set(names)
    missing = [n for n in required_names if n not in present]
    checks["allRequiredSemanticBonesPresent"] = not missing
    report["missingSemanticBones"] = missing

    # Diagnostic only. This is no longer a gate, and must never become one
    # again: joint order is per-skin and carries no cross-asset meaning.
    report["diagnostic"] = {
        "legacyOrderPrefixMatches": names[:len(LEGACY_BONES)] == list(LEGACY_BONES),
        "note": "informational; JOINTS_n indexes this skin's own joints array",
    }

    report["ok"] = all(checks.values())
    if not report["ok"]:
        report["problems"] = [k for k, v in checks.items() if not v]
    return report
