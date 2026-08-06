"""Build the 25 authored roster units against the shared art standard.

This script owns every ally and enemy except Hero and Warrior, which have
their own generators.

Why this was rewritten
----------------------
The previous version assembled each unit from ~95 separate rigid primitives,
shipping 118 primitives, 13 materials and 12 embedded images per unit. Every
role shared one body and differed only by colour, a hat and a prop, which is
why the whole roster read as the same placeholder in different costumes. It
was also where the frame's draw calls went.

The rewrite follows ``docs/art/PRODUCTION_STANDARD.md``:

* bodies are swept explicit cross-sections from ``authoring.py`` -- the same
  language the Warrior rebuild uses -- merged into ONE skinned body mesh and
  ONE skinned weapon mesh per LOD;
* roles differ by **archetype**, which changes actual mass distribution,
  height, stance and silhouette, not just palette;
* three materials and one atlas per unit.

The archetype is the important part. A marksman and a juggernaut are not the
same figure in different hats: one is narrow, upright and long-limbed, the
other is broad, hunched and short-necked, and that difference has to survive
being seen from the gameplay camera in a crowd.
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
from common import collision_box, empty, export_glb, material, orient_for_babylon, reset_scene, save_source, collection  # noqa: E402
from authoring import MeshBuilder, section  # noqa: E402


# --- archetypes -----------------------------------------------------------
# Each entry states the *form* of a body: how tall, how broad at the
# shoulders relative to the waist, how deep the torso is, how the legs are
# treated. These are the numbers that make a silhouette recognisable at
# distance, long before any equipment resolves.
ARCHETYPES = {
    "light": dict(
        height=0.96, shoulder=0.230, chest_depth=0.150, waist=0.176, hip=0.196,
        limb=0.070, neck=0.062, head=0.118, stance=0.115, hunch=0.00, skirt=False,
    ),
    "medium": dict(
        height=1.00, shoulder=0.268, chest_depth=0.172, waist=0.198, hip=0.216,
        limb=0.082, neck=0.070, head=0.126, stance=0.130, hunch=0.03, skirt=False,
    ),
    "heavy": dict(
        height=1.06, shoulder=0.348, chest_depth=0.222, waist=0.272, hip=0.288,
        limb=0.108, neck=0.092, head=0.138, stance=0.168, hunch=0.13, skirt=False,
    ),
    "caster": dict(
        height=1.02, shoulder=0.236, chest_depth=0.158, waist=0.204, hip=0.330,
        limb=0.068, neck=0.060, head=0.124, stance=0.000, hunch=0.02, skirt=True,
    ),
    "commander": dict(
        height=1.10, shoulder=0.312, chest_depth=0.196, waist=0.212, hip=0.234,
        limb=0.090, neck=0.078, head=0.132, stance=0.142, hunch=0.00, skirt=False,
    ),
    "flying": dict(
        height=0.88, shoulder=0.288, chest_depth=0.206, waist=0.196, hip=0.198,
        limb=0.074, neck=0.058, head=0.116, stance=0.104, hunch=0.16, skirt=False,
    ),
}

UNITS = {
    # --- allies ---
    "shield":     dict(arch="heavy",     body=(0.346, 0.439, 0.510), accent=(0.62, 0.80, 0.94), weapon="shield", crest="greatHelm"),
    "archer":     dict(arch="light",     body=(0.353, 0.420, 0.346), accent=(0.66, 0.82, 0.48), weapon="bow",    crest="hood"),
    "medic":      dict(arch="light",     body=(0.510, 0.519, 0.528), accent=(0.42, 0.86, 0.66), weapon="staff",  crest="hood"),
    "flagbearer": dict(arch="commander", body=(0.460, 0.305, 0.288), accent=(0.90, 0.66, 0.22), weapon="banner", crest="crest"),
    "mage":       dict(arch="caster",    body=(0.333, 0.305, 0.449), accent=(0.66, 0.44, 0.92), weapon="staff",  crest="hat"),
    "assault":    dict(arch="medium",    body=(0.305, 0.319, 0.358), accent=(0.90, 0.34, 0.24), weapon="dagger", crest="visor"),
    "engineer":   dict(arch="medium",    body=(0.490, 0.370, 0.240), accent=(0.92, 0.68, 0.22), weapon="wrench", crest="hardhat"),
    "musketeer":  dict(arch="medium",    body=(0.333, 0.358, 0.424), accent=(0.90, 0.72, 0.28), weapon="musket", crest="tricorne"),
    "frostmage":  dict(arch="caster",    body=(0.358, 0.500, 0.556), accent=(0.56, 0.88, 0.96), weapon="staff",  crest="iceCrown"),
    # --- enemies ---
    "grunt":      dict(arch="medium",    body=(0.383, 0.314, 0.449), accent=(0.66, 0.44, 0.90), weapon="club",   crest="horn"),
    "slinger":    dict(arch="light",     body=(0.346, 0.358, 0.480), accent=(0.46, 0.72, 0.94), weapon="sling",  crest="hood"),
    "bruiser":    dict(arch="heavy",     body=(0.340, 0.305, 0.415), accent=(0.72, 0.44, 0.92), weapon="club",   crest="horn"),
    "marksman":   dict(arch="light",     body=(0.299, 0.383, 0.466), accent=(0.46, 0.80, 0.94), weapon="bow",    crest="visor"),
    "juggernaut": dict(arch="heavy",     body=(0.293, 0.311, 0.363), accent=(0.76, 0.44, 0.92), weapon="shield", crest="greatHelm"),
    "bombardier": dict(arch="caster",    body=(0.439, 0.305, 0.470), accent=(0.94, 0.40, 0.80), weapon="staff",  crest="hood"),
    "boss":       dict(arch="commander", body=(0.254, 0.346, 0.424), accent=(0.40, 0.86, 0.96), weapon="club",   crest="crown"),
    "breacher":   dict(arch="heavy",     body=(0.370, 0.406, 0.460), accent=(0.60, 0.84, 0.96), weapon="ram",    crest="greatHelm"),
    "icearmor":   dict(arch="heavy",     body=(0.370, 0.528, 0.590), accent=(0.68, 0.90, 0.98), weapon="shield", crest="iceCrown"),
    "commander":  dict(arch="commander", body=(0.358, 0.290, 0.439), accent=(0.92, 0.68, 0.26), weapon="banner", crest="crown"),
    "bomber":     dict(arch="medium",    body=(0.305, 0.480, 0.500), accent=(0.50, 0.92, 0.94), weapon="none",   crest="core"),
    "flyingMelee":       dict(arch="flying", body=(0.353, 0.302, 0.460), accent=(0.46, 0.84, 0.96), weapon="club",   crest="horn"),
    "flyingEliteArcher": dict(arch="flying", body=(0.281, 0.383, 0.473), accent=(0.44, 0.92, 0.96), weapon="bow",    crest="visor"),
    "flyingBomber":      dict(arch="flying", body=(0.439, 0.290, 0.479), accent=(0.94, 0.38, 0.86), weapon="staff",  crest="core"),
    "flyingColossus":    dict(arch="flying", body=(0.254, 0.353, 0.424), accent=(0.40, 0.90, 0.96), weapon="shield", crest="crown"),
}

SURFACES = {"body": (0, 0), "trim": (0, 1), "accent": (0, 2),
            "leather": (1, 0), "grip": (1, 1),
            "metal": (2, 0), "edge": (2, 1)}
MATERIALS = {}
BONE_ORDER = ("root", "pelvis", "spine", "chest", "neck", "head",
              "upper_arm.L", "lower_arm.L", "hand.L", "upper_arm.R", "lower_arm.R", "hand.R",
              "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R")


def blend(bone, secondary=None, amount=0.18):
    return {bone: 1.0} if not secondary else {bone: 1.0 - amount, secondary: amount}


def torso_weights(y):
    if y < 0.72:
        return blend("pelvis", "spine", 0.30)
    if y < 1.00:
        return blend("spine", "chest", 0.40)
    if y < 1.36:
        return blend("chest", "spine", 0.18)
    return blend("chest", "neck", 0.34)


def head_weights(y):
    return blend("neck", "chest", 0.24) if y < 1.52 else blend("head", "neck", 0.12)


def arm_weights(side, y):
    upper, lower, hand = f"upper_arm.{side}", f"lower_arm.{side}", f"hand.{side}"
    if y > 1.16:
        return blend(upper, "chest", 0.16)
    if y > 1.00:
        return blend(upper, lower, 0.26)
    if y > 0.86:
        return blend(lower, upper, 0.18)
    return blend(hand, lower, 0.22)


def leg_weights(side, y):
    thigh, shin, foot = f"thigh.{side}", f"shin.{side}", f"foot.{side}"
    if y > 0.50:
        return blend(thigh, "pelvis", 0.18)
    if y > 0.32:
        return blend(thigh, shin, 0.24)
    if y > 0.14:
        return blend(shin, thigh, 0.20)
    return blend(foot, shin, 0.24)


def add_body(level, a, cfg):
    """One merged skinned body mesh for this LOD."""
    b = MeshBuilder(level)
    n_t = (22, 12, 8)[level]
    n_h = (16, 10, 6)[level]
    n_l = (14, 8, 6)[level]
    h = a["height"]
    sh, cd, wa, hp = a["shoulder"], a["chest_depth"], a["waist"], a["hip"]
    lean = a["hunch"]

    # Torso: hip -> cinched waist -> broad chest -> narrowed trapezius. The
    # chest/waist ratio and the trapezius narrowing are what separate a heavy
    # from a light unit, and the narrowing is also what keeps the arms
    # outboard of the body silhouette instead of buried in it.
    b.sweep([
        (0.50 * h, section(n_t, hp, hp * 0.66, hp * 0.70, 2.3)),
        (0.62 * h, section(n_t, hp * 0.94, hp * 0.62, hp * 0.66, 2.5)),
        (0.76 * h, section(n_t, wa, wa * 0.70, wa * 0.74, 2.8, lean=lean * 0.3)),
        (0.92 * h, section(n_t, wa * 1.10, wa * 0.78, wa * 0.76, 2.9, lean=lean * 0.5)),
        (1.10 * h, section(n_t, sh * 0.92, cd, cd * 0.88, 3.0, lean=lean * 0.8)),
        (1.24 * h, section(n_t, sh, cd * 1.02, cd * 0.90, 3.0, lean=lean)),
        (1.34 * h, section(n_t, sh * 0.94, cd * 0.94, cd * 0.86, 2.9, lean=lean)),
        (1.42 * h, section(n_t, sh * 0.62, cd * 0.74, cd * 0.70, 2.6, lean=lean * 0.8)),
    ], "body", torso_weights)

    b.sweep([
        (0.755 * h, section(n_t, wa * 1.04, wa * 0.74, wa * 0.78, 2.8)),
        (0.815 * h, section(n_t, wa * 1.06, wa * 0.76, wa * 0.80, 2.8)),
    ], "leather", torso_weights, cap_bottom=False, cap_top=False)

    nk = a["neck"]
    b.sweep([
        (1.42 * h, section(n_h, nk, nk, nk, 2.4)),
        (1.53 * h, section(n_h, nk * 0.94, nk * 0.96, nk * 0.96, 2.4)),
    ], "body", head_weights, cap_bottom=False, cap_top=False)
    hd = a["head"]
    b.sweep([
        (1.53 * h, section(n_h, hd * 0.80, hd * 0.84, hd * 0.78, 2.3, centre_z=0.008)),
        (1.60 * h, section(n_h, hd * 0.98, hd * 1.02, hd * 0.92, 2.7, centre_z=0.014)),
        (1.67 * h, section(n_h, hd, hd * 1.00, hd * 0.94, 3.0, centre_z=0.010)),
        (1.74 * h, section(n_h, hd * 0.92, hd * 0.90, hd * 0.90, 2.7, centre_z=0.000)),
        (1.79 * h, section(n_h, hd * 0.62, hd * 0.62, hd * 0.64, 2.3, centre_z=-0.006)),
    ], "body", head_weights, cap_bottom=False)

    if level <= 1:
        # Face structure. Every head in this roster was a smooth swept mass, so
        # up close a unit had a direction but no features. These are hard
        # surfaces rather than skin -- the roster wears helms -- and they are
        # deliberately structure, not detail: a brow that overhangs, a centre
        # line, and a recess for the eyes. At crowd distance what survives is
        # the shadow under the brow, which is what makes a head read as facing
        # you. Authored per-rig rather than shared, because head scale and
        # brow height differ between this roster, the Hero and the Warrior.
        fw = blend("head", "neck", 0.10)
        b.box((0.0, 1.686 * h, hd * 0.88), (hd * 1.60, hd * 0.28, hd * 0.42), "metal", fw, taper=0.80)
        b.box((0.0, 1.638 * h, hd * 0.92), (hd * 0.26, hd * 0.86, hd * 0.32), "metal", fw, taper=1.14)
        for sgn in (-1, 1):
            b.box((sgn * hd * 0.44, 1.662 * h, hd * 0.76), (hd * 0.46, hd * 0.18, hd * 0.17), "grip", fw, taper=0.92)
        for sgn in (-1, 1):
            b.prism([
                (sgn * hd * 0.50, 1.652 * h), (sgn * hd * 1.00, 1.640 * h),
                (sgn * hd * 0.94, 1.566 * h), (sgn * hd * 0.42, 1.556 * h),
            ], hd * 0.66, hd * 0.30, "metal", fw)

    lb = a["limb"]
    for side, sgn in (("L", -1), ("R", 1)):
        sx = sgn * (sh * 0.86)
        b.sweep([
            (1.34 * h, section(n_l, lb * 0.90, lb * 0.94, lb * 0.90, 2.4, centre_x=sx * 0.96)),
            (1.26 * h, section(n_l, lb * 1.34, lb * 1.32, lb * 1.24, 2.6, centre_x=sx)),
            (1.12 * h, section(n_l, lb * 1.08, lb * 1.10, lb * 1.04, 2.5, centre_x=sgn * (sh * 0.96))),
            (1.00 * h, section(n_l, lb * 0.86, lb * 0.88, lb * 0.86, 2.6, centre_x=sgn * (sh * 1.02))),
        ], "body", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        b.sweep([
            (1.00 * h, section(n_l, lb * 0.86, lb * 0.88, lb * 0.86, 2.6, centre_x=sgn * (sh * 1.02))),
            (0.90 * h, section(n_l, lb * 0.78, lb * 0.80, lb * 0.80, 2.6, centre_x=sgn * (sh * 1.02), centre_z=0.012)),
        ], "body", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        b.sweep([
            (0.90 * h, section(n_l, lb * 0.88, lb * 0.84, lb * 0.84, 2.6, centre_x=sgn * (sh * 1.02), centre_z=0.016)),
            (0.82 * h, section(n_l, lb * 0.96, lb * 0.82, lb * 0.82, 3.0, centre_x=sgn * (sh * 1.00), centre_z=0.036)),
            (0.75 * h, section(n_l, lb * 0.70, lb * 0.62, lb * 0.62, 2.6, centre_x=sgn * (sh * 0.98), centre_z=0.050)),
        ], "leather", lambda y, s=side: arm_weights(s, y), cap_bottom=False)

    if a["skirt"]:
        # Casters get a flared robe instead of legs: an unmistakable
        # silhouette even as a distant dark shape.
        b.sweep([
            (0.62 * h, section(n_t, hp * 0.92, hp * 0.62, hp * 0.66, 2.5)),
            (0.42 * h, section(n_t, hp * 1.06, hp * 0.74, hp * 0.78, 2.4)),
            (0.20 * h, section(n_t, hp * 1.22, hp * 0.88, hp * 0.92, 2.2)),
            (0.03 * h, section(n_t, hp * 1.34, hp * 0.98, hp * 1.02, 2.1)),
        ], "body", lambda y: blend("pelvis", "root", 0.35), cap_top=False)
    else:
        st = a["stance"]
        for side, sgn in (("L", -1), ("R", 1)):
            lx = sgn * st
            b.sweep([
                (0.56 * h, section(n_l, lb * 1.44, lb * 1.40, lb * 1.48, 2.4, centre_x=lx)),
                (0.44 * h, section(n_l, lb * 1.32, lb * 1.30, lb * 1.38, 2.5, centre_x=lx)),
                (0.32 * h, section(n_l, lb * 1.02, lb * 1.10, lb * 1.02, 3.0, centre_x=lx)),
                (0.24 * h, section(n_l, lb * 1.10, lb * 1.06, lb * 1.22, 2.7, centre_x=lx)),
                (0.12 * h, section(n_l, lb * 0.84, lb * 0.86, lb * 0.90, 2.5, centre_x=lx)),
            ], "body", lambda y, s=side: leg_weights(s, y), cap_top=False)
            # Boots. These were two flat boxes 0.45 long and 0.055 tall, which
            # at any distance read as skis strapped under the legs -- and it
            # was on all twenty-four units at once. A boot needs an ankle
            # above the joint, an instep that spreads as it drops, and a toe
            # reaching further forward than the heel reaches back; that
            # asymmetry is what makes a foot look like a foot.
            # sweep() takes a weight function; box() takes a weight dict.
            fw_map = blend(f"foot.{side}", f"shin.{side}", 0.16)
            fw = lambda y, m=fw_map: m
            b.sweep([
                (0.200 * h, section(n_l, lb * 0.92, lb * 0.98, lb * 0.94, 2.6, centre_x=lx, centre_z=0.008)),
                (0.130 * h, section(n_l, lb * 1.04, lb * 1.34, lb * 1.12, 2.8, centre_x=lx, centre_z=0.032)),
                (0.072 * h, section(n_l, lb * 1.14, lb * 2.08, lb * 1.30, 3.0, centre_x=lx, centre_z=0.060)),
                (0.030 * h, section(n_l, lb * 1.18, lb * 2.28, lb * 1.36, 3.2, centre_x=lx, centre_z=0.068)),
            ], "leather", fw, cap_top=False)
            # Sole in the darkest leather, barely proud of the upper. It was
            # `metal`, and once the scene had an environment to reflect that
            # turned every unit's feet into two bright plates on the snow.
            b.sweep([
                (0.030 * h, section(n_l, lb * 1.20, lb * 2.30, lb * 1.38, 3.4, centre_x=lx, centre_z=0.068)),
                (0.006 * h, section(n_l, lb * 1.12, lb * 2.14, lb * 1.28, 3.4, centre_x=lx, centre_z=0.064)),
            ], "grip", fw)

    add_crest(b, level, a, cfg, n_h)
    add_armor(b, level, a, cfg, n_l)
    if a["arch_name"] == "flying":
        add_wings(b, level, a, n_l)
    return b


def add_wings(b, level, a, n):
    """Flyers read as creatures from below, so the wing is the silhouette."""
    h, sh, lb = a["height"], a["shoulder"], a["limb"]
    span = sh * (3.4 if level == 0 else 3.0)
    for sgn in (-1, 1):
        b.prism([
            (sgn * sh * 0.86, 1.30 * h),
            (sgn * span * 0.62, 1.52 * h),
            (sgn * span, 1.34 * h),
            (sgn * span * 0.80, 1.12 * h),
            (sgn * span * 0.40, 1.06 * h),
            (sgn * sh * 0.90, 1.14 * h),
        ], -0.06, lb * 0.5, "trim", blend("chest", "spine", 0.22))


def add_crest(b, level, a, cfg, n):
    """Head silhouette. This is the fastest role read in a crowd."""
    h, hd = a["height"], a["head"]
    kind = cfg["crest"]
    top = 1.79 * h
    w = blend("head", "neck", 0.10)
    if kind == "horn":
        for sgn in (-1, 1):
            b.prism([(sgn * hd * 0.5, 1.66 * h), (sgn * hd * 1.5, 1.90 * h),
                     (sgn * hd * 1.7, 1.82 * h), (sgn * hd * 0.8, 1.60 * h)], 0.0, hd * 0.42, "metal", w)
    elif kind in ("greatHelm", "visor"):
        b.box((0.0, 1.665 * h, hd * 0.72), (hd * 1.5, hd * 0.34, hd * 0.30), "metal", w, taper=0.82)
        if kind == "greatHelm":
            b.sweep([(1.56 * h, section(n, hd * 1.06, hd * 1.06, hd * 1.00, 2.8)),
                     (1.76 * h, section(n, hd * 1.02, hd * 1.00, hd * 0.98, 2.6))],
                    "metal", lambda y: w, cap_bottom=False)
    elif kind == "hood":
        b.sweep([(1.50 * h, section(n, hd * 1.20, hd * 1.24, hd * 1.16, 2.4)),
                 (1.66 * h, section(n, hd * 1.16, hd * 1.20, hd * 1.10, 2.7)),
                 (1.80 * h, section(n, hd * 0.72, hd * 0.78, hd * 0.72, 2.3))],
                "trim", lambda y: w, cap_bottom=False)
    elif kind == "hat":
        b.sweep([(1.76 * h, section(n, hd * 0.90, hd * 0.90, hd * 0.90, 2.4)),
                 (1.80 * h, section(n, hd * 2.10, hd * 2.10, hd * 2.10, 2.2)),
                 (1.84 * h, section(n, hd * 1.90, hd * 1.90, hd * 1.90, 2.2)),
                 (2.06 * h, section(n, hd * 0.30, hd * 0.30, hd * 0.30, 2.0))],
                "trim", lambda y: w)
    elif kind == "tricorne":
        # Every ring in a sweep must carry the same point count; the wide,
        # angular brim comes from the low exponent, not from fewer points.
        b.sweep([(1.78 * h, section(n, hd * 0.96, hd * 0.96, hd * 0.96, 2.4)),
                 (1.82 * h, section(n, hd * 1.90, hd * 1.60, hd * 1.90, 1.6)),
                 (1.92 * h, section(n, hd * 0.86, hd * 0.80, hd * 0.86, 2.2))],
                "trim", lambda y: w)
    elif kind == "hardhat":
        b.sweep([(1.74 * h, section(n, hd * 1.10, hd * 1.16, hd * 1.06, 2.6)),
                 (1.86 * h, section(n, hd * 0.84, hd * 0.88, hd * 0.82, 2.4))],
                "accent", lambda y: w, cap_bottom=False)
    elif kind in ("crown", "crest"):
        for i in range(5):
            t = (i - 2) / 2.0
            b.box((t * hd * 0.80, top + hd * (0.30 if i % 2 == 0 else 0.18), 0.0),
                  (hd * 0.20, hd * (0.60 if i % 2 == 0 else 0.36), hd * 0.20), "accent", w, taper=0.5)
    elif kind == "iceCrown":
        for i in range(4):
            ang = math.tau * i / 4 + 0.4
            b.prism([(math.sin(ang) * hd * 0.6, 1.74 * h),
                     (math.sin(ang) * hd * 1.1, 2.02 * h),
                     (math.sin(ang) * hd * 1.4, 1.76 * h)], math.cos(ang) * hd * 0.6, hd * 0.26, "edge", w)
    elif kind == "core":
        b.sweep([(1.58 * h, section(n, hd * 0.72, hd * 0.72, hd * 0.72, 2.0)),
                 (1.70 * h, section(n, hd * 1.16, hd * 1.16, hd * 1.16, 2.0)),
                 (1.82 * h, section(n, hd * 0.72, hd * 0.72, hd * 0.72, 2.0))],
                "accent", lambda y: w)


def add_armor(b, level, a, cfg, n):
    """Shoulder mass and faction strip. Heavies get real pauldrons."""
    h, sh, lb = a["height"], a["shoulder"], a["limb"]
    heavy = a["arch_name"] in ("heavy", "commander")
    for sgn in (-1, 1):
        if not heavy and sgn > 0:
            continue
        side = "L" if sgn < 0 else "R"
        b.sweep([
            (1.36 * h, section(n, lb * 1.02, lb * 1.06, lb * 1.02, 2.6, centre_x=sgn * sh * 0.84)),
            (1.26 * h, section(n, lb * 1.72, lb * 1.66, lb * 1.58, 3.1, centre_x=sgn * sh * 0.90)),
            (1.15 * h, section(n, lb * 1.54, lb * 1.46, lb * 1.40, 3.0, centre_x=sgn * sh * 0.98)),
        ], "metal", lambda y, s=side: blend(f"upper_arm.{s}", "chest", 0.34))
    if level == 0:
        b.box((0.0, 1.16 * h, a["chest_depth"] * 1.06), (sh * 0.24, sh * 0.42, 0.022), "accent",
              blend("chest", "spine", 0.32))


def add_weapon(level, a, cfg):
    """One merged skinned weapon mesh, rigid to hand.R."""
    kind = cfg["weapon"]
    if kind == "none":
        return None
    b = MeshBuilder(level)
    h, sh, lb = a["height"], a["shoulder"], a["limb"]
    w = {"hand.R": 1.0}
    hx = sh * 1.02
    hy = 0.82 * h
    n = (8, 6, 4)[level]

    def shaft(y0, y1, r0, r1, x=None, z=0.06, surface="grip"):
        px = hx if x is None else x
        b.sweep([(y0, section(n, r0, r0, r0, 2.2, centre_x=px, centre_z=z)),
                 (y1, section(n, r1, r1, r1, 2.2, centre_x=px, centre_z=z))], surface, lambda y: w)

    if kind in ("club", "wrench"):
        shaft(hy - 0.30 * h, hy + 0.26 * h, lb * 0.30, lb * 0.28)
        b.box((hx, hy + 0.34 * h, 0.06), (lb * 1.7, 0.20 * h, lb * 1.7), "metal", w, taper=0.80)
    elif kind == "dagger":
        # Grip, a crossguard, and a blade that tapers to a point rather than
        # stopping flat. The guard is what says "weapon" at a glance -- without
        # it a short blade is just a stick with a wedge on the end.
        shaft(hy - 0.12 * h, hy + 0.05 * h, lb * 0.30, lb * 0.26)
        b.box((hx, hy - 0.14 * h, 0.06), (lb * 0.52, 0.04 * h, lb * 0.52), "metal", w, taper=0.8)
        b.box((hx, hy + 0.07 * h, 0.06), (lb * 1.70, 0.035 * h, lb * 0.60), "metal", w, taper=0.86)
        b.prism([
            (hx - lb * 0.46, hy + 0.09 * h), (hx + lb * 0.46, hy + 0.09 * h),
            (hx + lb * 0.34, hy + 0.36 * h), (hx, hy + 0.50 * h), (hx - lb * 0.34, hy + 0.36 * h),
        ], 0.06, lb * 0.30, "edge", w)
    elif kind == "sling":
        shaft(hy - 0.06 * h, hy + 0.20 * h, lb * 0.22, lb * 0.20)
        b.box((hx, hy + 0.26 * h, 0.06), (lb * 1.0, lb * 1.0, lb * 1.0), "leather", w, taper=0.7)
    elif kind == "bow":
        # A bow is a continuous limb bellying away from a straight string, and
        # that pairing is the whole read. This was four stacked boxes
        # approximating the curve, which at any distance is a ladder.
        limb = ((-0.46, 0.02), (-0.32, 0.26), (-0.16, 0.38), (0.02, 0.40),
                (0.18, 0.32), (0.32, 0.18), (0.44, 0.02))
        b.sweep([
            (hy + t * h, section(n, lb * (0.16 + 0.10 * off), lb * 0.44, lb * 0.44, 2.4,
                                 centre_x=hx + off * lb * 2.4, centre_z=0.06))
            for t, off in limb
        ], "leather", lambda y: w)
        # String, tip to tip and dead straight, which is what sells the tension.
        shaft(hy - 0.46 * h, hy + 0.44 * h, lb * 0.06, lb * 0.06, x=hx + lb * 0.05, surface="edge")
        b.box((hx + 0.40 * lb * 2.4, hy - 0.02 * h, 0.06), (lb * 0.62, 0.13 * h, lb * 0.62), "grip", w, taper=0.94)
    elif kind == "musket":
        shaft(hy - 0.16 * h, hy + 0.52 * h, lb * 0.24, lb * 0.20, surface="metal")
        b.box((hx, hy - 0.24 * h, 0.06), (lb * 0.9, 0.26 * h, lb * 1.5), "leather", w, taper=0.86)
    elif kind == "staff":
        shaft(hy - 0.44 * h, hy + 0.60 * h, lb * 0.24, lb * 0.22)
        # Head: a metal claw holding a faceted crystal, rather than a ball.
        # The low ring count is deliberate -- facets catch the light in
        # separate flat steps, which is what makes a small prop read as a gem.
        b.sweep([(hy + 0.56 * h, section(4, lb * 0.34, lb * 0.34, lb * 0.34, 2.6, centre_x=hx, centre_z=0.06)),
                 (hy + 0.64 * h, section(4, lb * 0.86, lb * 0.86, lb * 0.86, 2.6, centre_x=hx, centre_z=0.06)),
                 (hy + 0.70 * h, section(4, lb * 0.62, lb * 0.62, lb * 0.62, 2.6, centre_x=hx, centre_z=0.06))],
                "metal", lambda y: w)
        b.sweep([(hy + 0.66 * h, section(6, lb * 0.22, lb * 0.22, lb * 0.22, 2.4, centre_x=hx, centre_z=0.06)),
                 (hy + 0.76 * h, section(6, lb * 0.92, lb * 0.92, lb * 0.92, 2.4, centre_x=hx, centre_z=0.06)),
                 (hy + 0.98 * h, section(6, lb * 0.18, lb * 0.18, lb * 0.18, 2.4, centre_x=hx, centre_z=0.06))],
                "accent", lambda y: w)
    elif kind == "banner":
        shaft(hy - 0.40 * h, hy + 0.86 * h, lb * 0.22, lb * 0.20)
        b.prism([(hx, hy + 0.84 * h), (hx + sh * 0.90, hy + 0.76 * h),
                 (hx + sh * 0.82, hy + 0.34 * h), (hx, hy + 0.40 * h)], 0.06, lb * 0.16, "accent", w)
    elif kind == "ram":
        shaft(hy - 0.12 * h, hy + 0.14 * h, lb * 0.30, lb * 0.28)
        b.sweep([(hy + 0.14 * h, section(n, lb * 0.9, lb * 0.9, lb * 0.9, 2.2, centre_x=hx, centre_z=0.06)),
                 (hy + 0.30 * h, section(n, lb * 1.9, lb * 1.9, lb * 1.9, 2.4, centre_x=hx, centre_z=0.06)),
                 (hy + 0.62 * h, section(n, lb * 1.7, lb * 1.7, lb * 1.7, 2.4, centre_x=hx, centre_z=0.06))],
                "metal", lambda y: w)
    elif kind == "shield":
        # Held out from the body: the broad face is the whole silhouette.
        #
        # This was one slab with a flat plate stuck on the front, and it read
        # as a sheet of paper -- not because it was thin (it is not) but
        # because a flat face under even lighting has nothing on it. A shield
        # reads through its edge: the rim catches light all the way round and
        # separates the disc from whatever is behind it. So the backing plate
        # is built proud of the face on every side in `edge`, the brightest
        # steel in the palette, and the face is inset and pushed forward. The
        # boss is two stepped blocks rather than a decal.
        sx = hx * 1.10

        def disc(scale, z, depth, surface):
            b.sweep([
                (hy - 0.34 * h, section(n, sh * 0.30 * scale, depth, depth * 0.78, 2.8, centre_x=sx, centre_z=z)),
                (hy - 0.06 * h, section(n, sh * 0.80 * scale, depth, depth * 0.78, 3.2, centre_x=sx, centre_z=z)),
                (hy + 0.14 * h, section(n, sh * 0.86 * scale, depth, depth * 0.78, 3.2, centre_x=sx, centre_z=z)),
                (hy + 0.42 * h, section(n, sh * 0.68 * scale, depth, depth * 0.78, 2.8, centre_x=sx, centre_z=z)),
            ], surface, lambda y: w)

        disc(1.00, 0.140, lb * 0.62, "edge")
        disc(0.88, 0.156, lb * 0.58, "metal")
        b.box((sx, hy + 0.06 * h, 0.212), (sh * 0.38, sh * 0.32, lb * 0.44), "edge", w, taper=0.86)
        b.box((sx, hy + 0.06 * h, 0.246), (sh * 0.24, sh * 0.19, lb * 0.40), "accent", w, taper=0.68)
    return b


def make_skeleton(root, h):
    data = bpy.data.armatures.new("UnitSkeleton")
    skeleton = bpy.data.objects.new("UnitSkeleton", data)
    collection("RIG").objects.link(skeleton)
    skeleton.parent = root
    bpy.context.view_layer.objects.active = skeleton
    skeleton.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    if len(data.edit_bones):
        data.edit_bones.remove(data.edit_bones[0])
    specs = [
        ("root", (0, 0, 0), (0, 0.16 * h, 0), None),
        ("pelvis", (0, 0.50 * h, 0), (0, 0.76 * h, 0), "root"),
        ("spine", (0, 0.76 * h, 0), (0, 1.04 * h, 0), "pelvis"),
        ("chest", (0, 1.04 * h, 0), (0, 1.42 * h, 0), "spine"),
        ("neck", (0, 1.42 * h, 0), (0, 1.53 * h, 0), "chest"),
        ("head", (0, 1.53 * h, 0), (0, 1.82 * h, 0), "neck"),
    ]
    for side, x in (("L", -1), ("R", 1)):
        specs += [
            (f"upper_arm.{side}", (x * 0.26 * h, 1.30 * h, 0), (x * 0.30 * h, 1.06 * h, 0), "chest"),
            (f"lower_arm.{side}", (x * 0.30 * h, 1.06 * h, 0), (x * 0.30 * h, 0.88 * h, 0.02), f"upper_arm.{side}"),
            (f"hand.{side}", (x * 0.30 * h, 0.88 * h, 0.02), (x * 0.28 * h, 0.76 * h, 0.06), f"lower_arm.{side}"),
            (f"thigh.{side}", (x * 0.12 * h, 0.54 * h, 0), (x * 0.13 * h, 0.32 * h, 0), "pelvis"),
            (f"shin.{side}", (x * 0.13 * h, 0.32 * h, 0), (x * 0.13 * h, 0.13 * h, 0.01), f"thigh.{side}"),
            (f"foot.{side}", (x * 0.13 * h, 0.13 * h, 0.01), (x * 0.13 * h, 0.03 * h, 0.14), f"shin.{side}"),
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


def create_mesh(builder, name, parent, skeleton, allowed, lod):
    data = bpy.data.meshes.new(name)
    data.from_pydata(builder.vertices, [], builder.faces)
    data.validate(verbose=False)
    data.update()
    for polygon in data.polygons:
        polygon.use_smooth = True
    for slot in allowed:
        data.materials.append(MATERIALS[slot])
    slot_names = ("body", "leather", "metal")
    uv = data.uv_layers.new(name="UVMap")
    colors = data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in data.polygons:
        surface = builder.surfaces[polygon.index]
        material_index, band = SURFACES[surface]
        wanted = slot_names[material_index]
        polygon.material_index = allowed.index(wanted) if wanted in allowed else 0
        u0, v0 = material_index / 3.0, band / 4.0
        # COLOR_0 is consumed as a multiplier by both the exporter and
        # Babylon, so it stays near white and only carries directional shade.
        # Writing the surface tint here would multiply against the atlas and
        # crush every material toward black.
        lift = 0.055 if polygon.normal.z > 0.55 else (-0.045 if polygon.normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.06, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            v = data.vertices[data.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = (u0 + (0.06 + 0.88 * ((v.x * 1.4 + 0.5) % 1.0)) / 3.0,
                                      v0 + (0.06 + 0.88 * ((v.y * 0.6) % 1.0)) / 4.0)
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


def make_atlas(name, body, accent):
    size = 512
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    trim = tuple(min(1.0, c * 1.45 + 0.06) for c in body)
    leather = (0.439, 0.333, 0.247)
    grip = (0.370, 0.288, 0.225)
    metal = (0.395, 0.412, 0.437)
    edge = (0.537, 0.561, 0.587)
    bands = {0: (body, trim, accent, body), 1: (leather, grip, leather, leather), 2: (metal, edge, metal, metal)}
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
                value += (math.sin(x * 0.9) * 0.5 + math.sin(x * 0.31) * 0.5) * 0.020
                value += (math.sin(y * 1.8) * 0.5 + math.sin(y * 0.47) * 0.5) * 0.030
            elif column == 1:
                value += math.sin(y * 0.62 + math.sin(x * 0.18) * 1.6) * 0.050
                value += 0.028 if math.sin(x * 0.27 + y * 0.09) > 0.9 else 0.0
            else:
                value += math.sin(x * 0.21 + y * 0.05) * 0.030
                cl = min((u * 3.0 - column), 1.0 - (u * 3.0 - column))
                value += 0.080 * (1.0 - min(1.0, cl * 7.0))
            occlusion = min(local, 1.0 - local)
            value -= 0.080 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.70, min(1.26, value))
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


def add_clip(skeleton, name, end, poses):
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


def add_animations(skeleton):
    """The six clips the manifest requires for a non-Warrior unit."""
    add_clip(skeleton, "Idle", 30, [
        (1, {"chest": (0.0, 0, 0)}),
        (15, {"chest": (-0.035, 0, 0.02), "neck": (0.03, 0, 0)}),
        (30, {"chest": (0.0, 0, 0)}),
    ])
    add_clip(skeleton, "Walk", 24, [
        (1, {"thigh.L": (0.46, 0, 0), "thigh.R": (-0.46, 0, 0), "shin.L": (-0.22, 0, 0),
             "upper_arm.L": (-0.30, 0, 0), "upper_arm.R": (0.30, 0, 0), "chest": (0.05, 0.09, 0)}),
        (7, {"thigh.L": (-0.42, 0, 0), "thigh.R": (0.42, 0, 0), "shin.R": (-0.24, 0, 0),
             "upper_arm.L": (0.26, 0, 0), "upper_arm.R": (-0.26, 0, 0), "chest": (0.05, -0.09, 0)}),
        (13, {"thigh.L": (0.46, 0, 0), "thigh.R": (-0.46, 0, 0), "shin.L": (-0.22, 0, 0),
              "upper_arm.L": (-0.30, 0, 0), "upper_arm.R": (0.30, 0, 0), "chest": (0.05, 0.09, 0)}),
        (19, {"thigh.L": (-0.42, 0, 0), "thigh.R": (0.42, 0, 0), "shin.R": (-0.24, 0, 0),
              "upper_arm.L": (0.26, 0, 0), "upper_arm.R": (-0.26, 0, 0), "chest": (0.05, -0.09, 0)}),
        (24, {"thigh.L": (0.46, 0, 0), "thigh.R": (-0.46, 0, 0), "shin.L": (-0.22, 0, 0),
              "upper_arm.L": (-0.30, 0, 0), "upper_arm.R": (0.30, 0, 0), "chest": (0.05, 0.09, 0)}),
    ])
    # Attack: settle -> load -> drive -> recover, so the beat is readable.
    add_clip(skeleton, "Attack", 24, [
        (1, {"chest": (0, 0, 0)}),
        (6, {"upper_arm.R": (-1.42, 0.10, -0.24), "lower_arm.R": (-0.72, 0, 0),
             "chest": (-0.16, 0.34, 0), "pelvis": (0, 0.20, 0), "head": (0.10, -0.14, 0)}),
        (12, {"upper_arm.R": (0.86, -0.14, -0.42), "lower_arm.R": (-0.18, 0, 0),
              "chest": (0.30, -0.44, 0), "pelvis": (0, -0.26, 0), "thigh.L": (0.22, 0, 0),
              "thigh.R": (-0.24, 0, 0), "head": (-0.16, 0.12, 0)}),
        (16, {"upper_arm.R": (0.46, -0.08, -0.36), "chest": (0.18, -0.30, 0), "pelvis": (0, -0.16, 0)}),
        (24, {"chest": (0, 0, 0)}),
    ])
    # Cast: both arms rise and the body opens. Deliberately unlike Attack, so
    # the runtime's cast state cannot be mistaken for a swing.
    # Arms raise forward-and-up, not backward: a positive upper_arm X pitches
    # the shoulder toward +Z, which is the direction a caster is facing and
    # firing. Authored negative originally, which put the whole gesture
    # behind the body.
    add_clip(skeleton, "Cast", 26, [
        (1, {"chest": (0, 0, 0)}),
        (9, {"upper_arm.L": (1.1, 0, 0.46), "upper_arm.R": (1.1, 0, -0.46),
             "lower_arm.L": (0.52, 0, 0), "lower_arm.R": (0.52, 0, 0),
             "chest": (-0.22, 0, 0), "head": (-0.16, 0, 0)}),
        (16, {"upper_arm.L": (1.46, 0, 0.30), "upper_arm.R": (1.46, 0, -0.30),
              "chest": (-0.30, 0, 0), "head": (-0.22, 0, 0)}),
        (26, {"chest": (0, 0, 0)}),
    ])
    add_clip(skeleton, "Hit", 14, [
        (1, {"chest": (0, 0, 0)}),
        (5, {"chest": (0.20, -0.26, 0), "head": (0.16, 0, 0), "pelvis": (0, -0.18, 0)}),
        (14, {"chest": (0, 0, 0)}),
    ])
    add_clip(skeleton, "Death", 30, [
        (1, {"pelvis": (0, 0, 0)}),
        (12, {"pelvis": (0.55, -0.30, 0), "chest": (0.80, 0, 0.18), "head": (0.34, 0, 0),
              "thigh.L": (0.60, 0, 0), "shin.L": (-0.55, 0, 0)}),
        (30, {"pelvis": (1.36, 0, 0.24), "chest": (1.42, 0, 0.30), "head": (0.64, 0, 0),
              "thigh.L": (0.86, 0, 0), "thigh.R": (-0.52, 0, 0),
              "upper_arm.L": (0.84, 0, 0.46), "upper_arm.R": (0.58, 0, -0.42)}),
    ])


def build_unit(key, cfg):
    reset_scene()
    MATERIALS.clear()
    body, accent = cfg["body"], cfg["accent"]
    MATERIALS["body"] = material(f"MAT_{key}_body", body, 0.92, 0.0)
    MATERIALS["leather"] = material(f"MAT_{key}_leather", (0.230, 0.140, 0.082), 0.58, 0.06)
    MATERIALS["metal"] = material(f"MAT_{key}_metal", (0.190, 0.205, 0.228), 0.32, 0.86)
    make_atlas(f"ATLAS_{key}", body, accent)

    a = dict(ARCHETYPES[cfg["arch"]])
    a["arch_name"] = cfg["arch"]
    h = a["height"]

    root = orient_for_babylon(empty("UnitRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root["assetRole"] = key
    root["archetype"] = cfg["arch"]
    skeleton = make_skeleton(root, h)

    for level in (0, 1, 2):
        body_slots = ["body", "leather", "metal"] if level == 0 else (["body", "metal"] if level == 1 else ["body"])
        pieces = [create_mesh(add_body(level, a, cfg), f"LOD{level}_PROD_body", root, skeleton, body_slots, level)]
        weapon_builder = add_weapon(level, a, cfg)
        if weapon_builder and weapon_builder.faces:
            slots = ["leather", "metal"] if level < 2 else ["metal"]
            pieces.append(create_mesh(weapon_builder, f"LOD{level}_PROD_weapon", root, skeleton, slots, level))
        if level > 0:
            marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            marker.parent = root
            marker["lodLevel"] = level
            for piece in pieces:
                piece.parent = marker
        else:
            for piece in pieces:
                piece.parent = root

    socket = empty("weapon_socket", (a["shoulder"] * 1.02, 0.82 * h, 0.06), "EXPORT", "PLAIN_AXES")
    socket.parent = root
    anchor = empty("attackAnchor", (0.0, 0.95 * h, 0.40), "EXPORT", "PLAIN_AXES")
    anchor.parent = root
    collision_box("COL_Unit", (a["shoulder"] * 2.4, 1.86 * h, a["chest_depth"] * 3.0), (0, 0.93 * h, 0), root)
    add_animations(skeleton)
    bpy.context.scene.frame_set(1)

    source = os.path.join(ROOT, "assets-source", "blender", "characters", f"{key}.blend")
    output = os.path.join(ROOT, "public", "assets", "models", "characters", f"{key}.glb")
    save_source(source)
    export_glb(output)
    print(f"unit written: {key} ({cfg['arch']})")


def main():
    only = None
    if "--" in sys.argv:
        rest = sys.argv[sys.argv.index("--") + 1:]
        if rest:
            only = set(rest)
    for key, cfg in UNITS.items():
        if only and key not in only:
            continue
        build_unit(key, cfg)


if __name__ == "__main__":
    main()
