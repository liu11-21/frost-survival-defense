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

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
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
    "female": {
        "gender": 0.08,
        "age": 0.50,
        "muscle": 0.50,
        "weight": 0.48,
        "height": 0.50,
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
        MaterialService.create_v2_skin_material(basemesh, "skin")
        record.update({"source": "mpfb-procedural-v2",
                       "note": "official system-asset pack not installed; procedural stand-in"})
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
    armature = HumanService.add_builtin_rig(basemesh, RIG_NAME)
    if armature is None:
        armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature produced for %s" % args.variant)

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

    helpers = strip_helper_geometry(basemesh)
    helpers["bake"] = baked
    bpy.context.view_layer.update()

    os.makedirs(OUT, exist_ok=True)
    glb = os.path.join(OUT, "%s.glb" % name)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              export_skins=True, export_yup=True)

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
