"""Build authored natural-resource props used by the gathering loop.

The runtime still owns depletion, regrowth and collision. These GLBs provide
the readable tree/ore silhouettes and named stage meshes that the resource
view can hide as the node is harvested.
"""
import os
import sys
import math

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import (  # noqa: E402
    add_lod_markers,
    box,
    collision_box,
    cone,
    cylinder,
    empty,
    export_glb,
    material,
    orient_for_babylon,
    parent_all,
    prism,
    reset_scene,
    save_source,
    sphere,
    torus,
)


def output_paths(key):
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "environment", f"{key}.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "environment", f"{key}.glb"))
    return source, output


def build_tree():
    reset_scene()
    bark = material("MAT_resource_tree_bark", (0.26, 0.13, 0.055), 0.96)
    bark_light = material("MAT_resource_tree_bark_light", (0.44, 0.24, 0.1), 0.9)
    bark_dark = material("MAT_resource_tree_bark_dark", (0.14, 0.06, 0.025), 0.98)
    needle = material("MAT_resource_tree_needle", (0.06, 0.22, 0.16), 0.97)
    needle_light = material("MAT_resource_tree_needle_light", (0.14, 0.38, 0.26), 0.88)
    snow = material("MAT_resource_tree_snow", (0.76, 0.9, 0.98), 0.68)
    glow = material("MAT_resource_tree_ice", (0.28, 0.78, 1.0), 0.28, 0.08, (0.1, 0.45, 0.9))
    root = orient_for_babylon(empty("ResourceTreeRoot", target="EXPORT", display="CUBE"))
    add_lod_markers(root, "building")
    parts = [
        cylinder("resource_trunk", 0.25, 1.55, (0, 0.78, 0), bark, "LOD0", 8),
        cylinder("resource_trunk_core", 0.13, 1.62, (0, 0.82, 0), bark_light, "LOD0", 7),
        prism("resource_root_flare", [(-0.52, 0.12), (0.52, 0.12), (0.36, 0.45), (-0.36, 0.45)], 0.65, (0, 0, 0), bark, "LOD0", 0.035),
    ]
    for side in (-1, 1):
        branch = cylinder(f"resource_branch.{side}", 0.09, 1.1, (side * 0.28, 1.45, 0), bark_light, "LOD0", 7)
        branch.rotation_euler.z = side * 0.58
        parts.append(branch)
        parts += [
            sphere(f"resource_branch_collar.{side}", 0.13, (side * 0.24, 1.42, 0), bark_dark),
            cone(f"resource_branch_tip.{side}", 0.12, 0.025, 0.42, (side * 0.70, 1.74, 0), bark_light, "LOD0", 7),
        ]
    tiers = (("0", 1.18, 1.95, 1.08), ("1", 1.9, 1.42, 0.96), ("2", 2.5, 0.88, 0.72))
    for name, y, diameter, height in tiers:
        parts.append(cone(f"resource_canopy{name}", diameter * 0.5, 0.04, height, (0, y, 0), needle, "LOD0", 8))
        parts.append(cone(f"resource_snow{name}", diameter * 0.39, 0.02, height * 0.38, (0, y + height * 0.3, 0), snow, "LOD0", 8))
        parts.append(torus(f"resource_needle_ring{name}", diameter * 0.24, 0.025, (0, y + height * 0.18, 0), needle_light, "LOD0"))
    parts += [
        cylinder("resource_stump", 0.34, 0.32, (0, 0.16, 0), bark, "LOD0", 8),
        cylinder("resource_stump_cap", 0.27, 0.04, (0, 0.34, 0), snow, "LOD0", 8),
        sphere("resource_sap_glow", 0.08, (0.22, 0.82, 0.16), glow),
        torus("resource_stump_ring", 0.24, 0.025, (0, 0.36, 0), bark_dark, "LOD0"),
        sphere("resource_pinecone", 0.10, (-0.28, 1.62, 0.12), bark_dark),
    ]
    parent_all(parts, root)
    collision_box("COL_Resource", (1.25, 3.1, 1.25), (0, 1.55, 0), root)
    source, output = output_paths("resource_tree")
    save_source(source)
    export_glb(output)


def build_rock():
    reset_scene()
    rock = material("MAT_resource_rock", (0.3, 0.34, 0.42), 0.97)
    rock_light = material("MAT_resource_rock_light", (0.48, 0.52, 0.6), 0.9)
    rock_dark = material("MAT_resource_rock_dark", (0.16, 0.19, 0.25), 0.98)
    snow = material("MAT_resource_rock_snow", (0.78, 0.9, 0.98), 0.68)
    ore = material("MAT_resource_ore", (0.25, 0.72, 1.0), 0.3, 0.2, (0.08, 0.38, 1.0))
    root = orient_for_babylon(empty("ResourceRockRoot", target="EXPORT", display="CUBE"))
    add_lod_markers(root, "building")
    parts = [
        prism("resource_rock_base", [(-0.82, 0.12), (-0.5, 0.7), (0.18, 0.88), (0.84, 0.42), (0.58, 0.12)], 1.25, (0, 0, 0), rock, "LOD0", 0.05),
        prism("resource_rock_face", [(-0.5, 0.28), (-0.2, 0.82), (0.25, 0.74), (0.56, 0.32), (0.22, 0.18)], 0.12, (0, 0, -0.64), rock_light, "LOD0", 0.025),
        prism("resource_rock_snow", [(-0.48, 0.72), (-0.2, 0.96), (0.32, 0.88), (0.58, 0.58), (0.25, 0.68), (-0.1, 0.78)], 0.16, (0, 0, 0), snow, "LOD0", 0.03),
        cylinder("resource_rubble", 0.78, 0.18, (0, 0.1, 0), rock, "LOD0", 8),
    ]
    for index, (x, y, z, scale) in enumerate(((-0.35, 0.55, -0.67, 1.0), (0.18, 0.82, -0.68, 0.8), (0.48, 0.42, -0.68, 0.65))):
        vein = prism(f"resource_ore{index}", [(-0.12, 0.0), (0.0, 0.22), (0.12, 0.0), (0.04, -0.18), (-0.08, -0.14)], 0.07 * scale, (x, y, z), ore, "LOD0", 0.01)
        vein.rotation_euler.y = math.radians(18 * index)
        parts.append(vein)
        parts.append(torus(f"resource_ore_ring{index}", 0.14 * scale, 0.018, (x, y, z + 0.035), rock_dark, "LOD0"))
    parts += [
        prism("resource_rock_facetA", [(-0.66, 0.25), (-0.30, 0.88), (0.02, 0.78), (-0.10, 0.30)], 0.07, (0.03, 0, -0.67), rock_dark, "LOD0", 0.012),
        prism("resource_rock_facetB", [(0.08, 0.18), (0.34, 0.74), (0.72, 0.40), (0.42, 0.16)], 0.07, (-0.02, 0, -0.70), rock_light, "LOD0", 0.012),
        sphere("resource_snow_lump.L", 0.16, (-0.52, 0.72, -0.20), snow),
        sphere("resource_snow_lump.R", 0.13, (0.42, 0.56, -0.22), snow),
    ]
    parent_all(parts, root)
    collision_box("COL_Resource", (1.65, 1.3, 1.45), (0, 0.65, 0), root)
    source, output = output_paths("resource_rock")
    save_source(source)
    export_glb(output)


def main():
    build_tree()
    build_rock()


if __name__ == "__main__":
    main()
