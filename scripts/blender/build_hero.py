"""Build the Hero on the shared art standard.

The player character, so it stays the most detailed figure in the game --
but it was also the largest budget violation left in the library: 18,080
LOD0 triangles against a 12,000 hero cap, and 3.72 MB against a 2.5 MB cap,
built from 15 separately-named LOD0 parts.

The body is now merged into one skinned mesh per LOD, swept from explicit
cross-sections via ``authoring.py``, with the melee blade as a second mesh
rigid to ``hand.R``. Hero keeps a taller, caped, heavier silhouette than any
roster unit so it still reads as the player at a glance.

**The seven animation clips are preserved verbatim** from the R7 asset. They
are good work -- a four-beat melee and a ranged sequence that keeps the
support hand on the carbine -- and nothing about the geometry rewrite
required touching them.

Contract kept unchanged: ``HeroRoot``, ``HeroSkeleton``, ``weapon_socket.R``,
``ranged_socket``, ``LOD1``, ``LOD2``, 18 bones, and Idle / Walk / Run /
MeleeAttack / RangedAttack / Hit / Death.
"""
import math
import os
import sys
from array import array

import bpy
from mathutils import Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import (  # noqa: E402
    collision_box, empty, export_glb, material, orient_for_babylon,
    reset_scene, save_source, collection,
)
from authoring import MeshBuilder, section  # noqa: E402

SURFACES = {"coat": (0, 0), "trim": (0, 1), "accent": (0, 2),
            "leather": (1, 0), "glove": (1, 1),
            "metal": (2, 0), "edge": (2, 1)}
MATERIALS = {}
BONE_ORDER = ("root", "pelvis", "spine", "chest", "neck", "head",
              "upper_arm.L", "lower_arm.L", "hand.L", "upper_arm.R", "lower_arm.R", "hand.R",
              "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R")

# Hero is deliberately taller and broader than any roster archetype: the
# player should be findable in a crowd without relying on the marker.
H = 1.19
# Tall and broad on purpose. The gameplay review asserts the Hero occupies
# at least 64x135 screen pixels so the player stays findable in a melee;
# the first rebuild measured 60.25 wide and then 130.77 tall. Note that
# raising H alone made the projected width *shrink*: it lifts the shoulders
# away from the review camera's aim point, so the breadth constants below
# have to be widened directly rather than inherited from height. Both are also
# the right answer artistically -- the player should be the most present
# figure on screen, taller and broader than any roster archetype.
# The collision box below is deliberately left at the previous gameplay
# dimensions: it is a movement capsule, not a visual bound.
SHOULDER = 0.392
CHEST_D = 0.224
WAIST = 0.236
HIP = 0.268
LIMB = 0.098
COAT = (0.340, 0.370, 0.420)
ACCENT = (0.96, 0.62, 0.20)


def blend(bone, secondary=None, amount=0.18):
    return {bone: 1.0} if not secondary else {bone: 1.0 - amount, secondary: amount}


def torso_weights(y):
    if y < 0.72 * H:
        return blend("pelvis", "spine", 0.30)
    if y < 1.00 * H:
        return blend("spine", "chest", 0.40)
    if y < 1.36 * H:
        return blend("chest", "spine", 0.18)
    return blend("chest", "neck", 0.34)


def head_weights(y):
    return blend("neck", "chest", 0.24) if y < 1.52 * H else blend("head", "neck", 0.12)


def arm_weights(side, y):
    upper, lower, hand = f"upper_arm.{side}", f"lower_arm.{side}", f"hand.{side}"
    if y > 1.16 * H:
        return blend(upper, "chest", 0.16)
    if y > 1.00 * H:
        return blend(upper, lower, 0.26)
    if y > 0.86 * H:
        return blend(lower, upper, 0.18)
    return blend(hand, lower, 0.22)


def leg_weights(side, y):
    thigh, shin, foot = f"thigh.{side}", f"shin.{side}", f"foot.{side}"
    if y > 0.50 * H:
        return blend(thigh, "pelvis", 0.18)
    if y > 0.32 * H:
        return blend(thigh, shin, 0.24)
    if y > 0.14 * H:
        return blend(shin, thigh, 0.20)
    return blend(foot, shin, 0.24)


