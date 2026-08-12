"""Generate male and female MPFB human bases as separate real bodies.

The gender variants are produced from MPFB's own macro targets, not by
scaling one mesh. That distinction is the whole point: a female base built by
narrowing a male mesh has a male skull, male hands and a male ribcage, and it
reads as exactly that at any distance where a face is visible.

    node scripts/run-blender.mjs scripts/blender/mpfb_human_variants.py -- \
        --variant male --name hero_male_base

Writes .runtime/mpfb/variants/<name>.{glb,json}. Nothing enters the game asset
tree; the adapter takes it from here.

Skin: the official MakeHuman system-asset pack is not required to *see* the
body. When no `.mhmat` skin is installed, this falls back to MPFB's own
procedural v2 skin material, which is generated from the bundled node trees
rather than from a downloaded asset. The provenance record says which of the
two was used, because "official CC0 skin" and "procedural stand-in" are
different claims and only one of them survives review.
"""
import argparse
import hashlib
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# Sibling modules are not importable without this; the face map failed
# with `No module named 'hero_face'` and the surrounding except turned
# that into a silent downgrade to flat skin.
sys.path.append(HERE)
import hero_face  # noqa: E402
OUT = os.path.join(ROOT, ".runtime", "mpfb", "variants")
RIG_NAME = "game_engine"

# Macro settings per variant. Deliberately conservative on both sides: these
# are winter survivors in heavy clothing, not heroic-fantasy body types.
# `gender` is the macro that actually drives skull, shoulder girdle, ribcage,
# pelvis and hand proportion, so it is the one doing the real work here.
VARIANTS = {
    "male": {
        "gender": 0.92,
        "age": 0.52,
        "muscle": 0.56,
        "weight": 0.52,
        "height": 0.60,
        "proportions": 0.55,
        "cupsize": 0.0,
        "firmness": 0.5,
    },
    # A rank-and-file melee soldier, not the protagonist. Heavier, older and
    # broader than the Hero on purpose: the two share a base mesh and a rig, so
    # the silhouette has to come from build and kit or they read as the same
    # person in different coats. Shorter and thicker-set reads as infantry
    # beside the Hero's taller, leaner outline at gameplay distance.
    "warrior": {
        "gender": 0.95,
        "age": 0.62,
        "muscle": 0.74,
        "weight": 0.66,
        "height": 0.46,
        "proportions": 0.42,
        "cupsize": 0.0,
        "firmness": 0.6,
    },
    "female": {
        "gender": 0.08,
        "age": 0.50,
        "muscle": 0.50,
        "weight": 0.48,
        "height": 0.603,
        "proportions": 0.55,
        # Deliberately low and unremarkable. A combat character in a coat, and
        # nothing about the brief calls for more than that.
        "cupsize": 0.32,
        "firmness": 0.45,
    },
}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def strip_helper_geometry(basemesh):
    """DIAGNOSTIC ONLY -- superseded by ExportService. Kept as reference.

    Delete MakeHuman's helper cage instead of merely masking it.

    MPFB builds the base mesh with helper geometry -- the loose panels used to
    fit clothes, hair and proxies -- and `mask_helpers=True` hides it behind a
    Mask modifier. A Mask modifier is a viewport nicety: the glTF exporter
    walks the underlying mesh and ships every helper polygon. The first render
    of this candidate had the panels hanging over the face like a shroud.

    Deleting the vertices is used rather than applying the modifier, because
    applying it would require clearing shape keys first -- and the macro
    targets that make this body male or female ARE shape keys, so clearing
    them reverts the character to the neutral base.
    """
    removed = {"modifiers": [], "verticesBefore": len(basemesh.data.vertices)}
    groups = set()
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK" and modifier.vertex_group:
            groups.add(modifier.vertex_group)
            removed["modifiers"].append(modifier.name)
    # MPFB's mask keeps the BODY group, so the helpers are everything outside
    # it rather than a group of their own.
    keep_ids = {g.index for g in basemesh.vertex_groups if g.name in groups}
    if not keep_ids:
        removed["note"] = "no mask modifier with a vertex group; nothing removed"
        return removed

    doomed = [v.index for v in basemesh.data.vertices
              if not any(g.group in keep_ids and g.weight > 0.0 for g in v.groups)]
    if not doomed:
        removed["note"] = "mask group already covers every vertex"
        return removed

    import bmesh
    mesh = bmesh.new()
    mesh.from_mesh(basemesh.data)
    mesh.verts.ensure_lookup_table()
    bmesh.ops.delete(mesh, geom=[mesh.verts[i] for i in doomed], context="VERTS")
    mesh.to_mesh(basemesh.data)
    mesh.free()
    basemesh.data.update()
    for modifier in list(basemesh.modifiers):
        if modifier.type == "MASK":
            basemesh.modifiers.remove(modifier)
    removed["verticesRemoved"] = len(doomed)
    removed["verticesAfter"] = len(basemesh.data.vertices)
    return removed


