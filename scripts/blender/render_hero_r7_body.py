"""Render R7-A body-language and silhouette evidence from the current Hero blend.

Evidence-only renderer: it opens the generated Hero source, hides lower LOD and
collision helpers, and never saves or mutates the production blend.
"""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from render_hero_r4_review import _arg, _look_at, _setup_scene


def _prepare(clay=False, silhouette=False):
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
    scene, camera = _setup_scene(clay=clay, neutralize=False)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            name = obj.name.lower()
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_") or name.startswith("col_")
        elif obj.name in {"LOD1", "LOD2", "COL_Hero"}:
            obj.hide_render = True
    if silhouette:
        material = bpy.data.materials.new("R7_Silhouette")
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.003, 0.006, 0.012, 1.0)
            shader.inputs["Roughness"].default_value = 0.98
            shader.inputs["Metallic"].default_value = 0.0
            shader.inputs["Emission Strength"].default_value = 0.0
        for obj in bpy.data.objects:
            if obj.type == "MESH" and not obj.hide_render:
                obj.data.materials.clear()
                obj.data.materials.append(material)
        scene.world.color = (0.16, 0.20, 0.28)
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
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r7", "R7-A")))
    os.makedirs(output_dir, exist_ok=True)
    views = [
        ("clay-front", (0.0, 5.6, 1.15), (0.0, 0.0, 1.10), 58, True, False),
        ("clay-side", (5.6, 0.0, 1.15), (0.0, 0.0, 1.10), 58, True, False),
        ("clay-back", (0.0, -5.6, 1.15), (0.0, 0.0, 1.10), 58, True, False),
        ("clay-three-quarter", (4.4, 4.4, 1.25), (0.0, 0.0, 1.08), 58, True, False),
        ("clay-close-up", (3.0, 3.8, 1.72), (0.0, 0.0, 1.38), 72, True, False),
        ("silhouette-front", (0.0, 5.6, 1.15), (0.0, 0.0, 1.10), 58, False, True),
        ("silhouette-side", (5.6, 0.0, 1.15), (0.0, 0.0, 1.10), 58, False, True),
        ("silhouette-back", (0.0, -5.6, 1.15), (0.0, 0.0, 1.10), 58, False, True),
        ("silhouette-three-quarter", (4.4, 4.4, 1.25), (0.0, 0.0, 1.08), 58, False, True),
        ("gameplay-distance", (4.8, 6.2, 2.35), (0.0, 0.0, 1.0), 52, False, False),
    ]
    manifest = {
        "stage": "R7-A",
        "kind": "body-language-clay-and-silhouette",
        "source": "assets-source/blender/characters/hero.blend",
        "method": "existing authored ring profiles; no new render meshes, bones or materials",
        "views": [],
    }
    for name, location, target, lens, clay, silhouette in views:
        scene, camera = _prepare(clay=clay, silhouette=silhouette)
        manifest["views"].append({"name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})
    with open(os.path.join(output_dir, "body-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R7-A body renders written to {output_dir}")


if __name__ == "__main__":
    main()