def add_body(level):
    """One merged skinned mesh: coat, cape, pack, helmet, limbs, boots."""
    b = MeshBuilder(level)
    n_t = (26, 14, 8)[level]
    n_h = (20, 12, 6)[level]
    n_l = (16, 10, 6)[level]

    # Torso: broad chest over a cinched waist, trapezius sloping in hard so
    # the arms sit outboard of the body rather than buried inside it.
    b.sweep([
        (0.50 * H, section(n_t, HIP, HIP * 0.68, HIP * 0.72, 2.3)),
        (0.62 * H, section(n_t, HIP * 0.94, HIP * 0.64, HIP * 0.68, 2.5)),
        (0.76 * H, section(n_t, WAIST, WAIST * 0.70, WAIST * 0.74, 2.8)),
        (0.92 * H, section(n_t, WAIST * 1.12, WAIST * 0.80, WAIST * 0.78, 2.9)),
        (1.10 * H, section(n_t, SHOULDER * 0.94, CHEST_D, CHEST_D * 0.88, 3.0)),
        (1.24 * H, section(n_t, SHOULDER, CHEST_D * 1.04, CHEST_D * 0.90, 3.0)),
        (1.34 * H, section(n_t, SHOULDER * 0.92, CHEST_D * 0.94, CHEST_D * 0.86, 2.9)),
        (1.42 * H, section(n_t, SHOULDER * 0.58, CHEST_D * 0.72, CHEST_D * 0.68, 2.6)),
    ], "coat", torso_weights)

    # Coat skirt: the flare below the belt that separates Hero from the
    # roster's straight-hemmed jackets.
    b.sweep([
        (0.76 * H, section(n_t, WAIST * 1.02, WAIST * 0.74, WAIST * 0.78, 2.7)),
        (0.60 * H, section(n_t, HIP * 1.06, HIP * 0.76, HIP * 0.82, 2.5)),
        (0.42 * H, section(n_t, HIP * 1.18, HIP * 0.86, HIP * 0.96, 2.3)),
    ], "coat", lambda y: blend("pelvis", "spine", 0.28), cap_bottom=False, cap_top=False)

    b.sweep([
        (0.755 * H, section(n_t, WAIST * 1.06, WAIST * 0.76, WAIST * 0.80, 2.8)),
        (0.815 * H, section(n_t, WAIST * 1.08, WAIST * 0.78, WAIST * 0.82, 2.8)),
    ], "leather", torso_weights, cap_bottom=False, cap_top=False)

    # Cape hanging off the back: pure silhouette, and the clearest read that
    # this is the player and not another trooper.
    if level <= 1:
        b.prism([
            (-SHOULDER * 0.92, 1.34 * H), (SHOULDER * 0.92, 1.34 * H),
            (SHOULDER * 1.02, 0.86 * H), (SHOULDER * 0.78, 0.40 * H),
            (-SHOULDER * 0.78, 0.40 * H), (-SHOULDER * 1.02, 0.86 * H),
        ], -CHEST_D * 1.18, 0.05, "trim", blend("chest", "spine", 0.30))

    # Neck and head.
    b.sweep([
        (1.42 * H, section(n_h, 0.078, 0.078, 0.078, 2.4)),
        (1.53 * H, section(n_h, 0.074, 0.076, 0.076, 2.4)),
    ], "coat", head_weights, cap_bottom=False, cap_top=False)
    hd = 0.132
    b.sweep([
        (1.53 * H, section(n_h, hd * 0.80, hd * 0.84, hd * 0.78, 2.3, centre_z=0.008)),
        (1.60 * H, section(n_h, hd * 0.98, hd * 1.02, hd * 0.92, 2.7, centre_z=0.014)),
        (1.67 * H, section(n_h, hd, hd * 1.00, hd * 0.94, 3.0, centre_z=0.010)),
        (1.74 * H, section(n_h, hd * 0.92, hd * 0.90, hd * 0.90, 2.7, centre_z=0.000)),
        (1.79 * H, section(n_h, hd * 0.62, hd * 0.62, hd * 0.64, 2.3, centre_z=-0.006)),
    ], "coat", head_weights, cap_bottom=False)
    # Helmet shell over the cranium, plus a visor band across the brow.
    b.sweep([
        (1.58 * H, section(n_h, hd * 1.10, hd * 1.12, hd * 1.06, 2.8)),
        (1.72 * H, section(n_h, hd * 1.06, hd * 1.06, hd * 1.02, 2.7)),
        (1.82 * H, section(n_h, hd * 0.70, hd * 0.70, hd * 0.72, 2.4)),
    ], "metal", lambda y: blend("head", "neck", 0.10), cap_bottom=False)
    if level <= 1:
        # Face structure, matching the treatment given to the Warrior and the
        # roster: an overhanging brow, a centre line, recessed eye slits and a
        # cheek plate. The Hero wears a helmet shell already, so these read as
        # the front of that helm rather than as skin. Authored against this
        # rig's own head scale rather than shared, because brow height and head
        # width differ across the three character generators.
        fw = blend("head", "neck", 0.10)
        b.box((0.0, 1.700 * H, hd * 0.90), (hd * 1.58, hd * 0.28, hd * 0.42), "metal", fw, taper=0.80)
        b.box((0.0, 1.648 * H, hd * 0.94), (hd * 0.26, hd * 0.90, hd * 0.32), "metal", fw, taper=1.14)
        for sgn in (-1, 1):
            b.box((sgn * hd * 0.44, 1.674 * H, hd * 0.78), (hd * 0.46, hd * 0.18, hd * 0.17), "glove", fw, taper=0.92)
        for sgn in (-1, 1):
            b.prism([
                (sgn * hd * 0.50, 1.664 * H), (sgn * hd * 1.02, 1.652 * H),
                (sgn * hd * 0.96, 1.576 * H), (sgn * hd * 0.42, 1.566 * H),
            ], hd * 0.68, hd * 0.30, "metal", fw)

    if level == 0:
        b.box((0.0, 1.665 * H, hd * 0.80), (hd * 1.62, hd * 0.34, hd * 0.26), "accent",
              blend("head", "neck", 0.10), taper=0.86)

    # Survival pack on the back.
    if level <= 1:
        b.sweep([
            (0.94 * H, section(n_l, SHOULDER * 0.58, 0.10, 0.10, 2.2, centre_z=-CHEST_D * 1.06)),
            (1.14 * H, section(n_l, SHOULDER * 0.66, 0.13, 0.13, 2.4, centre_z=-CHEST_D * 1.10)),
            (1.30 * H, section(n_l, SHOULDER * 0.54, 0.10, 0.10, 2.2, centre_z=-CHEST_D * 1.06)),
        ], "leather", lambda y: blend("chest", "spine", 0.22))

    # Arms: deltoid cap outboard of the narrowed trapezius, then taper.
    for side, sgn in (("L", -1), ("R", 1)):
        sx = sgn * (SHOULDER * 0.86)
        b.sweep([
            (1.34 * H, section(n_l, LIMB * 0.92, LIMB * 0.96, LIMB * 0.92, 2.4, centre_x=sx * 0.96)),
            (1.26 * H, section(n_l, LIMB * 1.38, LIMB * 1.34, LIMB * 1.26, 2.6, centre_x=sx)),
            (1.12 * H, section(n_l, LIMB * 1.10, LIMB * 1.12, LIMB * 1.06, 2.5, centre_x=sgn * SHOULDER * 0.96)),
            (1.00 * H, section(n_l, LIMB * 0.88, LIMB * 0.90, LIMB * 0.88, 2.6, centre_x=sgn * SHOULDER * 1.02)),
            (0.90 * H, section(n_l, LIMB * 0.80, LIMB * 0.82, LIMB * 0.82, 2.6, centre_x=sgn * SHOULDER * 1.02, centre_z=0.012)),
        ], "coat", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        b.sweep([
            (0.90 * H, section(n_l, LIMB * 0.90, LIMB * 0.86, LIMB * 0.86, 2.6, centre_x=sgn * SHOULDER * 1.02, centre_z=0.016)),
            (0.82 * H, section(n_l, LIMB * 0.98, LIMB * 0.84, LIMB * 0.84, 3.0, centre_x=sgn * SHOULDER * 1.00, centre_z=0.036)),
            (0.75 * H, section(n_l, LIMB * 0.72, LIMB * 0.64, LIMB * 0.64, 2.6, centre_x=sgn * SHOULDER * 0.98, centre_z=0.050)),
        ], "glove", lambda y, s=side: arm_weights(s, y), cap_bottom=False)
        if level == 0:
            b.sweep([
                (1.32 * H, section(n_l, LIMB * 1.06, LIMB * 1.08, LIMB * 1.04, 2.6, centre_x=sx * 0.98)),
                (1.24 * H, section(n_l, LIMB * 1.66, LIMB * 1.60, LIMB * 1.52, 3.1, centre_x=sgn * SHOULDER * 0.90)),
                (1.14 * H, section(n_l, LIMB * 1.48, LIMB * 1.42, LIMB * 1.36, 3.0, centre_x=sgn * SHOULDER * 0.98)),
            ], "metal", lambda y, s=side: blend(f"upper_arm.{s}", "chest", 0.34))

    # Legs with real muscle staging, then a three-part boot.
    for side, sgn in (("L", -1), ("R", 1)):
        lx = sgn * 0.152
        b.sweep([
            (0.56 * H, section(n_l, LIMB * 1.50, LIMB * 1.46, LIMB * 1.54, 2.4, centre_x=lx)),
            (0.44 * H, section(n_l, LIMB * 1.36, LIMB * 1.34, LIMB * 1.42, 2.5, centre_x=lx)),
            (0.32 * H, section(n_l, LIMB * 1.04, LIMB * 1.12, LIMB * 1.04, 3.0, centre_x=lx)),
            (0.24 * H, section(n_l, LIMB * 1.12, LIMB * 1.08, LIMB * 1.26, 2.7, centre_x=lx)),
            (0.14 * H, section(n_l, LIMB * 0.86, LIMB * 0.88, LIMB * 0.92, 2.5, centre_x=lx)),
        ], "coat", lambda y, s=side: leg_weights(s, y), cap_top=False)
        fw = blend(f"foot.{side}", f"shin.{side}", 0.16)
        b.box((lx, 0.075 * H, 0.050), (LIMB * 2.5, 0.060 * H, LIMB * 5.0), "leather", fw, taper=0.96)
        b.box((lx, 0.030 * H, 0.046), (LIMB * 2.4, 0.042 * H, LIMB * 4.8), "metal", fw, taper=0.94)

    if level == 0:
        # Faction strip on the chest, the same amber the HUD uses.
        b.box((0.0, 1.16 * H, CHEST_D * 1.08), (SHOULDER * 0.22, SHOULDER * 0.40, 0.022), "accent",
              blend("chest", "spine", 0.32))
    return b


def add_blade(level):
    """Melee blade, rigid to hand.R."""
    b = MeshBuilder(level)
    n = (10, 8, 6)[level]
    w = {"hand.R": 1.0}
    hx = SHOULDER * 1.02
    hy = 0.82 * H
    b.sweep([
        (hy - 0.18 * H, section(n, LIMB * 0.30, LIMB * 0.30, LIMB * 0.30, 2.2, centre_x=hx, centre_z=0.06)),
        (hy + 0.04 * H, section(n, LIMB * 0.28, LIMB * 0.28, LIMB * 0.28, 2.2, centre_x=hx, centre_z=0.06)),
    ], "leather", lambda y: w)
    b.box((hx, hy + 0.07 * H, 0.06), (LIMB * 2.2, 0.05 * H, LIMB * 0.7), "metal", w, taper=0.9)
    b.prism([
        (hx - LIMB * 0.52, hy + 0.10 * H),
        (hx + LIMB * 0.52, hy + 0.10 * H),
        (hx + LIMB * 0.40, hy + 0.62 * H),
        (hx, hy + 0.80 * H),
        (hx - LIMB * 0.40, hy + 0.62 * H),
    ], 0.06, LIMB * 0.36, "edge", w)
    return b


def make_hero_skeleton(root):
    """Hero's own 18-bone rig at hero scale.

    Deliberately local rather than imported. This script previously pulled
    its rig and clip helpers out of ``build_units.py``; when that module was
    rewritten the import broke, and because ``hero.glb`` was already on disk
    the asset validator and both Hero tests kept passing against a stale
    artifact while the build script could no longer run at all.
    """
    data = bpy.data.armatures.new("HeroSkeleton")
    skeleton = bpy.data.objects.new("HeroSkeleton", data)
    collection("RIG").objects.link(skeleton)
    skeleton.parent = root
    bpy.context.view_layer.objects.active = skeleton
    skeleton.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    if len(data.edit_bones):
        data.edit_bones.remove(data.edit_bones[0])
    specs = [
        ("root", (0, 0, 0), (0, 0.16 * H, 0), None),
        ("pelvis", (0, 0.50 * H, 0), (0, 0.76 * H, 0), "root"),
        ("spine", (0, 0.76 * H, 0), (0, 1.04 * H, 0), "pelvis"),
        ("chest", (0, 1.04 * H, 0), (0, 1.42 * H, 0), "spine"),
        ("neck", (0, 1.42 * H, 0), (0, 1.53 * H, 0), "chest"),
        ("head", (0, 1.53 * H, 0), (0, 1.82 * H, 0), "neck"),
    ]
    for side, x in (("L", -1), ("R", 1)):
        specs += [
            (f"upper_arm.{side}", (x * 0.26 * H, 1.30 * H, 0), (x * 0.30 * H, 1.06 * H, 0), "chest"),
            (f"lower_arm.{side}", (x * 0.30 * H, 1.06 * H, 0), (x * 0.30 * H, 0.88 * H, 0.02), f"upper_arm.{side}"),
            (f"hand.{side}", (x * 0.30 * H, 0.88 * H, 0.02), (x * 0.28 * H, 0.76 * H, 0.06), f"lower_arm.{side}"),
            (f"thigh.{side}", (x * 0.12 * H, 0.54 * H, 0), (x * 0.13 * H, 0.32 * H, 0), "pelvis"),
            (f"shin.{side}", (x * 0.13 * H, 0.32 * H, 0), (x * 0.13 * H, 0.13 * H, 0.01), f"thigh.{side}"),
            (f"foot.{side}", (x * 0.13 * H, 0.13 * H, 0.01), (x * 0.13 * H, 0.03 * H, 0.14), f"shin.{side}"),
        ]
    bones = {}
    for name, head, tail, parent in specs:
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    skeleton["boneContract"] = "18 weighted bones"
    return skeleton


def add_clip(skeleton, name, end, poses):
    """Local copy, for the same decoupling reason as the skeleton above."""
    if not skeleton.animation_data:
        skeleton.animation_data_create()
    skeleton.animation_data.action = None
    for frame, pose in poses:
        bpy.context.scene.frame_set(frame)
        for bone in skeleton.pose.bones:
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            bone.location = (0.0, 0.0, 0.0)
        for bone_name, values in pose.items():
            bone = skeleton.pose.bones.get(bone_name)
            if not bone:
                continue
            bone.rotation_quaternion = Euler(values, "XYZ").to_quaternion()
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    action = skeleton.animation_data.action
    if action is None:
        raise RuntimeError(f"no action created for {name}")
    action.name = name
    track = skeleton.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = end
    skeleton.animation_data.action = None
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end, end)


