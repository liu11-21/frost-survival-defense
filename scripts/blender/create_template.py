import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, save_source, empty


def build():
    reset_scene()
    material("MAT_cloth", (0.24, 0.32, 0.48), 0.92)
    material("MAT_leather", (0.18, 0.09, 0.045), 0.82)
    material("MAT_metal", (0.2, 0.24, 0.3), 0.3, 0.85)
    material("MAT_stone", (0.35, 0.38, 0.43), 0.95)
    material("MAT_wood", (0.32, 0.16, 0.07), 0.88)
    material("MAT_snow", (0.78, 0.9, 1.0), 0.68)
    material("MAT_ice", (0.25, 0.72, 0.95), 0.3, 0.15, (0.08, 0.35, 0.5))
    empty("EXPORT_ROOT", target="EXPORT", display="PLAIN_AXES")
    scene = bpy.context.scene
    scene.camera = None
    path = os.path.join(os.path.dirname(HERE), "..", "assets-source", "blender", "templates", "game_asset_template.blend")
    save_source(os.path.abspath(path))


if __name__ == "__main__":
    build()
