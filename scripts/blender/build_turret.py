"""Build the basic turret on the shared art standard.

Keeps its own script because its contract differs from the emplacements in
``build_buildings.py``: the root is ``TurretRoot``, and it carries a
``Reload`` clip they do not have.

Previously 33 mesh nodes and 33 primitives of stacked boxes, cylinders and
spheres. The static mount is now one merged mesh per LOD; only the nodes the
runtime actually drives stay separate, because ``yawPivot``/``pitchPivot``
are how it aims and ``muzzle`` is where projectiles spawn.

Scale is held to the previous asset (base radius ~1.25, pivot at y≈1.1,
barrel ~1.65 long) so placement, collision and firing offsets keep working.
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

SURFACES = {"stone": (0, 0), "course": (0, 1), "timber": (1, 0), "trim": (1, 1),
            "metal": (2, 0), "ember": (2, 1)}
MATERIALS = {}
BASE_R = 1.25
PIVOT_Y = 1.10
BARREL_LEN = 1.62


def add_mount(level):
    """Plinth, turntable ring and the timber post the head sits on."""
    b = MeshBuilder(level)
    n = (16, 10, 6)[level]
    b.sweep([
        (0.00, section(n, BASE_R, BASE_R, BASE_R, 1.8)),
        (0.30, section(n, BASE_R, BASE_R, BASE_R, 1.8)),
        (0.38, section(n, BASE_R * 0.86, BASE_R * 0.86, BASE_R * 0.86, 2.0)),
        (0.58, section(n, BASE_R * 0.78, BASE_R * 0.78, BASE_R * 0.78, 2.2)),
    ], "stone", lambda y: {}, cap_top=False)
    # Turntable ring: the horizontal break that says "this part rotates".
    b.sweep([
        (0.58, section(n, BASE_R * 0.80, BASE_R * 0.80, BASE_R * 0.80, 2.4)),
        (0.72, section(n, BASE_R * 0.74, BASE_R * 0.74, BASE_R * 0.74, 2.4)),
    ], "metal", lambda y: {}, cap_bottom=False)
    b.sweep([
        (0.72, section(n, 0.30, 0.30, 0.30, 1.6)),
        (PIVOT_Y, section(n, 0.26, 0.26, 0.26, 1.6)),
    ], "timber", lambda y: {}, cap_bottom=False)
    if level == 0:
        for sx in (-1, 1):
            b.box((sx * 0.30, 0.92, 0.0), (0.12, 0.72, 0.44), "metal", {}, taper=0.86)
    return b


def add_head(level):
    """The rotating weapon: barrel, cowl and a hot muzzle collar."""
    b = MeshBuilder(level)
    n = (12, 8, 6)[level]
    b.sweep([
        (0.00, section(n, 0.17, 0.17, 0.17, 2.2)),
        (0.26, section(n, 0.13, 0.13, 0.13, 2.2)),
        (BARREL_LEN, section(n, 0.105, 0.105, 0.105, 2.2)),
    ], "metal", lambda y: {})
    if level <= 1:
        b.sweep([
            (0.30, section(n, 0.21, 0.21, 0.21, 2.4)),
            (0.46, section(n, 0.19, 0.19, 0.19, 2.4)),
        ], "metal", lambda y: {}, cap_bottom=False, cap_top=False)
    if level == 0:
        b.sweep([
            (BARREL_LEN - 0.10, section(n, 0.145, 0.145, 0.145, 2.2)),
            (BARREL_LEN + 0.04, section(n, 0.125, 0.125, 0.125, 2.2)),
        ], "ember", lambda y: {}, cap_bottom=False)
    return b


def make_atlas():
    size = 512
    name = "TURRET_ATLAS"
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    stone = (0.206, 0.210, 0.222)
    course = (0.262, 0.266, 0.278)
    timber = (0.196, 0.126, 0.076)
    trim = (0.268, 0.180, 0.108)
    metal = (0.186, 0.200, 0.224)
    ember = (1.000, 0.480, 0.150)
    bands = {0: (stone, course, stone, stone), 1: (timber, trim, timber, timber), 2: (metal, ember, metal, metal)}
    for y in range(size):
        v = y / size
        band = min(3, int(v * 4))
        local = v * 4.0 - band
        for x in range(size):
            u = x / size
            column = min(2, int(u * 3))
            base = bands[column][band]
            value = 1.0
            if column == 0:
                row = int(v * 20)
                value -= 0.24 if (((u * 13) + (0.5 if row % 2 else 0.0)) % 1.0) < 0.06 else 0.0
                value -= 0.18 if (v * 20 % 1.0) < 0.06 else 0.0
            elif column == 1:
                value += math.sin(y * 0.72 + math.sin(x * 0.2) * 1.5) * 0.055
            else:
                value += math.sin(x * 0.24 + y * 0.06) * 0.035
                edge = min(u * 3.0 - column, 1.0 - (u * 3.0 - column))
                value += 0.090 * (1.0 - min(1.0, edge * 7.0))
            occlusion = min(local, 1.0 - local)
            value -= 0.080 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.60, min(1.34, value))
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
            uv.data[loop_index].uv = (u0 + (0.05 + 0.90 * ((v.x * 0.44 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.05 + 0.90 * ((v.y * 0.48) % 1.0)) / 4.0)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    mesh["lodLevel"] = lod
    return mesh


def main():
    reset_scene()
    MATERIALS.clear()
    MATERIALS["stone"] = material("MAT_turret_stone", (0.206, 0.210, 0.222), 0.92, 0.02)
    MATERIALS["timber"] = material("MAT_turret_timber", (0.196, 0.126, 0.076), 0.72, 0.0)
    MATERIALS["metal"] = material("MAT_turret_metal", (0.186, 0.200, 0.224), 0.32, 0.88)
    make_atlas()

    root = orient_for_babylon(empty("TurretRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = "turret_basic"

    yaw = empty("yawPivot", (0, PIVOT_Y, 0), "EXPORT", "PLAIN_AXES")
    yaw.parent = root
    pitch = empty("pitchPivot", (0, 0.15, 0), "EXPORT", "PLAIN_AXES")
    pitch.parent = yaw

    for level in (0, 1, 2):
        parent = root
        if level > 0:
            parent = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            parent.parent = root
            parent["lodLevel"] = level
        mount_slots = ["stone", "timber", "metal"] if level == 0 else (["stone", "metal"] if level == 1 else ["stone"])
        create_mesh(add_mount(level), f"LOD{level}_PROD_mount", parent, mount_slots, level)
        # Lower tiers carry a static copy of the head so the turret does not
        # lose its barrel at distance; only LOD0's is the contract node.
        head_name = "barrel" if level == 0 else f"LOD{level}_PROD_head"
        head_parent = pitch if level == 0 else parent
        head = create_mesh(add_head(level), head_name, head_parent, ["metal"], level)
        if level == 0:
            head.rotation_euler.x = -math.pi * 0.5
        else:
            head.location = (0, PIVOT_Y + 0.15, 0)
            head.rotation_euler.x = -math.pi * 0.5

    muzzle = empty("muzzle", (0, 0, BARREL_LEN + 0.10), "EXPORT", "PLAIN_AXES")
    muzzle.parent = pitch
    recoil = MeshBuilder(0)
    recoil.sweep([(0.0, section(10, 0.24, 0.24, 0.24, 2.0)),
                  (0.30, section(10, 0.20, 0.20, 0.20, 2.0))], "timber", lambda y: {})
    recoil_mesh = create_mesh(recoil, "recoilPart", pitch, ["timber"], 0)
    recoil_mesh.location = (0, -0.18, 0)

    collision_box("COL_Turret", (BASE_R * 2.1, 2.0, BASE_R * 2.1), (0, 1.0, 0), root)

    add_simple_animation(yaw, "Aim", property_path="rotation_euler", index=1, amount=0.60, end=16)
    add_simple_animation(pitch, "Aim", property_path="rotation_euler", index=0, amount=-0.30, end=16)
    add_simple_animation(recoil_mesh, "Recoil", property_path="location", index=1, amount=-0.22, end=12)
    add_simple_animation(recoil_mesh, "Fire", property_path="scale", index=0, amount=1.12, end=12)
    add_simple_animation(recoil_mesh, "Reload", property_path="location", index=1, amount=-0.10, end=20)
    for name, amount, end in (("Idle", 0.02, 24), ("Fire", -0.08, 12), ("Reload", 0.05, 20)):
        add_simple_animation(root, name, amount=amount, end=end)

    bpy.context.scene.frame_set(1)
    save_source(os.path.join(ROOT, "assets-source", "blender", "buildings", "turret_basic.blend"))
    export_glb(os.path.join(ROOT, "public", "assets", "models", "buildings", "turret_basic.glb"))
    print("turret written")


if __name__ == "__main__":
    main()
