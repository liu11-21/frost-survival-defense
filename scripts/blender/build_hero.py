import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, prism, cylinder, sphere, empty, collision_box, parent_all, move_to, orient_for_babylon, add_lod_markers, cone, torus, save_source, export_glb
from build_units import make_skeleton, bind_unit_pieces, add_armature_clip


def build():
    reset_scene()
    cloth = material("MAT_hero_cloth", (0.18, 0.3, 0.55), 0.9)
    leather = material("MAT_hero_leather", (0.2, 0.08, 0.035), 0.82)
    metal = material("MAT_hero_metal", (0.22, 0.28, 0.36), 0.28, 0.85)
    skin = material("MAT_hero_skin", (0.65, 0.36, 0.22), 0.88)
    snow = material("MAT_hero_snow", (0.78, 0.9, 1.0), 0.7)
    glow = material("MAT_hero_glow", (0.3, 0.78, 1.0), 0.24, 0.0, (0.18, 0.62, 1.0))
    accent = material("MAT_hero_accent", (0.45, 0.78, 1.0), 0.35, 0.5)
    root = orient_for_babylon(empty("HeroRoot", target="EXPORT", display="CUBE"))
    add_lod_markers(root, "character")
    parts = [
        box("body", (0.66, 0.85, 0.42), (0, 1.05, 0), cloth, bevel=0.08),
        box("coatSkirt", (0.76, 0.24, 0.5), (0, 0.68, -0.01), leather, bevel=0.06),
        box("chestPlate", (0.48, 0.38, 0.08), (0, 1.12, 0.22), metal, bevel=0.045),
        box("chestTrim", (0.52, 0.07, 0.05), (0, 1.28, 0.24), snow, bevel=0.02),
        sphere("head", 0.3, (0, 1.75, 0), skin),
        cone("hood", 0.42, 0.2, 0.3, (0, 1.98, 0), snow, "LOD0", 8),
        torus("hoodRim", 0.3, 0.035, (0, 1.83, 0), snow, "LOD0"),
        box("coatTrim", (0.74, 0.12, 0.46), (0, 1.42, 0), snow, bevel=0.04),
        box("arm.L", (0.18, 0.7, 0.2), (-0.48, 1.1, 0), cloth, bevel=0.05),
        box("arm.R", (0.18, 0.7, 0.2), (0.48, 1.1, 0), cloth, bevel=0.05),
        sphere("glove.L", 0.12, (-0.48, 0.72, 0.02), skin),
        sphere("glove.R", 0.12, (0.48, 0.72, 0.02), skin),
        box("shoulder.L", (0.3, 0.18, 0.3), (-0.46, 1.38, 0), metal, bevel=0.06),
        box("shoulder.R", (0.3, 0.18, 0.3), (0.46, 1.38, 0), metal, bevel=0.06),
        box("leg.L", (0.22, 0.7, 0.24), (-0.2, 0.42, 0), leather, bevel=0.05),
        box("leg.R", (0.22, 0.7, 0.24), (0.2, 0.42, 0), leather, bevel=0.05),
        box("boot.L", (0.25, 0.14, 0.42), (-0.2, 0.07, 0.08), metal, bevel=0.05),
        box("boot.R", (0.25, 0.14, 0.42), (0.2, 0.07, 0.08), metal, bevel=0.05),
        box("belt", (0.74, 0.12, 0.48), (0, 0.82, 0), leather, bevel=0.04),
        box("beltSigil", (0.13, 0.13, 0.05), (0, 0.82, 0.24), glow, bevel=0.02),
        # Faceted profiles break the rectangular silhouette and read as
        # separate garment/armour layers from the normal game camera.
        prism("coatTail", [(-0.38, 1.12), (0.38, 1.12), (0.48, 0.55), (0.18, 0.42), (-0.18, 0.42), (-0.48, 0.55)], 0.08, (0, 0, -0.24), leather, "LOD0", 0.035),
        prism("shoulderMantle", [(-0.62, 1.4), (-0.36, 1.62), (0.36, 1.62), (0.62, 1.4), (0.42, 1.28), (-0.42, 1.28)], 0.28, (0, 0, 0), snow, "LOD0", 0.035),
        prism("scarf", [(-0.34, 1.45), (0.34, 1.45), (0.29, 1.28), (-0.29, 1.28)], 0.46, (0, 0, 0.02), accent, "LOD0", 0.025),
        box("backPack", (0.42, 0.5, 0.24), (0, 1.0, -0.3), leather, bevel=0.055),
        box("backPackCap", (0.48, 0.09, 0.26), (0, 1.25, -0.3), snow, bevel=0.03),
        torus("bracer.L", 0.13, 0.035, (-0.51, 0.93, 0.02), metal, "LOD0"),
        torus("bracer.R", 0.13, 0.035, (0.51, 0.93, 0.02), metal, "LOD0"),
        prism("helmetBrow", [(-0.22, 1.84), (0.22, 1.84), (0.16, 1.68), (-0.16, 1.68)], 0.22, (0, 0, 0.22), leather, "LOD0", 0.02),
        prism("bootToe.L", [(-0.13, 0.16), (0.09, 0.16), (0.1, 0.02), (-0.13, 0.02)], 0.3, (-0.2, 0, 0.16), metal, "LOD0", 0.018),
        prism("bootToe.R", [(-0.09, 0.16), (0.13, 0.16), (0.13, 0.02), (-0.1, 0.02)], 0.3, (0.2, 0, 0.16), metal, "LOD0", 0.018),
        torus("weaponGuard", 0.09, 0.025, (0.62, 0.88, 0.16), accent, "LOD0"),
        prism("sigilPlate", [(-0.14, 1.28), (0.14, 1.28), (0.1, 1.02), (-0.1, 1.02)], 0.06, (0, 0, 0.26), glow, "LOD0", 0.015),
        cylinder("weapon", 0.055, 1.15, (0.62, 0.86, 0.16), metal, "LOD0", 8),
        sphere("weaponGem", 0.1, (0.62, 1.44, 0.16), glow),
    ]
    parent_all(parts, root)
    skeleton = make_skeleton(root)
    skeleton.name = "HeroSkeleton"
    skeleton.data.name = "HeroSkeleton"
    bind_unit_pieces(parts, skeleton)
    for name in ("weapon_socket.R", "weapon_socket.L", "ranged_socket", "back_socket"):
        socket = empty(name, (0, 1.1, 0), "RIG")
        socket.parent = root
    collision_box("COL_Hero", (0.75, 1.85, 0.75), (0, 0.95, 0), root)
    add_armature_clip(skeleton, "Idle", 24, [(1, {}), (12, {"chest": (0.025, 0, 0), "head": (0, 0.025, 0)}), (24, {})])
    add_armature_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.35, 0, 0), "upper_arm.R": (-0.35, 0, 0), "thigh.L": (-0.5, 0, 0), "thigh.R": (0.5, 0, 0)}),
        (8, {"upper_arm.L": (-0.35, 0, 0), "upper_arm.R": (0.35, 0, 0), "thigh.L": (0.5, 0, 0), "thigh.R": (-0.5, 0, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Run", 18, [
        (1, {"upper_arm.L": (0.65, 0, 0), "upper_arm.R": (-0.65, 0, 0), "thigh.L": (-0.75, 0, 0), "thigh.R": (0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (6, {"upper_arm.L": (-0.65, 0, 0), "upper_arm.R": (0.65, 0, 0), "thigh.L": (0.75, 0, 0), "thigh.R": (-0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (18, {}),
    ])
    add_armature_clip(skeleton, "MeleeAttack", 16, [(1, {"upper_arm.R": (-1.0, 0, 0), "lower_arm.R": (-0.6, 0, 0)}), (7, {"upper_arm.R": (1.4, 0, 0), "lower_arm.R": (0.5, 0, 0), "chest": (0.2, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "RangedAttack", 16, [(1, {"upper_arm.R": (-0.8, 0, 0), "upper_arm.L": (-0.5, 0, 0)}), (8, {"upper_arm.R": (-1.7, 0, 0), "upper_arm.L": (-1.1, 0, 0), "head": (-0.15, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "Hit", 12, [(1, {"chest": (-0.2, 0, 0), "head": (0.12, 0, 0)}), (12, {})])
    add_armature_clip(skeleton, "Death", 20, [(1, {}), (12, {"root": (1.25, 0, 0), "chest": (0.4, 0, 0), "upper_arm.L": (0.8, 0, 0), "upper_arm.R": (0.8, 0, 0)}), (20, {"root": (1.45, 0, 0), "chest": (0.5, 0, 0), "upper_arm.L": (1.1, 0, 0), "upper_arm.R": (1.1, 0, 0)})])
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", "hero.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
