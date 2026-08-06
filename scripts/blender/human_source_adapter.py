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
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import collision_box, empty, export_glb, reset_scene, save_source, collection  # noqa: E402

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
    removed = []
    for obj in list(objects):
        drop = obj.type in {"CAMERA", "LIGHT", "SPEAKER"}
        drop = drop or any(p.search(obj.name) for p in patterns)
        if drop:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    survivors = [o for o in objects if o.name not in removed]
    meshes = [o for o in survivors if o.type == "MESH"]
    armatures = [o for o in survivors if o.type == "ARMATURE"]
    return meshes, armatures, removed


# --- 3. bone mapping -------------------------------------------------------
def map_bones(armature, profile):
    """Rename the source's bones onto this project's names.

    A source bone is matched by the ordered candidate list in the profile, and
    the first hit wins. Anything unmatched is *reported*, never guessed: a rig
    whose pelvis did not map would still export, still pass a triangle budget,
    and animate as garbage.
    """
    if armature is None:
        return {}, list(REQUIRED_BONES), []
    strip = profile.get("strip_bone_prefix", [])
    for bone in armature.data.bones:
        for prefix in strip:
            if bone.name.startswith(prefix):
                bone.name = bone.name[len(prefix):]

    available = {b.name.lower(): b.name for b in armature.data.bones}
    mapping, missing = {}, []
    wanted = dict(profile.get("bones", {}))
    wanted.update(profile.get("optional_bones", {}))
    for target, candidates in wanted.items():
        hit = next((available[c.lower()] for c in candidates if c.lower() in available), None)
        if hit:
            mapping[target] = hit
        elif target in REQUIRED_BONES:
            missing.append(target)
    # Rename last, so a candidate list cannot match a bone this loop just
    # renamed on a previous iteration.
    for target, source in mapping.items():
        if source != target:
            armature.data.bones[source].name = target
    extra = [b.name for b in armature.data.bones if b.name not in mapping]
    return mapping, missing, extra


# --- 4. orientation, scale, grounding -------------------------------------
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
    for obj in objects:
        if obj.parent is None:
            obj.parent = root

    if profile.get("up_axis", "Y").upper() == "Z":
        root.rotation_euler[0] = -math.pi / 2
    if profile.get("forward_axis", "+Z") == "-Z":
        root.rotation_euler[1] += math.pi
    root.scale = (profile.get("unit_scale", 1.0),) * 3
    bpy.context.view_layer.update()

    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for mesh in meshes:
        for corner in mesh.bound_box:
            world = mesh.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], world[i]) for i in range(3)))
            hi = Vector((max(hi[i], world[i]) for i in range(3)))
    height = max(1e-6, hi[1] - lo[1])
    factor = target_height / height
    root.scale = tuple(s * factor for s in root.scale)
    bpy.context.view_layer.update()

    lo_y = min((mesh.matrix_world @ Vector(c))[1] for mesh in meshes for c in mesh.bound_box)
    cx = sum((mesh.matrix_world @ Vector(c))[0] for mesh in meshes for c in mesh.bound_box)
    cz = sum((mesh.matrix_world @ Vector(c))[2] for mesh in meshes for c in mesh.bound_box)
    n = len(meshes) * 8
    root.location = (root.location[0] - cx / n, root.location[1] - lo_y, root.location[2] - cz / n)
    bpy.context.view_layer.update()
    return root, {"sourceHeight": round(height, 4), "scaleFactor": round(factor, 5)}


