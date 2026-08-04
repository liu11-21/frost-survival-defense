"""Render R7-C material-value and lighting evidence using the current Hero blend."""

import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from render_hero_r6_materials import _arg, _prepare_scene, _render, _set_lighting


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r7", "R7-C")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _prepare_scene()
    material_names = sorted(material.name for material in bpy.data.materials if material.name.startswith("MAT_hero_"))
    atlas = bpy.data.images.get("HERO_ATLAS_1024")
    views = [
        ("neutral", "neutral-front", (0.0, 5.6, 1.18), (0.0, 0.0, 1.12), 58),
        ("snow-daylight", "snow-daylight", (4.4, 4.4, 1.28), (0.0, 0.0, 1.10), 58),
        ("furnace-warm", "furnace-warm", (3.4, 4.8, 1.30), (0.0, 0.0, 1.08), 60),
        ("shadow", "shadow-read", (-3.4, 3.8, 1.34), (0.0, 0.0, 1.14), 60),
        ("multi-light", "battle-surface-close-up", (2.35, 3.15, 1.72), (0.0, 0.0, 1.38), 72),
    ]
    manifest = {
        "stage": "R7-C",
        "kind": "four-material-value-and-response-review",
        "source": "assets-source/blender/characters/hero.blend",
        "materials": material_names,
        "atlas": {"name": atlas.name, "resolution": list(atlas.size)} if atlas else None,
        "contract": "4 materials, one embedded HERO_ATLAS_1024, no new shader maps",
        "views": [],
    }
    for mode, name, location, target, lens in views:
        _set_lighting(scene, mode)
        manifest["views"].append({"mode": mode, "name": name, "file": _render(scene, camera, output_dir, name, location, target, lens)})
    with open(os.path.join(output_dir, "surface-manifest.json"), "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")
    print(f"R7-C material renders written to {output_dir}")


if __name__ == "__main__":
    main()
