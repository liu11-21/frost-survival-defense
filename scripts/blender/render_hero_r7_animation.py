"""Render deterministic R7-D key-pose evidence from the existing Hero clips.

This is an evidence-only Blender renderer. It evaluates the authored NLA clips
at fixed normalized timeline values and never edits or saves the source blend.
The Babylon test performs the same normalized samples at runtime.
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
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    return scene, camera, skeleton


def _evaluate_clip(scene, skeleton, clip_name, normalized):
    if skeleton is None or skeleton.animation_data is None:
        raise RuntimeError("HeroSkeleton has no animation data")
    selected = None
    for track in skeleton.animation_data.nla_tracks:
        track.mute = track.name != clip_name
        if track.name == clip_name:
            selected = track
    if selected is None or not selected.strips:
        raise RuntimeError(f"Missing Hero animation track: {clip_name}")
    strip = selected.strips[0]
    frame = strip.frame_start + max(0.0, min(1.0, normalized)) * max(1.0, strip.frame_end - strip.frame_start)
    skeleton.animation_data.action = None
    scene.frame_set(1)
    scene.frame_set(int(round(frame)))
    bpy.context.view_layer.update()
    return strip, frame


def _render(scene, camera, output_dir, name):
    camera.location = (4.4, 4.4, 1.30)
    camera.data.lens = 58
    _look_at(camera, (0.0, 0.0, 1.10))
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r7", "R7-D")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera, skeleton = _prepare_scene()
    poses = [
        ("MeleeAttack", 0.00, "melee-start"),
        ("MeleeAttack", 0.20, "melee-windup"),
        ("MeleeAttack", 0.40, "melee-swing"),
        ("MeleeAttack", 0.55, "melee-impact"),
        ("MeleeAttack", 0.80, "melee-recover"),
        ("RangedAttack", 0.00, "ranged-low-ready"),
        ("RangedAttack", 0.20, "ranged-raise"),
        ("RangedAttack", 0.40, "ranged-aim"),
        ("RangedAttack", 0.60, "ranged-fire"),
        ("RangedAttack", 0.70, "ranged-recoil"),
        ("RangedAttack", 0.90, "ranged-recover"),
        ("Walk", 0.40, "walk-carry"),
        ("Run", 0.40, "run-carry"),
        ("Death", 1.00, "death-grounded"),
    ]
    manifest = {
        "stage": "R7-D",
        "kind": "deterministic-normalized-animation-key-pose-review",
        "source": "assets-source/blender/characters/hero.blend",
        "normalizedTimeline": [0, 0.2, 0.4, 0.6, 0.8, 1],
        "clips": [],
    }
    for clip_name, normalized, output_name in poses:
        strip, frame = _evaluate_clip(scene, skeleton, clip_name, normalized)
        manifest["clips"].append({
            "name": output_name,
            "clip": clip_name,
            "normalized": normalized,
            "frame": frame,
            "stripStart": strip.frame_start,
            "stripEnd": strip.frame_end,
            "file": _render(scene, camera, output_dir, output_name),
        })
    with open(os.path.join(output_dir, "animation-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R7-D deterministic animation key-pose renders written to {output_dir}")


if __name__ == "__main__":
    main()
