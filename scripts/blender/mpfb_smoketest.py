"""Generate a minimal male human with MPFB, headless, and report what it is.

This is an installation and scriptability test, not a Hero candidate. It
proves that MPFB's own Python API can build an official-core character from a
background Blender with no GUI, which is the whole reason MPFB was chosen over
the MakeHuman desktop application.

    node scripts/run-blender.mjs scripts/blender/mpfb_smoketest.py

Writes .runtime/mpfb/mpfb_smoketest.{blend,glb,json}. Nothing is written into
the game's asset tree and nothing here is wired into the game.

Official core assets only: the base mesh, targets and rig definitions that
ship inside the MPFB extension. No contributed clothes, hair or equipment.
"""
import hashlib
import json
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, ".runtime", "mpfb")

MPFB = "bl_ext.blender_org.mpfb"
# `default` rather than `game_engine`: it carries the full finger chains, toes
# and twist bones. The rig assessment for this project found that the missing
# clavicle, fingers, forearm twist and toes are exactly what make a mature
# base worth having, so the smoke test has to prove they survive.
RIG_NAME = "default"
# Adult male, medium build. Values run 0..1 with 0.5 neutral. The dict is
# built from MPFB's own defaults rather than written out here: it carries a
# nested `race` sub-dict, and a hand-written dict missing it raises KeyError
# deep inside target resolution.
MACRO_OVERRIDES = {
    "gender": 0.9,
    "age": 0.5,
    "muscle": 0.55,
    "weight": 0.5,
    "height": 0.6,
    "cupsize": 0.0,
    "firmness": 0.5,
}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    os.makedirs(OUT, exist_ok=True)
    from bl_ext.blender_org.mpfb.services.humanservice import HumanService
    from bl_ext.blender_org.mpfb.services.locationservice import LocationService
    from bl_ext.blender_org.mpfb.services.targetservice import TargetService

    macro = TargetService.get_default_macro_info_dict()
    macro.update(MACRO_OVERRIDES)

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    basemesh = HumanService.create_human(
        mask_helpers=True,
        detailed_helpers=False,
        extra_vertex_groups=True,
        feet_on_ground=True,
        scale=0.1,
        macro_detail_dict=macro,
    )
    report = {"baseMeshObject": basemesh.name, "macroDetail": macro, "rigRequested": RIG_NAME}

    # Rig. Signature differs across MPFB releases, so it is probed rather than
    # assumed -- an assumption here produces an unrigged mesh that still
    # exports and still looks fine in a triangle count.
    import inspect
    signature = str(inspect.signature(HumanService.add_builtin_rig))
    report["addBuiltinRigSignature"] = signature
    try:
        armature = HumanService.add_builtin_rig(basemesh, RIG_NAME)
    except TypeError:
        armature = HumanService.add_builtin_rig(basemesh, RIG_NAME, import_weights=True)
    if armature is None:
        armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("MPFB produced no armature for rig %r" % RIG_NAME)

    bpy.context.view_layer.update()

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bones = [b.name for b in armature.data.bones]
    lo = [1e9, 1e9, 1e9]
    hi = [-1e9, -1e9, -1e9]
    triangles = 0
    for mesh in meshes:
        for polygon in mesh.data.polygons:
            triangles += max(0, len(polygon.vertices) - 2)
        for corner in mesh.bound_box:
            world = mesh.matrix_world @ __import__("mathutils").Vector(corner)
            lo = [min(lo[i], world[i]) for i in range(3)]
            hi = [max(hi[i], world[i]) for i in range(3)]

    def count(token):
        return len([b for b in bones if token in b.lower()])

    blend_path = os.path.join(OUT, "mpfb_smoketest.blend")
    glb_path = os.path.join(OUT, "mpfb_smoketest.glb")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    bpy.ops.export_scene.gltf(
        filepath=glb_path, export_format="GLB", export_apply=False,
        export_skins=True, export_yup=True,
    )

    licence_path = os.path.join(OUT, "licence-hashes.json")
    licences = json.load(open(licence_path, encoding="utf-8")) if os.path.isfile(licence_path) else None

    report.update({
        "blenderVersion": bpy.app.version_string,
        "mpfbVersion": "2.0.17",
        "mpfbDataRoot": LocationService.get_mpfb_data(),
        "rigDefinition": "data/rigs/standard/rig.%s.json" % RIG_NAME,
        "armature": armature.name,
        "meshCount": len(meshes),
        "meshNames": sorted(m.name for m in meshes),
        "triangleCount": triangles,
        "materialCount": len({s.material.name for m in meshes for s in m.material_slots if s.material}),
        "imageCount": len(bpy.data.images),
        "boneCount": len(bones),
        "boneNames": bones,
        "boneGroups": {
            "fingers": count("finger") + count("thumb") + count("index")
                       + count("middle") + count("ring") + count("pinky"),
            "toes": count("toe"),
            "clavicle": count("clavicle") + count("shoulder"),
            "twist": count("twist"),
            "spine": count("spine"),
        },
        "shapeKeys": sorted({
            key.name for m in meshes if m.data.shape_keys
            for key in m.data.shape_keys.key_blocks}),
        "heightMetres": round(hi[2] - lo[2], 4),
        "boundingBox": {"min": [round(v, 4) for v in lo], "max": [round(v, 4) for v in hi]},
        "glbSha256": sha256(glb_path),
        "glbBytes": os.path.getsize(glb_path),
        "blendPath": blend_path,
        "glbPath": glb_path,
        "licence": {
            "codeLicence": "SPDX:GPL-3.0-or-later (MPFB add-on, per extensions.blender.org catalogue)",
            "assetNote": "Official MakeHuman core assets bundled inside the MPFB extension. "
                         "No third-party contributed packs were installed.",
            "installedLicenceFiles": (licences or {}).get("licenceFiles"),
        },
        "notAHeroCandidate": True,
    })

    with open(os.path.join(OUT, "mpfb_smoketest.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("MPFB_SMOKETEST_OK %s" % json.dumps({
        "bones": report["boneCount"],
        "groups": report["boneGroups"],
        "meshes": report["meshCount"],
        "triangles": report["triangleCount"],
        "height": report["heightMetres"],
        "shapeKeys": len(report["shapeKeys"]),
        "glbBytes": report["glbBytes"],
    }))
    if report["boneGroups"]["fingers"] < 20 or report["boneGroups"]["toes"] < 2:
        print("MPFB_SMOKETEST_RIG_INCOMPLETE fingers=%d toes=%d"
              % (report["boneGroups"]["fingers"], report["boneGroups"]["toes"]))
        sys.exit(1)


if __name__ == "__main__":
    main()
