"""Render the R5-C expedition helmet identity review plates.

Evidence-only Blender render.  It keeps the authored Hero materials, renders
the helmet at three production LOD tiers, and never saves the source blend.
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
    scene.world.color = (0.035, 0.050, 0.080)
    scene.view_settings.look = "AgX - Medium High Contrast"
    ground = next((obj for obj in bpy.data.objects if obj.name.lower().startswith("r4reviewground")), None)
    if ground:
        material = bpy.data.materials.get("R5_Helmet_Ground") or bpy.data.materials.new("R5_Helmet_Ground")
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
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r5", "R5-C")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    views = [
        ("helmet-front", (0.0, 5.0, 1.85), (0.0, 0.0, 1.84), 70, 0),
        ("helmet-side", (5.0, 0.0, 1.85), (0.0, 0.0, 1.84), 70, 0),
        ("helmet-three-quarter", (3.5, 3.5, 1.90), (0.0, 0.0, 1.82), 68, 0),
        ("helmet-close-up", (1.65, 2.25, 1.92), (0.0, 0.0, 1.82), 82, 0),
        ("helmet-lod1", (0.0, 5.4, 1.25), (0.0, 0.0, 1.18), 58, 1),
        ("helmet-lod2", (0.0, 5.4, 1.25), (0.0, 0.0, 1.18), 58, 2),
    ]
    manifest = {"stage": "R5-C", "kind": "expedition-helmet-identity", "source": "assets-source/blender/characters/hero.blend", "views": []}
    for name, location, target, lens, level in views:
        manifest["views"].append({"name": name, "lod": level, "file": _render(scene, camera, output_dir, name, location, target, lens, level)})
    with open(os.path.join(output_dir, "helmet-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R5-C helmet renders written to {output_dir}")


if __name__ == "__main__":
    main()
