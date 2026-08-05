"""Build the wall-and-gate segment on the shared art standard.

Keeps its own script: the root is ``WallGateRoot`` and the contract is a
door mechanism rather than a weapon -- ``gateRoot``, ``gateDoorLeft``,
``gateDoorRight``, ``gateCollider`` and ``friendlyPassTrigger``, driven by
GateOpen/GateClose.

Previously 52 mesh nodes and 52 primitives of stacked boxes and prisms,
including eight individually placed masonry courses per side. The static
masonry is now one merged mesh per LOD with the courses painted into the
atlas, so the joints follow the wall instead of being boxes stuck onto it.

The two doors stay separate meshes on their own pivots because the runtime
swings them, and the collider and pass trigger stay as empties because
gameplay queries them.

Scale is held to the previous asset: 4.8-wide wall blocks centred at x=±4.2,
2.6 tall, 1.5 deep, with a 3.6-wide gate opening and doors hinged at x=±1.25.
"""
import math
import os
import sys
from array import array

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import (  # noqa: E402
    add_simple_animation, collision_box, empty, export_glb, material,
    orient_for_babylon, reset_scene, save_source, collection,
)
from authoring import MeshBuilder, section  # noqa: E402

SURFACES = {"stone": (0, 0), "course": (0, 1), "snow": (0, 2),
            "timber": (1, 0), "band": (1, 1), "metal": (2, 0)}
MATERIALS = {}
WALL_H = 2.60
WALL_D = 1.50
BLOCK_W = 4.80
BLOCK_X = 4.20
GATE_HALF = 1.80


def add_wall(level):
    """Both wall blocks, the lintel and the snow caps, merged."""
    b = MeshBuilder(level)
    n = (12, 8, 6)[level]
    hw, hd = BLOCK_W * 0.5, WALL_D * 0.5

    for sx in (-1, 1):
        cx = sx * BLOCK_X
        # A slight batter (wider at the base) reads as load-bearing masonry
        # rather than an extruded slab.
        b.sweep([
            (0.00, section(n, hw * 1.02, hd * 1.06, hd * 1.06, 1.3, centre_x=cx)),
            (0.30, section(n, hw * 1.00, hd * 1.02, hd * 1.02, 1.3, centre_x=cx)),
            (WALL_H * 0.60, section(n, hw * 0.98, hd * 0.98, hd * 0.98, 1.4, centre_x=cx)),
            (WALL_H, section(n, hw * 0.96, hd * 0.96, hd * 0.96, 1.4, centre_x=cx)),
        ], "stone", lambda y: {}, cap_top=False)
        # Snow cap and crenellated head.
        b.sweep([
            (WALL_H, section(n, hw * 1.02, hd * 1.06, hd * 1.06, 1.3, centre_x=cx)),
            (WALL_H + 0.16, section(n, hw * 1.00, hd * 1.02, hd * 1.02, 1.3, centre_x=cx)),
        ], "snow", lambda y: {})
        if level == 0:
            for i in range(5):
                t = (i - 2) / 2.0
                b.box((cx + t * hw * 0.72, WALL_H + 0.34, 0.0),
                      (0.52, 0.34, WALL_D * 0.82), "stone", {}, taper=0.94)
            # Buttress on the outer face.
            b.prism([(cx - 0.44, 0.10), (cx + 0.44, 0.10), (cx + 0.34, WALL_H * 0.92),
                     (cx - 0.34, WALL_H * 0.84)], hd * 0.96, 0.34, "timber", {})

    # Lintel spanning the opening.
    b.sweep([
        (WALL_H * 0.78, section(n, GATE_HALF * 1.04, hd * 1.02, hd * 1.02, 1.3)),
        (WALL_H, section(n, GATE_HALF * 1.04, hd * 1.02, hd * 1.02, 1.3)),
    ], "stone", lambda y: {})
    b.sweep([
        (WALL_H, section(n, GATE_HALF * 1.10, hd * 1.06, hd * 1.06, 1.3)),
        (WALL_H + 0.18, section(n, GATE_HALF * 1.06, hd * 1.02, hd * 1.02, 1.3)),
    ], "snow", lambda y: {})
    if level == 0:
        # Iron straps framing the arch.
        for sx in (-1, 1):
            b.box((sx * GATE_HALF * 0.96, WALL_H * 0.42, -hd * 0.98),
                  (0.14, WALL_H * 0.84, 0.10), "metal", {}, taper=0.94)
    return b