def bake_skin_pbr(material, roughness=0.62, specular=0.28):
    """Give the skin material PBR values glTF can actually export.

    MPFB's v2 skin drives its look through a node group. glTF has no such
    concept: the exporter reads a Principled BSDF and writes baseColorFactor,
    metallic and roughness. With the group in place and the Principled node
    untouched, the export came out with an EMPTY baseColorFactor -- white --
    and roughness 0.2.

    MPFB knows what colour the skin is (`get_skin_diffuse_color`), so that is
    used rather than a typed-in tone: a different macro or a future installed
    skin will move it. Roughness is set for skin rather than left at the
    node group's default, because 0.2 is wet plastic.
    """
    from bl_ext.blender_org.mpfb.services.materialservice import MaterialService

    if material is None or not material.use_nodes:
        return {"applied": False, "reason": "no node-based material"}
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    added = False
    if bsdf is None:
        # MPFB's v2 skin wires a custom node group straight to the output, with
        # no Principled node anywhere. glTF cannot represent that group, so the
        # export came out with an empty baseColorFactor -- white -- at
        # roughness 0.2, which is WORSE than the flat fallback it replaced
        # (that one at least exported a real skin tone).
        #
        # So the group is replaced, for export purposes, by a Principled node
        # carrying MPFB's own diffuse colour. The v2 look cannot survive glTF
        # by any route; what can survive is a correct base colour, roughness
        # and metallic, and that is what the runtime actually shades with.
        output = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
        if output is None:
            return {"applied": False, "reason": "material has no output node"}
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.location = (output.location.x - 300, output.location.y)
        for link in list(tree.links):
            if link.to_node is output and link.to_socket.name == "Surface":
                tree.links.remove(link)
        tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        added = True
    try:
        diffuse = list(MaterialService.get_skin_diffuse_color())
    except Exception:  # noqa: BLE001
        diffuse = [0.76, 0.58, 0.47]
    while len(diffuse) < 4:
        diffuse.append(1.0)
    bsdf.inputs["Base Color"].default_value = tuple(diffuse[:4])
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0
    # Skin is dielectric with a soft sheen; the clamp matters because a PBR
    # metal has no diffuse and blowing out specular is how the earlier review
    # renders lost the face.
    for name in ("Specular IOR Level", "Specular"):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = specular
            break
    return {"applied": True, "baseColor": [round(v, 4) for v in diffuse[:3]],
            "roughness": roughness, "principledAdded": added}