# --- 5. materials ----------------------------------------------------------
def convert_materials(meshes, budget):
    """Force every material to a Babylon-loadable PBR metallic-roughness set.

    An imported character routinely arrives with a specular/glossiness stack,
    per-part materials for eyelashes and teeth, and image nodes Babylon's glTF
    loader will not follow. This keeps Base Color / Normal / Roughness /
    Metallic and drops everything else, then reports the count rather than
    silently exceeding the budget.
    """
    kept = {}
    for mesh in meshes:
        for slot in mesh.material_slots:
            mat = slot.material
            if mat is None or mat.name in kept:
                continue
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            bsdf = nodes.get("Principled BSDF")
            if bsdf is None:
                bsdf = nodes.new("ShaderNodeBsdfPrincipled")
                out = nodes.get("Material Output") or nodes.new("ShaderNodeOutputMaterial")
                mat.node_tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
            for name in ("Specular IOR Level", "Sheen Weight", "Coat Weight", "Transmission Weight"):
                if name in bsdf.inputs:
                    bsdf.inputs[name].default_value = 0.0
            kept[mat.name] = {
                "images": sorted({
                    n.image.name for n in nodes
                    if n.type == "TEX_IMAGE" and n.image is not None
                }),
            }
    return {
        "materials": sorted(kept),
        "materialCount": len(kept),
        "textures": sorted({img for v in kept.values() for img in v["images"]}),
        "withinBudget": len(kept) <= budget,
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
            if ratio < 1.0:
                mod = copy.modifiers.new("lod", "DECIMATE")
                mod.ratio = ratio
                bpy.context.view_layer.objects.active = copy
                bpy.ops.object.modifier_apply(modifier=mod.name)
            copy["lodLevel"] = level
            copy["authoredRole"] = "human_source_candidate"
            copy["weightedSkinning"] = bool(armature)
            made.append(copy)
        tiers.append(made)
    return tiers


def triangle_count(objects):
    total = 0
    for obj in objects:
        mesh = obj.data
        for polygon in mesh.polygons:
            total += max(0, len(polygon.vertices) - 2)
    return total


# --- 7. report -------------------------------------------------------------
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


def main():
    # run-blender.mjs already inserts the "--" separator, so a caller who
    # also writes one produces two. Strip any leading separators rather than
    # failing with "the following arguments are required" on a correct call.
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser(prog="human_source_adapter")
    parser.add_argument("--input", required=True)
    parser.add_argument("--profile", default="generic-gltf")
    parser.add_argument("--name", default="hero_human_candidate")
    parser.add_argument("--height", type=float, default=1.86)
    parser.add_argument("--material-budget", type=int, default=4)
    # Smoke runs write outside the shipped asset tree on purpose: a pipeline
    # rehearsal must not add a file that art:validate then has to explain.
    parser.add_argument("--out-dir", default=os.path.join(ROOT, "public", "assets", "models", "characters"))
    args = parser.parse_args(argv)

    if not os.path.isfile(args.input):
        raise SystemExit("input not found: %s" % args.input)
    out_name = "%s.glb" % args.name
    if out_name in PROTECTED:
        raise SystemExit(
            "refusing to write %s: it is the working fallback asset. "
            "Give the candidate its own --name." % out_name
        )

    profile = load_profile(args.profile)
    reset_scene()
    imported = import_source(args.input, profile)
    meshes, armatures, removed = clean(imported, profile)
    if not meshes:
        raise SystemExit("no mesh objects survived cleaning")
    armature = armatures[0] if armatures else None
    mapping, missing, extra = map_bones(armature, profile)
    source_root, scale_info = normalise(meshes, armatures, profile, args.height)
    materials = convert_materials(meshes, args.material_budget)

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

    tiers = build_lods(meshes, armature, args.name)
    for level, made in enumerate(tiers):
        for obj in made:
            obj.parent = root
    for mesh in meshes:
        bpy.data.objects.remove(mesh, do_unlink=True)

    collision_box("COL_Unit", (0.82, args.height * 1.02, 0.70), (0, args.height * 0.5, 0), root)

    blend_path = os.path.join(ROOT, "assets-source", "blender", "characters", "%s.blend" % args.name)
    os.makedirs(args.out_dir, exist_ok=True)
    glb_path = os.path.join(args.out_dir, out_name)
    save_source(blend_path)
    export_glb(glb_path)

    report = {
        "input": os.path.abspath(args.input),
        "profile": args.profile,
        "profileLabel": profile.get("label", ""),
        "output": glb_path,
        "outputSha256": file_hash(glb_path),
        "outputBytes": os.path.getsize(glb_path),
        "normalisation": scale_info,
        "targetHeightMetres": args.height,
        "removedNodes": removed,
        "bones": {
            "mapped": mapping,
            "missingRequired": missing,
            "unmapped": extra,
            "satisfiesLegacyRig": not missing,
        },
        "materials": materials,
        "lodTriangles": {
            "LOD%d" % level: triangle_count(made) for level, made in enumerate(tiers)
        },
        "animations": sorted(a.name for a in bpy.data.actions),
    }
    report_dir = os.path.join(ROOT, ".runtime", "human-adapter")
    os.makedirs(report_dir, exist_ok=True)
    write_report(os.path.join(report_dir, "%s.report.json" % args.name), report)

    print("HUMAN_ADAPTER_OK %s" % glb_path)
    print("HUMAN_ADAPTER_REPORT %s" % json.dumps(report["lodTriangles"]))
    if missing:
        # Loud, and non-zero, because an unmapped required bone means the
        # existing animation set cannot drive this asset at all.
        print("HUMAN_ADAPTER_MISSING_BONES %s" % ",".join(missing))
        raise SystemExit("required bones were not mapped: %s" % ", ".join(missing))


if __name__ == "__main__":
    main()
