"""Render R6-C surface and lighting review plates.

This renderer is evidence-only. It loads the current Hero source blend,
keeps the existing four-material/one-atlas contract, and renders the same
Hero under neutral, snow, furnace, and shadow lighting. It never saves the
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
        ground_material = bpy.data.materials.get("R6C_SnowGround") or bpy.data.materials.new("R6C_SnowGround")
        ground_material.use_nodes = True
        shader = ground_material.node_tree.nodes.get("Principled BSDF")
        if shader:
            shader.inputs["Base Color"].default_value = (0.62, 0.72, 0.84, 1.0)
            shader.inputs["Roughness"].default_value = 0.96
        ground_material.diffuse_color = (0.62, 0.72, 0.84, 1.0)
        ground.data.materials.clear()
        ground.data.materials.append(ground_material)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene, camera


def _set_lighting(scene, mode):
    presets = {
        "neutral": ((0.035, 0.045, 0.070), {"R4Key": (980, (0.78, 0.88, 1.0)), "R4Fill": (520, (0.38, 0.54, 1.0)), "R4Rim": (760, (0.55, 0.70, 1.0))}),
        "snow-daylight": ((0.42, 0.52, 0.68), {"R4Key": (1250, (0.78, 0.90, 1.0)), "R4Fill": (820, (0.54, 0.72, 1.0)), "R4Rim": (420, (0.72, 0.84, 1.0))}),
        "furnace-warm": ((0.075, 0.028, 0.018), {"R4Key": (1120, (1.0, 0.42, 0.15)), "R4Fill": (280, (0.16, 0.26, 0.52)), "R4Rim": (560, (1.0, 0.23, 0.08))}),
        "shadow": ((0.010, 0.015, 0.030), {"R4Key": (380, (0.42, 0.56, 0.82)), "R4Fill": (110, (0.14, 0.22, 0.46)), "R4Rim": (620, (0.30, 0.48, 0.86))}),
        "multi-light": ((0.16, 0.20, 0.28), {"R4Key": (860, (0.75, 0.86, 1.0)), "R4Fill": (440, (0.36, 0.48, 0.78)), "R4Rim": (580, (1.0, 0.38, 0.12))}),
    }
    world, lights = presets[mode]
    scene.world.color = world
    for name, (energy, color) in lights.items():
        obj = bpy.data.objects.get(name)
        if obj and obj.type == "LIGHT":
            obj.data.energy = energy
            obj.data.color = color


def _render(scene, camera, output_dir, name, location, target, lens):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    path = os.path.join(output_dir, f"{name}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r6", "R6-C")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    material_names = sorted(material.name for material in bpy.data.materials if material.name.startswith("MAT_hero_"))
    atlas = bpy.data.images.get("HERO_ATLAS_1024")
    views = [
        ("neutral", "neutral-front", (0.0, 5.6, 1.18), (0.0, 0.0, 1.12), 58),
        ("snow-daylight", "snow-daylight", (4.4, 4.4, 1.28), (0.0, 0.0, 1.10), 58),
        ("furnace-warm", "furnace-warm", (3.4, 4.8, 1.30), (0.0, 0.0, 1.08), 60),
        ("shadow", "shadow-read", (-3.4, 3.8, 1.34), (0.0, 0.0, 1.14), 60),
        ("multi-light", "multi-light-close-up", (2.35, 3.15, 1.72), (0.0, 0.0, 1.38), 72),
    ]
    manifest = {
        "stage": "R6-C",
        "kind": "surface-atlas-lighting-review",
        "source": "assets-source/blender/characters/hero.blend",
        "materials": material_names,
        "atlas": {"name": atlas.name, "resolution": list(atlas.size)} if atlas else None,
        "views": [],
    }
    for mode, name, location, target, lens in views:
        _set_lighting(scene, mode)
        manifest["views"].append({"mode": mode, "name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})
    with open(os.path.join(output_dir, "surface-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R6-C surface/lighting renders written to {output_dir}")


if __name__ == "__main__":
    main()