def apply_skin(basemesh):
    """Official core skin when installed, MPFB's procedural skin otherwise."""
    from bl_ext.blender_org.mpfb.services.assetservice import AssetService
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.materialservice import MaterialService

    record = {"requested": "official core skin"}
    try:
        skins = AssetService.get_asset_list("skins", "mhmat") or {}
    except Exception as error:  # noqa: BLE001
        skins = {}
        record["assetListError"] = str(error)[:160]
    record["installedSkinCount"] = len(skins)

    if skins:
        # Prefer a plainly-named core skin over anything decorative.
        name = sorted(skins)[0]
        entry = skins[name]
        path = entry.get("full_path") if isinstance(entry, dict) else entry
        try:
            HumanService.set_character_skin(path, basemesh)
            record.update({"source": "official-core", "skin": name, "path": str(path)})
            return record
        except Exception as error:  # noqa: BLE001
            record["officialSkinError"] = str(error)[:160]

    try:
        # (name, blender_object) -- NOT (blender_object, name).
        #
        # The arguments were the other way round, so MPFB took the mesh as the
        # material name and the string "skin" as the object, then reached for
        # `"skin".data`. That surfaced as
        # `proceduralError: 'str' object has no attribute 'data'` in the
        # provenance record and dropped every build to the flat fallback --
        # which is why the Hero has been a single untextured colour all along.
        material = MaterialService.create_v2_skin_material("skin", basemesh)
        record.update({"source": "mpfb-procedural-v2",
                       "note": "official system-asset pack not installed; procedural stand-in"})
        # MPFB's v2 skin is a node group, and glTF can only carry what a
        # Principled BSDF exposes. Exported as-is it produced
        # `baseColorFactor: []` -- i.e. white -- with roughness 0.2, so the
        # Hero would have rendered as a shiny white mannequin: worse than the
        # flat skin tone it replaced. Write MPFB's own diffuse colour and a
        # skin-appropriate roughness into the Principled node so the exporter
        # has real numbers to bake.
        record["pbrBake"] = bake_skin_pbr(material)
        # Face. The head's UVs are scattered across the whole layout, so this
        # paints by 3D anatomy and inverts the unwrap rather than drawing into
        # a rectangle. See hero_face.py.
        diffuse = record["pbrBake"].get("baseColor") or [0.76, 0.58, 0.47]
        image, face_record = hero_face.build(basemesh, None, diffuse)
        record["face"] = face_record
        if image is not None:
            hero_face.attach(material, image)
    except Exception as error:  # noqa: BLE001
        record["proceduralError"] = str(error)[:160]
        material = bpy.data.materials.new("HumanSkinFallback")
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (0.76, 0.58, 0.47, 1.0)
            bsdf.inputs["Roughness"].default_value = 0.62
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = 0.0
        basemesh.data.materials.append(material)
        record.update({"source": "flat-fallback", "note": "MPFB procedural skin unavailable"})
    return record



STAGES = []


def _worst_growth(basemesh, armature, bone_name, angle=35.0):
    """Max edge growth under a single-bone rotation, plus the worst weights.

    The same measurement `hero_deform_diagnostic.py` runs on the shipped GLB,
    so a stage here is directly comparable to the finished file.
    """
    import math
    from mathutils import Matrix

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def evaluated():
        obj = basemesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = obj.to_mesh()
        out = [v.co.copy() for v in mesh.vertices]
        obj.to_mesh_clear()
        return out

    if armature is None:
        return {"note": "no armature at this stage", "maxGrowthMetres": None}
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        return {"note": "bone %s absent" % bone_name, "maxGrowthMetres": None}

    for pose_bone in armature.pose.bones:
        pose_bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    rest = evaluated()

    bone.rotation_mode = "XYZ"
    bone.rotation_euler = (math.radians(angle), 0.0, 0.0)
    bpy.context.view_layer.update()
    posed = evaluated()
    bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()

    if len(posed) != len(rest):
        return {"note": "topology changed under evaluation", "maxGrowthMetres": None}

    names = {g.index: g.name for g in basemesh.vertex_groups}
    best = (0.0, None, None)
    for edge in basemesh.data.edges:
        a, b = edge.vertices
        if a >= len(rest) or b >= len(rest):
            continue
        base = (rest[a] - rest[b]).length
        if base < 1e-6:
            continue
        grew = (posed[a] - posed[b]).length - base
        if grew > best[0]:
            best = (grew, a, b)

    def weights(index):
        if index is None or index >= len(basemesh.data.vertices):
            return []
        pairs = sorted(((names.get(g.group, "?"), round(g.weight, 4))
                        for g in basemesh.data.vertices[index].groups),
                       key=lambda item: -item[1])[:4]
        return [list(pair) for pair in pairs]

    return {
        "bone": bone_name,
        "maxGrowthMetres": round(best[0], 5),
        "worstEdge": [best[1], best[2]],
        "v0Weights": weights(best[1]),
        "v1Weights": weights(best[2]),
    }