def add_door(level, sign):
    """One gate leaf. Hinged at its own pivot, so it is authored at origin."""
    b = MeshBuilder(level)
    n = (8, 6, 4)[level]
    hw = 0.60
    b.sweep([
        (0.00, section(n, hw, 0.125, 0.125, 1.3)),
        (2.10, section(n, hw, 0.125, 0.125, 1.3)),
    ], "timber", lambda y: {})
    if level <= 1:
        for y in (0.42, 1.05, 1.68):
            b.box((0.0, y, 0.0), (hw * 2.02, 0.13, 0.30), "band", {}, taper=0.96)
    if level == 0:
        b.box((sign * hw * 0.62, 1.05, -0.16), (0.16, 0.28, 0.14), "metal", {}, taper=0.8)
    return b


def make_atlas():
    size = 512
    name = "WALLGATE_ATLAS"
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    stone = (0.198, 0.202, 0.216)
    course = (0.254, 0.258, 0.272)
    snow = (0.760, 0.796, 0.848)
    timber = (0.186, 0.120, 0.072)
    band = (0.238, 0.164, 0.100)
    metal = (0.176, 0.190, 0.212)
    bands = {0: (stone, course, snow, stone), 1: (timber, band, timber, timber), 2: (metal, metal, metal, metal)}
    for y in range(size):
        v = y / size
        bi = min(3, int(v * 4))
        local = v * 4.0 - bi
        for x in range(size):
            u = x / size
            column = min(2, int(u * 3))
            base = bands[column][bi]
            value = 1.0
            if column == 0:
                if bi == 2:
                    value += math.sin(x * 0.4 + y * 0.2) * 0.030
                else:
                    # Staggered masonry courses; replaces 16 separate meshes.
                    row = int(v * 16)
                    value -= 0.28 if (((u * 10) + (0.5 if row % 2 else 0.0)) % 1.0) < 0.055 else 0.0
                    value -= 0.22 if (v * 16 % 1.0) < 0.055 else 0.0
                    value += math.sin(x * 0.55 + y * 0.24) * 0.030
            elif column == 1:
                # Vertical plank ribs for the doors.
                value -= 0.20 if (((u * 3.0 - column) * 9) % 1.0) < 0.09 else 0.0
                value += math.sin(y * 0.66 + math.sin(x * 0.18) * 1.4) * 0.048
            else:
                value += math.sin(x * 0.22 + y * 0.05) * 0.032
                edge = min(u * 3.0 - column, 1.0 - (u * 3.0 - column))
                value += 0.085 * (1.0 - min(1.0, edge * 7.0))
            occlusion = min(local, 1.0 - local)
            value -= 0.075 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.58, min(1.32, value))
            i = (y * size + x) * 4
            pixels[i] = max(0.0, min(1.0, base[0] * value))
            pixels[i + 1] = max(0.0, min(1.0, base[1] * value))
            pixels[i + 2] = max(0.0, min(1.0, base[2] * value))
            pixels[i + 3] = 1.0
    image.pixels = pixels
    image.pack()
    for mat in MATERIALS.values():
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        tex = nodes.get("atlas") or nodes.new("ShaderNodeTexImage")
        tex.name = "atlas"
        tex.image = image
        base_input = shader.inputs.get("Base Color")
        if base_input:
            for link in list(base_input.links):
                links.remove(link)
            links.new(tex.outputs["Color"], base_input)


