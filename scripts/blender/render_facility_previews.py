"""Render a deterministic facility art-review sheet for local QA."""
import os
import math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "reports", "art-previews", "facility-sheet.png")


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def setup():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.color = (0.012, 0.018, 0.035)
    bpy.ops.object.camera_add(location=(0, 8.5, 14.0))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 10.5
    look_at(camera, (0, 2.3, 0.0))
    scene.camera = camera
    for location, energy, color, size in [
        ((3.5, 8, 5), 1100, (1, 0.86, 0.68), 5),
        ((-5, 4, 2), 750, (0.25, 0.48, 1), 4),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.color = color
        lamp.data.size = size
        look_at(lamp, (0, 1.2, 0))
    bpy.ops.mesh.primitive_plane_add(size=28, location=(0, -0.03, 0))
    ground = bpy.context.object
    mat = bpy.data.materials.new("facility-preview-ground")
    mat.diffuse_color = (0.025, 0.04, 0.07, 1)
    ground.data.materials.append(mat)
    return scene


def add_label(text, location):
    bpy.ops.object.text_add(location=location)
    label = bpy.context.object
    label.name = f"PreviewLabel_{text}"
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.size = 0.3
    label.data.extrude = 0.008
    mat = bpy.data.materials.new(f"label-{text}")
    mat.diffuse_color = (0.78, 0.9, 1.0, 1)
    label.data.materials.append(mat)
    label.rotation_euler = (math.radians(90), 0, math.pi)
    return label


def import_asset(path, location):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    roots = [obj for obj in imported if obj.parent is None]
    root = next((obj for obj in roots if obj.name.startswith("BuildingRoot") or obj.name.startswith("FurnaceRoot")), roots[0] if roots else None)
    if root:
        root.location = location
        root.scale = (1.0, 1.0, 1.0)
    for obj in imported:
        if obj.type == "MESH":
            base_name = obj.name.split(":")[-1]
            is_proxy = base_name.startswith("LOD1_PROXY") or base_name.startswith("LOD2_PROXY")
            obj.hide_set(is_proxy)
            obj.hide_render = is_proxy


def main():
    clear()
    scene = setup()
    # Keep both rows on the same ground plane; the imported GLBs use Y for
    # height, so catalogue depth belongs in Z rather than Y.
    items = [("furnace", (-3.25, 4.0, 0)), ("crossbow_tower", (3.25, 4.0, 0)), ("recruit_hall", (-3.25, 0, 0)), ("auto_rebuilder", (3.25, 0, 0))]
    for key, location in items:
        import_asset(os.path.join(ROOT, "public", "assets", "models", "buildings", f"{key}.glb"), location)
        add_label(key, (location[0], location[1] - 1.65, -0.2))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scene.render.filepath = OUT
    scene.frame_set(10)
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
