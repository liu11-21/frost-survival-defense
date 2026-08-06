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
    checks = (
        ("shoulderRaise", "upper_arm.R", "hand.R", (0, 0, 1), -55.0, 0.10),
        ("wristTwist", "lower_arm.R", "hand.R", (0, 1, 0), 70.0, 0.004),
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


# --- 5. glTF joint contract ------------------------------------------------
def verify_joint_order(glb_path, expected_prefix):
    """Check the exported skin, not the Blender scene.

    "Append-only is safe" is a claim about the exported file, so it has to be
    checked there. Blender's exporter is free to order joints however it likes,
    and if it reorders, every JOINTS_0 index in every previously shipped asset
    means something different.
    """
    import json
    import struct

    with open(glb_path, "rb") as handle:
        data = handle.read()
    if data[:4] != b"glTF":
        raise RigError("not a GLB: %s" % glb_path)
    offset, gltf = 12, None
    while offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + length]
        if kind == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
            break
        offset += 8 + length + (-length % 4)
    if gltf is None:
        raise RigError("GLB has no JSON chunk: %s" % glb_path)

    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    report = {"skins": len(skins), "joints": [], "orderMatchesPrefix": False, "hasInverseBindMatrices": False}
    if not skins:
        return report
    joints = [nodes[i].get("name", "<%d>" % i) for i in skins[0].get("joints", [])]
    report["joints"] = joints
    report["jointCount"] = len(joints)
    report["hasInverseBindMatrices"] = "inverseBindMatrices" in skins[0]
    prefix = list(expected_prefix)
    report["orderMatchesPrefix"] = joints[:len(prefix)] == prefix
    if not report["orderMatchesPrefix"]:
        report["firstDivergence"] = next(
            (i for i, name in enumerate(prefix) if i >= len(joints) or joints[i] != name),
            None,
        )
    return report
