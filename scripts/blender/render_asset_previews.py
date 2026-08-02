"""Render a small local art-review sheet from the exported GLBs.

This is a QA aid only; it never becomes a runtime dependency. It gives the
art pass a repeatable camera, lighting and scale for comparing silhouettes.
"""
import os
import math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "reports", "art-previews", "unit-sheet.png")


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(name, color, metallic=0.0, roughness=0.75):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return m


def setup():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.012, 0.018, 0.035)
    # Keep world X horizontal and world Z vertical in the sheet.  The authored
    # GLBs are Y-up after import, so a near-front elevated camera makes the six
    # grid cells read as a proper catalogue instead of a diagonal pile-up.
    bpy.ops.object.camera_add(location=(0, 8.5, 14.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 10.5
    look_at(camera, (0, 2.3, 0.0))
    scene.camera = camera
    bpy.ops.object.light_add(type="AREA", location=(2.5, 7, 4))
    key = bpy.context.object
    key.data.energy = 900
    key.data.shape = "DISK"
    key.data.size = 5
    look_at(key, (0, 1, 0))
    bpy.ops.object.light_add(type="AREA", location=(-4, 3, 1))
    fill = bpy.context.object
    fill.data.energy = 600
    fill.data.color = (0.25, 0.5, 1.0)
    fill.data.size = 4
    look_at(fill, (0, 1, 0))
    bpy.ops.mesh.primitive_plane_add(size=24, location=(0, -0.03, 0))
    ground = bpy.context.object
    ground.data.materials.append(material("preview-ground", (0.025, 0.04, 0.07), 0, 0.92))
    return scene


def add_label(text, location):
    """Add a small camera-facing review label without affecting the GLB."""
    bpy.ops.object.text_add(location=location)
    label = bpy.context.object
    label.name = f"PreviewLabel_{text}"
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.size = 0.28
    label.data.extrude = 0.008
    label.data.materials.append(material(f"label-{text}", (0.78, 0.9, 1.0), 0.55, 0.1))
    # The review camera is above the ground; tilt the text toward it so the
    # label remains legible in the three-quarter sheet.
    label.rotation_euler = (math.radians(90), 0, math.pi)
    return label


def import_asset(path, location):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    roots = [obj for obj in imported if obj.parent is None]
    root = next((obj for obj in roots if obj.name.startswith("UnitRoot")), roots[0] if roots else None)
    if root:
        root.location = location
        root.scale = (1.25, 1.25, 1.25)
    for obj in imported:
        if obj.type == "MESH":
            base_name = obj.name.split(":")[-1]
            is_proxy = base_name.startswith("LOD1_PROXY") or base_name.startswith("LOD2_PROXY")
            obj.hide_set(is_proxy)
            obj.hide_render = is_proxy
    return imported


def main():
    clear()
    setup()
    # Y is height in the imported GLBs; use Z for the catalogue depth so the
    # second row is not pushed below the ground or hidden behind the first.
    paths = [
        ("hero", (-3.2, 4.0, 0)),
        ("warrior", (0, 4.0, 0)),
        ("shield", (3.2, 4.0, 0)),
        ("mage", (-3.2, 0, 0)),
        ("musketeer", (0, 0, 0)),
        ("flyingColossus", (3.2, 0, 0)),
    ]
    for key, location in paths:
        import_asset(os.path.join(ROOT, "public", "assets", "models", "characters", f"{key}.glb"), location)
        add_label(key, (location[0], location[1] - 1.62, -0.18))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.context.scene.render.filepath = OUT
    bpy.context.scene.frame_set(10)
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