def make_atlas():
    size = 1024
    name = "HERO_ATLAS"
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    trim = tuple(min(1.0, c * 1.42 + 0.05) for c in COAT)
    leather = (0.446, 0.346, 0.259)
    glove = (0.397, 0.308, 0.240)
    metal = (0.402, 0.420, 0.446)
    edge = (0.564, 0.587, 0.614)
    bands = {0: (COAT, trim, ACCENT, COAT), 1: (leather, glove, leather, leather), 2: (metal, edge, metal, metal)}
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
                warp = math.sin(x * 0.92) * 0.5 + math.sin(x * 0.31 + 1.1) * 0.5
                weft = math.sin(y * 1.83) * 0.5 + math.sin(y * 0.47) * 0.5
                value += warp * 0.020 + weft * 0.032
                if band == 2:
                    value += 0.050 * math.sin(y * 3.1)
            elif column == 1:
                value += math.sin(y * 0.63 + math.sin(x * 0.18) * 1.6) * 0.052
                value += 0.030 if math.sin(x * 0.27 + y * 0.09) > 0.90 else 0.0
            else:
                value += math.sin(x * 0.21 + y * 0.05) * 0.030
                edge_t = min(u * 3.0 - column, 1.0 - (u * 3.0 - column))
                value += 0.085 * (1.0 - min(1.0, edge_t * 7.0))
                if band == 1:
                    value += 0.055 * max(0.0, math.sin(y * 0.42))
            occlusion = min(local, 1.0 - local)
            value -= 0.085 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.68, min(1.28, value))
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


