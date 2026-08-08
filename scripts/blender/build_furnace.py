"""Build the Frost Furnace, the game's centrepiece prop.

The furnace has its own generator for the same reason Hero and Warrior do:
it is on screen for the entire run, dead centre of frame, and it is the
object the whole settlement is built around. It deserves bespoke authoring
rather than a slot in a shared facility template.

Why this was rewritten
----------------------
The furnace shipped 94 mesh nodes, 124 primitives, 10 materials and 9
embedded images -- a stack of cylinders, spheres, a torus and ten
individually-placed masonry blocks. It was the single worst offender in the
library, and it is the asset the player looks at most.

Following ``docs/art/PRODUCTION_STANDARD.md``, the static shell is now one
merged mesh per LOD built from swept explicit cross-sections. Only the parts
that actually animate stay separate nodes, because they have to:

* ``heatCore``   -- the fire inside the bowl, pulses on Operate
* ``furnaceCrown`` -- the iron crown ring, lifts and rotates on Operate
* ``emitter``    -- an empty the VFX system spawns flame and embers from

The manifest contract (``FurnaceRoot``, ``heatCore``, ``furnaceCrown``,
``emitter``, ``LOD1``, ``LOD2`` + Idle/Operate/Damaged/Destroyed) is
unchanged, so no runtime code has to move.
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


# Cold quarried stone, dark iron, and the fire itself. The fire is the only
# saturated thing in the scene by design -- it is the settlement's focal
# point and the reason the snow reads as cold.
MATS = {
    "stone": (0.208, 0.212, 0.226),
    "iron": (0.132, 0.140, 0.156),
    "ember": (1.000, 0.420, 0.110),
}
SURFACES = {"stone": (0, 0), "course": (0, 1), "iron": (1, 0), "band": (1, 1), "ember": (2, 0), "coal": (2, 1)}
MATERIALS = {}

# Scale is held to the previous asset so gameplay framing, the furnace light
# and every camera preset keep working: base radius ~1.8, crown near y=2.8.
BASE_R = 1.82
BODY_R = 1.46
CROWN_Y = 2.64
FRONT = -1.0  # the fire chamber faces -Z, matching the old asset


def add_shell(level):
    """Everything that does not move, merged into one mesh."""
    b = MeshBuilder(level)
    n = (26, 14, 8)[level]

    # Stepped plinth into a tapering stack. The exponent climbs with height
    # so the base reads as cut blocks and the bowl reads as turned iron --
    # the same trick that stops the units looking lathed, used in reverse.
    b.sweep([
        (0.00, section(n, BASE_R, BASE_R, BASE_R, 2.2)),
        (0.26, section(n, BASE_R, BASE_R, BASE_R, 2.2)),
        (0.34, section(n, BASE_R * 0.94, BASE_R * 0.94, BASE_R * 0.94, 2.3)),
        (0.92, section(n, BASE_R * 0.86, BASE_R * 0.86, BASE_R * 0.86, 2.4)),
        (1.00, section(n, BASE_R * 0.90, BASE_R * 0.90, BASE_R * 0.90, 2.4)),
        (1.62, section(n, BODY_R * 1.06, BODY_R * 1.06, BODY_R * 1.06, 2.6)),
        (1.70, section(n, BODY_R * 1.10, BODY_R * 1.10, BODY_R * 1.10, 2.6)),
        (2.16, section(n, BODY_R, BODY_R, BODY_R, 2.9)),
        (2.40, section(n, BODY_R * 1.14, BODY_R * 1.14, BODY_R * 1.14, 3.1)),
    ], "stone", lambda y: {}, cap_top=False)

    # Open bowl: an inner wall dropping back down, so the fire sits in a
    # cavity instead of on a lid.
    b.sweep([
        (2.40, section(n, BODY_R * 1.06, BODY_R * 1.06, BODY_R * 1.06, 3.1)),
        (2.10, section(n, BODY_R * 0.86, BODY_R * 0.86, BODY_R * 0.86, 2.8)),
        (1.86, section(n, BODY_R * 0.72, BODY_R * 0.72, BODY_R * 0.72, 2.6)),
    ], "coal", lambda y: {}, cap_top=False)

    if level <= 1:
        # Two iron bands clamping the shell. Rings, not decals: they catch a
        # highlight and give the silhouette a horizontal break.
        for y, r in ((1.02, BASE_R * 0.93), (1.66, BODY_R * 1.13)):
            b.sweep([
                (y - 0.075, section(n, r, r, r, 2.5)),
                (y + 0.075, section(n, r, r, r, 2.5)),
            ], "band", lambda y: {}, cap_bottom=False, cap_top=False)

    # Fire chamber: a recessed arch on the front face with an iron frame and
    # a grate. This is the detail that makes it a furnace rather than a pot.
    z = FRONT * BASE_R
    b.prism([(-0.74, 0.62), (0.74, 0.62), (0.74, 1.58), (0.44, 1.86), (-0.44, 1.86), (-0.74, 1.58)],
            z * 0.99, 0.16, "iron", {})
    b.prism([(-0.56, 0.74), (0.56, 0.74), (0.56, 1.50), (0.33, 1.72), (-0.33, 1.72), (-0.56, 1.50)],
            z * 1.02, 0.14, "coal", {})
    if level == 0:
        for i in range(4):
            b.box((-0.42 + i * 0.28, 1.14, z * 1.05), (0.06, 0.90, 0.06), "iron", {})
        # Chimney vents around the crown, so the top edge is not a clean ring.
        for i in range(6):
            ang = math.tau * i / 6 + 0.26
            b.box((math.sin(ang) * BODY_R * 1.02, 2.30, math.cos(ang) * BODY_R * 1.02),
                  (0.20, 0.26, 0.20), "iron", {}, rotate_z=ang, taper=0.7)
    return b


def add_heat_core(level):
    """The fire in the bowl. Separate because Operate pulses it."""
    b = MeshBuilder(level)
    n = (14, 10, 6)[level]
    b.sweep([
        (1.86, section(n, BODY_R * 0.66, BODY_R * 0.66, BODY_R * 0.66, 2.4)),
        (2.12, section(n, BODY_R * 0.74, BODY_R * 0.74, BODY_R * 0.74, 2.2)),
        (2.34, section(n, BODY_R * 0.50, BODY_R * 0.50, BODY_R * 0.50, 2.0)),
        (2.62, section(n, BODY_R * 0.20, BODY_R * 0.20, BODY_R * 0.20, 2.0)),
    ], "ember", lambda y: {})
    return b


def add_crown(level):
    """Iron crown ring above the bowl. Lifts and turns on Operate."""
    b = MeshBuilder(level)
    n = (20, 12, 8)[level]
    r = BODY_R * 1.20
    b.sweep([
        (CROWN_Y - 0.10, section(n, r, r, r, 2.6)),
        (CROWN_Y, section(n, r * 1.06, r * 1.06, r * 1.06, 2.6)),
        (CROWN_Y + 0.10, section(n, r, r, r, 2.6)),
    ], "band", lambda y: {}, cap_bottom=False, cap_top=False)
    if level == 0:
        for i in range(8):
            ang = math.tau * i / 8
            b.box((math.sin(ang) * r * 1.02, CROWN_Y + 0.20, math.cos(ang) * r * 1.02),
                  (0.14, 0.30, 0.14), "band", {}, rotate_z=ang, taper=0.5)
    return b


def make_atlas():
    """Quarried stone, dark iron and ember heat in one 512 atlas."""
    size = 512
    name = "FURNACE_ATLAS"
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    course = tuple(min(1.0, c * 1.28 + 0.03) for c in MATS["stone"])
    band = tuple(min(1.0, c * 1.55 + 0.04) for c in MATS["iron"])
    coal = (0.055, 0.048, 0.046)
    bands = {0: (MATS["stone"], course, MATS["stone"], MATS["stone"]),
             1: (MATS["iron"], band, MATS["iron"], MATS["iron"]),
             2: (MATS["ember"], coal, MATS["ember"], MATS["ember"])}
    for y in range(size):
        v = y / size
        band_index = min(3, int(v * 4))
        local = v * 4.0 - band_index
        for x in range(size):
            u = x / size
            column = min(2, int(u * 3))
            base = bands[column][band_index]
            value = 1.0
            if column == 0:
                # Masonry: horizontal courses with a staggered vertical joint,
                # plus fine grain. This replaces ten separate brick meshes.
                row = int(v * 26)
                joint = ((u * 18 + (0.5 if row % 2 else 0.0)) % 1.0)
                value -= 0.30 if joint < 0.055 else 0.0
                value -= 0.26 if (v * 26 % 1.0) < 0.07 else 0.0
                value += math.sin(x * 0.7 + y * 0.31) * 0.030
            elif column == 1:
                value += math.sin(x * 0.24 + y * 0.06) * 0.035
                edge = min(u * 3.0 - column, 1.0 - (u * 3.0 - column))
                value += 0.090 * (1.0 - min(1.0, edge * 7.0))
                if ((x * 5 + y * 3) % 61) < 2:
                    value -= 0.05
            else:
                # Ember: a hot core falling off to charred edges.
                value += math.sin(x * 0.5 + math.sin(y * 0.2) * 2.0) * 0.10
                value += 0.14 * max(0.0, math.sin(y * 0.33))
            occlusion = min(local, 1.0 - local)
            value -= 0.075 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.55, min(1.40, value))
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
    slot_names = ("stone", "iron", "ember")
    uv = data.uv_layers.new(name="UVMap")
    colors = data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in data.polygons:
        material_index, band = SURFACES[builder.surfaces[polygon.index]]
        wanted = slot_names[material_index]
        polygon.material_index = allowed.index(wanted) if wanted in allowed else 0
        u0, v0 = material_index / 3.0, band / 4.0
        # COLOR_0 is a multiplier, so it stays near white and only carries
        # directional shade -- writing tints here would double-darken.
        lift = 0.06 if polygon.normal.z > 0.55 else (-0.05 if polygon.normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.08, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            v = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (u0 + (0.05 + 0.90 * ((v.x * 0.32 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.05 + 0.90 * ((v.y * 0.34) % 1.0)) / 4.0)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    mesh["lodLevel"] = lod
    return mesh


def main():
    reset_scene()
    MATERIALS["stone"] = material("MAT_furnace_stone", MATS["stone"], 0.94, 0.0)
    MATERIALS["iron"] = material("MAT_furnace_iron", MATS["iron"], 0.36, 0.88)
    MATERIALS["ember"] = material("MAT_furnace_ember", MATS["ember"], 0.62, 0.0, emission=MATS["ember"])
    make_atlas()

    root = orient_for_babylon(empty("FurnaceRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = "furnace"
    root["productionTemplate"] = "Furnace-B3"

    animated = {}
    for level in (0, 1, 2):
        parent = root
        if level > 0:
            parent = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            parent.parent = root
            parent["lodLevel"] = level
        shell_slots = ["stone", "iron", "ember"] if level == 0 else (["stone", "iron"] if level == 1 else ["stone"])
        create_mesh(add_shell(level), f"LOD{level}_PROD_shell", parent, shell_slots, level)
        # The two animated parts keep the contract names at LOD0 so the
        # runtime and the validator find them; the lower tiers carry
        # suffixed copies purely as geometry.
        core_name = "heatCore" if level == 0 else f"LOD{level}_PROD_heatCore"
        crown_name = "furnaceCrown" if level == 0 else f"LOD{level}_PROD_crown"
        core = create_mesh(add_heat_core(level), core_name, parent, ["ember"], level)
        crown = create_mesh(add_crown(level), crown_name, parent, ["iron"], level)
        if level == 0:
            animated["heatCore"] = core
            animated["furnaceCrown"] = crown

    emitter = empty("emitter", (0, 2.30, 0), "EXPORT", "PLAIN_AXES")
    emitter.parent = root
    emitter["socketRole"] = "flame and ember spawn"
    collision_box("COL_Furnace", (BASE_R * 2.1, 2.9, BASE_R * 2.1), (0, 1.45, 0), root)

    # Contract clips. Idle breathes, Operate drives the fire and turns the
    # crown, Damaged jolts, Destroyed collapses.
    for name, amount, end in (("Idle", 0.02, 24), ("Operate", 0.10, 20), ("Damaged", 0.16, 14), ("Destroyed", -0.55, 18)):
        add_simple_animation(root, name, amount=amount, end=end)
    add_simple_animation(animated["heatCore"], "Operate", property_path="scale", index=1, amount=1.22, end=20)
    add_simple_animation(animated["heatCore"], "Idle", property_path="scale", index=1, amount=1.06, end=24)
    add_simple_animation(animated["furnaceCrown"], "Operate", property_path="rotation_euler", index=1, amount=0.42, end=20)

    bpy.context.scene.frame_set(1)
    save_source(os.path.join(ROOT, "assets-source", "blender", "buildings", "furnace.blend"))
    export_glb(os.path.join(ROOT, "public", "assets", "models", "buildings", "furnace.glb"))
    print("furnace written")


if __name__ == "__main__":
    main()
