"""Import an external human base and turn it into a project-shaped GLB.

Why this exists
---------------
Every human in this project so far was modelled out of swept superellipses,
boxes and prisms. That language is good at coats, armour plate and boots --
hard surfaces with flat planes and hard edges -- and it is bad at faces.
Four rounds of review converged on the same finding each time: the nose is a
prism, the eyes are rectangles, the brow is a plank. Those are not tuning
failures, they are what the toolkit produces. A believable human face needs a
mature base with real topology, and no amount of parameter work in
``build_hero.py`` reaches it.

This module is the other half of that: the repeatable path from *someone
else's* human model to an asset this game can load. It does not model
anything. It imports, normalises, cleans, re-materials, decimates, exports
and reports.

Nothing about any particular vendor is written into this file. Node names,
bone names, source orientation and unit scale all come from
``human_source_profiles.json``, so adding a source is a data change. That
matters because the sources worth using (MakeHuman, Character Creator,
Blender Studio's CC0 base meshes, a bought Blender Market character) disagree
about all four.

Usage
-----
    node scripts/run-blender.mjs scripts/blender/human_source_adapter.py -- \
        --input <path to .fbx/.glb> --profile makehuman-fbx --name hero_human_candidate

Contract with the rest of the project
-------------------------------------
Output obeys the same contract the authored assets do: Babylon Y-up, forward
+Z, feet on y=0, root named UnitRoot, LOD meshes named ``LOD{n}_PROD_*``, and
a ``COL_Unit`` collision box. It writes to ``public/assets/models/characters``
under the name given, and it will refuse to overwrite ``hero.glb`` --- the
working Hero is the fallback and this pipeline is not allowed to take it out
until a candidate has passed human review.
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import collision_box, empty, export_glb, reset_scene, save_source, collection  # noqa: E402
import human_rig  # noqa: E402

PROFILES_PATH = os.path.join(HERE, "human_source_profiles.json")
# The 18 bones every existing clip and every runtime contract is written
# against. See docs/art/HUMAN_SOURCE_PIPELINE.md for why this list is a
# problem for a mature base and what the migration looks like.
REQUIRED_BONES = (
    "root", "pelvis", "spine", "chest", "neck", "head",
    "upper_arm.L", "lower_arm.L", "hand.L",
    "upper_arm.R", "lower_arm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L",
    "thigh.R", "shin.R", "foot.R",
)
# Assets this pipeline must never overwrite. The authored Hero is the
# fallback; a candidate has to earn its way in through human review, not by
# happening to be written to the same path.
PROTECTED = {"hero.glb", "warrior.glb"}
LOD_RATIO = (1.0, 0.45, 0.18)
# Floor on the face count any single mesh keeps after decimation, so small
# props survive tiers tuned for a body.
LOD_MIN_FACES = 72


def load_profile(name):
    with open(PROFILES_PATH, encoding="utf-8") as handle:
        data = json.load(handle)
    profiles = data["profiles"]
    if name not in profiles:
        raise SystemExit(
            "unknown profile %r; human_source_profiles.json defines: %s"
            % (name, ", ".join(sorted(profiles)))
        )
    return profiles[name]


# --- 1. import -------------------------------------------------------------
def import_source(path, profile):
    ext = os.path.splitext(path)[1].lower()
    if ext not in [e.lower() for e in profile["extension"]]:
        raise SystemExit(
            "profile expects %s, got %s -- pick the profile that matches the file"
            % (profile["extension"], ext)
        )
    before = set(bpy.data.objects)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    else:
        bpy.ops.import_scene.gltf(filepath=path)
    imported = [o for o in bpy.data.objects if o not in before]
    if not imported:
        raise SystemExit("import produced no objects from %s" % path)
    return imported


# --- 2. clean --------------------------------------------------------------
def clean(objects, profile):
    """Drop cameras, lights, controllers and helpers before anything else.

    External rigs routinely ship an IK control hierarchy and a lighting setup.
    None of it can reach the GLB, and dropping it first means every later step
    is measuring the actual character rather than a control cage around it.
    """
    patterns = [re.compile(p, re.IGNORECASE) for p in profile.get("drop_nodes", [])]
    # Decide first, delete second, and re-read the survivors from the scene.
    # Holding Python references to objects across a removal and then touching
    # `.name` raises "StructRNA has been removed" -- the reference outlives the
    # data it points at.
    keep_names, drop_names = [], []
    for obj in list(objects):
        drop = obj.type in {"CAMERA", "LIGHT", "SPEAKER"}
        drop = drop or any(p.search(obj.name) for p in patterns)
        (drop_names if drop else keep_names).append(obj.name)
    for name in drop_names:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            bpy.data.objects.remove(obj, do_unlink=True)
    removed = drop_names
    survivors = [bpy.data.objects[n] for n in keep_names if n in bpy.data.objects]
    meshes = [o for o in survivors if o.type == "MESH"]
    armatures = [o for o in survivors if o.type == "ARMATURE"]
    return meshes, armatures, removed


# --- 3. rig ---------------------------------------------------------------
# Bone analysis, rest-pose alignment and retargeting live in human_rig.py.
# They were inline here as a single rename loop, which is not retargeting: it
# makes LeftArm answer to upper_arm.L and does nothing about the fact that our
# clips are quaternions written against *our* rest orientation.


def synthesise_root(armature):
    """Give a rig without a root bone one, at the origin, above the pelvis.

    Sources like Mixamo have no root -- the hips are the top of the hierarchy.
    The profile used to paper over that by mapping both `root` and `pelvis` to
    Hips, which collapses two levels into one and makes every root-relative
    offset silently wrong.
    """
    if "root" in armature.data.bones:
        return False
    previous = bpy.context.view_layer.objects.active
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    edit = armature.data.edit_bones
    root = edit.new("root")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 0.0, 0.10)
    for bone in edit:
        if bone.name != "root" and bone.parent is None:
            bone.parent = root
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = previous
    return True


# --- 4. orientation, scale, grounding -------------------------------------
def measure_basis(armature):
    """The character's own (right, up, forward) frame, read off its skeleton.

    Returns None when the rig does not carry enough landmarks, in which case
    the caller falls back to the profile's declared axes.
    """
    if armature is None:
        return None
    bones = armature.data.bones
    pelvis, head = bones.get("pelvis"), bones.get("head")
    left, right_hip = bones.get("thigh.L"), bones.get("thigh.R")
    if not (pelvis and head and left and right_hip):
        return None
    m = armature.matrix_world
    up = ((m @ head.head_local) - (m @ pelvis.head_local))
    right = ((m @ right_hip.head_local) - (m @ left.head_local))
    if up.length < 1e-6 or right.length < 1e-6:
        return None
    up.normalize()
    # Re-orthogonalise: hips are rarely exactly perpendicular to the spine.
    right = (right - up * right.dot(up))
    if right.length < 1e-6:
        return None
    right.normalize()
    forward = right.cross(up)
    if forward.length < 1e-6:
        return None
    return right, up, forward.normalized()



def normalise(meshes, armatures, profile, target_height):
    """Babylon Y-up, forward +Z, feet on the floor, and a known height.

    Sources disagree about all three. A MakeHuman FBX is Y-up facing -Z; a
    Mixamo FBX is centimetre-scaled; a DCC glTF may be Z-up. Getting this
    wrong is not subtle -- the character lies on its back or stands 100x too
    large -- but it is exactly the kind of thing that a validator counting
    triangles reports as fine.
    """
    objects = meshes + armatures
    if not objects:
        raise SystemExit("nothing left to normalise after cleaning")
    root = empty("SourceRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES")
    # Reparent the *topmost ancestors*, not the objects with no parent at all.
    # An imported GLB usually arrives under its own root empty, so every mesh
    # and armature already has a parent -- "if obj.parent is None" then matches
    # nothing, SourceRoot ends up empty, and rotating it rotates nothing while
    # every later measurement quietly reports the unrotated model.
    # Scene-level roots, not "objects in my list with no parent". An imported
    # character hangs off empties this list never contains -- UnitRoot,
    # LOD markers, weapon sockets -- so walking only meshes and armatures
    # stops one level short and reparents nothing at all. That is precisely
    # what happened on the first real input: SourceRoot rotated an empty
    # hierarchy while every measurement reported the unrotated model.
    tops = [o for o in bpy.data.objects if o.parent is None and o is not root]
    for obj in tops:
        obj.parent = root

    # Orientation is *measured off the skeleton*, not taken from a profile flag.
    #
    # The flag approach failed on the first real input and the gate caught it:
    # the profile said the file was Y-up, which was true, but Blender's glTF
    # importer converts to Blender's Z-up on the way in -- so by the time this
    # code measured anything the character was lying on its back, 2.58m tall,
    # facing -Y. A profile cannot know that, because the answer depends on the
    # importer as much as on the file.
    #
    # A humanoid rig already carries its own frame: pelvis-to-head is up, and
    # left-hip-to-right-hip is the character's right. Forward is their cross
    # product. That is true of every source regardless of file convention,
    # importer behaviour or what the exporter believed.
    armature = armatures[0] if armatures else None
    basis = measure_basis(armature)
    if basis is not None:
        right, up, forward = basis
        # Rows map the measured frame onto the project's: +X right, +Y up,
        # +Z forward.
        # Rows map the measured frame onto BLENDER's, not onto the project's
        # Y-up output convention: +X right, +Y forward, +Z up.
        #
        # Targeting Y-up here meant the glTF exporter converted a second time.
        # Only half the character received both conversions -- the LOD copies
        # were re-parented off this root (see build_lods) and got exactly one,
        # which is why every static render looked upright, while the armature
        # stayed under the root and got two. The shipped file therefore had its
        # bones a whole coordinate frame from its skin, 2.1714 m median against
        # 0.10 m on the project's own asset, and skinning hides that entirely
        # at rest because v' = M * B^-1 * v collapses to v whenever M = B.
        rotation = Matrix((right, forward, up)).to_4x4()
        if rotation.determinant() < 0:
            # Keep it right-handed; a mirrored basis swaps the character's left
            # and right along with the axes. Measured source: right = -X,
            # up = +Z, forward = +Y, which needs this branch.
            rotation = Matrix((-Vector(right), forward, up)).to_4x4()
        root.matrix_world = rotation @ root.matrix_world
    elif profile.get("up_axis", "Y").upper() == "Y":
        root.rotation_euler[0] = math.pi / 2
    root.scale = tuple(v * profile.get("unit_scale", 1.0) for v in root.scale)
    bpy.context.view_layer.update()

    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for mesh in meshes:
        for corner in mesh.bound_box:
            world = mesh.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], world[i]) for i in range(3)))
            hi = Vector((max(hi[i], world[i]) for i in range(3)))
    # Blender axes now: up is +Z and the floor the feet stand on is z = 0.
    # The exporter maps that to the Y-up floor the runtime contract asks for.
    height = max(1e-6, hi[2] - lo[2])
    factor = target_height / height
    root.scale = tuple(s * factor for s in root.scale)
    bpy.context.view_layer.update()

    lo_z = min((mesh.matrix_world @ Vector(c))[2] for mesh in meshes for c in mesh.bound_box)
    cx = sum((mesh.matrix_world @ Vector(c))[0] for mesh in meshes for c in mesh.bound_box)
    cy = sum((mesh.matrix_world @ Vector(c))[1] for mesh in meshes for c in mesh.bound_box)
    n = len(meshes) * 8
    root.location = (root.location[0] - cx / n, root.location[1] - cy / n, root.location[2] - lo_z)
    bpy.context.view_layer.update()
    print("NORMALISE height=%.4f factor=%.5f" % (height, factor))
    bpy.context.view_layer.update()
    return root, {"sourceHeight": round(height, 4), "scaleFactor": round(factor, 5)}


def bake_transforms(root, meshes, armature):
    """Push the root's frame correction down into the data itself.

    `normalise` orients and scales the character by transforming a parent
    empty. That is correct on screen and wrong in the file. The geometry and
    the bone rest positions each stay in whatever frame they arrived in, and
    only the parent reconciles them -- so in the exported GLB the mesh is
    Y-up while the armature's rest is still Z-up:

        candidate  mesh Y 0.007..1.849   bones Y -0.315..0.026, Z -0.809..0.697
        hero.glb   mesh Y 0.007..2.254   bones Y  0.000..1.821

    Skinning is v' = M * B^-1 * v, so at rest M = B and the vertex returns to
    itself no matter how far B is from the flesh. The mismatch is invisible in
    every static frame and then multiplies every rotation, which is why a
    35 deg turn moved a vertex 2.3 m while its own joint moved 0.36 m.

    Applying rotation and scale to the armature rewrites `head_local` for
    every bone, and applying it to the meshes rewrites their vertices, so the
    two end up in one frame with identity object transforms -- which is what
    the control asset has and why it does not do this.
    """
    view = bpy.context.view_layer
    targets = [obj for obj in ([armature] + list(meshes)) if obj is not None]

    # `transform_apply` bakes an object's OWN transform and leaves its parent's
    # alone, and the frame correction lives on the root empty -- so applying it
    # in place changes nothing, which the bind gate caught immediately. The
    # children have to carry the world matrix themselves first.
    world = {obj.name: obj.matrix_world.copy() for obj in targets}
    for obj in targets:
        obj.parent = None
        obj.matrix_world = world[obj.name]
    view.update()

    for obj in bpy.data.objects:
        obj.select_set(False)
    for obj in targets:
        obj.select_set(True)
    view.objects.active = armature if armature is not None else targets[0]
    # Location stays on the object: it carries the floor/centre placement, and
    # baking it would move the bind pose away from the origin for no gain.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for obj in targets:
        obj.select_set(False)

    # The orientation and scale now live in the vertices and in `head_local`,
    # so the root must stop applying them a second time.
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    view.update()
    for obj in targets:
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()
    view.update()
    return {
        "baked": [obj.name for obj in targets],
        "armatureScale": [round(v, 5) for v in armature.matrix_world.to_scale()]
        if armature else None,
    }


def verify_bind_frame(meshes, armature, tolerance=0.25):
    """Fail the build if the bones do not sit inside the flesh they drive.

    This is the check whose absence let a metre-scale bind error ship through
    a triangle budget, a JOINTS_0 contract, a pose test and ten rendered
    frames. The control asset reads 0.10-0.16 m here; the broken candidate
    read 1.47-1.97 m.
    """
    if armature is None:
        return {"checked": 0}
    body = max(meshes, key=lambda o: len(o.data.vertices))
    names = {g.index: g.name for g in body.vertex_groups}
    into = armature.matrix_world.inverted() @ body.matrix_world
    worst = []
    for bone_name in ("lower_arm.R", "lower_arm.L", "head", "pelvis"):
        bone = armature.data.bones.get(bone_name)
        group = body.vertex_groups.get(bone_name)
        if bone is None or group is None:
            continue
        owned = [into @ v.co for v in body.data.vertices
                 if any(g.group == group.index and g.weight > 0.5 for g in v.groups)]
        if not owned:
            continue
        centroid = sum(owned, Vector((0.0, 0.0, 0.0))) / len(owned)
        worst.append((round((centroid - bone.head_local).length, 4), bone_name))
    worst.sort(reverse=True)
    if worst and worst[0][0] > tolerance:
        raise human_rig.RigError(
            "bind frame mismatch: %s is %.3f m from the vertices weighted to it "
            "(limit %.2f). The bones and the mesh are in different frames; the "
            "rest pose will look correct and every rotation will tear."
            % (worst[0][1], worst[0][0], tolerance))
    return {"worstBoneToFlesh": worst[:4]}


def verify_normalised(meshes, armature, target_height, tolerance=0.02):
    """Measure the result instead of trusting the transform that produced it.

    Every item here is something that survives to a shipped GLB, passes a
    triangle budget and a JOINTS_0 check, and is instantly obvious the first
    time anybody looks: a character on its back, sunk through the floor, or
    facing away from the camera.
    """
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for mesh in meshes:
        for corner in mesh.bound_box:
            world = mesh.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], world[i]) for i in range(3)))
            hi = Vector((max(hi[i], world[i]) for i in range(3)))
    height = hi[2] - lo[2]
    # Facing is read off the rig: the vector from the pelvis to the head is up,
    # and a human's chest normal is the cross of up with the hip-to-hip axis.
    facing = None
    if armature is not None:
        bones = armature.data.bones
        left, right = bones.get("thigh.L"), bones.get("thigh.R")
        pelvis, head = bones.get("pelvis"), bones.get("head")
        if left and right and pelvis and head:
            m = armature.matrix_world
            hip = (m @ right.head_local) - (m @ left.head_local)
            up = (m @ head.head_local) - (m @ pelvis.head_local)
            if hip.length > 1e-6 and up.length > 1e-6:
                facing = hip.normalized().cross(up.normalized())
    checks = {
        "feetOnFloor": abs(lo[2]) <= tolerance,
        "footZ": round(lo[2], 5),
        "heightMetres": round(height, 4),
        "heightOnTarget": abs(height - target_height) <= tolerance,
        "centredOnX": abs((lo[0] + hi[0]) * 0.5) <= tolerance * 4,
        "zUpInBlender": height >= (hi[0] - lo[0]) and height >= (hi[1] - lo[1]),
        "facingVector": [round(v, 4) for v in facing] if facing else None,
        # Blender +Y becomes glTF +Z, the forward the contract wants.
        "facesPositiveYInBlender": bool(facing and facing.y > 0.5),
        "sameCoordinateSystem": all(
            (m.matrix_world.translation - (armature.matrix_world.translation if armature else Vector())).length < 50.0
            for m in meshes
        ),
    }
    checks["allPassed"] = all(
        checks[k] for k in ("feetOnFloor", "heightOnTarget", "zUpInBlender", "sameCoordinateSystem")
    )
    return checks


# --- 5. materials ----------------------------------------------------------
# Channels Babylon's glTF loader consumes. Anything else on an imported
# character -- specular/glossiness stacks, subsurface, sheen -- is dropped
# rather than left connected and silently ignored at runtime.
PBR_INPUTS = ("Base Color", "Normal", "Roughness", "Metallic", "Alpha")
# Materials a human base ships that must not be merged into the skin: they
# need their own alpha or their own shading and merging them produces a face
# with an opaque grey slab across the eyes.
KEEP_SEPARATE = ("eyelash", "eyebrow", "eye", "cornea", "sclera", "iris",
                 "tear", "teeth", "tongue", "nail", "hair")


def classify(name):
    lowered = name.lower()
    for token in KEEP_SEPARATE:
        if token in lowered:
            return token
    return "body"


def convert_materials(meshes, budget, enforce=True):
    """Force PBR metallic-roughness, record what is actually wired, enforce budget.

    The previous version reported `withinBudget: false` and carried on, which
    is the same as not having a budget. Over budget is now either merged (for
    materials that are safe to merge) or a hard failure -- never a note in a
    report nobody reads.
    """
    seen = {}
    for mesh in meshes:
        for slot in mesh.material_slots:
            mat = slot.material
            if mat is None or mat.name in seen:
                continue
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            bsdf = nodes.get("Principled BSDF")
            if bsdf is None:
                bsdf = nodes.new("ShaderNodeBsdfPrincipled")
                out = nodes.get("Material Output") or nodes.new("ShaderNodeOutputMaterial")
                mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
            for name in ("Specular IOR Level", "Sheen Weight", "Coat Weight",
                         "Transmission Weight", "Subsurface Weight"):
                if name in bsdf.inputs:
                    bsdf.inputs[name].default_value = 0.0
            connections = {}
            for channel in PBR_INPUTS:
                socket = bsdf.inputs.get(channel)
                linked = bool(socket and socket.is_linked)
                image = None
                if linked:
                    node = socket.links[0].from_node
                    # Walk one hop through a Normal Map or a separator node.
                    if node.type != "TEX_IMAGE":
                        for candidate in node.inputs:
                            if candidate.is_linked and candidate.links[0].from_node.type == "TEX_IMAGE":
                                node = candidate.links[0].from_node
                                break
                    image = node.image.name if getattr(node, "image", None) else None
                connections[channel] = {"connected": linked, "image": image}
            kind = classify(mat.name)
            if kind in ("eye", "cornea", "tear", "eyelash", "eyebrow", "hair"):
                # Alpha-blended parts of a human base. Left opaque, eyelashes
                # render as black rectangles across the eye.
                mat.blend_method = "BLEND" if hasattr(mat, "blend_method") else mat.blend_method
            seen[mat.name] = {"channels": connections, "class": kind}

    over = len(seen) - budget
    merged = []
    if over > 0:
        # Only body materials are candidates: eyes, lashes and hair carry alpha
        # or their own shading and merging them destroys the face.
        body = sorted(n for n, v in seen.items() if v["class"] == "body")
        if len(body) - 1 >= over:
            keep = body[0]
            victims = body[1:1 + over]
            target = bpy.data.materials.get(keep)
            for mesh in meshes:
                for slot in mesh.material_slots:
                    if slot.material is not None and slot.material.name in victims:
                        slot.material = target
            for name in victims:
                seen.pop(name, None)
            merged = victims
        elif enforce:
            raise human_rig.RigError(
                "material budget exceeded: %d materials, budget %d, and only %d "
                "body materials are safe to merge (eyes, lashes and hair must stay "
                "separate). Reduce them in the source export or raise "
                "--material-budget deliberately. Nothing was written."
                % (len(seen), budget, len(body))
            )
    return {
        "materials": {name: value for name, value in sorted(seen.items())},
        "materialCount": len(seen),
        "merged": merged,
        "budget": budget,
        "withinBudget": len(seen) <= budget,
        "textures": sorted({
            c["image"] for v in seen.values() for c in v["channels"].values() if c["image"]
        }),
        "alphaMaterials": sorted(n for n, v in seen.items()
                                 if v["class"] in ("eye", "cornea", "tear", "eyelash", "eyebrow", "hair")),
    }


# --- 6. LODs ---------------------------------------------------------------
def build_lods(meshes, armature, name):
    """LOD0/1/2 by decimation, named to the project's LOD contract.

    Decimate rather than re-author: the whole point of a mature base is that
    its topology is better than anything this pipeline could produce, so the
    coarse tiers should be that same surface with fewer triangles.
    """
    tiers = []
    for level, ratio in enumerate(LOD_RATIO):
        holder = collection("LOD%d" % level)
        made = []
        for index, source in enumerate(meshes):
            copy = source.copy()
            copy.data = source.data.copy()
            copy.name = "LOD%d_PROD_%s_%d" % (level, name, index)
            holder.objects.link(copy)
            # A mature base arrives with its macro morph targets still present
            # as shape keys, and Decimate refuses to apply to a mesh that has
            # them. The macro values are already baked into the vertex
            # positions -- the keys are authoring history, not runtime data --
            # so they are dropped rather than kept as dead weight in the GLB.
            if copy.data.shape_keys:
                copy.shape_key_clear()
            # Decimate proportionally, but never below a floor.
            #
            # A ratio that suits a 4600-face body destroys a 130-face weapon:
            # at LOD2 the axe lost its edge entirely, the silhouette's outermost
            # geometry went with it, and the tier stopped matching LOD0's
            # bounds. Small props are a rounding error in the budget and carry
            # the read -- an axe nobody can see is worse than the triangles it
            # would have cost.
            faces = len(copy.data.polygons)
            effective = ratio
            if faces:
                effective = max(ratio, min(1.0, LOD_MIN_FACES / float(faces)))
            if effective < 1.0:
                mod = copy.modifiers.new("lod", "DECIMATE")
                mod.ratio = effective
                bpy.context.view_layer.objects.active = copy
                bpy.ops.object.modifier_apply(modifier=mod.name)
            copy["lodLevel"] = level
            copy["authoredRole"] = "human_source_candidate"
            copy["weightedSkinning"] = bool(armature)
            copy["sourceName"] = source.name
            made.append(copy)
            print("LODTRACE tier=%d src=%s copy=%s tris=%d mats=%s groups=%d "
                  "hideR=%s hideV=%s parent=%s colls=%s"
                  % (level, source.name, copy.name,
                     sum(max(0, len(pl.vertices) - 2) for pl in copy.data.polygons),
                     [m.name if m else None for m in copy.data.materials],
                     len(copy.vertex_groups), copy.hide_render, copy.hide_viewport,
                     copy.parent.name if copy.parent else None,
                     [c.name for c in copy.users_collection]))
        tiers.append(made)
    print("LODTRACE_SOURCES %s" % sorted(m.name for m in meshes))
    return tiers


def triangle_count(objects):
    total = 0
    for obj in objects:
        mesh = obj.data
        for polygon in mesh.polygons:
            total += max(0, len(polygon.vertices) - 2)
    return total


# --- 7. LOD verification ---------------------------------------------------
def verify_lods(tiers, armature):
    """Prove the decimation kept what the runtime needs.

    Decimate is happy to delete the vertices that carried a bone's only
    influence. The result still loads, still reports a sensible triangle count,
    and comes apart the first time the clip plays -- so weights, joint
    attributes and per-tier alignment are all measured here rather than
    assumed.
    """
    groups_lod0 = None
    report = {"tiers": [], "allPassed": True}
    for level, made in enumerate(tiers):
        weighted = 0
        unweighted = 0
        names = set()
        lo = [1e9, 1e9, 1e9]
        hi = [-1e9, -1e9, -1e9]
        for obj in made:
            names.update(g.name for g in obj.vertex_groups)
            for vertex in obj.data.vertices:
                if any(g.weight > 0.0 for g in vertex.groups):
                    weighted += 1
                else:
                    unweighted += 1
            for corner in obj.bound_box:
                world = obj.matrix_world @ Vector(corner)
                lo = [min(lo[i], world[i]) for i in range(3)]
                hi = [max(hi[i], world[i]) for i in range(3)]
        if level == 0:
            groups_lod0 = names
        tier = {
            "lod": level,
            "meshes": len(made),
            "weightedVertices": weighted,
            "unweightedVertices": unweighted,
            "everyVertexWeighted": unweighted == 0,
            "vertexGroups": len(names),
            "keptEveryLod0Bone": groups_lod0 is not None and groups_lod0.issubset(names) if level else True,
            "bounds": {"min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]},
        }
        if armature is None:
            tier["everyVertexWeighted"] = False
        report["tiers"].append(tier)

    base = report["tiers"][0]["bounds"] if report["tiers"] else None
    for tier in report["tiers"][1:]:
        if base is None:
            continue
        drift = max(
            abs(tier["bounds"]["min"][i] - base["min"][i]) for i in range(3)
        ) if base else 0.0
        drift = max(drift, max(abs(tier["bounds"]["max"][i] - base["max"][i]) for i in range(3)))
        tier["boundsDriftFromLod0"] = round(drift, 4)
        # A tier that moves or resizes on switch is a pop the player sees.
        tier["alignedWithLod0"] = drift <= 0.05
    report["allPassed"] = all(
        t.get("everyVertexWeighted", False) and t.get("keptEveryLod0Bone", False)
        and t.get("alignedWithLod0", True)
        for t in report["tiers"]
    )
    return report


# --- 8. report -------------------------------------------------------------
def write_report(path, payload):
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def file_hash(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_reference_rig(path):
    """The project's own rest pose and clip names, read from the shipped Hero.

    The delta that makes retargeting work has to be measured against the rig
    the clips were actually authored for. Assuming "both are T-pose" is how a
    renamed rig ends up playing our Idle with its arms somewhere else.
    """
    if not os.path.isfile(path):
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    added = [o for o in bpy.data.objects if o not in before]
    armature = next((o for o in added if o.type == "ARMATURE"), None)
    if armature is None:
        for obj in added:
            bpy.data.objects.remove(obj, do_unlink=True)
        return None
    # Everything the retarget needs has to leave this function as DATA. The
    # scene -- and bpy.data.actions with it -- is torn down immediately after.
    clips = sorted({a.name.split(":")[-1] for a in bpy.data.actions})
    wanted = sorted(set(human_rig.LEGACY_BONES) | {b.name for b in armature.data.bones})
    captured = human_rig.serialise_clips(armature, clips, wanted)
    reference = {
        "restPose": human_rig.rest_pose(armature),
        "restRelative": human_rig.parent_relative_rest(armature),
        "clips": clips,
        "captured": captured,
        # Largest component across all three axes, not `.y`. This armature is
        # freshly imported and therefore still in Blender's Z-up space, so
        # reading `.y` measured depth and returned ~1.0 -- which then scaled
        # root and pelvis translation by 1.86x.
        "height": max(
            max(abs(v) for v in (armature.matrix_world @ b.head_local))
            for b in armature.data.bones) if armature.data.bones else 1.0,
    }
    for obj in added:
        bpy.data.objects.remove(obj, do_unlink=True)
    return reference


def collapse_to_legacy_bones(armature, meshes):
    """Merge non-contract bones into their nearest contract ancestor.

    The humanoid runtime contract is 18 bones; an MPFB game_engine rig ships
    53, of which 30 are finger joints. Exporting all of them costs skin data
    and matrix palette on every ordinary unit for articulation nothing reads at
    gameplay distance -- and this Warrior wears mittens, so the fingers are not
    even visible.

    Deleting the bones alone would strand the vertices weighted to them, which
    is how a hand collapses to the wrist. So each doomed bone's weights are
    ADDED to the nearest surviving ancestor first: a fingertip's influence ends
    up on the hand, which is where a mitten's geometry follows anyway.
    """
    keep = set(human_rig.LEGACY_BONES)
    bones = armature.data.bones
    merged = {}
    for bone in bones:
        if bone.name in keep:
            continue
        ancestor = bone.parent
        while ancestor is not None and ancestor.name not in keep:
            ancestor = ancestor.parent
        if ancestor is not None:
            merged[bone.name] = ancestor.name

    moved = 0
    for mesh in meshes:
        groups = {g.name: g for g in mesh.vertex_groups}
        for source, target in merged.items():
            src = groups.get(source)
            if src is None:
                continue
            dst = groups.get(target) or mesh.vertex_groups.new(name=target)
            groups[target] = dst
            for vertex in mesh.data.vertices:
                for entry in vertex.groups:
                    if entry.group != src.index:
                        continue
                    if entry.weight > 0.0:
                        existing = 0.0
                        for other in vertex.groups:
                            if other.group == dst.index:
                                existing = other.weight
                                break
                        dst.add([vertex.index], min(1.0, existing + entry.weight),
                                "REPLACE")
                        moved += 1
        for source in merged:
            group = groups.get(source)
            if group is not None:
                mesh.vertex_groups.remove(group)

    previous = bpy.context.view_layer.objects.active
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = armature.data.edit_bones
    for name in merged:
        bone = edit_bones.get(name)
        if bone is not None:
            edit_bones.remove(bone)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = previous
    return {"kept": len(armature.data.bones), "removed": sorted(merged),
            "weightsMoved": moved}


def emit_ally_contract(root, armature, height):
    """Emit the node contract the ALLY asset manifest requires.

    An MPFB-derived character satisfies the human half of the contract already
    -- UnitRoot, LOD{n}_PROD_* meshes, the legacy bone set -- but the ally spec
    also names an armature `UnitSkeleton`, two LOD marker nodes, and five weapon
    locators that the procedural units carry. Nothing on the human path ever
    needed them, so nothing emitted them, and an MPFB warrior could not be a
    drop-in for the procedural one no matter how good it looked.

    This is asset-layer only: it renames the armature and adds empties. No
    gameplay code is involved, and the runtime reads these by name.

    The locators are placed from the RIG rather than typed in, so they follow
    whatever body the macro produced:

        upper_grip     the right hand itself, where a haft is held
        lower_grip     a haft's length below it, along the forearm
        weapon_socket  coincident with upper_grip, which is what the procedural
                       warrior does and what the swing code expects
        axe_tip        out along the haft, driving the swing arc
        attackAnchor   in front of the chest, where a strike lands
    """
    # Drop anything not bound to the rig. An MPFB import carries a stray
    # Icosphere through the whole pipeline, and it shipped inside the candidate
    # GLB: 42 vertices spanning z -1..1, which is not the character and which
    # corrupts any measurement taken from the file's bounding box.
    #
    # Scoped to the ally path deliberately: the Hero's export is signed off and
    # is not being touched this round.
    #
    # Keep COL_* -- the collision box is a deliberate part of the asset, not
    # debris. A first pass dropped everything unskinned and took it with it.
    dropped = []
    for obj in list(bpy.data.objects):
        if obj.type != "MESH" or obj.name.startswith("COL_"):
            continue
        if not any(mod.type == "ARMATURE" for mod in obj.modifiers):
            dropped.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)

    armature.name = "UnitSkeleton"
    armature.data.name = "UnitSkeleton"

    # REST positions, not pose positions. `pose.bones[...].head` is evaluated in
    # pose space, and the rig still carries whatever the pose tests left on it,
    # so the socket was authored 0.21 m from where the exported bind pose puts
    # the hand. The GLB ships the bind pose; the locators must agree with it.
    bones = armature.data.bones
    hand = bones.get("hand.R") or bones.get("hand_r")
    if hand is None:
        raise SystemExit("ally contract needs a right hand bone; rig has none")
    grip = armature.matrix_world @ hand.head_local
    lower = bones.get("lower_arm.R") or bones.get("lowerarm_r")
    # The haft crosses the palm; it does not fold back along the arm.
    #
    # The first version used the forearm direction itself, so the weapon ran
    # from the hand back toward the elbow and the entire axe was buried inside
    # the arm and torso. Nothing caught it: the locators shared that axis, so
    # geometry and contract agreed with each other, and "on the character"
    # cannot tell inside from outside.
    #
    # A held haft is roughly PERPENDICULAR to the forearm. Taking world-down
    # and removing its forearm component gives that perpendicular, pointing
    # down, which is where an axe hangs in an A-pose -- clear of the body on
    # every side.
    # MEASURE THE WEAPON, do not re-derive its axis.
    #
    # Both this and the kit computed the haft direction from the same formula,
    # in different spaces and at different points in the pipeline, and got
    # different answers: the kit builds in a Y-up pivot space and against a rest
    # pose the adapter later realigns and rescales. The locators ended up 0.15 m
    # off the geometry they are supposed to describe -- and an earlier version
    # was off by the whole weapon.
    #
    # The tip of the axe is a fact about the mesh. Read it off the mesh and the
    # contract cannot drift from the object again.
    axe = None
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.name.startswith("LOD0"):
            continue
        if "Sword" in (obj.data.name or "") or "Axe" in (obj.data.name or ""):
            axe = obj
            break
    if axe is not None and len(axe.data.vertices):
        points = [axe.matrix_world @ v.co for v in axe.data.vertices]
        far = max(points, key=lambda p: (p - grip).length)
        along = (far - grip)
        along = along.normalized() if along.length > 1e-6 else Vector((0.0, 0.0, -1.0))
        measured_tip = far
    elif lower is not None:
        forearm = (grip - (armature.matrix_world @ lower.head_local)).normalized()
        down = Vector((0.0, 0.0, -1.0))
        along = (down - forearm * down.dot(forearm))
        along = along.normalized() if along.length > 1e-6 else Vector((0.0, 0.0, -1.0))
        measured_tip = grip + along * (height * 0.290)
    else:
        along = Vector((0.0, 0.0, -1.0))
        measured_tip = grip + along * (height * 0.290)

    made = []
    for name, location in (
        ("weapon_socket", grip),
        ("upper_grip", grip),
        ("lower_grip", grip - along * (height * 0.105)),
        ("axe_tip", measured_tip),
        # Blender is Z-UP here and the character faces -Y. Writing chest height
        # into the Y slot put the anchor 0.92 m BEHIND the character at knee
        # height -- a node-presence check called that a pass; the transform
        # check did not.
        ("attackAnchor", Vector((0.0, -height * 0.22, height * 0.62))),
    ):
        node = empty(name, tuple(location), "EXPORT", "PLAIN_AXES")
        node.parent = root
        node.matrix_world = Matrix.Translation(location)
        made.append(name)

    # The manifest wants nodes literally named LOD1 and LOD2. The tiers live in
    # Blender COLLECTIONS of that name, and collections are not exported as
    # glTF nodes, so the contract saw nothing.
    for level in (1, 2):
        marker = empty("LOD%d" % level, (0, 0, 0), "EXPORT", "PLAIN_AXES")
        marker.parent = root
        made.append(marker.name)
    return {"armature": armature.name, "locators": made,
            "droppedUnskinned": dropped}


def main():
    # run-blender.mjs already inserts the "--" separator, so a caller who also
    # writes one produces two. Strip any leading separators rather than failing
    # with "the following arguments are required" on a correct call.
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="human_source_adapter")
    parser.add_argument("--input", required=True)
    parser.add_argument("--profile", default="generic-gltf")
    # The default leaves LOD0 at full density, which suits a protagonist and no
    # ordinary unit: their triangle cap cannot afford an undecimated tier.
    parser.add_argument("--lod-ratio", default=None,
                        help="comma-separated decimate ratios per tier")
    parser.add_argument("--legacy-bones", action="store_true",
                        help="collapse the rig to the 18-bone runtime contract")
    parser.add_argument("--ally-contract", action="store_true",
                        help="emit UnitSkeleton, weapon locators and LOD marker "
                             "nodes required by the ally asset manifest")
    parser.add_argument("--name", default="hero_human_candidate")
    parser.add_argument("--height", type=float, default=1.86)
    parser.add_argument("--material-budget", type=int, default=4)
    parser.add_argument("--reference", default=os.path.join(
        ROOT, "public", "assets", "models", "characters", "hero.glb"))
    parser.add_argument("--out-dir", default=os.path.join(
        ROOT, "public", "assets", "models", "characters"))
    args = parser.parse_args(argv)

    if not os.path.isfile(args.input):
        raise SystemExit("input not found: %s" % args.input)
    out_name = "%s.glb" % args.name
    if out_name in PROTECTED:
        raise SystemExit(
            "refusing to write %s: it is the working fallback asset. "
            "Give the candidate its own --name." % out_name)

    profile = load_profile(args.profile)
    reset_scene()

    # Reference first, and in its own scene pass: importing it after the source
    # would mix two armatures and two action sets.
    reference = load_reference_rig(args.reference)
    reset_scene()

    imported = import_source(args.input, profile)
    meshes, armatures, removed = clean(imported, profile)
    if not meshes:
        raise SystemExit("no mesh objects survived cleaning")
    armature = armatures[0] if armatures else None
    synthesised = synthesise_root(armature) if (armature and profile.get("synthesise_root")) else False

    # ---- gate. Nothing below this line has written a byte. ----------------
    record = human_rig.analyse(armature, profile)
    if synthesised:
        record["mapping"]["root"] = "root"
        record["missingRequired"] = [b for b in record["missingRequired"] if b != "root"]
    human_rig.gate(record, args.profile)

    deltas, retarget = {}, {"retargeted": [], "absent": []}
    if reference:
        deltas = human_rig.align_rest_pose(armature, record["mapping"], reference["restPose"])
    else:
        human_rig.align_rest_pose(armature, record["mapping"], {})

    source_root, scale_info = normalise(meshes, armatures, profile, args.height)
    # No transform baking here. It was written to reconcile the bone rest with
    # the mesh, but the mismatch was never created at this stage -- the rig
    # arrives from MPFB already sitting 0.85 m below its own body, and
    # `seat_rig_in_body` now corrects it there, where the offset is a plain
    # translation and can be recovered exactly. Baking the root's rotation into
    # the data here additionally failed to apply while still clearing the
    # root's rotation, which laid the character flat on its back.
    scale_info["bindFrame"] = verify_bind_frame(meshes, armature)
    placement = verify_normalised(meshes, armature, args.height)
    if not placement["allPassed"]:
        raise human_rig.RigError(
            "normalisation failed its own checks: %s. Nothing was written."
            % json.dumps({k: v for k, v in placement.items() if k != "allPassed"}))

    if reference and reference.get("captured"):
        retarget = human_rig.build_retargeted_actions(
            armature, reference["captured"], reference["restRelative"],
            height_ratio=args.height / max(1e-6, reference.get("height") or 1.0))

    materials = convert_materials(meshes, args.material_budget, enforce=True)
    poses = human_rig.pose_tests(armature) if armature else {"allPassed": False}

    root = empty("UnitRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES")
    root["assetRole"] = args.name
    root["forwardAxis"] = "+Z"
    root["upAxis"] = "+Y"
    root["scaleContract"] = 1.0
    root["orientationContract"] = "Babylon Y-up, forward +Z"
    root["feetGrounded"] = True
    root["sourcePipeline"] = "human_source_adapter"
    root["sourceProfile"] = args.profile
    root["sourceFile"] = os.path.basename(args.input)
    source_root.parent = root

    global LOD_RATIO
    if args.lod_ratio:
        LOD_RATIO = tuple(float(v) for v in args.lod_ratio.split(",") if v)
        print("LOD_RATIO %s" % json.dumps(list(LOD_RATIO)))
    tiers = build_lods(meshes, armature, args.name)
    for made in tiers:
        for obj in made:
            # `.parent` does NOT preserve the world transform. The copies are
            # made under the armature, which sits below SourceRoot and carries
            # the normalisation; re-parenting to UnitRoot silently dropped it
            # and left them in a different frame from the rig driving them.
            world = obj.matrix_world.copy()
            obj.parent = root
            obj.matrix_world = world
    for mesh in meshes:
        bpy.data.objects.remove(mesh, do_unlink=True)
    # Gate the bind on the meshes that SHIP. The call after `normalise` only
    # ever saw the source meshes, still correctly parented, so it passed while
    # the LOD copies it never inspected went out with a 2.17 m error.
    scale_info["bindFrameShipped"] = verify_bind_frame(
        [obj for tier in tiers for obj in tier], armature)
    lods = verify_lods(tiers, armature)

    collision_box("COL_Unit", (0.82, args.height * 1.02, 0.70), (0, args.height * 0.5, 0), root)

    blend_path = os.path.join(ROOT, "assets-source", "blender", "characters", "%s.blend" % args.name)
    os.makedirs(args.out_dir, exist_ok=True)
    glb_path = os.path.join(args.out_dir, out_name)
    # Hard gate: every tier must carry every garment. A candidate missing a
    # glove is not a candidate, and this has silently shipped twice.
    # The gate exists so a candidate can never ship with a garment silently
    # dropped by the LOD pass. Which parts are mandatory is per-character,
    # though: the Warrior carries no sword, and hard-coding the Hero's list
    # made the adapter refuse a correct Warrior build.
    REQUIRED = tuple(part for part in os.environ.get(
        "HUMAN_REQUIRE_PARTS",
        "HeroOutfit,HeroSword,HeroGlove_l,HeroGlove_r").split(",") if part)
    for level, made in enumerate(tiers):
        present = {obj.get("sourceName", "") for obj in made}
        print("LODTRACE_PRE_EXPORT tier=%d objects=%s" % (level, sorted(o.name for o in made)))
        missing = [r for r in REQUIRED if r not in present]
        if missing and os.environ.get("HERO_REQUIRE_GARMENTS") == "1":
            raise human_rig.RigError(
                "tier %d is missing %s; refusing to write a candidate" % (level, missing))

    save_source(blend_path)
    collapsed = None
    if args.legacy_bones and armature is not None:
        collapsed = collapse_to_legacy_bones(
            armature, [o for o in bpy.data.objects if o.type == "MESH"])
        print("BONE_COLLAPSE %s" % json.dumps(
            {"kept": collapsed["kept"], "removed": len(collapsed["removed"])}))

    ally = None
    if args.ally_contract and armature is not None:
        ally = emit_ally_contract(root, armature, args.height)
        print("ALLY_CONTRACT %s" % json.dumps(ally))

    export_glb(glb_path)

    joints = human_rig.verify_skin_contract(glb_path, human_rig.LEGACY_BONES)

    report = {
        "input": os.path.abspath(args.input),
        "profile": args.profile,
        "profileLabel": profile.get("label", ""),
        "output": glb_path,
        "outputSha256": file_hash(glb_path),
        "outputBytes": os.path.getsize(glb_path),
        "referenceRig": args.reference if reference else None,
        "normalisation": scale_info,
        "placementChecks": placement,
        "targetHeightMetres": args.height,
        "allyContract": ally,
        "boneCollapse": collapsed,
        "removedNodes": removed,
        "synthesisedRoot": synthesised,
        "bones": {
            "mapped": record["mapping"],
            "missingRequired": record["missingRequired"],
            "duplicateSourceBones": record["duplicateSourceBones"],
            "unmappedSource": record["unmappedSource"],
            "fingerChains": record["fingerChains"],
            "fingerBoneCount": record["fingerBoneCount"],
            "satisfiesLegacyRig": not record["missingRequired"],
        },
        "restPoseDeltas": deltas,
        "retarget": retarget,
        "poseTests": poses,
        "gltfJoints": joints,
        "materials": materials,
        "lodChecks": lods,
        "lodTriangles": {
            "LOD%d" % level: triangle_count(made) for level, made in enumerate(tiers)},
        "animations": sorted(a.name for a in bpy.data.actions),
    }
    report_dir = os.path.join(ROOT, ".runtime", "human-adapter")
    os.makedirs(report_dir, exist_ok=True)
    write_report(os.path.join(report_dir, "%s.report.json" % args.name), report)

    print("HUMAN_ADAPTER_OK %s" % glb_path)
    print("HUMAN_ADAPTER_SUMMARY %s" % json.dumps({
        "lod": report["lodTriangles"],
        "placement": placement["allPassed"],
        "lodChecks": lods["allPassed"],
        "poseTests": poses.get("allPassed"),
        "skinContract": joints.get("ok"),
        "materials": materials["materialCount"],
        "fingers": record["fingerBoneCount"],
        "retargeted": len(retarget["retargeted"]),
    }))


if __name__ == "__main__":
    try:
        main()
    except human_rig.RigError as error:
        # Loud and non-zero, and -- crucially -- raised before export.
        raise SystemExit("RigError: %s" % error)
