"""Render the R5-A Hero proportions as black silhouette review plates.

This is an evidence-only renderer. It opens the freshly authored Hero blend,
shows LOD0, assigns a flat black material to the visible Hero meshes, and
renders fixed front/side/back/three-quarter/gameplay views. It does not save
or modify the source asset.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from render_hero_r4_review import _arg, _setup_scene, _look_at


def _black_material():
    material = bpy.data.materials.get("R5_Silhouette_Black") or bpy.data.materials.new("R5_Silhouette_Black")
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (0.002, 0.003, 0.005, 1.0)
        shader.inputs["Roughness"].default_value = 1.0
        shader.inputs["Metallic"].default_value = 0.0
        if shader.inputs.get("Emission Color"):
            shader.inputs["Emission Color"].default_value = (0.0, 0.0, 0.0, 1.0)
        if shader.inputs.get("Emission Strength"):
            shader.inputs["Emission Strength"].default_value = 0.0
    material.diffuse_color = (0.002, 0.003, 0.005, 1.0)
    return material


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
    scene, camera = _setup_scene(clay=True, neutralize=False)
    scene.frame_set(1)
    scene.world.color = (0.86, 0.89, 0.94)
    scene.view_settings.look = "AgX - Medium High Contrast"
    black = _black_material()
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            if obj.name.lower().startswith("r4reviewground"):
                continue
            if obj.name == "Cube" and obj.parent is None:
                obj.hide_render = True
                continue
            name = obj.name.lower()
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_") or name.startswith("col_")
            if not obj.hide_render:
                obj.data.materials.clear()
                obj.data.materials.append(black)
        elif obj.name in {"LOD1", "LOD2", "COL_Hero"}:
            obj.hide_render = True
    ground = next((obj for obj in bpy.data.objects if obj.name.lower().startswith("r4reviewground")), None)
    if ground:
        ground_material = bpy.data.materials.get("R5_Silhouette_Ground") or bpy.data.materials.new("R5_Silhouette_Ground")
        ground_material.diffuse_color = (0.78, 0.83, 0.91, 1.0)
        ground_material.use_nodes = True
        shader = ground_material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.78, 0.83, 0.91, 1.0)
            shader.inputs["Roughness"].default_value = 0.95
        ground.data.materials.clear()
        ground.data.materials.append(ground_material)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    return scene, camera


def _render(scene, camera, output_dir, name, location, target=(0.0, 0.0, 1.15), lens=58):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r5", "R5-A")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    views = [
        ("silhouette-front", (0.0, 5.6, 1.15), (0.0, 0.0, 1.15), 58),
        ("silhouette-side", (5.6, 0.0, 1.15), (0.0, 0.0, 1.15), 58),
        ("silhouette-back", (0.0, -5.6, 1.15), (0.0, 0.0, 1.15), 58),
        ("silhouette-three-quarter", (4.4, 4.4, 1.25), (0.0, 0.0, 1.10), 58),
        ("silhouette-gameplay", (4.8, 6.2, 2.35), (0.0, 0.0, 1.0), 52),
    ]
    manifest = {"stage": "R5-A", "kind": "black-silhouette", "views": []}
    for name, location, target, lens in views:
        manifest["views"].append({"name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})
    with open(os.path.join(output_dir, "silhouette-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R5-A silhouette renders written to {output_dir}")


if __name__ == "__main__":
    main()
