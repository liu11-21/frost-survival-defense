"""Render fixed key poses from the seven authored Hero animation clips.

Evidence-only renderer.  It opens the current source blend, evaluates one
existing NLA clip at a time, and writes stills for human comparison.  It does
not create actions, change geometry/materials, or save the source asset.
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
        # The source blend is saved after the last authored clip is created,
        # so its pose bones can otherwise retain the Death key pose.  Reset
        # only the review scene state; never write this change back to source.
        for pose_bone in skeleton.pose.bones:
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = (0.0, 0.0, 0.0)
            pose_bone.location = (0.0, 0.0, 0.0)
            pose_bone.scale = (1.0, 1.0, 1.0)
    scene, camera = _setup_scene(clay=False, neutralize=False)
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
        ground_material = bpy.data.materials.get("R5_Animation_Ground") or bpy.data.materials.new("R5_Animation_Ground")
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


def _render(scene, camera, output_dir, name, location, target, lens):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r5", "R5-F")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera, skeleton = _prepare_scene()
    clips = [
        ("Idle", 8, "animation-idle"),
        ("Walk", 8, "animation-walk"),
        ("Run", 6, "animation-run"),
        ("MeleeAttack", 9, "animation-melee"),
        ("RangedAttack", 7, "animation-ranged"),
        ("Hit", 6, "animation-hit"),
        ("Death", 16, "animation-death"),
    ]
    manifest = {
        "stage": "R5-F",
        "kind": "authored-animation-key-poses",
        "source": "assets-source/blender/characters/hero.blend",
        "clips": [],
    }
    for clip_name, frame, output_name in clips:
        strip = _evaluate_clip(scene, skeleton, clip_name, frame)
        file_path = _render(scene, camera, output_dir, output_name, (4.4, 4.4, 1.30), (0.0, 0.0, 1.10), 58)
        manifest["clips"].append({
            "name": clip_name,
            "frame": frame,
            "stripStart": strip.frame_start,
            "stripEnd": strip.frame_end,
            "file": file_path,
        })
    with open(os.path.join(output_dir, "animation-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R5-F animation key-pose renders written to {output_dir}")


if __name__ == "__main__":
    main()
