"""Render the R4-D production LOD tiers for human review."""

import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from render_hero_r4_review import _arg, _setup_scene, render_view


def _show_tier(tier):
    prefix = "LOD0" if tier == 0 else f"LOD{tier}_PROD"
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        name = obj.name.upper()
        is_lod0 = not name.startswith(("LOD1_", "LOD2_", "COL_"))
        visible = is_lod0 if tier == 0 else name.startswith(prefix)
        obj.hide_render = not visible
        if visible:
            clay = bpy.data.materials.get("R4_Clay_Review")
            if clay:
                obj.data.materials.clear()
                obj.data.materials.append(clay)


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r4", "R4-D")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _setup_scene(clay=True)
    for tier in (0, 1, 2):
        _show_tier(tier)
        render_view(
            scene,
            camera,
            output_dir,
            f"lod{tier}-front",
            (0.0, 5.6, 1.15),
            target=(0.0, 0.0, 1.15),
            lens=58,
        )
    _show_tier(1)
    render_view(
        scene,
        camera,
        output_dir,
        "lod1-three-quarter",
        (4.4, 4.4, 1.25),
        target=(0.0, 0.0, 1.10),
        lens=58,
    )
    print(f"R4-D LOD renders written to {output_dir}")


if __name__ == "__main__":
    main()
