"""Render R6-B compact carbine and existing-skeleton grip evidence."""

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
    scene.world.color = (0.028, 0.038, 0.065)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            name = obj.name.lower()
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_") or name.startswith("col_")
    if silhouette:
        material = bpy.data.materials.new("R6_WeaponSilhouette")
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.004, 0.008, 0.014, 1.0)
            shader.inputs["Roughness"].default_value = 0.98
        for obj in bpy.data.objects:
            if obj.type == "MESH" and not obj.hide_render and not obj.name.lower().startswith("r4review"):
                obj.data.materials.clear()
                obj.data.materials.append(material)
        scene.world.color = (0.18, 0.22, 0.28)
    return scene, camera, skeleton


def _evaluate_clip(scene, skeleton, clip_name, frame):
    if skeleton is None or skeleton.animation_data is None:
        raise RuntimeError("HeroSkeleton has no animation data")
    selected = None
    for track in skeleton.animation_data.nla_tracks:
        track.mute = track.name != clip_name
        if track.name == clip_name:
            selected = track
    if selected is None or not selected.strips:
        raise RuntimeError(f"Missing Hero animation track: {clip_name}")
    skeleton.animation_data.action = None
    scene.frame_set(1)
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    return selected.strips[0]


def _render(scene, camera, output_dir, name, location, target=(0.0, 0.0, 1.10), lens=58):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r6", "R6-B")))
    os.makedirs(output_dir, exist_ok=True)
    manifest = {"stage": "R6-B", "iteration": 1, "source": "assets-source/blender/characters/hero.blend", "views": []}

    scene, camera, skeleton = _prepare(clay=True)
    for name, location, target, lens in [
        ("weapon-clay-front", (0.0, 5.3, 1.2), (0, 0, 1.08), 60),
        ("weapon-clay-side", (5.3, 0.0, 1.2), (0, 0, 1.08), 60),
        ("weapon-clay-three-quarter", (3.9, 3.9, 1.35), (0, 0, 1.08), 60),
    ]:
        manifest["views"].append({"name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})

    scene, camera, skeleton = _prepare(clay=False, silhouette=True)
    manifest["views"].append({"name": "weapon-black-silhouette", "file": _render(scene, camera, output_dir, "weapon-black-silhouette", (3.4, 4.6, 1.30), (0, 0, 1.08), 64)})

    scene, camera, skeleton = _prepare(clay=False)
    pose_views = [
        ("idle-carry", "Idle", 1, (3.8, 4.8, 1.35), (0, 0, 1.08), 62),
        ("walk-carry", "Walk", 8, (3.8, 4.8, 1.35), (0, 0, 1.08), 62),
        ("ranged-aim", "RangedAttack", 7, (3.8, 4.8, 1.35), (0, 0, 1.08), 62),
        ("ranged-fire", "RangedAttack", 11, (3.8, 4.8, 1.35), (0, 0, 1.08), 62),
        ("ranged-recoil", "RangedAttack", 12, (3.8, 4.8, 1.35), (0, 0, 1.08), 62),
        ("gameplay-ranged", "RangedAttack", 7, (4.8, 6.2, 2.35), (0, 0, 1.0), 52),
    ]
    for name, clip, frame, location, target, lens in pose_views:
        _evaluate_clip(scene, skeleton, clip, frame)
        manifest["views"].append({"name": name, "clip": clip, "frame": frame, "file": _render(scene, camera, output_dir, name, location, target, lens)})

    with open(os.path.join(output_dir, "weapon-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R6-B weapon renders written to {output_dir}")


if __name__ == "__main__":
    main()
