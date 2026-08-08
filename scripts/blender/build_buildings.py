"""Build the economy and attack facilities on the shared art standard.

Owns 11 assets: 7 economy buildings and 4 attack emplacements. The furnace
moved to ``build_furnace.py`` (it is the centrepiece prop and is authored
bespoke, like Hero and Warrior); ``turret_basic`` and ``wall_gate`` keep
their own scripts.

Why this was rewritten
----------------------
Each facility shipped 42-68 mesh nodes, 57-91 primitives, 10-15 materials and
9-14 embedded images -- a pile of boxes, cylinders and spheres. Across the
library that was ~700 primitives of pure draw-call cost for buildings that
still read as blockouts.

Per ``docs/art/PRODUCTION_STANDARD.md`` the static shell is now one merged
mesh per LOD, swept from explicit cross-sections. **Only nodes that actually
have to move stay separate**, and for the attack emplacements that is not a
modelling preference: the runtime aims them by driving `yawPivot` and
`pitchPivot` and spawns projectiles at `muzzle`, so that hierarchy is a hard
contract.

Facilities differ by archetype -- footprint, height, roof and mass -- so a
mine does not read as a warehouse with different paint.
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


SURFACES = {"wall": (0, 0), "roof": (0, 1), "accent": (0, 2),
            "timber": (1, 0), "trim": (1, 1),
            "metal": (2, 0), "glow": (2, 1)}
MATERIALS = {}

# Footprint half-width / half-depth, wall height, roof style and pitch.
#
# Economy walls were raised about 30% and their roof peaks by more, because
# at the gameplay camera these sat no taller than the terrain rock they were
# standing next to and the pitched roofs were too shallow to read as roofs.
# Footprints are unchanged, so slot layout and placement checks still hold.
# Attack emplacements keep their wall and peak untouched: `muzzle` hangs off
# yawPivot at `top + 0.10`, so their height is where projectiles spawn.
# These are what make a silhouette identifiable from the gameplay camera.
FACILITIES = {
    # --- economy -----------------------------------------------------------
    "mine":           dict(kind="economy", w=1.30, d=1.15, wall=1.52, roof="pitched", peak=1.18,
                           body=(0.439, 0.434, 0.446), accent=(0.42, 0.62, 0.70), prop="headframe"),
    "gold_mine":      dict(kind="economy", w=1.30, d=1.15, wall=1.52, roof="pitched", peak=1.18,
                           body=(0.465, 0.425, 0.378), accent=(1.00, 0.66, 0.14), prop="headframe"),
    "lumberyard":     dict(kind="economy", w=1.55, d=1.20, wall=1.28, roof="pitched", peak=0.98,
                           body=(0.482, 0.388, 0.296), accent=(0.82, 0.48, 0.18), prop="sawblade"),
    "warehouse":      dict(kind="economy", w=1.70, d=1.30, wall=1.40, roof="barrel", peak=1.02,
                           body=(0.446, 0.408, 0.358), accent=(0.94, 0.70, 0.30), prop="crates"),
    "recruit_hall":   dict(kind="economy", w=1.35, d=1.20, wall=2.02, roof="pitched", peak=1.34,
                           body=(0.390, 0.385, 0.446), accent=(0.84, 0.32, 0.20), prop="banner"),
    "auto_collector": dict(kind="economy", w=0.95, d=0.95, wall=2.08, roof="flat", peak=0.34,
                           body=(0.334, 0.390, 0.415), accent=(0.30, 1.00, 0.64), prop="pylon"),
    "auto_rebuilder": dict(kind="economy", w=0.95, d=0.95, wall=2.08, roof="flat", peak=0.34,
                           body=(0.344, 0.378, 0.423), accent=(0.30, 0.72, 1.00), prop="pylon"),
    # --- attack ------------------------------------------------------------
    "crossbow_tower": dict(kind="attack", w=0.98, d=0.98, wall=2.05, roof="battlement", peak=0.30,
                           body=(0.456, 0.390, 0.313), accent=(0.94, 0.60, 0.20), barrel="bolt"),
    "frost_tower":    dict(kind="attack", w=0.92, d=0.92, wall=2.25, roof="spire", peak=0.75,
                           body=(0.366, 0.502, 0.568), accent=(0.44, 0.94, 1.00), barrel="crystal"),
    "sniper_tower":   dict(kind="attack", w=0.86, d=0.86, wall=2.60, roof="flat", peak=0.22,
                           body=(0.410, 0.420, 0.456), accent=(0.52, 0.86, 1.00), barrel="long"),
    "mortar":         dict(kind="attack", w=1.25, d=1.25, wall=0.80, roof="flat", peak=0.18,
                           body=(0.390, 0.398, 0.427), accent=(1.00, 0.34, 0.12), barrel="stub"),
}

BARREL_LENGTH = {"bolt": 1.15, "crystal": 0.85, "long": 1.55, "stub": 0.72}
BARREL_RADIUS = {"bolt": 0.11, "crystal": 0.17, "long": 0.09, "stub": 0.23}


def add_shell(level, cfg):
    """Static structure: plinth, walls, roof and fixed detail, merged."""
    b = MeshBuilder(level)
    # Multiples of four only. A superellipse puts its corners at 45 degrees,
    # so a ring whose segment count is not divisible by four has no vertex
    # there and cuts the corner off -- which is exactly how these lost their
    # rectangular read on LOD1 and LOD2, the tiers the gameplay camera uses.
    n = (16, 12, 8)[level]
    w, d, wall = cfg["w"], cfg["d"], cfg["wall"]

    # section()'s exponent is rectangular ABOVE 2 and diamond-shaped below it;
    # 2 is a plain ellipse. This file previously passed 1.3-1.6 everywhere with
    # a comment claiming that was near-rectangular, so every facility was swept
    # from cross-sections rounder than a circle. At the gameplay camera the
    # result was indistinguishable from the decoration rocks scattered around
    # the arena -- the whole reason facilities read as "just a boulder".
    def plan(scale=1.0, exp=6.0):
        return section(n, w * scale, d * scale, d * scale, exp)

    b.sweep([
        (0.00, plan(1.10, 7.0)),
        (0.16, plan(1.10, 7.0)),
        (0.24, plan(1.00, 6.0)),
        (wall * 0.55, plan(0.985, 5.5)),
        (wall, plan(0.96, 5.5)),
    ], "wall", lambda y: {}, cap_top=False)

    roof, peak = cfg["roof"], cfg["peak"]
    if roof == "pitched":
        b.sweep([
            (wall, plan(1.12, 7.0)),
            (wall + 0.10, plan(1.10, 7.0)),
            (wall + peak, section(n, w * 0.10, d * 1.02, d * 1.02, 7.0)),
        ], "roof", lambda y: {})
    elif roof == "barrel":
        rings = []
        for i in range(5):
            t = i / 4.0
            rings.append((wall + peak * math.sin(t * math.pi * 0.5),
                          section(n, w * (1.10 - 0.30 * t * t), d * 1.06, d * 1.06, 5.0)))
        b.sweep(rings, "roof", lambda y: {})
    elif roof == "spire":
        b.sweep([
            (wall, plan(1.14, 6.0)),
            (wall + 0.12, plan(1.06, 6.0)),
            (wall + peak, section(n, w * 0.08, d * 0.08, d * 0.08, 5.0)),
        ], "roof", lambda y: {})
    elif roof == "battlement":
        b.sweep([(wall, plan(1.16, 7.0)), (wall + peak, plan(1.16, 7.0))], "roof", lambda y: {}, cap_top=False)
        if level == 0:
            for i in range(8):
                ang = math.tau * i / 8
                b.box((math.sin(ang) * w * 1.10, wall + peak + 0.14, math.cos(ang) * d * 1.10),
                      (0.22, 0.28, 0.22), "roof", {}, rotate_z=ang, taper=0.9)
    else:  # flat
        b.sweep([(wall, plan(1.10, 6.0)), (wall + peak, plan(1.02, 6.0))], "roof", lambda y: {})

    if level <= 1:
        # A timber sill band: the horizontal break that stops a wall reading
        # as one extruded slab.
        b.sweep([
            (wall * 0.52, plan(1.03, 6.0)),
            (wall * 0.60, plan(1.03, 6.0)),
        ], "timber", lambda y: {}, cap_bottom=False, cap_top=False)
    if level == 0:
        for sx in (-1, 1):
            for sz in (-1, 1):
                b.box((sx * w * 0.95, wall * 0.5, sz * d * 0.95), (0.16, wall, 0.16), "timber", {}, taper=0.92)
        # Door on -Z, so every facility has a readable front.
        b.prism([(-w * 0.32, 0.05), (w * 0.32, 0.05), (w * 0.32, wall * 0.62),
                 (0.0, wall * 0.78), (-w * 0.32, wall * 0.62)], -d * 1.02, 0.10, "timber", {})
    return b


def add_prop(level, cfg):
    """Fixed role prop, merged into a second mesh."""
    kind = cfg.get("prop")
    if not kind:
        return None
    b = MeshBuilder(level)
    n = (12, 8, 6)[level]
    w, d, wall = cfg["w"], cfg["d"], cfg["wall"]
    if kind == "headframe":
        # A pit-head A-frame: the unmistakable mine silhouette.
        for sx in (-1, 1):
            b.prism([(sx * w * 0.62, wall + 0.10), (sx * w * 0.30, wall + 1.35),
                     (sx * w * 0.16, wall + 1.30), (sx * w * 0.48, wall + 0.10)], 0.0, 0.14, "metal", {})
        b.box((0.0, wall + 1.34, 0.0), (w * 0.70, 0.16, 0.24), "metal", {}, taper=0.9)
    elif kind == "sawblade":
        b.sweep([(wall + 0.42, section(n, w * 0.44, 0.06, 0.06, 2.0)),
                 (wall + 0.50, section(n, w * 0.44, 0.06, 0.06, 2.0))], "metal", lambda y: {})
        b.box((0.0, wall + 0.20, 0.0), (0.18, 0.50, 0.18), "metal", {}, taper=0.8)
    elif kind == "crates":
        for x, z, hgt in ((-0.55, 0.72, 0.42), (0.42, 0.78, 0.34), (-0.10, 0.86, 0.28)):
            b.box((x * w, hgt * 0.5, z * d), (0.46, hgt, 0.44), "metal", {}, taper=0.96)
    elif kind == "banner":
        b.box((0.0, wall * 0.5, -d * 1.16), (0.12, wall * 1.5, 0.12), "metal", {}, taper=0.9)
        b.prism([(-0.05, wall * 1.16), (0.62, wall * 1.10), (0.58, wall * 0.62), (-0.05, wall * 0.68)],
                -d * 1.16, 0.05, "glow", {})
    elif kind == "pylon":
        b.sweep([(wall + 0.28, section(n, w * 0.30, d * 0.30, d * 0.30, 2.0)),
                 (wall + 0.62, section(n, w * 0.52, d * 0.52, d * 0.52, 2.0)),
                 (wall + 0.96, section(n, w * 0.18, d * 0.18, d * 0.18, 2.0))], "glow", lambda y: {})
    return b


def add_barrel(level, style):
    """The moving weapon mesh for attack emplacements."""
    b = MeshBuilder(level)
    n = (10, 8, 6)[level]
    length = BARREL_LENGTH[style]
    radius = BARREL_RADIUS[style]
    surface = "glow" if style == "crystal" else "metal"
    b.sweep([
        (0.0, section(n, radius * 1.5, radius * 1.5, radius * 1.5, 2.2)),
        (0.18, section(n, radius, radius, radius, 2.2)),
        (length, section(n, radius * 0.86, radius * 0.86, radius * 0.86, 2.2)),
    ], surface, lambda y: {})
    return b


def make_atlas(key, body, accent):
    size = 512
    name = f"ATLAS_{key}"
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    roof = tuple(max(0.0, c * 0.68) for c in body)
    timber = (0.446, 0.358, 0.278)
    trim = (0.520, 0.427, 0.332)
    metal = (0.439, 0.455, 0.480)
    bands = {0: (body, roof, accent, body), 1: (timber, trim, timber, timber), 2: (metal, accent, metal, metal)}
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
                # Plank ribs for roofs, staggered stone courses for walls.
                if band == 1:
                    value -= 0.22 if ((u * 26) % 1.0) < 0.09 else 0.0
                else:
                    row = int(v * 22)
                    value -= 0.24 if (((u * 14) + (0.5 if row % 2 else 0.0)) % 1.0) < 0.06 else 0.0
                    value -= 0.20 if (v * 22 % 1.0) < 0.06 else 0.0
                value += math.sin(x * 0.6 + y * 0.28) * 0.028
            elif column == 1:
                value += math.sin(y * 0.70 + math.sin(x * 0.2) * 1.5) * 0.055
                value -= 0.16 if (((u * 3.0 - column) * 12) % 1.0) < 0.08 else 0.0
            else:
                value += math.sin(x * 0.22 + y * 0.05) * 0.032
                edge = min(u * 3.0 - column, 1.0 - (u * 3.0 - column))
                value += 0.085 * (1.0 - min(1.0, edge * 7.0))
            occlusion = min(local, 1.0 - local)
            value -= 0.080 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.62, min(1.32, value))
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
    slot_names = ("wall", "timber", "metal")
    uv = data.uv_layers.new(name="UVMap")
    colors = data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in data.polygons:
        material_index, band = SURFACES[builder.surfaces[polygon.index]]
        wanted = slot_names[material_index]
        polygon.material_index = allowed.index(wanted) if wanted in allowed else 0
        u0, v0 = material_index / 3.0, band / 4.0
        # COLOR_0 is a multiplier; keep it near white or it double-darkens
        # against the atlas.
        lift = 0.06 if polygon.normal.z > 0.55 else (-0.05 if polygon.normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.08, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            v = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (u0 + (0.05 + 0.90 * ((v.x * 0.42 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.05 + 0.90 * ((v.y * 0.46) % 1.0)) / 4.0)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    mesh["lodLevel"] = lod
    return mesh


def build_facility(key, cfg):
    reset_scene()
    MATERIALS.clear()
    body = cfg["body"]
    MATERIALS["wall"] = material(f"MAT_{key}_wall", body, 0.92, 0.02)
    MATERIALS["timber"] = material(f"MAT_{key}_timber", (0.196, 0.126, 0.076), 0.72, 0.0)
    MATERIALS["metal"] = material(f"MAT_{key}_metal", (0.190, 0.205, 0.228), 0.34, 0.86)
    make_atlas(key, body, cfg["accent"])

    root = orient_for_babylon(empty("BuildingRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = key
    wall, w, d = cfg["wall"], cfg["w"], cfg["d"]
    top = wall + cfg["peak"]

    for level in (0, 1, 2):
        parent = root
        if level > 0:
            parent = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            parent.parent = root
            parent["lodLevel"] = level
        shell_slots = ["wall", "timber", "metal"] if level == 0 else (["wall", "metal"] if level == 1 else ["wall"])
        create_mesh(add_shell(level, cfg), f"LOD{level}_PROD_shell", parent, shell_slots, level)
        prop = add_prop(level, cfg)
        if prop and prop.faces:
            create_mesh(prop, f"LOD{level}_PROD_prop", parent, ["metal"], level)

    if cfg["kind"] == "economy":
        # `workPart` moves on Operate and `productionCore` is the glow the
        # runtime pulses; both are contract nodes the game drives directly.
        work = create_mesh(add_barrel(0, "stub"), "workPart", root, ["metal"], 0)
        work.location = (0.0, wall * 0.72, -d * 1.10)
        work.rotation_euler.x = math.pi * 0.5
        core = MeshBuilder(0)
        core.sweep([(0.0, section(10, 0.16, 0.16, 0.16, 2.0)),
                    (0.20, section(10, 0.22, 0.22, 0.22, 2.0)),
                    (0.40, section(10, 0.10, 0.10, 0.10, 2.0))], "glow", lambda y: {})
        core_mesh = create_mesh(core, "productionCore", root, ["metal"], 0)
        core_mesh.location = (0.0, top + 0.22, 0.0)
        add_simple_animation(work, "Operate", property_path="rotation_euler", index=2, amount=0.55, end=20)
        add_simple_animation(core_mesh, "Operate", property_path="scale", index=1, amount=1.25, end=20)
        add_simple_animation(core_mesh, "Idle", property_path="scale", index=1, amount=1.06, end=24)
        for name, amount, end in (("Idle", 0.02, 24), ("Operate", 0.08, 20), ("Damaged", 0.16, 14), ("Destroyed", -0.55, 18)):
            add_simple_animation(root, name, amount=amount, end=end)
    else:
        # Aiming hierarchy. The runtime rotates yawPivot/pitchPivot and
        # spawns at muzzle, so this parenting is a contract, not styling.
        yaw = empty("yawPivot", (0, top + 0.10, 0), "EXPORT", "PLAIN_AXES")
        yaw.parent = root
        pitch = empty("pitchPivot", (0, 0, 0), "EXPORT", "PLAIN_AXES")
        pitch.parent = yaw
        barrel = create_mesh(add_barrel(0, cfg["barrel"]), "barrel", pitch, ["metal"], 0)
        barrel.rotation_euler.x = -math.pi * 0.5
        muzzle = empty("muzzle", (0, 0, BARREL_LENGTH[cfg["barrel"]] + 0.12), "EXPORT", "PLAIN_AXES")
        muzzle.parent = pitch
        recoil = MeshBuilder(0)
        recoil.sweep([(0.0, section(10, 0.26, 0.26, 0.26, 2.0)),
                      (0.26, section(10, 0.22, 0.22, 0.22, 2.0))], "metal", lambda y: {})
        recoil_mesh = create_mesh(recoil, "recoilPart", pitch, ["metal"], 0)
        recoil_mesh.location = (0, -0.16, 0)
        add_simple_animation(yaw, "Aim", property_path="rotation_euler", index=1, amount=0.55, end=16)
        add_simple_animation(pitch, "Aim", property_path="rotation_euler", index=0, amount=-0.28, end=16)
        add_simple_animation(recoil_mesh, "Recoil", property_path="location", index=1, amount=-0.20, end=12)
        add_simple_animation(recoil_mesh, "Fire", property_path="scale", index=0, amount=1.10, end=12)
        for name, amount, end in (("Idle", 0.02, 24), ("Fire", -0.10, 12), ("Damaged", 0.16, 14), ("Destroyed", -0.55, 18)):
            add_simple_animation(root, name, amount=amount, end=end)

    collision_box("COL_Building", (w * 2.3, top + 0.3, d * 2.3), (0, (top + 0.3) * 0.5, 0), root)
    bpy.context.scene.frame_set(1)
    save_source(os.path.join(ROOT, "assets-source", "blender", "buildings", f"{key}.blend"))
    export_glb(os.path.join(ROOT, "public", "assets", "models", "buildings", f"{key}.glb"))
    print(f"facility written: {key} ({cfg['kind']})")


def main():
    only = None
    if "--" in sys.argv:
        rest = sys.argv[sys.argv.index("--") + 1:]
        if rest:
            only = set(rest)
    for key, cfg in FACILITIES.items():
        if only and key not in only:
            continue
        build_facility(key, cfg)


if __name__ == "__main__":
    main()
