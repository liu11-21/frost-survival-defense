"""Render R6-D Hero combat-pose evidence from the existing seven clips.

Evidence-only renderer. It evaluates the current source blend's existing NLA
tracks and writes fixed key poses; it does not create actions, change assets,
or save the source blend.
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
        ground_material = bpy.data.materials.get("R6D_AnimationGround") or bpy.data.materials.new("R6D_AnimationGround")
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


def _render(scene, camera, output_dir, name):
    camera.location = (4.4, 4.4, 1.30)
    camera.data.lens = 58
    _look_at(camera, (0.0, 0.0, 1.10))
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r6", "R6-D")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera, skeleton = _prepare_scene()
    poses = [
        ("MeleeAttack", 1, "melee-start"),
        ("MeleeAttack", 4, "melee-windup"),
        ("MeleeAttack", 7, "melee-swing"),
        ("MeleeAttack", 9, "melee-impact"),
        ("MeleeAttack", 13, "melee-recover"),
        ("RangedAttack", 1, "ranged-low-ready"),
        ("RangedAttack", 4, "ranged-raise"),
        ("RangedAttack", 7, "ranged-aim"),
        ("RangedAttack", 10, "ranged-fire"),
        ("RangedAttack", 11, "ranged-recoil"),
        ("RangedAttack", 14, "ranged-recover"),
        ("Walk", 8, "walk-carry"),
        ("Run", 6, "run-carry"),
        ("Death", 16, "death-grounded"),
    ]
    manifest = {
        "stage": "R6-D",
        "kind": "existing-clip-combat-pose-review",
        "source": "assets-source/blender/characters/hero.blend",
        "clips": [],
    }
    for clip_name, frame, output_name in poses:
        strip = _evaluate_clip(scene, skeleton, clip_name, frame)
        manifest["clips"].append({
            "name": output_name,
            "clip": clip_name,
            "frame": frame,
            "stripStart": strip.frame_start,
            "stripEnd": strip.frame_end,
            "file": _render(scene, camera, output_dir, output_name),
        })
    with open(os.path.join(output_dir, "animation-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R6-D animation key-pose renders written to {output_dir}")


if __name__ == "__main__":
    main()