def create_mesh(builder, name, parent, skeleton, allowed, lod):
    data = bpy.data.meshes.new(name)
    data.from_pydata(builder.vertices, [], builder.faces)
    data.validate(verbose=False)
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    for slot in allowed:
        data.materials.append(MATERIALS[slot])
    slot_names = ("coat", "leather", "metal")
    uv = data.uv_layers.new(name="UVMap")
    colors = data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in data.polygons:
        material_index, band = SURFACES[builder.surfaces[polygon.index]]
        wanted = slot_names[material_index]
        polygon.material_index = allowed.index(wanted) if wanted in allowed else 0
        u0, v0 = material_index / 3.0, band / 4.0
        # COLOR_0 is a multiplier; near-white or it double-darkens the atlas.
        lift = 0.055 if polygon.normal.z > 0.55 else (-0.045 if polygon.normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.06, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            v = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (u0 + (0.06 + 0.88 * ((v.x * 1.3 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.06 + 0.88 * ((v.y * 0.55) % 1.0)) / 4.0)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    for bone_name in BONE_ORDER:
        mesh.vertex_groups.new(name=bone_name)
    for index, weights in enumerate(builder.weights):
        for bone_name, weight in weights.items():
            mesh.vertex_groups[bone_name].add([index], max(0.0, min(1.0, weight)), "REPLACE")
    modifier = mesh.modifiers.new("weighted skin", "ARMATURE")
    modifier.object = skeleton
    mesh["lodLevel"] = lod
    return mesh


def main():
    reset_scene()
    MATERIALS.clear()
    MATERIALS["coat"] = material("MAT_hero_coat", COAT, 0.90, 0.0)
    MATERIALS["leather"] = material("MAT_hero_leather", (0.236, 0.150, 0.090), 0.58, 0.06)
    MATERIALS["metal"] = material("MAT_hero_metal", (0.196, 0.212, 0.236), 0.30, 0.88)
    make_atlas()

    root = orient_for_babylon(empty("HeroRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = "hero"
    root["productionTemplate"] = "Hero-R8"
    skeleton = make_hero_skeleton(root)

    for level in (0, 1, 2):
        parent = root
        if level > 0:
            parent = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            parent.parent = root
            parent["lodLevel"] = level
        body_slots = ["coat", "leather", "metal"] if level == 0 else (["coat", "metal"] if level == 1 else ["coat"])
        create_mesh(add_body(level), f"LOD{level}_PROD_body", parent, skeleton, body_slots, level)
        blade_slots = ["leather", "metal"] if level < 2 else ["metal"]
        create_mesh(add_blade(level), f"LOD{level}_PROD_weapon", parent, skeleton, blade_slots, level)

    for name, position, kind in (
        ("weapon_socket.R", (SHOULDER * 1.02, 0.82 * H, 0.06), "weapon"),
        ("weapon_socket.L", (-SHOULDER * 1.02, 0.82 * H, 0.06), "weapon"),
        ("ranged_socket", (SHOULDER * 0.62, 1.22 * H, CHEST_D * 1.55), "ranged"),
    ):
        socket = empty(name, position, "EXPORT", "PLAIN_AXES")
        socket.parent = root
        socket["socketKind"] = kind
    collision_box("COL_Hero", (0.82, 1.9, 0.82), (0, 0.95, 0), root)

    add_clip(skeleton, "Idle", 24, [
        (1, {"pelvis": (0.008, 0.0, 0.0), "chest": (0.012, 0.0, 0.0)}),
        (8, {"pelvis": (-0.012, 0.0, 0.0), "chest": (0.032, 0.0, 0.0), "head": (0.0, 0.018, 0.0)}),
        (14, {"pelvis": (0.006, 0.0, 0.0), "chest": (-0.020, 0.0, 0.0), "head": (0.0, -0.014, 0.0)}),
        (20, {"pelvis": (-0.006, 0.0, 0.0), "chest": (-0.004, 0.0, 0.0)}),
        (24, {})
    ])
    add_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.38, 0, 0), "upper_arm.R": (-0.38, 0, 0), "lower_arm.L": (-0.20, 0, 0), "lower_arm.R": (0.20, 0, 0), "thigh.L": (-0.54, 0, 0), "thigh.R": (0.54, 0, 0), "foot.L": (0.15, 0, 0), "foot.R": (-0.15, 0, 0), "chest": (0.045, 0, 0), "head": (-0.02, 0, 0)}),
        (8, {"upper_arm.L": (-0.38, 0, 0), "upper_arm.R": (0.38, 0, 0), "lower_arm.L": (0.20, 0, 0), "lower_arm.R": (-0.20, 0, 0), "thigh.L": (0.54, 0, 0), "thigh.R": (-0.54, 0, 0), "foot.L": (-0.15, 0, 0), "foot.R": (0.15, 0, 0), "chest": (-0.028, 0, 0), "head": (0.015, 0, 0)}),
        (16, {"upper_arm.L": (0.30, 0, 0), "upper_arm.R": (-0.30, 0, 0), "lower_arm.L": (-0.10, 0, 0), "lower_arm.R": (0.10, 0, 0), "thigh.L": (-0.40, 0, 0), "thigh.R": (0.40, 0, 0), "chest": (0.025, 0, 0)}),
        (24, {}),
    ])
    add_clip(skeleton, "Run", 18, [
        (1, {"upper_arm.L": (0.70, 0, 0), "upper_arm.R": (-0.70, 0, 0), "lower_arm.L": (-0.30, 0, 0), "lower_arm.R": (0.30, 0, 0), "thigh.L": (-0.82, 0, 0), "thigh.R": (0.82, 0, 0), "chest": (0.14, 0, 0), "head": (-0.06, 0, 0)}),
        (6, {"upper_arm.L": (-0.70, 0, 0), "upper_arm.R": (0.70, 0, 0), "lower_arm.L": (0.30, 0, 0), "lower_arm.R": (-0.30, 0, 0), "thigh.L": (0.82, 0, 0), "thigh.R": (-0.82, 0, 0), "chest": (0.10, 0, 0), "head": (-0.03, 0, 0)}),
        (12, {"upper_arm.L": (0.56, 0, 0), "upper_arm.R": (-0.56, 0, 0), "lower_arm.L": (-0.16, 0, 0), "lower_arm.R": (0.16, 0, 0), "thigh.L": (-0.66, 0, 0), "thigh.R": (0.66, 0, 0), "chest": (0.11, 0, 0), "head": (-0.04, 0, 0)}),
        (18, {}),
    ])
    add_clip(skeleton, "MeleeAttack", 16, [
        # Low-ready: both feet and the torso establish a stable launch point.
        (1, {"upper_arm.R": (-0.70, -0.08, -0.14), "lower_arm.R": (-0.42, 0.18, 0.18), "hand.R": (-0.18, 0.0, 0.0), "upper_arm.L": (-0.12, 0.10, 0.08), "foot.L": (-0.08, 0.0, 0.0), "foot.R": (0.10, 0.0, 0.0), "head": (0.05, 0.02, -0.05), "chest": (0.12, 0.10, -0.08), "pelvis": (0.02, -0.06, 0.0)}),
        # Pull-back: pelvis and chest counter-rotate before the swing.
        (4, {"root": (0.0, -0.08, 0.05), "upper_arm.R": (-1.58, -0.18, -0.22), "lower_arm.R": (-0.88, 0.26, 0.22), "hand.R": (-0.42, 0.0, 0.05), "upper_arm.L": (0.36, 0.20, 0.12), "foot.L": (0.12, 0.0, 0.0), "foot.R": (-0.16, 0.0, 0.0), "head": (0.16, 0.04, -0.08), "chest": (-0.22, -0.20, -0.16), "pelvis": (0.16, 0.14, 0.05)}),
        # Maximum swing: shoulder, chest, pelvis, and support leg share the arc.
        (7, {"root": (0.0, 0.10, -0.06), "upper_arm.R": (1.54, 0.22, 0.28), "lower_arm.R": (0.74, -0.16, -0.18), "hand.R": (0.46, 0.0, -0.06), "upper_arm.L": (-0.34, -0.18, -0.08), "foot.L": (-0.10, 0.0, 0.0), "foot.R": (0.18, 0.0, 0.0), "head": (-0.14, -0.05, 0.06), "chest": (0.34, 0.22, 0.22), "pelvis": (-0.14, -0.12, -0.05)}),
        # Impact hold: two adjacent keys make the hit readable before recovery.
        (9, {"root": (0.0, 0.10, -0.06), "upper_arm.R": (1.54, 0.22, 0.28), "lower_arm.R": (0.74, -0.16, -0.18), "hand.R": (0.46, 0.0, -0.06), "upper_arm.L": (-0.34, -0.18, -0.08), "foot.L": (-0.10, 0.0, 0.0), "foot.R": (0.18, 0.0, 0.0), "head": (-0.14, -0.05, 0.06), "chest": (0.34, 0.22, 0.22), "pelvis": (-0.14, -0.12, -0.05)}),
        (10, {"root": (0.0, 0.08, -0.04), "upper_arm.R": (1.48, 0.20, 0.26), "lower_arm.R": (0.70, -0.14, -0.16), "hand.R": (0.42, 0.0, -0.05), "upper_arm.L": (-0.30, -0.16, -0.07), "foot.L": (-0.08, 0.0, 0.0), "foot.R": (0.16, 0.0, 0.0), "head": (-0.12, -0.04, 0.05), "chest": (0.30, 0.20, 0.19), "pelvis": (-0.12, -0.10, -0.04)}),
        # Recover into a guarded stance.
        (13, {"upper_arm.R": (0.66, 0.06, 0.12), "lower_arm.R": (0.20, -0.04, -0.05), "hand.R": (0.12, 0.0, 0.0), "upper_arm.L": (-0.08, -0.02, 0.0), "foot.L": (0.03, 0.0, 0.0), "foot.R": (-0.03, 0.0, 0.0), "head": (-0.04, 0.0, 0.02), "chest": (0.10, 0.05, 0.06), "pelvis": (-0.03, -0.02, 0.0)}),
        (16, {})
    ])
    # Every arm-chain X rotation here is positive: on this rig a positive
    # upper_arm X swings the shoulder forward, which MeleeAttack relies on to
    # cross from -1.58 at pull-back to +1.54 at impact. R7 authored this clip
    # entirely negative, so the whole "aim" was assembled behind the back --
    # the Hero raised the carbine away from whatever it was shooting at.
    add_clip(skeleton, "RangedAttack", 16, [
        # Low-ready: the carbine starts below the chest with both hands engaged.
        (1, {"root": (0.0, -0.02, 0.0), "upper_arm.R": (0.52, -0.06, -0.10), "upper_arm.L": (0.7, 0.08, 0.10), "lower_arm.L": (0.34, 0.0, 0.12), "lower_arm.R": (0.14, 0.0, 0.03), "hand.L": (-0.16, 0.0, 0.02), "hand.R": (0.1, 0.0, 0.0), "head": (-0.04, 0.0, 0.0), "chest": (-0.02, 0.0, -0.02), "pelvis": (0.02, 0.0, 0.0), "foot.L": (-0.02, 0.0, 0.0), "foot.R": (0.02, 0.0, 0.0)}),
        # Raise and seat the stock near the shoulder.
        (4, {"root": (0.0, -0.04, 0.02), "upper_arm.R": (1.02, -0.10, -0.14), "upper_arm.L": (1.08, 0.10, 0.12), "lower_arm.L": (0.5, 0.02, 0.12), "lower_arm.R": (0.24, 0.02, 0.05), "hand.L": (-0.22, 0.0, 0.02), "hand.R": (0.2, 0.0, 0.0), "head": (-0.10, -0.02, 0.0), "chest": (-0.06, -0.02, -0.04), "pelvis": (0.03, 0.0, 0.0), "foot.L": (-0.04, 0.0, 0.0), "foot.R": (0.04, 0.0, 0.0)}),
        # Aim: a compact two-arm triangle and visor line of sight.
        (7, {"root": (0.0, -0.07, 0.03), "upper_arm.R": (1.42, -0.14, -0.16), "upper_arm.L": (1.45, 0.13, 0.13), "lower_arm.L": (0.68, 0.10, 0.10), "lower_arm.R": (0.38, 0.06, 0.06), "hand.L": (-0.26, 0.0, 0.02), "hand.R": (0.36, 0.0, 0.0), "head": (-0.18, -0.02, 0.0), "chest": (-0.10, -0.04, -0.07), "pelvis": (0.04, 0.02, 0.0), "foot.L": (-0.06, 0.0, 0.0), "foot.R": (0.06, 0.0, 0.0)}),
        # Fire key and a small recoil preparation.
        (10, {"root": (0.0, -0.05, 0.02), "upper_arm.R": (1.26, -0.12, -0.13), "upper_arm.L": (1.3, 0.11, 0.12), "lower_arm.L": (0.58, 0.09, 0.09), "lower_arm.R": (0.3, 0.05, 0.05), "hand.L": (-0.23, 0.0, 0.02), "hand.R": (0.28, 0.0, 0.0), "head": (-0.14, -0.02, 0.0), "chest": (-0.07, -0.03, -0.06), "pelvis": (0.03, 0.02, 0.0), "foot.L": (-0.05, 0.0, 0.0), "foot.R": (0.05, 0.0, 0.0)}),
        (11, {"root": (0.0, -0.03, 0.01), "upper_arm.R": (1.1, -0.10, -0.10), "upper_arm.L": (1.18, 0.09, 0.09), "lower_arm.L": (0.52, 0.08, 0.08), "lower_arm.R": (0.25, 0.04, 0.04), "hand.L": (-0.2, 0.0, 0.02), "hand.R": (0.18, 0.0, 0.0), "head": (-0.09, -0.02, 0.0), "chest": (-0.04, -0.02, -0.03), "pelvis": (0.02, 0.01, 0.0), "foot.L": (-0.04, 0.0, 0.0), "foot.R": (0.04, 0.0, 0.0)}),
        # Recover without dropping the left support hand.
        (14, {"root": (0.0, 0.0, 0.0), "upper_arm.R": (0.72, -0.04, -0.06), "upper_arm.L": (0.86, 0.06, 0.07), "lower_arm.L": (0.3, 0.04, 0.05), "lower_arm.R": (0.14, 0.02, 0.02), "hand.L": (-0.12, 0.0, 0.01), "hand.R": (0.08, 0.0, 0.0), "head": (-0.04, 0.0, 0.0), "chest": (-0.01, 0.0, 0.0)}),
        (16, {})
    ])
    add_clip(skeleton, "Hit", 12, [
        (1, {"chest": (-0.18, 0.0, 0.07), "pelvis": (-0.05, 0.0, 0.0), "head": (0.12, 0.0, 0.05), "upper_arm.L": (0.14, 0.0, 0.09), "upper_arm.R": (-0.10, 0.0, -0.05), "thigh.L": (-0.08, 0.0, 0.0), "thigh.R": (0.05, 0.0, 0.0)}),
        (6, {"chest": (-0.38, 0.0, 0.14), "pelvis": (-0.10, 0.0, 0.0), "head": (0.23, 0.0, 0.09), "upper_arm.L": (0.30, 0.0, 0.16), "upper_arm.R": (-0.20, 0.0, -0.09), "lower_arm.L": (0.14, 0.0, 0.07), "thigh.L": (-0.14, 0.0, 0.0), "thigh.R": (0.09, 0.0, 0.0)}),
        (10, {"chest": (-0.16, 0.0, 0.06), "pelvis": (-0.03, 0.0, 0.0), "head": (0.09, 0.0, 0.03), "upper_arm.L": (0.11, 0.0, 0.05), "upper_arm.R": (-0.07, 0.0, -0.03)}),
        (12, {})
    ])
    add_clip(skeleton, "Death", 20, [
        (1, {"foot.L": (0.04, 0, 0), "foot.R": (-0.04, 0, 0), "pelvis": (0.02, 0, 0)}),
        (6, {"root": (0.35, 0, 0), "pelvis": (0.10, 0, 0), "chest": (0.14, 0, 0), "head": (0.08, 0, 0), "foot.L": (0.08, 0, 0), "foot.R": (-0.08, 0, 0)}),
        (12, {"root": (1.25, 0, 0), "pelvis": (0.28, 0, 0), "chest": (0.44, 0, 0), "head": (0.20, 0, 0), "upper_arm.L": (0.84, 0, 0), "upper_arm.R": (0.84, 0, 0), "thigh.L": (-0.12, 0, 0), "thigh.R": (0.10, 0, 0)}),
        (16, {"root": (1.38, 0, 0), "pelvis": (0.38, 0, 0), "chest": (0.52, 0, 0), "head": (0.27, 0, 0), "upper_arm.L": (1.02, 0, 0), "upper_arm.R": (1.02, 0, 0), "thigh.L": (-0.18, 0, 0), "thigh.R": (0.14, 0, 0)}),
        (20, {"root": (1.45, 0, 0), "pelvis": (0.42, 0, 0), "chest": (0.56, 0, 0), "head": (0.31, 0, 0), "upper_arm.L": (1.14, 0, 0), "upper_arm.R": (1.14, 0, 0), "thigh.L": (-0.20, 0, 0), "thigh.R": (0.16, 0, 0)}),
    ])

    bpy.context.scene.frame_set(1)
    save_source(os.path.join(ROOT, "assets-source", "blender", "characters", "hero.blend"))
    export_glb(os.path.join(ROOT, "public", "assets", "models", "characters", "hero.glb"))
    print("hero written")


if __name__ == "__main__":
    main()