def probe_stage(stage, basemesh, armature):
    """Record the body's skinning state at one point in the build."""
    if os.environ.get("HERO_BODY_STAGES") != "1":
        return
    from mathutils import Vector

    entry = {
        "stage": stage,
        "vertices": len(basemesh.data.vertices),
        "shapeKeys": (len(basemesh.data.shape_keys.key_blocks)
                      if basemesh.data.shape_keys else 0),
        "bodyMatrixWorld": [round(v, 5) for row in basemesh.matrix_world for v in row],
        "armatureModifier": next((m.object.name for m in basemesh.modifiers
                                  if m.type == "ARMATURE" and m.object), None),
    }
    if armature is not None:
        entry["armatureMatrixWorld"] = [round(v, 5) for row in armature.matrix_world
                                        for v in row]
        entry["bones"] = {}
        for name in ("upperarm_r", "lowerarm_r"):
            bone = armature.data.bones.get(name)
            if bone is None:
                continue
            head = armature.matrix_world @ bone.head_local
            tail = armature.matrix_world @ bone.tail_local
            entry["bones"][name] = {
                "head": [round(c, 5) for c in head],
                "tail": [round(c, 5) for c in tail],
            }
            # Where the vertices this bone owns actually sit, against where the
            # bone thinks it is. A rig fitted to a different shape than the one
            # the vertices ended up in shows here as a growing distance.
            group = basemesh.vertex_groups.get(name)
            if group is not None:
                owned = [basemesh.matrix_world @ v.co
                         for v in basemesh.data.vertices
                         if any(g.group == group.index and g.weight > 0.5
                                for g in v.groups)]
                if owned:
                    centroid = sum(owned, Vector((0.0, 0.0, 0.0))) / len(owned)
                    entry["bones"][name]["ownedVertices"] = len(owned)
                    entry["bones"][name]["centroid"] = [round(c, 5) for c in centroid]
                    entry["bones"][name]["centroidToHead"] = round(
                        (centroid - head).length, 5)
        entry["deformation"] = {name: _worst_growth(basemesh, armature, name)
                                for name in ("upperarm_r", "lowerarm_r")}
    STAGES.append(entry)
    growth = entry.get("deformation", {})
    print("BODYSTAGE %s verts=%d keys=%d armMod=%s upper=%s lower=%s" % (
        stage, entry["vertices"], entry["shapeKeys"], entry["armatureModifier"],
        growth.get("upperarm_r", {}).get("maxGrowthMetres"),
        growth.get("lowerarm_r", {}).get("maxGrowthMetres")))


