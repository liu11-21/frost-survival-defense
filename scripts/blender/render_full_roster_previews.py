"""Render complete authored-roster contact sheets for art direction review.

The existing focal sheets are intentionally small. This companion sheet keeps
one deterministic camera and lighting setup while showing every authored unit
or facility, so visual quality decisions are not made from a six-asset sample.
It is a QA artifact only and never becomes a runtime dependency.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

UNITS = [
    "hero", "warrior", "shield", "archer", "medic", "flagbearer", "mage",
    "assault", "engineer", "musketeer", "frostmage", "grunt", "slinger",
    "bruiser", "marksman", "juggernaut", "bombardier", "boss", "breacher",
    "icearmor", "commander", "bomber", "flyingMelee", "flyingEliteArcher",
    "flyingBomber", "flyingColossus",
]
BUILDINGS = [
    "mine", "gold_mine", "lumberyard", "warehouse", "recruit_hall",
    "auto_collector", "auto_rebuilder", "crossbow_tower", "frost_tower",
    "sniper_tower", "mortar", "furnace", "turret_basic", "wall_gate",
]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def preview_material(name, color, metallic=0.0, roughness=0.75, emission=None):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 1.3
    return mat


def setup_scene(kind, columns, rows, cell):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1600 if kind == "units" else 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.014, 0.03)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except (AttributeError, TypeError):
        pass

    # The exported GLBs are Z-up in Blender.  Use a nearly orthographic front
    # catalogue: X is the column axis and Z is the row axis, while every asset
    # stays at Y=0.  This keeps silhouettes comparable and avoids depth-row
    # compression or a camera accidentally looking at the underside of a row.
    bpy.ops.object.camera_add(location=(0, 28.0, max(6.0, (rows - 1) * cell * 0.5)))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 36.0 if kind == "units" else 26.0
    # Looking straight down -Y with +Z as screen-up.  `look_at(..., "Y")`
    # cannot use Y as the up axis when the view direction is itself Y, which
    # otherwise rotates the entire contact sheet upside down.
    camera.rotation_euler = (math.radians(90), 0, math.radians(180))
    scene.camera = camera

    for location, energy, color, size in [
        ((5.0, 18.0, max(8.0, rows * cell)), 1500, (1.0, 0.82, 0.65), 5.5),
        ((-7.0, 12.0, max(4.0, rows * cell * 0.45)), 950, (0.25, 0.45, 1.0), 5.0),
        ((0.0, 8.0, 2.0), 650, (0.3, 0.55, 1.0), 4.0),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        lamp = bpy.context.object
        lamp.data.energy = energy
        lamp.data.color = color
        lamp.data.size = size
        look_at(lamp, (0, 0.8, 0))

    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, -1.8, max(0.8, (rows - 1) * cell * 0.5)), rotation=(math.radians(90), 0, 0))
    backdrop = bpy.context.object
    backdrop.data.materials.append(preview_material("full-roster-ground", (0.018, 0.032, 0.065), 0, 0.9))

    # A very faint row grid gives scale and makes empty cells obvious without
    # competing with the authored asset silhouette.
    grid_mat = preview_material("full-roster-grid", (0.12, 0.2, 0.34), 0.1, 0.9, (0.04, 0.08, 0.14))
    column_cell = 3.0 if kind == "units" else 4.0
    for index in range(-columns, columns + 1):
        bpy.ops.mesh.primitive_cube_add(location=(index * column_cell, -1.72, max(0.8, (rows - 1) * cell * 0.5)))
        line = bpy.context.object
        line.name = f"ReviewGridX.{index}"
        line.dimensions = (0.012, 0.01, rows * cell + 1.4)
        line.data.materials.append(grid_mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for index in range(rows + 1):
        bpy.ops.mesh.primitive_cube_add(location=(0, -1.72, index * cell - 0.8))
        line = bpy.context.object
        line.name = f"ReviewGridZ.{index}"
        line.dimensions = (columns * column_cell + 1.4, 0.01, 0.012)
        line.data.materials.append(grid_mat)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return scene, camera


def add_label(text, location, camera):
    bpy.ops.object.text_add(location=location)
    label = bpy.context.object
    label.name = f"ReviewLabel.{text}"
    label.data.body = text
    label.data.align_x = "CENTER"
    label.data.align_y = "CENTER"
    label.data.size = 0.25
    label.data.extrude = 0.006
    label.data.materials.append(preview_material(f"label-{text}", (0.72, 0.9, 1.0), 0.2, 0.3, (0.12, 0.22, 0.5)))
    # The catalogue camera looks straight along -Y; text's local +Z normal is
    # rotated to +Y so the glyphs face the camera without mirroring.
    # Match the camera basis exactly: local +Z faces +Y toward the camera,
    # local +Y maps to screen-up, and local +X maps to screen-right.
    label.rotation_euler = camera.rotation_euler.copy()
    return label


def import_asset(path, location, scale):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    imported = [obj for obj in bpy.data.objects if obj not in before]
    # GLTF exports can contain several top-level mesh objects even when the
    # source scene had a semantic Root empty.  Wrap every top-level imported
    # object in a review-only parent so the complete asset moves as one unit.
    # Preserve each object's world matrix while parenting; this avoids the
    # partial-placement bug where only one mesh appeared in its contact cell.
    placement = bpy.data.objects.new(f"ReviewRoot.{os.path.basename(path)}", None)
    bpy.context.scene.collection.objects.link(placement)
    top_level = [obj for obj in imported if obj.parent is None]
    for obj in top_level:
        matrix = obj.matrix_world.copy()
        obj.parent = placement
        obj.matrix_world = matrix
    placement.location = location
    placement.scale = (scale, scale, scale)
    print(f"PLACED {os.path.basename(path)} objects={len(imported)} top_level={len(top_level)} loc={tuple(round(v, 2) for v in location)}")
    for obj in imported:
        if obj.type == "MESH":
            base_name = obj.name.split(":")[-1]
            is_proxy = base_name.startswith("LOD1_PROXY") or base_name.startswith("LOD2_PROXY")
            obj.hide_set(is_proxy)
            obj.hide_render = is_proxy
    return imported


def render(kind):
    names = UNITS if kind == "units" else BUILDINGS
    columns = 5 if kind == "units" else 4
    rows = int(math.ceil(len(names) / columns))
    cell_x = 3.0 if kind == "units" else 4.0
    cell_y = 4.0 if kind == "units" else 4.5
    scene, camera = setup_scene(kind, columns, rows, cell_y)
    start_x = ((columns - 1) * cell_x) * -0.5
    for index, key in enumerate(names):
        row, column = divmod(index, columns)
        location = (start_x + column * cell_x, 0, (rows - 1 - row) * cell_y)
        folder = "characters" if kind == "units" else "buildings"
        scale = 0.82 if kind == "units" else 0.62
        import_asset(os.path.join(ROOT, "public", "assets", "models", folder, f"{key}.glb"), location, scale)
        add_label(key, (location[0], -0.85, location[2] - (1.65 if kind == "units" else 1.35)), camera)
    out_name = "unit-roster-full.png" if kind == "units" else "facility-roster-full.png"
    out = os.path.join(ROOT, "reports", "art-previews", out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    scene.render.filepath = out
    scene.frame_set(10)
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {out}")


if __name__ == "__main__":
    render(sys.argv[-1] if sys.argv[-1] in ("units", "buildings") else "units")
