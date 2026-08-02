import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, prism, cylinder, sphere, empty, collision_box, parent_all, orient_for_babylon, add_lod_markers, add_simple_animation, author_surface_paint, save_source, export_glb, torus, cone


def build():
    reset_scene()
    stone = material("MAT_turret_stone", (0.32, 0.36, 0.43), 0.93)
    metal = material("MAT_turret_iron", (0.12, 0.16, 0.22), 0.3, 0.9)
    metal_light = material("MAT_turret_iron_light", (0.42, 0.5, 0.6), 0.22, 0.92)
    wood = material("MAT_turret_wood", (0.32, 0.16, 0.07), 0.88)
    snow = material("MAT_turret_snow", (0.8, 0.92, 1.0), 0.65)
    ember = material("MAT_turret_ember", (1.0, 0.23, 0.04), 0.45, 0.0, (1.0, 0.08, 0.01))
    glass = material("MAT_turret_glass", (0.16, 0.58, 1.0), 0.12, 0.12, (0.05, 0.25, 0.7))
    root = orient_for_babylon(empty("TurretRoot", target="EXPORT", display="PLAIN_AXES"))
    add_lod_markers(root, "building")
    yaw = empty("yawPivot", (0, 1.1, 0), "EXPORT", "PLAIN_AXES")
    yaw.parent = root
    pitch = empty("pitchPivot", (0, 0.2, 0), "EXPORT", "PLAIN_AXES")
    pitch.parent = yaw
    parts = [
        cylinder("base", 1.25, 0.35, (0, 0.18, 0), stone, "LOD0", 12),
        torus("baseTrim", 1.07, 0.08, (0, 0.4, 0), snow, "LOD0"),
        cylinder("ring", 0.95, 0.22, (0, 0.48, 0), metal, "LOD0", 12),
        box("support", (0.34, 1.0, 0.34), (0, 0.92, 0), wood, bevel=0.07),
        box("supportBraceL", (0.12, 0.8, 0.5), (-0.28, 0.9, 0), metal, bevel=0.035),
        box("supportBraceR", (0.12, 0.8, 0.5), (0.28, 0.9, 0), metal, bevel=0.035),
        box("barrel", (0.24, 0.24, 1.65), (0, 1.25, 0.85), metal, bevel=0.045),
        cone("barrelCowl", 0.19, 0.13, 0.32, (0, 1.25, 0.38), metal, "LOD0", 8),
        prism("frontMantlet", [(-0.46, 1.52), (0.46, 1.52), (0.34, 0.94), (-0.34, 0.94)], 0.28, (0, 0, 0.34), metal, "LOD0", 0.04),
        prism("snowMantletCap", [(-0.42, 1.56), (0.42, 1.56), (0.32, 1.48), (-0.32, 1.48)], 0.3, (0, 0, 0.34), snow, "LOD0", 0.025),
        box("recoilPart", (0.4, 0.34, 0.48), (0, 1.25, 0.15), wood, bevel=0.06),
        sphere("muzzle", 0.16, (0, 1.25, 1.68), ember),
        sphere("muzzleLens", 0.08, (0, 1.25, 1.72), glass),
        box("ammoBox", (0.44, 0.35, 0.42), (-0.55, 0.78, 0), snow, bevel=0.05),
        torus("ammoLatch", 0.12, 0.03, (-0.55, 0.95, 0.2), metal, "LOD0"),
        cylinder("driveGear", 0.22, 0.08, (0.56, 0.62, 0), metal, "LOD0", 10),
        torus("driveGearTeeth", 0.22, 0.035, (0.56, 0.62, 0), snow, "LOD0"),
        box("basePanel", (1.4, 0.08, 0.7), (0, 0.46, -0.72), metal, "LOD0", 0.035),
        torus("barrelBandRear", 0.17, 0.035, (0, 1.25, 0.58), metal_light, "LOD0"),
        torus("barrelBandFront", 0.18, 0.035, (0, 1.25, 1.30), metal_light, "LOD0"),
        sphere("supportBoltL", 0.055, (-0.24, 0.82, 0.22), snow),
        sphere("supportBoltR", 0.055, (0.24, 0.82, 0.22), snow),
        cone("muzzleCrown", 0.23, 0.16, 0.18, (0, 1.25, 1.68), metal_light, "LOD0", 8),
        torus("housingCollar", 0.30, 0.035, (0, 1.25, 0.30), metal_light, "LOD0"),
        box("housingVent", (0.22, 0.05, 0.12), (0.42, 1.12, -0.18), metal_light, "LOD0", 0.012),
        *(sphere(f"housingRivet.{i}", 0.035, (-0.18 + i * 0.18, 1.02, 0.32), snow) for i in range(3)),
        prism("ammoGuide", [(-0.22, 0.90), (0.22, 0.90), (0.18, 0.58), (-0.18, 0.58)], 0.045, (-0.55, 0, 0.18), metal_light, "LOD0", 0.01),
    ]
    author_surface_paint(parts, seed=31, textured=True)
    parent_all(parts, pitch)
    empty("muzzleAnchor", (0, 1.25, 1.68), "EXPORT").parent = pitch
    collision_box("COL_Turret", (2.1, 1.8, 2.1), (0, 0.9, 0), root)
    for name, amount in (("Idle", 0.03), ("Aim", 0.12), ("Fire", -0.2), ("Recoil", -0.18), ("Reload", 0.08)):
        add_simple_animation(root, name, amount=amount, end=12)
    add_simple_animation(recoil_part := next(obj for obj in parts if obj.name == "recoilPart"), "Fire", property_path="location", index=2, amount=-0.16, end=12)
    add_simple_animation(recoil_part, "Recoil", property_path="location", index=2, amount=-0.22, end=12)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "buildings", "turret_basic.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "buildings", "turret_basic.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
