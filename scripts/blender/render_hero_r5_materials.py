"""Render the R5-E Hero production material and atlas review plates.

Evidence-only renderer: it opens the shipped Hero source blend, keeps the
existing four materials and one embedded atlas, hides non-LOD0/collision
geometry, and writes fixed views for human inspection.  It never saves the
source blend or changes the shipped GLB.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from render_hero_r4_review import _arg, _setup_scene, _look_at


def _prepare_scene():
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    bpy.ops.wm.open_mainfile(filepath=source)
    skeleton = bpy.data.objects.get("HeroSkeleton")
    if skeleton:
        if skeleton.animation_data:
            skeleton.animation_data.action = None
            for track in skeleton.animation_data.nla_tracks:
                track.mute = True
        for pose_bone in skeleton.pose.bones:
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = (0.0, 0.0, 0.0)
            pose_bone.location = (0.0, 0.0, 0.0)
            pose_bone.scale = (1.0, 1.0, 1.0)
    scene, camera = _setup_scene(clay=False, neutralize=False)
    scene.frame_set(1)
    scene.world.color = (0.028, 0.038, 0.065)
    scene.view_settings.look = "AgX - Medium High Contrast"
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            name = obj.name.lower()
            if obj.name == "Cube" and obj.parent is None:
                obj.hide_render = True
                continue
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_") or name.startswith("col_")
        elif obj.name in {"LOD1", "LOD2", "COL_Hero"}:
            obj.hide_render = True
    ground = next((obj for obj in bpy.data.objects if obj.name.lower().startswith("r4reviewground")), None)
    if ground:
        ground_material = bpy.data.materials.get("R5_Materials_Ground") or bpy.data.materials.new("R5_Materials_Ground")
        ground_material.use_nodes = True
        shader = ground_material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.075, 0.10, 0.15, 1.0)
            shader.inputs["Roughness"].default_value = 0.94
        ground_material.diffuse_color = (0.075, 0.10, 0.15, 1.0)
        ground.data.materials.clear()
        ground.data.materials.append(ground_material)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    return scene, camera


def _render(scene, camera, output_dir, name, location, target, lens):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r5", "R5-E")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    views = [
        ("materials-front", (0.0, 5.6, 1.18), (0.0, 0.0, 1.15), 58),
        ("materials-side", (5.6, 0.0, 1.18), (0.0, 0.0, 1.15), 58),
        ("materials-back", (0.0, -5.6, 1.18), (0.0, 0.0, 1.15), 58),
        ("materials-three-quarter", (4.4, 4.4, 1.28), (0.0, 0.0, 1.10), 58),
        ("materials-close-up", (2.25, 3.0, 1.72), (0.0, 0.0, 1.38), 72),
    ]
    material_names = [
        material.name
        for material in bpy.data.materials
        if material.name.startswith("MAT_hero_")
    ]
    atlas = bpy.data.images.get("HERO_ATLAS_1024")
    manifest = {
        "stage": "R5-E",
        "kind": "production-material-atlas",
        "source": "assets-source/blender/characters/hero.blend",
        "materials": material_names,
        "atlas": {"name": atlas.name, "resolution": list(atlas.size)} if atlas else None,
        "views": [],
    }
    for name, location, target, lens in views:
        manifest["views"].append({"name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})
    with open(os.path.join(output_dir, "materials-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R5-E material/atlas renders written to {output_dir}")


if __name__ == "__main__":
    main()
