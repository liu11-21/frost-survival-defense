"""Render controlled Hero joint-deformation poses for R4-C review."""

import json
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from render_hero_r4_review import _setup_scene, render_view


def _arg(name, default):
    if name not in sys.argv:
        return default
    index = sys.argv.index(name)
    return sys.argv[index + 1] if index + 1 < len(sys.argv) else default


def _reset_pose(armature):
    # The source file keeps the seven gameplay clips in muted-by-default NLA
    # tracks.  Mute them explicitly for this review so the hand-authored
    # stress poses below are not overwritten when Blender evaluates a frame.
    if armature.animation_data:
        armature.animation_data.use_nla = False
        for track in armature.animation_data.nla_tracks:
            track.mute = True
            for strip in track.strips:
                strip.mute = True
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        # HeroRoot is an export-space object correction, while the rig's
        # root bone carries the authored Y-up -> Z-up bind orientation.  Keep
        # that reference quarter-turn when evaluating standalone poses.
        bone.rotation_euler = (math.pi / 2.0, 0.0, 0.0) if bone.name == "root" else (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
        bone.location = (0.0, 0.0, 0.0)


def _pose(armature, rotations):
    _reset_pose(armature)
    for name, values in rotations.items():
        bone = armature.pose.bones.get(name)
        if bone:
            bone.rotation_euler = values


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r4", "R4-C")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _setup_scene(clay=True)
    armature = bpy.data.objects.get("HeroSkeleton")
    if armature is None:
        raise RuntimeError("HeroSkeleton is missing from the source blend")

    poses = {
        "pose-t": {},
        "pose-arms-forward": {
            "upper_arm.L": (0.0, 0.0, -0.55),
            "upper_arm.R": (0.0, 0.0, 0.55),
            "lower_arm.L": (0.0, 0.0, -0.35),
            "lower_arm.R": (0.0, 0.0, 0.35),
        },
        "pose-arms-up": {
            "upper_arm.L": (0.0, 0.0, -2.0),
            "upper_arm.R": (0.0, 0.0, 2.0),
            "lower_arm.L": (0.0, 0.0, -0.7),
            "lower_arm.R": (0.0, 0.0, 0.7),
        },
        "pose-elbow-90": {
            "upper_arm.L": (0.0, 0.0, -1.05),
            "upper_arm.R": (0.0, 0.0, 1.05),
            "lower_arm.L": (0.0, 0.0, 1.35),
            "lower_arm.R": (0.0, 0.0, -1.35),
        },
        "pose-knee-bend": {
            "thigh.L": (0.0, 0.0, -0.55),
            "shin.L": (0.0, 0.0, 1.05),
            "thigh.R": (0.0, 0.0, 0.35),
            "shin.R": (0.0, 0.0, -0.45),
        },
        "pose-walk-stride": {
            "upper_arm.L": (0.0, 0.0, 0.55),
            "upper_arm.R": (0.0, 0.0, -0.55),
            "thigh.L": (0.0, 0.0, -0.65),
            "thigh.R": (0.0, 0.0, 0.65),
            "shin.L": (0.0, 0.0, 0.35),
            "shin.R": (0.0, 0.0, -0.35),
        },
        "pose-melee": {
            "chest": (0.0, 0.0, -0.24),
            "upper_arm.R": (0.0, 0.0, 1.55),
            "lower_arm.R": (0.0, 0.0, -0.85),
            "hand.R": (0.0, 0.0, -0.35),
            "upper_arm.L": (0.0, 0.0, -0.55),
        },
        "pose-ranged": {
            "chest": (0.0, 0.0, -0.12),
            "upper_arm.R": (0.0, 0.0, 1.35),
            "upper_arm.L": (0.0, 0.0, -0.92),
            "lower_arm.L": (0.0, 0.0, -0.42),
            "lower_arm.R": (0.0, 0.0, 0.22),
            "head": (0.0, 0.0, -0.12),
        },
        "pose-death": {
            "root": (0.0, 0.0, 0.35),
            "chest": (0.0, 0.0, 0.38),
            "upper_arm.L": (0.0, 0.0, 0.85),
            "upper_arm.R": (0.0, 0.0, 0.85),
            "thigh.L": (0.0, 0.0, -0.3),
            "thigh.R": (0.0, 0.0, 0.55),
        },
    }
    manifest = {"stage": "R4-C", "source": "Blender clay/topology review", "poses": []}
    for index, (name, rotations) in enumerate(poses.items()):
        _pose(armature, rotations)
        scene.frame_set(1)
        bpy.context.view_layer.update()
        location = (4.2, 4.2, 1.35) if index else (0.0, 5.6, 1.15)
        target = (0.0, 0.0, 1.12)
        render_view(scene, camera, output_dir, name, location, target=target, lens=58)
        manifest["poses"].append({"name": name, "rotatedBones": sorted(rotations), "image": f"{name}.png"})
    with open(os.path.join(output_dir, "deformation-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
    print(f"R4-C deformation renders written to {output_dir}")


if __name__ == "__main__":
    main()