def seat_rig_in_body(basemesh, armature, tolerance=0.05):
    """Move the rig onto the flesh it is supposed to drive.

    `create_human(feet_on_ground=True)` puts the mesh's feet at z=0; the rig
    that `add_builtin_rig` fits afterwards comes back centred on the origin
    instead. The result is an armature translated roughly half a body height
    below its own body:

        mesh   z  0.000 .. 1.835
        bones  z -0.809 .. 0.697

    Nothing downstream notices, because skinning is v' = M * B^-1 * v and at
    rest M = B, so every vertex returns to itself no matter where B is. The
    static renders are correct, the triangle budget passes, the pose test
    passes -- and then every rotation pivots the mesh about a point a metre
    away and multiplies its displacement. Measured on the shipped candidate: a
    vertex weighted 0.98 to lower_arm.R moved 2.32 m while lower_arm.R itself
    moved 0.36 m.

    The error is a pure translation, so it is recoverable exactly: for each
    deform bone, compare its head against the centroid of the vertices it
    owns, and take the MEDIAN of those differences. A median ignores the bones
    whose centroid legitimately sits away from the head (the head bone points
    up through the skull, the pelvis sits inside the hips) and locks onto the
    offset they all share. Weights are addressed by group name and are not
    touched, so re-binding is unnecessary.
    """
    from mathutils import Vector

    names = {g.index: g.name for g in basemesh.vertex_groups}
    owned = {}
    for vertex in basemesh.data.vertices:
        for group in vertex.groups:
            name = names.get(group.group)
            if name and group.weight > 0.5:
                owned.setdefault(name, []).append(basemesh.matrix_world @ vertex.co)

    deltas = []
    for bone in armature.data.bones:
        points = owned.get(bone.name)
        if not points or len(points) < 8:
            continue
        centroid = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
        deltas.append(centroid - (armature.matrix_world @ bone.head_local))
    if len(deltas) < 4:
        return {"seated": False, "reason": "only %d usable bones" % len(deltas)}

    offset = Vector(tuple(
        sorted(d[axis] for d in deltas)[len(deltas) // 2] for axis in range(3)))
    if offset.length < tolerance:
        return {"seated": False, "offset": [round(v, 4) for v in offset],
                "reason": "already seated"}

    previous = bpy.context.view_layer.objects.active
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.mode_set(mode="EDIT")
    local = armature.matrix_world.inverted().to_3x3() @ offset
    for bone in armature.data.edit_bones:
        bone.head = bone.head + local
        bone.tail = bone.tail + local
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.objects.active = previous
    bpy.context.view_layer.update()

    after = []
    for bone in armature.data.bones:
        points = owned.get(bone.name)
        if not points or len(points) < 8:
            continue
        centroid = sum(points, Vector((0.0, 0.0, 0.0))) / len(points)
        after.append(round((centroid - (armature.matrix_world @ bone.head_local)).length, 4))
    after.sort()
    return {"seated": True, "offset": [round(v, 4) for v in offset],
            "bones": len(deltas),
            "medianBoneToFlesh": after[len(after) // 2] if after else None,
            "maxBoneToFlesh": after[-1] if after else None}


def smooth_body_weights(basemesh, armature, passes=6, floor=1e-3, max_influences=4):
    """Remove the weight discontinuities MPFB's builtin rig leaves on the body.

    Measured, not assumed. The stage probe puts the body at 0.117 m / 0.212 m
    of edge growth under a single 35 deg arm rotation the instant
    `add_builtin_rig` runs, and every later stage -- bake, helper strip,
    export, re-import -- reproduces that number exactly. So it is neither the
    shape-key bake order nor the glTF skin: it is the weighting itself.

    For scale, the project's own authored hero.glb scores 0.013 m and 0.026 m
    on the identical test, with neighbouring vertices reading 0.84/0.16 and
    0.74/0.26. The MPFB body has 0.6141/0.3859 sitting next to 0.9935/0.0065 --
    adjacent vertices assigned almost entirely to different bones, which is a
    tear waiting for the first pose.

    This does not re-author the weights or invent new influences; it averages
    each vertex's weight vector with its edge neighbours, which is the same
    correction already proven on the coat (0.70 m -> 0.12 m). Run AFTER the
    helper cage is stripped so the cage cannot drag the body's values around.
    """
    deform = {b.name for b in armature.data.bones if b.use_deform}
    names = {g.index: g.name for g in basemesh.vertex_groups}
    sampled = []
    for vertex in basemesh.data.vertices:
        sampled.append({names[g.group]: g.weight for g in vertex.groups
                        if names.get(g.group) in deform and g.weight > 0.0})

    adjacency = [[] for _ in basemesh.data.vertices]
    for edge in basemesh.data.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)

    for _pass in range(passes):
        updated = []
        for index, blended in enumerate(sampled):
            neighbours = adjacency[index]
            if not neighbours:
                updated.append(dict(blended))
                continue
            share = 1.0 / (len(neighbours) + 1.0)
            merged = {n: w * share for n, w in blended.items()}
            for other in neighbours:
                for name, weight in sampled[other].items():
                    merged[name] = merged.get(name, 0.0) + weight * share
            updated.append(merged)
        sampled = updated

    groups = {name: basemesh.vertex_groups[name] for name in deform
              if name in basemesh.vertex_groups}
    for index, blended in enumerate(sampled):
        ranked = [(n, w) for n, w in
                  sorted(blended.items(), key=lambda item: -item[1])[:max_influences]
                  if w > floor]
        total = sum(w for _n, w in ranked)
        if total <= 1e-6:
            continue
        keep = {n for n, _w in ranked}
        for name, group in groups.items():
            if name not in keep:
                group.remove([index])
        for name, weight in ranked:
            groups[name].add([index], weight / total, "REPLACE")
    bpy.context.view_layer.update()
    return {"passes": passes, "deformBones": len(deform),
            "vertices": len(basemesh.data.vertices)}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=sorted(VARIANTS), required=True)
    parser.add_argument("--name", default=None)
    args = parser.parse_args(argv)
    name = args.name or ("%s_base" % args.variant)

    from bl_ext.blender_org.mpfb.services.exportservice import ExportService
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    macro = TargetService.get_default_macro_info_dict()
    macro.update(VARIANTS[args.variant])
    basemesh = HumanService.create_human(
        mask_helpers=True, detailed_helpers=False, extra_vertex_groups=True,
        feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    probe_stage("A_create_human", basemesh, None)
    armature = HumanService.add_builtin_rig(basemesh, RIG_NAME)
    if armature is None:
        armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature produced for %s" % args.variant)

    # Before any measurement: the rig comes back centred on the origin
    # while the mesh stands on the floor. Everything after this reads the
    # rest pose, so it has to be right here or not at all.
    seated = seat_rig_in_body(basemesh, armature)
    print("SEAT_RIG %s" % json.dumps(seated))
    probe_stage("B_after_rig", basemesh, armature)

    skin = apply_skin(basemesh)

    # Bake the macro into the geometry, then remove the helper cage.
    #
    # This is the fix for a real defect, not tidiness. MPFB applies the macro
    # targets -- the things that make this body male or female -- as SHAPE
    # KEYS. Any downstream step that clears shape keys throws the character
    # away and leaves the neutral base, and the adapter does exactly that
    # before decimating, because Decimate refuses to run on a mesh that has
    # them. The result rendered as a female body under a male asset name with
    # every structural check green.
    #
    # MPFB's own `ExportService.bake_modifiers_remove_helpers` is the intended
    # route and is preferred, but it drives `bpy.ops.mesh.*`, whose poll fails
    # under `--background` where there is no screen or area to run in. So the
    # bake is done through the data API instead: collapse the current mix into
    # a new basis and drop every key, after which the shape keys are no longer
    # load-bearing and anything downstream may clear them harmlessly.
    baked = {"method": "shape-key mix baked to basis (data API)"}
    if basemesh.data.shape_keys:
        baked["keysBefore"] = len(basemesh.data.shape_keys.key_blocks)
        mixed = basemesh.shape_key_add(name="__baked__", from_mix=True)
        # Write the mixed result into the mesh itself, then drop every key in
        # one call. Removing them one by one re-evaluates the remaining stack
        # after each removal and raises "ShapeKey not found" partway through.
        for vertex, point in zip(basemesh.data.vertices, mixed.data):
            vertex.co = point.co
        basemesh.shape_key_clear()
        baked["keysAfter"] = 0 if basemesh.data.shape_keys is None else len(
            basemesh.data.shape_keys.key_blocks)
    else:
        baked["keysBefore"] = 0
        baked["keysAfter"] = 0

    probe_stage("C_after_bake", basemesh, armature)

    helpers = strip_helper_geometry(basemesh)
    helpers["bake"] = baked
    bpy.context.view_layer.update()

    probe_stage("D_after_strip_helpers", basemesh, armature)
    helpers["weightSmoothing"] = smooth_body_weights(basemesh, armature)
    probe_stage("D2_after_weight_smoothing", basemesh, armature)
    probe_stage("E_before_export", basemesh, armature)

    os.makedirs(OUT, exist_ok=True)
    glb = os.path.join(OUT, "%s.glb" % name)
    # Delete the target first, then record what was actually written.
    #
    # `--variant male` with no `--name` writes male_base.glb, not
    # hero_male_base.glb. A whole round was spent concluding that weight
    # smoothing "did not survive export" because the smoothed run wrote one
    # file and the measurement read another, five hours stale, sitting right
    # beside it. A stale read is indistinguishable from a broken write unless
    # the writer proves the bytes are new.
    if os.path.exists(glb):
        os.remove(glb)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              export_skins=True, export_yup=True)
    if not os.path.exists(glb):
        raise SystemExit("export wrote nothing to %s" % glb)
    written = {
        "path": os.path.relpath(glb, ROOT).replace("\\", "/"),
        "bytes": os.path.getsize(glb),
        "mtime": os.path.getmtime(glb),
        "sha256": sha256(glb),
    }
    print("EXPORT_WROTE %s" % json.dumps(written))

    bones = [b.name for b in armature.data.bones]
    lo = [1e9] * 3
    hi = [-1e9] * 3
    from mathutils import Vector
    for corner in basemesh.bound_box:
        world = basemesh.matrix_world @ Vector(corner)
        lo = [min(lo[i], world[i]) for i in range(3)]
        hi = [max(hi[i], world[i]) for i in range(3)]

    report = {
        "variant": args.variant,
        "name": name,
        "blenderVersion": bpy.app.version_string,
        "mpfbVersion": "2.0.17",
        "rig": RIG_NAME,
        "macroConfiguration": macro,
        "skin": skin,
        "helperGeometry": helpers,
        "boneCount": len(bones),
        "fingerBones": len([b for b in bones if any(
            d in b.lower() for d in ("thumb", "index", "middle", "ring", "pinky"))]),
        "triangles": sum(max(0, len(p.vertices) - 2) for p in basemesh.data.polygons),
        "vertexCount": len(basemesh.data.vertices),
        "materialCount": len([s for s in basemesh.material_slots if s.material]),
        "materialNames": [s.material.name for s in basemesh.material_slots if s.material],
        "heightMetres": round(hi[2] - lo[2], 4),
        "glb": glb,
        "glbBytes": os.path.getsize(glb),
        "glbSha256": sha256(glb),
        "provenance": {
            "body": "MPFB 2.0.17 official core base mesh + macro targets (CC0)",
            "rig": "MPFB standard rig: %s (CC0)" % RIG_NAME,
            "skin": skin.get("source"),
            "contributedAssets": "none",
        },
    }
    with open(os.path.join(OUT, "%s.json" % name), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("MPFB_VARIANT_OK %s" % json.dumps({
        "variant": args.variant, "name": name, "bones": report["boneCount"],
        "fingers": report["fingerBones"], "tris": report["triangles"],
        "materials": report["materialCount"], "skin": skin.get("source"),
        "height": report["heightMetres"], "bytes": report["glbBytes"]}))


if __name__ == "__main__":
    main()
