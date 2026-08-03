"""Render R5-D Hero weapon and socket review plates."""

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
    scene.world.color = (0.035, 0.050, 0.080)
    scene.view_settings.look = "AgX - Medium High Contrast"
    ground = next((obj for obj in bpy.data.objects if obj.name.lower().startswith("r4reviewground")), None)
    if ground:
        material = bpy.data.materials.get("R5_Weapons_Ground") or bpy.data.materials.new("R5_Weapons_Ground")
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.105, 0.135, 0.19, 1.0)
            shader.inputs["Roughness"].default_value = 0.92
        ground.data.materials.clear()
        ground.data.materials.append(material)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    return scene, camera


def _set_lod(level):
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.lower()
        if obj.name == "Cube" and obj.parent is None:
            obj.hide_render = True
            continue
        if name.startswith("col_"):
            obj.hide_render = True
        elif level == 0:
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_")
        elif level == 1:
            obj.hide_render = not name.startswith("lod1_")
        else:
            obj.hide_render = not name.startswith("lod2_")
    for marker in ("LOD1", "LOD2", "COL_Hero"):
        obj = bpy.data.objects.get(marker)
        if obj:
            obj.hide_render = level == 0 or (marker == "LOD1" and level != 1) or (marker == "LOD2" and level != 2) or marker == "COL_Hero"


def _render(scene, camera, output_dir, name, location, target, lens, level=0):
    _set_lod(level)
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r5", "R5-D")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    views = [
        ("weapons-front", (0.0, 5.3, 1.20), (0.0, 0.0, 1.05), 60, 0),
        ("weapons-side", (5.3, 0.0, 1.20), (0.0, 0.0, 1.05), 60, 0),
        ("weapons-three-quarter", (3.9, 3.9, 1.35), (0.0, 0.0, 1.05), 60, 0),
        ("weapons-back", (0.0, -5.3, 1.20), (0.0, 0.0, 1.05), 60, 0),
        ("weapons-ranged", (3.2, -4.0, 1.35), (0.0, 0.0, 1.10), 68, 0),
        ("weapons-close-up", (2.3, 3.0, 1.45), (0.26, 0.0, 1.12), 78, 0),
        ("weapons-lod1", (0.0, 5.3, 1.20), (0.0, 0.0, 1.05), 60, 1),
        ("weapons-lod2", (0.0, 5.3, 1.20), (0.0, 0.0, 1.05), 60, 2),
    ]
    manifest = {"stage": "R5-D", "kind": "weapon-silhouette-and-socket", "source": "assets-source/blender/characters/hero.blend", "views": []}
    for name, location, target, lens, level in views:
        manifest["views"].append({"name": name, "lod": level, "file": _render(scene, camera, output_dir, name, location, target, lens, level)})
    with open(os.path.join(output_dir, "weapons-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R5-D weapon renders written to {output_dir}")


if __name__ == "__main__":
    main()