def create_mesh(builder, name, parent, allowed, lod):
    data = bpy.data.meshes.new(name)
    data.from_pydata(builder.vertices, [], builder.faces)
    data.validate(verbose=False)
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    for slot in allowed:
        data.materials.append(MATERIALS[slot])
    slot_names = ("stone", "timber", "metal")
    uv = data.uv_layers.new(name="UVMap")
    colors = data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in data.polygons:
        material_index, band = SURFACES[builder.surfaces[polygon.index]]
        wanted = slot_names[material_index]
        polygon.material_index = allowed.index(wanted) if wanted in allowed else 0
        u0, v0 = material_index / 3.0, band / 4.0
        lift = 0.06 if polygon.normal.z > 0.55 else (-0.05 if polygon.normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.08, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            v = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (u0 + (0.05 + 0.90 * ((v.x * 0.22 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.05 + 0.90 * ((v.y * 0.36) % 1.0)) / 4.0)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    mesh["lodLevel"] = lod
    return mesh


def main():
    reset_scene()
    MATERIALS.clear()
    MATERIALS["stone"] = material("MAT_wallgate_stone", (0.198, 0.202, 0.216), 0.94, 0.02)
    MATERIALS["timber"] = material("MAT_wallgate_timber", (0.186, 0.120, 0.072), 0.74, 0.0)
    MATERIALS["metal"] = material("MAT_wallgate_metal", (0.176, 0.190, 0.212), 0.34, 0.86)
    make_atlas()

    root = orient_for_babylon(empty("WallGateRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = "wall_gate"

    gate_root = empty("gateRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES")
    gate_root.parent = root

    for level in (0, 1, 2):
        parent = root
        if level > 0:
            parent = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            parent.parent = root
            parent["lodLevel"] = level
        wall_slots = ["stone", "timber", "metal"] if level == 0 else (["stone", "metal"] if level == 1 else ["stone"])
        create_mesh(add_wall(level), f"LOD{level}_PROD_wall", parent, wall_slots, level)

    # Doors: separate meshes on their own hinge pivots, because the runtime
    # swings them open and closed.
    pivots = []
    for name, x, direction in (("gateDoorLeft", -1.25, 1), ("gateDoorRight", 1.25, -1)):
        pivot = empty(f"{name}Pivot", (x, 0, -0.82), "EXPORT", "PLAIN_AXES")
        pivot.parent = gate_root
        door = create_mesh(add_door(0, direction), name, pivot, ["timber", "metal"], 0)
        door.location = (0, 0, 0)
        pivots.append((pivot, direction))

    collider = empty("gateCollider", (0, WALL_H * 0.5, -0.82), "EXPORT", "PLAIN_AXES")
    collider.parent = gate_root
    trigger = empty("friendlyPassTrigger", (0, 0.6, 0.0), "EXPORT", "PLAIN_AXES")
    trigger.parent = gate_root
    collision_box("COL_WallGate", (BLOCK_W * 2 + GATE_HALF * 2, WALL_H + 0.5, WALL_D * 1.1),
                  (0, (WALL_H + 0.5) * 0.5, 0), root)

    for pivot, direction in pivots:
        add_simple_animation(pivot, "GateOpen", property_path="rotation_euler", index=1,
                             amount=direction * 1.35, end=20)
        add_simple_animation(pivot, "GateClose", property_path="rotation_euler", index=1,
                             amount=direction * 0.02, end=18)
    for name, amount, end in (("GateOpen", 0.01, 20), ("GateClose", -0.01, 18),
                              ("Damaged", 0.14, 14), ("Destroyed", -0.55, 18)):
        add_simple_animation(root, name, amount=amount, end=end)

    bpy.context.scene.frame_set(1)
    save_source(os.path.join(ROOT, "assets-source", "blender", "buildings", "wall_gate.blend"))
    export_glb(os.path.join(ROOT, "public", "assets", "models", "buildings", "wall_gate.glb"))
    print("wall_gate written")


if __name__ == "__main__":
    main()
