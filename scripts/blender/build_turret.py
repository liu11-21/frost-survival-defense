import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, cylinder, empty, collision_box, parent_all, add_simple_animation, save_source, export_glb


def build():
    reset_scene()
    stone = material("MAT_turret_stone", (0.32, 0.36, 0.43), 0.93)
    metal = material("MAT_turret_iron", (0.12, 0.16, 0.22), 0.3, 0.9)
    wood = material("MAT_turret_wood", (0.32, 0.16, 0.07), 0.88)
    snow = material("MAT_turret_snow", (0.8, 0.92, 1.0), 0.65)
    ember = material("MAT_turret_ember", (1.0, 0.23, 0.04), 0.45, 0.0, (1.0, 0.08, 0.01))
    root = empty("TurretRoot", target="EXPORT", display="CUBE")
    yaw = empty("yawPivot", (0, 1.1, 0), "EXPORT", "CUBE")
    yaw.parent = root
    pitch = empty("pitchPivot", (0, 0.2, 0), "EXPORT", "CUBE")
    pitch.parent = yaw
    parts = [
        cylinder("base", 1.25, 0.35, (0, 0.18, 0), stone),
        cylinder("ring", 0.95, 0.22, (0, 0.48, 0), metal),
        box("support", (0.34, 1.0, 0.34), (0, 0.92, 0), wood),
        box("barrel", (0.24, 0.24, 1.65), (0, 1.25, 0.85), metal),
        box("recoilPart", (0.4, 0.34, 0.48), (0, 1.25, 0.15), wood),
        sphere("muzzle", 0.16, (0, 1.25, 1.68), ember),
        box("ammoBox", (0.44, 0.35, 0.42), (-0.55, 0.78, 0), snow),
    ]
    parent_all(parts, pitch)
    empty("muzzleAnchor", (0, 1.25, 1.68), "EXPORT").parent = pitch
    collision_box("COL_Turret", (2.1, 1.8, 2.1), (0, 0.9, 0), root)
    for name, amount in (("Idle", 0.03), ("Aim", 0.12), ("Fire", -0.2), ("Recoil", -0.18), ("Reload", 0.08)):
        add_simple_animation(root, name, amount=amount, end=12)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "buildings", "turret_basic.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "buildings", "turret_basic.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
