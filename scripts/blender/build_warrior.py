"""Build the authored Warrior production template without touching other units.

This script owns only warrior.blend/warrior.glb.  Each LOD is assembled into
two weighted skinned meshes (body and axe).

Authoring language (Warrior-W2)
-------------------------------
The W1 body was a stack of high-segment lathes -- bodies of revolution with
circular cross-sections -- which is exactly why it read as a turned wooden
toy.  W2 replaces that with ``MeshBuilder.sweep``: every ring is an explicit
cross-section, so a torso can be broad across the shoulders and shallow front
to back, a head can have a face plane and a jaw, and a boot can have a real
sole.  ``section()`` builds superellipse cross-sections, which give flat
front/back planes with rounded corners instead of a circle, and takes separate
front and back depths so the silhouette is not symmetric about the coronal
plane.

Segment counts are deliberately low.  A 12-point section that describes an
actual shape reads far better -- and costs far fewer triangles -- than an
80-point section describing a cylinder.
"""
import math
import os
import sys
from array import array

import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import collision_box, empty, export_glb, material, orient_for_babylon, reset_scene, save_source, collection  # noqa: E402
# Shared authoring language -- see docs/art/PRODUCTION_STANDARD.md. The
# Warrior consumes the same module the rest of the roster will, so the
# reference implementation cannot silently drift from the standard.
from authoring import MeshBuilder, arc, section, super_arc, thin  # noqa: E402


# Base colours.  Cloth is a mid-dark blue-grey rather than near-black, fur is
# a mid grey-beige rather than white, so both still hold detail once the
# review lighting stops over-exposing them.
# The W2 first pass kept every surface in a narrow dark band, so cloth,
# leather, metal and fur all read as the same grey mass under gameplay light.
# These are pulled apart on all three axes that actually separate materials:
# value (fur is ~4x the luminance of the coat), hue (cloth cool blue, leather
# warm orange-brown, iron neutral) and, via create_materials(), roughness.
MATS = {
    "cloth": (0.196, 0.250, 0.302),
    "leather": (0.372, 0.208, 0.104),
    "iron": (0.204, 0.222, 0.246),
}
# Sub-surfaces share a material slot but occupy their own atlas band, which is
# how fur/amber read as distinct surfaces while the GLB keeps 3 materials.
# (material_index, atlas_band) -- band 0..3 within that material's column.
# `beard` and `skin` occupy the two atlas bands that were previously filled
# with a duplicate of their column's first surface and never sampled. They cost
# no material slot and no texture, which matters because the validator caps
# both at 3 and 1 -- a face had to be paid for out of geometry and UV space.
SURFACES = {
    "coat": (0, 0),
    "fur": (0, 1),
    "amber": (0, 2),
    "beard": (0, 3),
    "belt": (1, 0),
    "glove": (1, 1),
    "grip": (1, 2),
    "skin": (1, 3),
    "plate": (2, 0),
    "blade": (2, 1),
}
# Structural values raised by c**0.70. Measured in a live match the cast
# sat at a median screen luminance of 99 against snow at 174, so everyone
# read as a dark cut-out. The exponent lifts the shadow end far more than
# the light end. 'fur' and 'amber' are deliberately untouched: one is the
# lightest mass the palette is anchored on, the other the only accent.
SURFACE_TINT = {
    "coat": (0.402, 0.460, 0.512),    # cool blue-grey wool
    "fur": (0.660, 0.606, 0.512),     # warm pale grey-beige, clearly the lightest mass
    "amber": (0.900, 0.520, 0.130),   # faction strip, the only saturated accent
    "belt": (0.574, 0.415, 0.281),    # warm tan leather
    "glove": (0.496, 0.370, 0.273),   # darker leather so gloves read off the sleeve
    "grip": (0.447, 0.344, 0.254),    # darkest leather, reads against the pale haft
    "plate": (0.411, 0.431, 0.456),   # neutral iron
    "blade": (0.537, 0.561, 0.587),   # polished steel, distinctly brighter than plate
    # A face and a beard. Skin is the warmest surface in the palette by a wide
    # margin -- everything else is cool blue-grey or desaturated tan -- because
    # the single thing that has to survive at forty pixels is "this one is
    # human". The beard is darker than the fur collar so the jaw still breaks
    # against the shawl instead of merging into it.
    "skin": (0.735, 0.552, 0.442),    # weathered warm skin
    "beard": (0.352, 0.318, 0.286),   # dark cold-weather beard
}
MATERIALS = {}


def blend(bone, secondary=None, amount=0.18):
    if not secondary:
        return {bone: 1.0}
    return {bone: 1.0 - amount, secondary: amount}


def torso_weights(y):
    if y < 1.00:
        return blend("pelvis", "spine", 0.32)
    if y < 1.36:
        return blend("spine", "chest", 0.42)
    if y < 1.74:
        return blend("chest", "spine", 0.16)
    return blend("chest", "neck", 0.30)


def head_weights(y):
    if y < 1.98:
        return blend("neck", "chest", 0.25)
    return blend("head", "neck", 0.12)


def arm_weights(side, y):
    upper, lower, hand = f"upper_arm.{side}", f"lower_arm.{side}", f"hand.{side}"
    if y > 1.30:
        return blend(upper, "chest", 0.14)
    if y > 1.16:
        return blend(upper, lower, 0.26)
    if y > 0.98:
        return blend(lower, upper, 0.18)
    if y > 0.86:
        return blend(lower, hand, 0.30)
    return {hand: 1.0}


def leg_weights(side, y):
    thigh, shin, foot = f"thigh.{side}", f"shin.{side}", f"foot.{side}"
    if y > 0.78:
        return blend(thigh, "pelvis", 0.16)
    if y > 0.54:
        return blend(thigh, shin, 0.24)
    if y > 0.34:
        return blend(shin, thigh, 0.18)
    if y > 0.18:
        return blend(shin, foot, 0.28)
    return {foot: 1.0}


def add_body_geometry(level):
    b = MeshBuilder(level)
    # Point counts describe shape, not smoothness.  These are chosen so LOD0
    # spends its budget on readable form (the doc's 4,500-7,000 band) instead
    # of on a smooth cylinder, and so LOD1/LOD2 drop resolution without
    # losing the silhouette.
    # LOD0 was using only ~2.3k of a 7,500 triangle budget. The extra
    # resolution goes into the sections that carry silhouette (torso, head,
    # limbs), not into subdividing flat panels.
    # Counts are multiples of four wherever a corner is actually visible. A
    # superellipse puts its corners at 45 degrees, so a count that is not
    # divisible by four samples *past* every corner and quietly rounds the
    # shape back toward the circle the exponent was raised to escape -- 22 and
    # 18 were doing exactly that at LOD0. LOD2 is exempt: a six-point section
    # is a hexagon, there is no corner left to preserve, and every triangle
    # there is being spent on a unit twenty pixels tall.
    n_torso = (28, 12, 8)[level]
    n_head = (24, 8, 6)[level]
    n_limb = (16, 8, 6)[level]
    # Garment panels are open shells laid on the body. They need their own,
    # much lower count: a lapel is a strip, not a ring.
    n_panel = (9, 6, 4)[level]

    # --- torso ------------------------------------------------------------
    # Broad across the shoulders, tucked at the waist, flaring into a coat
    # hem.  The chest is deeper in front than behind; the waist is shallow.
    # Heroic taper, and -- more importantly -- a torso that *narrows sharply*
    # above the chest. The previous profile stayed 0.378 wide right up to the
    # shoulder line, which is wider than the arm sits, so the arms were buried
    # inside the torso silhouette and the figure read as one slab. Sloping the
    # trapezius in to 0.248 puts the deltoids outboard of the chest, which is
    # what actually separates arm from body at gameplay distance.
    # Kept as parameters rather than as built rings, because the garment
    # panels below have to lie on exactly this surface. Rebuilding a lapel
    # against a guessed radius is how a coat ends up floating off a chest.
    TORSO = (
        (0.70, 0.372, 0.230, 0.248, 2.3),   # coat hem, flared
        (0.84, 0.334, 0.208, 0.226, 2.5),
        (1.00, 0.286, 0.184, 0.196, 2.8),   # waist, cinched
        (1.16, 0.318, 0.210, 0.204, 2.9),
        (1.34, 0.372, 0.244, 0.218, 3.0),   # ribcage
        (1.50, 0.408, 0.262, 0.226, 3.0),   # chest, broadest
        (1.62, 0.396, 0.246, 0.218, 2.9),
        (1.72, 0.322, 0.212, 0.198, 2.6),   # trapezius slope
        (1.78, 0.248, 0.186, 0.176, 2.4),   # neck base
    )
    b.sweep([(y, section(n_torso, w, df, db, e)) for y, w, df, db, e in thin(TORSO, level)],
            "coat", torso_weights)

    # --- garment cut lines -------------------------------------------------
    # The torso above is one closed shell, which is why the audit read it as a
    # hard shell rather than as clothing. Real clothing is *panels*: an
    # overlapping front closure, a reinforced shoulder yoke, a skirt with
    # vents. Each one is an open band laid on the torso surface, so the edge
    # where one layer laps over the next is geometry and catches a real
    # highlight, instead of being a colour change on a smooth wall.
    FRONT = math.tau / 4.0

    def torso_at(y):
        """Interpolated (half_width, depth_front, depth_back, exponent)."""
        if y <= TORSO[0][0]:
            return TORSO[0][1:]
        for lo, hi in zip(TORSO, TORSO[1:]):
            if y <= hi[0]:
                t = (y - lo[0]) / (hi[0] - lo[0])
                return tuple(a + (c - a) * t for a, c in zip(lo[1:], hi[1:]))
        return TORSO[-1][1:]

    def torso_point(y, angle, scale=1.0):
        w, df, db, e = torso_at(y)
        return super_arc(2, w, df, db, e, angle, angle, scale=scale)[0]

    def panel(rows, a0, a1, surface, outer, inner, n=None, weight_fn=torso_weights):
        count = n or n_panel
        b.band([(y,
                 super_arc(count, w, df, db, e, a0, a1, scale=outer),
                 super_arc(count, w, df, db, e, a0, a1, scale=inner))
                for y, w, df, db, e in rows], surface, weight_fn)

    # Front closure: a leather under-facing with a wool storm flap lapping
    # over it and stopping short, so the leather shows as a hard edge running
    # from the collar to the hem. The closure is deliberately off-centre --
    # a symmetric seam down the middle reads as a zip on a wetsuit.
    if level <= 1:
        closure = thin(TORSO[0:7], level, (1, 2, 2))
        panel(closure, FRONT - 0.22, FRONT + 1.06, "belt", 1.030, 1.000)
        panel(closure, FRONT - 0.20, FRONT + 0.88, "coat", 1.062, 1.028)

        # Shoulder yoke: a second layer across the shoulders and upper back,
        # under the fur collar. It puts a horizontal cut line across the one
        # part of the torso that had none.
        panel([r for r in TORSO if 1.44 <= r[0] <= 1.66], FRONT - 1.62, FRONT + 1.62,
              "belt", 1.038, 1.004, n=(15, 9)[level])

    # Coat skirt below the hem, split into three panels. The two side vents
    # and the front vent are what let the legs read through the coat; a closed
    # bell would swallow them and turn the whole lower body into one mass.
    SKIRT = (
        (0.72, 0.366, 0.228, 0.246, 2.3),
        (0.64, 0.378, 0.238, 0.256, 2.4),
        (0.57, 0.390, 0.248, 0.268, 2.5),
    )
    SKIRT_BACK = SKIRT[:-1] + ((0.51, 0.400, 0.256, 0.278, 2.5),)
    panel(SKIRT, FRONT - 1.36, FRONT - 0.16, "coat", 1.000, 0.958)
    panel(SKIRT, FRONT + 0.16, FRONT + 1.36, "coat", 1.000, 0.958)
    panel(SKIRT_BACK, FRONT + 1.54, FRONT + 4.74, "coat", 1.000, 0.958, n=n_panel * 2)

    if level == 0:
        # Toggles down the storm flap edge, and two hip pocket flaps. Small,
        # but they are the things that read as "this was sewn" at close range.
        for y in (1.44, 1.24, 1.04, 0.86):
            x, z = torso_point(y, FRONT + 0.80, 1.072)
            b.box((x, y, z), (0.052, 0.052, 0.032), "blade", torso_weights(y), taper=0.70)
        for centre in (FRONT - 1.02, FRONT + 1.02):
            panel([(0.94,) + torso_at(0.94), (0.85,) + torso_at(0.85)],
                  centre - 0.26, centre + 0.26, "coat", 1.076, 1.022, n=6)

    # --- neck -------------------------------------------------------------
    b.sweep([
        (1.76, section(n_head, 0.130, 0.112, 0.116, 2.4)),
        (1.94, section(n_head, 0.118, 0.104, 0.108, 2.4)),
    ], "coat", head_weights, cap_bottom=False, cap_top=False)

    # --- fur collar -------------------------------------------------------
    # An open shawl that wraps from one shoulder around the back to the
    # other, leaving a V at the front.  Deliberately NOT a closed ring: the
    # W1 collar read as a torus because it was one.
    if level <= 1:
        n_collar = (11, 7)[level]
        collar = []
        for y, outer_w, outer_d, inner_w, inner_d in (
            (1.71, 0.272, 0.242, 0.194, 0.174),
            (1.83, 0.304, 0.270, 0.180, 0.162),
            (1.93, 0.264, 0.234, 0.164, 0.148),
        ):
            collar.append((
                y,
                arc(n_collar, outer_w, outer_d, -2.42, 2.42),
                arc(n_collar, inner_w, inner_d, -2.42, 2.42),
            ))
        b.band(collar, "fur", lambda y: blend("chest", "neck", 0.42))

    # --- head -------------------------------------------------------------
    # A human head under an open helm, not a helm with a face drawn on it.
    #
    # The previous head was one smooth swept mass in coat cloth, with a brow
    # band, a nasal bar and two dark slits stuck to the front of it. At LOD0
    # that is a mask: no chin, no cheekbone, and no skin anywhere on a unit
    # the player is meant to read as a human winter survivor. The audit called
    # it a masked head and was right.
    #
    # These rings are a skull. The widest point is the cheekbone rather than
    # the brow, the jaw narrows into a chin that projects forward, and the
    # whole thing is `skin` -- the only warm surface in the palette. The helm
    # is separate geometry sitting on top of it, so it can cover the cranium
    # and leave the face open.
    head_w = blend("head", "neck", 0.10)
    head_rings = [
        (1.955, section(n_head, 0.098, 0.106, 0.100, 2.2, centre_z=0.004)),   # neck junction
        (2.010, section(n_head, 0.118, 0.134, 0.118, 2.2, centre_z=0.020)),   # under the jaw
        (2.062, section(n_head, 0.142, 0.158, 0.136, 2.4, centre_z=0.026)),   # jaw, chin forward
        (2.118, section(n_head, 0.164, 0.166, 0.148, 2.7, centre_z=0.022)),   # cheekbone, widest
        (2.178, section(n_head, 0.170, 0.168, 0.154, 2.9, centre_z=0.014)),   # eye line
        (2.232, section(n_head, 0.166, 0.170, 0.158, 3.0, centre_z=0.010)),   # brow ridge
        (2.286, section(n_head, 0.160, 0.158, 0.158, 2.8, centre_z=0.000)),   # forehead
        (2.348, section(n_head, 0.150, 0.146, 0.152, 2.6, centre_z=-0.006)),  # cranium
        (2.412, section(n_head, 0.122, 0.118, 0.128, 2.4, centre_z=-0.012)),  # upper cranium
        (2.452, section(n_head, 0.078, 0.076, 0.084, 2.2, centre_z=-0.016)),  # crown
    ]
    b.sweep(thin(head_rings, level), "skin", head_weights, cap_bottom=False)

    # Beard. It does three jobs at once: it is the strongest silhouette break
    # on the head, it is the only thing on the unit that says "wintering out
    # here" rather than "soldier", and it hides the jaw seam a swept skull
    # cannot avoid. Kept at every LOD, because a jaw mass survives to a dozen
    # pixels and the face detail below it does not.
    b.sweep([
        (1.928, section(n_head, 0.082, 0.128, 0.060, 2.0, centre_z=0.034)),
        (1.984, section(n_head, 0.134, 0.178, 0.104, 2.2, centre_z=0.034)),
        (2.042, section(n_head, 0.166, 0.190, 0.140, 2.4, centre_z=0.024)),
        # The top ring pulls *behind* the face front so the cheeks stay bare
        # while the sides still run up past them as sideburns.
        (2.096, section(n_head, 0.172, 0.162, 0.156, 2.6, centre_z=0.030)),
    ][:: 2 if level == 2 else 1], "beard", head_weights)

    # Open helm: a bowl over the cranium with a rolled brow rim. It has to sit
    # *on* the skull rings above -- a helm that clears the head by a visible
    # gap reads as a hat balanced on it.
    b.sweep([
        (2.222, section(n_head, 0.180, 0.184, 0.174, 3.0, centre_z=0.008)),
        (2.286, section(n_head, 0.174, 0.172, 0.172, 2.9, centre_z=0.000)),
        (2.352, section(n_head, 0.162, 0.158, 0.164, 2.7, centre_z=-0.006)),
        (2.418, section(n_head, 0.132, 0.128, 0.138, 2.5, centre_z=-0.012)),
        (2.472, section(n_head, 0.076, 0.074, 0.082, 2.3, centre_z=-0.016)),
    ][:: 2 if level == 2 else 1], "plate", head_weights, cap_bottom=False)
    if level <= 1:
        # Rolled rim: flares out, then tucks back inside the skull so the
        # shell has no open edge. `blade` is the brightest surface, and this
        # line is what separates helm from face when the head is small.
        b.sweep([
            (2.222, section(n_head, 0.180, 0.184, 0.174, 3.0, centre_z=0.008)),
            (2.206, section(n_head, 0.192, 0.200, 0.186, 3.0, centre_z=0.010)),
            (2.190, section(n_head, 0.164, 0.160, 0.158, 3.0, centre_z=0.008)),
        ], "blade", head_weights, cap_bottom=False, cap_top=False)

    if level == 0:
        # Brow, nose, eye sockets and moustache. All structure, no detail:
        # what reads at close range is the shadow the brow throws into the
        # sockets and the break the nose puts across the face. They are
        # dropped entirely below LOD0 rather than shrunk, because at LOD1 they
        # would be sub-pixel noise that only costs triangles.
        # Every one of these is placed against the measured superellipse, not
        # by eye. The first attempt put the eyes at z=0.159 where the face
        # surface is at z=0.176, so they were seventeen millimetres inside the
        # skull and the head rendered as a blank plane -- the exact masked
        # look this pass exists to remove, reintroduced by arithmetic.
        #
        # Geometry cannot cut a socket, so the eye is a dark slab straddling
        # the surface with a brow overhanging it. What reads as an eye at any
        # distance is the shadow the brow throws, not the eye itself.
        b.box((0.0, 2.208, 0.166), (0.176, 0.042, 0.048), "skin", head_w, taper=0.82)
        b.box((0.0, 2.174, 0.180), (0.038, 0.068, 0.056), "skin", head_w, taper=0.70)
        b.box((0.0, 2.122, 0.186), (0.074, 0.048, 0.064), "skin", head_w, taper=0.86)
        for sign in (-1, 1):
            b.box((sign * 0.078, 2.176, 0.172), (0.054, 0.026, 0.032), "grip", head_w, taper=0.88)
        # Cheek guards hinged off the helm rim, hanging down the sides of the
        # face past the jaw. They frame the face rather than closing over it.
        for sign in (-1, 1):
            b.prism([
                (sign * 0.150, 2.216), (sign * 0.204, 2.192),
                (sign * 0.192, 2.048), (sign * 0.136, 2.066),
            ], 0.030, 0.104, "plate", head_w)
        # Crown crest and a nape guard: the two ends of the head silhouette,
        # which are what the top-down gameplay camera actually sees.
        b.box((0.0, 2.482, -0.006), (0.052, 0.064, 0.176), "plate", head_w, taper=0.60)
        b.prism([
            (-0.120, 2.206), (0.120, 2.206), (0.104, 2.088), (-0.104, 2.088),
        ], -0.172, 0.034, "plate", head_w)

    # --- shoulders --------------------------------------------------------
    # One fitted pauldron that follows the shoulder curve, much smaller than
    # the W1 wedge.
    if level <= 1:
        # A layered pauldron: a cap over the deltoid and two lames skirting
        # below it. This was one smooth swept dome, which with a real
        # environment to reflect turned into a black egg -- no edges, so no
        # highlight anywhere to say it was steel. Armour reads as armour
        # because of the line where one plate laps over the next, so each lame
        # sits slightly proud of the one above and carries a rim in `blade`,
        # the brightest surface in the palette. Those rims are the only thing
        # that survives to LOD1, and they are the part worth keeping.
        n_sh = (12, 6)[level]
        sh_w = lambda y: blend("upper_arm.L", "chest", 0.34)

        # A shoulder is wider front-to-back than it is outboard, so the plate
        # that caps it has to be too. Equal radii gave a stack of discs that
        # read as a tin can sleeved onto the arm.
        def ring(r, x, exp):
            return section(n_sh, r, r * 1.16, r * 1.08, exp, centre_x=x)

        def lame(y_top, y_bot, r_top, r_bot, x_top, x_bot, exp=3.1):
            b.sweep([
                (y_top, ring(r_top, x_top, exp)),
                (y_bot, ring(r_bot, x_bot, exp)),
            ], "plate", sh_w, cap_top=False)
            # Rolled rim along the lower edge, where a real lame is thickest.
            b.sweep([
                (y_bot, ring(r_bot, x_bot, exp)),
                (y_bot - 0.024, ring(r_bot * 0.95, x_bot - 0.006, exp)),
            ], "blade", sh_w, cap_top=False)

        # Cap over the deltoid, then two lames each lapping outside the last.
        # Each lame flares wider than the one above it, so the pauldron skirts
        # away from the deltoid instead of closing back in like a cylinder.
        b.sweep([
            (1.748, ring(0.084, -0.394, 2.6)),
            (1.706, ring(0.126, -0.402, 2.9)),
            (1.672, ring(0.144, -0.408, 3.1)),
        ], "plate", sh_w, cap_bottom=False)
        lame(1.676, 1.612, 0.150, 0.168, -0.410, -0.421)
        lame(1.616, 1.550, 0.172, 0.186, -0.423, -0.436)

        if level == 0:
            # Rivets along the cap, which is where a pauldron is actually
            # strapped. Three is enough to catch the light and read as a join.
            # box() takes a weight dict; only sweep() takes a weight function.
            rivet_w = blend("upper_arm.L", "chest", 0.34)
            for t in (-1, 0, 1):
                b.box((-0.404 + t * 0.006, 1.686, t * 0.088), (0.030, 0.024, 0.030),
                      "blade", rivet_w, taper=0.55)

    # --- belt and faction strip ------------------------------------------
    # Pelvis/seat mass under the belt, so the coat hem has hips inside it
    # rather than hanging off a straight tube.
    b.sweep([
        (0.94, section(n_torso, 0.316, 0.204, 0.222, 2.6)),
        (0.86, section(n_torso, 0.332, 0.212, 0.238, 2.5)),
        (0.78, section(n_torso, 0.318, 0.204, 0.226, 2.5)),
    ], "coat", torso_weights, cap_bottom=False, cap_top=False)
    # Belt, cinched narrower than both the ribcage above and the hips below.
    b.sweep([
        (0.99, section(n_torso, 0.306, 0.196, 0.208, 2.9)),
        (1.07, section(n_torso, 0.312, 0.202, 0.214, 2.9)),
    ], "belt", torso_weights, cap_bottom=False, cap_top=False)
    if level == 0:
        b.box((0.0, 1.42, 0.268), (0.104, 0.190, 0.026), "amber", blend("chest", "spine", 0.34), rotate_z=-0.13)
        # Belt buckle: frame, tongue and a strap end hanging past it. The belt
        # was an unbroken band of leather, so the waist -- the narrowest point
        # of the whole silhouette, and where the eye goes -- had nothing on it.
        belt_w = blend("pelvis", "spine", 0.40)
        b.box((0.0, 1.030, 0.222), (0.128, 0.108, 0.028), "plate", belt_w)
        b.box((0.0, 1.030, 0.238), (0.086, 0.066, 0.022), "blade", belt_w, taper=0.88)
        b.box((0.0, 1.030, 0.246), (0.020, 0.096, 0.018), "blade", belt_w, taper=0.7)
        b.box((0.086, 1.004, 0.226), (0.062, 0.148, 0.020), "belt", belt_w, taper=0.82)

    # --- arms -------------------------------------------------------------
    for side, sign in (("L", -1), ("R", 1)):
        shoulder_x = sign * 0.402
        elbow_x = sign * 0.560
        wrist_x = sign * 0.552
        # Upper arm: a real deltoid cap sitting outboard of the narrowed
        # trapezius, tapering into a defined elbow. The cap is the piece that
        # makes the arm a separate mass rather than an extrusion of the chest.
        b.sweep([
            (1.72, section(n_limb, 0.104, 0.108, 0.104, 2.4, centre_x=sign * 0.396)),
            (1.64, section(n_limb, 0.148, 0.148, 0.142, 2.5, centre_x=sign * 0.418)),  # deltoid
            (1.52, section(n_limb, 0.136, 0.138, 0.132, 2.5, centre_x=sign * 0.444)),
            (1.42, section(n_limb, 0.118, 0.120, 0.116, 2.5, centre_x=sign * 0.492)),
            (1.32, section(n_limb, 0.098, 0.100, 0.098, 2.6, centre_x=elbow_x)),
        ][:: 2 if level == 2 else 1], "coat", lambda y, s=side: arm_weights(s, y),
            cap_bottom=False, cap_top=False)
        # Forearm: tapers to the wrist.
        b.sweep([
            (1.32, section(n_limb, 0.098, 0.100, 0.098, 2.5, centre_x=elbow_x)),
            (1.12, section(n_limb, 0.092, 0.094, 0.092, 2.6, centre_x=sign * 0.556)),
            (0.94, section(n_limb, 0.078, 0.080, 0.080, 2.6, centre_x=wrist_x, centre_z=0.028)),
        ], "coat", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        if level <= 1:
            # Sleeve head seam: the leather welt where a sleeve is set into a
            # coat. The left shoulder has a pauldron covering this join; the
            # right had nothing, so the right arm grew straight out of the
            # torso with no join at all and both arms read as extrusions.
            b.sweep([
                (1.700, section(n_limb, 0.114, 0.116, 0.112, 2.5, centre_x=sign * 0.394)),
                (1.648, section(n_limb, 0.154, 0.154, 0.148, 2.5, centre_x=sign * 0.416)),
            ], "belt", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)

            # Elbow patch: the hard-wearing panel on a working coat, and the
            # cut line that breaks the sleeve into upper arm and forearm
            # instead of one continuous tube from shoulder to wrist.
            b.sweep([
                (1.400, section(n_limb, 0.120, 0.122, 0.120, 2.6, centre_x=sign * 0.510)),
                (1.320, section(n_limb, 0.108, 0.110, 0.108, 2.7, centre_x=elbow_x)),
                (1.254, section(n_limb, 0.102, 0.104, 0.102, 2.7, centre_x=sign * 0.558)),
            ], "belt", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)

            # Vambrace over the forearm. Leather rather than plate: this is a
            # militia coat, and a second slab of steel down the arm would
            # fight the pauldron for the eye.
            b.sweep([
                (1.190, section(n_limb, 0.106, 0.108, 0.106, 3.0, centre_x=sign * 0.556, centre_z=0.008)),
                (1.040, section(n_limb, 0.100, 0.102, 0.100, 3.1, centre_x=sign * 0.554, centre_z=0.018)),
                (0.972, section(n_limb, 0.092, 0.094, 0.094, 3.1, centre_x=wrist_x, centre_z=0.026)),
            ], "belt", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)

        if level == 0:
            # Bright rim at the wrist, and two buckles down the outside. Both
            # are sub-pixel one tier down, so neither is worth carrying there.
            b.sweep([
                (0.972, section(n_limb, 0.092, 0.094, 0.094, 3.1, centre_x=wrist_x, centre_z=0.026)),
                (0.958, section(n_limb, 0.100, 0.102, 0.102, 3.1, centre_x=wrist_x, centre_z=0.027)),
                (0.944, section(n_limb, 0.086, 0.088, 0.088, 3.0, centre_x=wrist_x, centre_z=0.028)),
            ], "blade", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
            for y in (1.150, 1.030):
                b.box((sign * 0.660, y, 0.014), (0.030, 0.046, 0.078), "plate",
                      blend(f"lower_arm.{side}", f"hand.{side}", 0.10), taper=0.80)

        # Hand: a cuff, then a palm mass that is markedly wider than it is
        # thick, then a tapered finger block angled forward -- so it reads as
        # a closed fist gripping a haft rather than the rounded mitten the
        # previous pass produced.
        b.sweep([
            (0.945, section(n_limb, 0.086, 0.088, 0.088, 2.5, centre_x=wrist_x, centre_z=0.028)),
            (0.900, section(n_limb, 0.098, 0.086, 0.086, 2.8, centre_x=sign * 0.548, centre_z=0.040)),
        ], "belt", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        b.sweep([
            (0.900, section(n_limb, 0.104, 0.082, 0.082, 3.0, centre_x=sign * 0.548, centre_z=0.044)),
            (0.836, section(n_limb, 0.112, 0.086, 0.084, 3.2, centre_x=sign * 0.540, centre_z=0.070)),
            (0.780, section(n_limb, 0.104, 0.080, 0.078, 3.0, centre_x=sign * 0.528, centre_z=0.092)),
            (0.742, section(n_limb, 0.074, 0.062, 0.060, 2.6, centre_x=sign * 0.516, centre_z=0.104)),
        ][:: 2 if level == 2 else 1], "glove", lambda y, s=side: arm_weights(s, y), cap_bottom=False)
        # Thumb: small, but it is what makes the hand read as gripping.
        if level <= 1:
            b.box((sign * 0.494, 0.868, 0.098), (0.040, 0.086, 0.052), "glove",
                  blend(f"hand.{side}", f"lower_arm.{side}", 0.10), rotate_z=sign * 0.30, taper=0.78)

    # --- legs -------------------------------------------------------------
    for side, sign in (("L", -1), ("R", 1)):
        hip_x = sign * 0.186
        knee_x = sign * 0.204
        ankle_x = sign * 0.196
        # Leg with actual muscle staging: a heavy upper thigh, a narrowed
        # knee with a flatter front plane, a calf swell behind it, then a
        # thin ankle. The previous pass tapered almost linearly, which is
        # what made the legs read as tubes.
        b.sweep([
            (0.82, section(n_limb, 0.184, 0.180, 0.190, 2.4, centre_x=hip_x)),           # hip / seat
            (0.72, section(n_limb, 0.176, 0.174, 0.184, 2.5, centre_x=sign * 0.190)),    # thigh, thickest
            (0.60, section(n_limb, 0.150, 0.152, 0.158, 2.6, centre_x=sign * 0.194)),
            (0.50, section(n_limb, 0.118, 0.128, 0.120, 3.0, centre_x=knee_x)),          # knee, flat front
            (0.43, section(n_limb, 0.126, 0.126, 0.144, 2.7, centre_x=sign * 0.198)),    # calf swell (rear)
            (0.32, section(n_limb, 0.112, 0.112, 0.122, 2.6, centre_x=sign * 0.200)),
            (0.22, section(n_limb, 0.092, 0.094, 0.098, 2.5, centre_x=ankle_x)),         # ankle, thinnest
        ][:: 2 if level == 2 else 1], "coat", lambda y, s=side: leg_weights(s, y), cap_top=False)

        if level <= 1:
            # Knee patch. Same job as the elbow: it breaks the leg into thigh
            # and shin instead of one continuous taper from hip to ankle.
            b.sweep([
                (0.542, section(n_limb, 0.128, 0.138, 0.128, 2.8, centre_x=sign * 0.199, centre_z=0.008)),
                (0.502, section(n_limb, 0.124, 0.136, 0.124, 3.0, centre_x=knee_x, centre_z=0.012)),
                (0.470, section(n_limb, 0.117, 0.124, 0.119, 2.9, centre_x=sign * 0.200, centre_z=0.010)),
            ], "belt", lambda y, s=side: leg_weights(s, y), cap_bottom=False, cap_top=False)

            # Breeches bloused over the boot top. This is the cut line that
            # was missing at the ankle: without it, trouser and boot are one
            # tube that merely changes colour halfway down.
            b.sweep([
                (0.360, section(n_limb, 0.108, 0.110, 0.116, 2.5, centre_x=sign * 0.200)),
                (0.300, section(n_limb, 0.130, 0.134, 0.142, 2.4, centre_x=sign * 0.199)),
                (0.256, section(n_limb, 0.122, 0.126, 0.132, 2.5, centre_x=ankle_x)),
            ], "coat", lambda y, s=side: leg_weights(s, y), cap_bottom=False, cap_top=False)

        # --- boot -------------------------------------------------------
        # The sole was three tapered boxes, which is exactly why the audit
        # read the boots as blocks. A foot's shape runs along the direction it
        # points, so it is lofted along +Z -- heel, seat, arch, ball, toe --
        # with the sole lifting off the ground at the arch and again at the
        # toe. `section()` is reused with its second coordinate read as
        # height, so the same superellipse rules apply: a flat sole with
        # rounded edges, not a cylinder and not a brick.
        boot_weights = blend(f"foot.{side}", f"shin.{side}", 0.16)
        boot_w = lambda _key, w=boot_weights: w
        n_foot = (12, 8, 6)[level]

        # Ankle cuff, coming down onto the foot.
        b.sweep([
            (0.240, section(n_limb, 0.108, 0.110, 0.114, 2.4, centre_x=ankle_x)),
            (0.160, section(n_limb, 0.120, 0.126, 0.122, 2.5, centre_x=ankle_x, centre_z=0.012)),
            (0.108, section(n_limb, 0.114, 0.128, 0.114, 2.7, centre_x=ankle_x, centre_z=0.022)),
        ] if level <= 1 else [
            (0.240, section(n_limb, 0.108, 0.110, 0.114, 2.4, centre_x=ankle_x)),
            (0.120, section(n_limb, 0.118, 0.128, 0.118, 2.6, centre_x=ankle_x, centre_z=0.018)),
        ], "belt", boot_w, cap_bottom=False, cap_top=False)

        # (z, half_width, rise, drop, exponent, centre_x, centre_y)
        FOOT = (
            (-0.152, 0.066, 0.058, 0.038, 2.2, ankle_x, 0.072),   # heel, rounded off
            (-0.098, 0.098, 0.086, 0.062, 2.6, ankle_x, 0.070),   # heel seat, on the ground
            (-0.020, 0.092, 0.094, 0.052, 2.8, ankle_x, 0.062),   # arch, sole lifts
            (0.070, 0.108, 0.088, 0.050, 3.0, ankle_x, 0.058),    # ball, widest
            (0.160, 0.102, 0.074, 0.044, 3.0, ankle_x, 0.056),
            (0.226, 0.076, 0.058, 0.034, 2.6, ankle_x, 0.064),    # toe, springing up
            (0.258, 0.038, 0.036, 0.020, 2.2, ankle_x, 0.074),    # toe cap
        )
        b.sweep_z([(z, section(n_foot, w, up, dn, e, centre_x=cx, centre_z=cy))
                   for z, w, up, dn, e, cx, cy in thin(FOOT, level)], "belt", boot_w)
        # Sole: the same outline, wider and flattened into a slab that follows
        # the boot's underside, in the darkest leather -- so the boot has a
        # visible sole edge instead of the upper just ending at the ground.
        if level <= 1:
            b.sweep_z([(z, section(n_foot, w + 0.009, 0.026, 0.024, max(3.0, e),
                                   centre_x=cx, centre_z=(cy - dn) + 0.020))
                       for z, w, up, dn, e, cx, cy in FOOT], "grip", boot_w)
        if level == 0:
            # Heel block -- a heel genuinely is a block, so this one stays --
            # a steel cap lofted over the toe rather than boxed onto it, and
            # one buckle on the outside of the ankle.
            b.box((ankle_x, 0.026, -0.098), (0.196, 0.052, 0.126), "grip", boot_weights, taper=0.90)
            b.sweep_z([(z, section(n_foot, w + 0.007, up + 0.005, dn + 0.005, e,
                                   centre_x=cx, centre_z=cy))
                       for z, w, up, dn, e, cx, cy in FOOT[3:]], "plate", boot_w, cap_back=False)
            b.box((ankle_x + sign * 0.104, 0.170, 0.026), (0.034, 0.044, 0.086),
                  "plate", boot_weights, taper=0.82)

    return b


# --- ice axe --------------------------------------------------------------
# Rigid weapon contract (Warrior-W2 §7): the entire axe is weighted 100% to
# hand.R.  W1 split every axe vertex 50/50 between hand.L and hand.R, which
# stretched the weapon between the two hands whenever they moved apart.  The
# left hand is brought onto the shaft by the animation instead.
AXE_BONE = "hand.R"
# Shaft axis, solved so that the upper grip (t=UPPER_GRIP_T) lands exactly on
# the right hand's bind position (0.56, 0.92, 0.03). Because the whole axe is
# rigid to hand.R, that makes hand.R and the upper grip permanently
# coincident -- the right-hand contact is correct by construction, and the
# measurement that actually carries information is the left hand's.
AXE_BUTT = (0.4635, 0.2202, -0.0883)
AXE_TIP = (0.6755, 1.7582, 0.1717)
# Named grip parameters along the shaft. These drive both the authored wrap
# geometry and the exported locator nodes, so the mesh, the locators and the
# animation can never drift apart.
LOWER_GRIP_T = 0.205
UPPER_GRIP_T = 0.455
AXE_HEAD_T = 0.905
# Outermost point of the cutting edge, exported as the `axe_tip` locator so
# the swing arc is measured from the part of the weapon that actually lands
# rather than from a bounding-box centre.
AXE_BLADE_TIP = (
    AXE_BUTT[0] + (AXE_TIP[0] - AXE_BUTT[0]) * AXE_HEAD_T + 0.392,
    AXE_BUTT[1] + (AXE_TIP[1] - AXE_BUTT[1]) * AXE_HEAD_T - 0.020,
    AXE_BUTT[2] + (AXE_TIP[2] - AXE_BUTT[2]) * AXE_HEAD_T,
)


def axe_point(t, dx=0.0, dy=0.0, dz=0.0):
    """A point at parameter ``t`` along the shaft, with an optional offset."""
    return (
        AXE_BUTT[0] + (AXE_TIP[0] - AXE_BUTT[0]) * t + dx,
        AXE_BUTT[1] + (AXE_TIP[1] - AXE_BUTT[1]) * t + dy,
        AXE_BUTT[2] + (AXE_TIP[2] - AXE_BUTT[2]) * t + dz,
    )


def add_axe_geometry(level):
    b = MeshBuilder(level)
    n = (8, 6, 4)[level]
    w = {AXE_BONE: 1.0}

    def shaft_ring(t, radius, surface_points=None):
        px, py, pz = axe_point(t)
        return (py, section(n, radius, radius, radius, 2.2, centre_x=px, centre_z=pz))

    # 1. solid handle -- the full shaft, slightly thicker at the middle.
    b.sweep([
        shaft_ring(0.03, 0.0300),
        shaft_ring(0.20, 0.0330),
        shaft_ring(0.50, 0.0340),
        shaft_ring(0.78, 0.0322),
        shaft_ring(0.95, 0.0296),
    ], "grip", lambda y: w)

    # 2/3. grip wraps -- deliberately fat relative to the shaft so the two
    # hand positions are legible as *grips* at gameplay camera distance, not
    # just as slightly darker bands of haft.
    for centre_t in (LOWER_GRIP_T, UPPER_GRIP_T):
        b.sweep([
            shaft_ring(centre_t - 0.085, 0.0392),
            shaft_ring(centre_t - 0.060, 0.0505),
            shaft_ring(centre_t + 0.060, 0.0505),
            shaft_ring(centre_t + 0.085, 0.0392),
        ], "grip", lambda y: w, cap_bottom=False, cap_top=False)

    # 4. pommel -- a flared butt cap so the shaft does not just end.
    butt = axe_point(0.0)
    b.box((butt[0], butt[1] - 0.016, butt[2]), (0.098, 0.070, 0.098), "plate", w, taper=1.42)

    # 5. axe eye / connector -- the collar clamping head to shaft.
    eye = axe_point(AXE_HEAD_T - 0.012)
    b.box((eye[0], eye[1], eye[2]), (0.104, 0.158, 0.106), "plate", w, taper=0.88)

    # 6/7. head. The bit is bigger and its cutting edge is a deep concave
    # crescent, and the rear pick is a long downward-hooked spike: those two
    # asymmetric features are what make the silhouette read as an ice axe
    # rather than a generic hatchet at gameplay distance. The earlier pass
    # was too small and too symmetric to survive the LOD/scale reduction.
    bx, by, bz = axe_point(AXE_HEAD_T)
    thickness = (0.052, 0.058, 0.066)[level]
    blade = [
        (bx + 0.020, by - 0.128),
        (bx + 0.150, by - 0.176),
        (bx + 0.318, by - 0.150),
        (bx + 0.392, by - 0.020),
        (bx + 0.372, by + 0.128),
        (bx + 0.246, by + 0.206),
        (bx + 0.118, by + 0.196),   # concave sweep back into the eye
        (bx + 0.170, by + 0.086),
        (bx + 0.042, by + 0.120),
    ]
    b.prism(blade, bz, thickness, "blade", w)

    pick = [
        (bx - 0.014, by - 0.096),
        (bx - 0.150, by - 0.104),
        (bx - 0.300, by - 0.062),
        (bx - 0.398, by + 0.048),   # hooked tip
        (bx - 0.286, by + 0.030),
        (bx - 0.152, by + 0.028),
        (bx - 0.018, by + 0.104),
    ]
    b.prism(pick, bz * 1.0, thickness * 0.82, "blade", w)
    return b


def create_armature(root_obj):
    armature_data = bpy.data.armatures.new("UnitSkeleton")
    armature_obj = bpy.data.objects.new("UnitSkeleton", armature_data)
    collection("RIG").objects.link(armature_obj)
    armature_obj.parent = root_obj
    armature_obj.show_in_front = True
    armature_obj.hide_render = True
    bpy.context.view_layer.objects.active = armature_obj
    armature_obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    if len(armature_data.edit_bones):
        armature_data.edit_bones.remove(armature_data.edit_bones[0])
    specs = [
        ("root", (0, 0, 0), (0, 0.22, 0), None),
        ("pelvis", (0, 0.78, 0), (0, 1.03, 0), "root"),
        ("spine", (0, 1.03, 0), (0, 1.40, 0), "pelvis"),
        ("chest", (0, 1.40, 0), (0, 1.78, 0), "spine"),
        ("neck", (0, 1.78, 0), (0, 1.98, 0), "chest"),
        ("head", (0, 1.98, 0), (0, 2.36, 0), "neck"),
    ]
    for side, x in (("L", -1), ("R", 1)):
        specs += [
            (f"upper_arm.{side}", (x * 0.40, 1.60, 0), (x * 0.56, 1.32, 0), "chest"),
            (f"lower_arm.{side}", (x * 0.56, 1.32, 0), (x * 0.56, 0.92, 0.03), f"upper_arm.{side}"),
            (f"hand.{side}", (x * 0.56, 0.92, 0.03), (x * 0.50, 0.74, 0.09), f"lower_arm.{side}"),
            (f"thigh.{side}", (x * 0.19, 0.80, 0), (x * 0.20, 0.50, 0), "pelvis"),
            (f"shin.{side}", (x * 0.20, 0.50, 0), (x * 0.20, 0.22, 0.02), f"thigh.{side}"),
            (f"foot.{side}", (x * 0.20, 0.22, 0.02), (x * 0.20, 0.05, 0.24), f"shin.{side}"),
        ]
    bones = {}
    for name, head, tail, parent in specs:
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    armature_obj["boneContract"] = "18 weighted bones"
    armature_obj["forwardAxis"] = "+Z"
    return armature_obj


BONE_ORDER = (
    "root", "pelvis", "spine", "chest", "neck", "head",
    "upper_arm.L", "lower_arm.L", "hand.L", "upper_arm.R", "lower_arm.R", "hand.R",
    "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
)


def create_mesh(builder, name, parent, armature_obj, allowed_materials, lod):
    mesh_data = bpy.data.meshes.new(name)
    mesh_data.from_pydata(builder.vertices, [], builder.faces)
    mesh_data.validate(verbose=False)
    mesh_data.update()
    for polygon in mesh_data.polygons:
        polygon.use_smooth = True
    for mat_name in allowed_materials:
        mesh_data.materials.append(MATERIALS[mat_name])
    slot_names = ("cloth", "leather", "iron")
    uv = mesh_data.uv_layers.new(name="UVMap")
    colors = mesh_data.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    for polygon in mesh_data.polygons:
        surface = builder.surfaces[polygon.index]
        material_index, band = SURFACES[surface]
        wanted = slot_names[material_index]
        slot = allowed_materials.index(wanted) if wanted in allowed_materials else 0
        polygon.material_index = slot
        # Each material owns a third of the atlas; each surface owns a
        # quarter-band inside it, so fur/amber/grip read differently without
        # adding material slots or exceeding the primitive budget.
        u0 = material_index / 3.0
        v0 = band / 4.0
        # COLOR_0 is consumed as a *multiplier* by both Blender's exporter and
        # Babylon's glTF loader. It must therefore stay near white: the atlas
        # already carries the actual surface colour, and writing the absolute
        # tint here would multiply the two together and crush every surface
        # toward black. This is a soft directional shade only.
        normal = polygon.normal
        lift = 0.055 if normal.z > 0.55 else (-0.045 if normal.z < -0.55 else 0.0)
        shade = max(0.86, min(1.06, 1.0 + lift))
        for loop_index in polygon.loop_indices:
            vertex = mesh_data.vertices[mesh_data.loops[loop_index].vertex_index].co
            u = u0 + (0.06 + 0.88 * ((vertex.x * 0.9 + 0.5) % 1.0)) / 3.0
            v = v0 + (0.06 + 0.88 * ((vertex.y * 0.42) % 1.0)) / 4.0
            uv.data[loop_index].uv = (u, v)
            colors.data[loop_index].color = (shade, shade, shade, 1.0)
    mesh = bpy.data.objects.new(name, mesh_data)
    collection(f"LOD{lod}").objects.link(mesh)
    mesh.parent = parent
    for bone_name in BONE_ORDER:
        mesh.vertex_groups.new(name=bone_name)
    for vertex_index, weight_map in enumerate(builder.weights):
        for bone_name, weight in weight_map.items():
            mesh.vertex_groups[bone_name].add([vertex_index], max(0.0, min(1.0, weight)), "REPLACE")
    modifier = mesh.modifiers.new("Warrior weighted skin", "ARMATURE")
    modifier.object = armature_obj
    mesh["lodLevel"] = lod
    mesh["authoredRole"] = "warrior_body" if "body" in name else "warrior_axe"
    mesh["weightedSkinning"] = True
    return mesh


def make_atlas():
    """Author a 1024 atlas with real per-surface content.

    W1 filled this with a single sine field, which the art review correctly
    rejected as "sine noise standing in for a surface".  Each material column
    now carries its own structure -- woven weft for cloth, directional grain
    for leather, edge wear for metal -- and each quarter-band carries the
    sub-surface (fur pile, amber strip, grip wrap, blade polish) plus a soft
    contact-shadow gradient where the collar, belt and sole meet the body.
    """
    size = 1024
    image = bpy.data.images.get("WARRIOR_ATLAS_1024")
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new("WARRIOR_ATLAS_1024", width=size, height=size, alpha=True)
    pixels = array("f", [0.0]) * (size * size * 4)
    columns = ("cloth", "leather", "iron")
    # Band 3 of the cloth and leather columns used to repeat band 0 and was
    # never sampled by any face. It now carries the beard and the skin.
    bands = {
        0: (("coat", "fur", "amber", "beard"), 0),
        1: (("belt", "glove", "grip", "skin"), 1),
        2: (("plate", "blade", "plate", "plate"), 2),
    }
    for y in range(size):
        v = y / size
        band_index = min(3, int(v * 4))
        band_local = (v * 4.0) - band_index
        for x in range(size):
            u = x / size
            column = min(2, int(u * 3))
            column_local = (u * 3.0) - column
            surface = bands[column][0][band_index]
            base = SURFACE_TINT[surface]
            value = 1.0
            if column == 0:
                # Cloth: a woven weft with a clear vertical thread direction.
                warp = math.sin(x * 0.92) * 0.5 + math.sin(x * 0.31 + 1.1) * 0.5
                weft = math.sin(y * 1.83) * 0.5 + math.sin(y * 0.47) * 0.5
                value += warp * 0.020 + weft * 0.032
                value += 0.014 * math.sin((x * 0.11 + y * 0.07))
                if surface == "fur":
                    # Fur pile: long vertical strokes with broken tips.
                    strand = math.sin(x * 2.7 + math.sin(y * 0.21) * 2.4)
                    value += strand * 0.062
                    value += 0.040 if ((x * 5 + y * 3) % 37) < 4 else 0.0
                elif surface == "amber":
                    value += 0.055 * math.sin(y * 3.1)
                elif surface == "beard":
                    # Coarser and more clumped than the collar's fur: fewer,
                    # thicker strands so a beard does not read as more shawl.
                    clump = math.sin(x * 1.4 + math.sin(y * 0.13) * 3.1)
                    value += clump * 0.078
                    value -= 0.055 if ((x * 3 + y * 2) % 29) < 5 else 0.0
            elif column == 1:
                # Leather: directional grain plus scattered creases.
                grain = math.sin(y * 0.63 + math.sin(x * 0.18) * 1.6)
                value += grain * 0.052
                crease = math.sin(x * 0.27 + y * 0.09)
                value += 0.030 if crease > 0.90 else 0.0
                if surface == "grip":
                    # Wrap: repeating diagonal binding.
                    wrap = ((x * 0.7 + y * 1.9) % 22.0) / 22.0
                    value += 0.070 if wrap < 0.22 else -0.022
                elif surface == "skin":
                    # Skin wants the opposite of leather grain: almost no
                    # structure, just broad uneven weathering. Anything with a
                    # visible repeat reads as a texture on a face rather than
                    # as a face, so the leather grain above is cancelled first.
                    value -= grain * 0.052
                    value += 0.030 * math.sin(x * 0.037 + y * 0.021)
                    value += 0.018 * math.sin(x * 0.13 + math.sin(y * 0.05) * 2.0)
            else:
                # Metal: broad polish plus wear concentrated at the edges.
                polish = math.sin(x * 0.21 + y * 0.05)
                value += polish * 0.030
                edge = min(column_local, 1.0 - column_local)
                value += (0.085 * (1.0 - min(1.0, edge * 7.0)))
                if surface == "blade":
                    value += 0.055 * max(0.0, math.sin(y * 0.42))
                    if ((x * 3 + y * 7) % 53) < 2:
                        value -= 0.045
            # Soft contact shadow at the top and bottom of every band, so the
            # collar, belt and boot sole read as sitting on the body.
            occlusion = min(band_local, 1.0 - band_local)
            value -= 0.085 * (1.0 - min(1.0, occlusion * 8.0))
            value = max(0.68, min(1.28, value))
            idx = (y * size + x) * 4
            pixels[idx] = max(0.0, min(1.0, base[0] * value))
            pixels[idx + 1] = max(0.0, min(1.0, base[1] * value))
            pixels[idx + 2] = max(0.0, min(1.0, base[2] * value))
            pixels[idx + 3] = 1.0
    image.pixels = pixels
    image.pack()
    for mat in MATERIALS.values():
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        tex = nodes.get("Warrior atlas") or nodes.new("ShaderNodeTexImage")
        tex.name = "Warrior atlas"
        tex.image = image
        tex.interpolation = "Linear"
        base_input = shader.inputs.get("Base Color")
        if base_input:
            for link in list(base_input.links):
                links.remove(link)
            links.new(tex.outputs["Color"], base_input)


def _rigid_axe_point(armature_obj, local_point):
    """Where an axe-local point currently is, in armature space.

    The axe is skinned 100% to hand.R, so it moves with exactly that bone's
    rigid transform: pose matrix composed with the inverse of the rest matrix.
    """
    hand = armature_obj.pose.bones[AXE_BONE]
    rigid = hand.matrix @ hand.bone.matrix_local.inverted()
    return rigid @ Vector(local_point)


def _aim_bone(pose_bone, tail_target, roll_hint):
    """Point a bone's +Y axis at a target without translating it.

    Only the rotation is authored; the head stays wherever the parent chain
    puts it, so the arm cannot detach from the shoulder.
    """
    head = pose_bone.head.copy()
    y = (tail_target - head)
    if y.length < 1e-6:
        return
    y.normalize()
    x = roll_hint.cross(y)
    if x.length < 1e-5:
        x = Vector((1.0, 0.0, 0.0)).cross(y)
        if x.length < 1e-5:
            x = Vector((0.0, 0.0, 1.0)).cross(y)
    x.normalize()
    # Right-handed basis: X x Y = Z. Using y.cross(x) here yields a
    # determinant of -1 -- a reflection. Blender still lands the bone's +Y on
    # the target, so the in-memory residual reads 0.0000m and looks correct,
    # but the rotation decomposed out of a reflection is meaningless and the
    # exported quaternion channels are wrong. That is exactly how the left
    # hand ended up 1.4m off the haft in the GLB while every Blender-side
    # check reported a perfect grip.
    z = x.cross(y)
    matrix = Matrix((x, y, z)).transposed().to_4x4()
    matrix.translation = head
    pose_bone.matrix = matrix
    bpy.context.view_layer.update()


def _solve_two_bone(armature_obj, upper_name, lower_name, target, pole_reference):
    """Analytic two-bone IK. Returns the residual distance to the target."""
    pose = armature_obj.pose
    upper = pose.bones[upper_name]
    lower = pose.bones[lower_name]
    bpy.context.view_layer.update()
    shoulder = upper.head.copy()
    l1 = (upper.tail - upper.head).length
    l2 = (lower.tail - lower.head).length
    to_target = target - shoulder
    distance = to_target.length
    if distance < 1e-5:
        return 0.0
    direction = to_target / distance
    reach = min(max(distance, abs(l1 - l2) + 1e-4), (l1 + l2) - 1e-4)
    along = (l1 * l1 - l2 * l2 + reach * reach) / (2.0 * reach)
    height = math.sqrt(max(0.0, l1 * l1 - along * along))
    perpendicular = pole_reference - direction * pole_reference.dot(direction)
    if perpendicular.length < 1e-5:
        perpendicular = Vector((0.0, 0.0, 1.0)) - direction * direction.z
    perpendicular.normalize()
    elbow = shoulder + direction * along + perpendicular * height
    _aim_bone(upper, elbow, perpendicular)
    _aim_bone(lower, target, perpendicular)
    return (lower.tail - target).length


def pose_weapon(armature_obj, grip, shaft_dir):
    """Author the pose from the weapon outward instead of from joint angles.

    Hand-authoring Euler angles for a two-handed weapon does not work: the
    left hand has to land on a haft whose position is a consequence of the
    right arm, so any hand-tuned value is wrong the moment the right arm
    moves. Here the caller states where the upper grip should be and which
    way the shaft should point -- i.e. the thing the player actually sees --
    and both arms are solved to match.

    Returns (right_residual, left_residual, blade_tip) so the bake can prove
    the grip closed rather than assume it.
    """
    grip = Vector(grip)
    shaft_dir = Vector(shaft_dir).normalized()

    # Right arm carries the weapon: hand.R's origin *is* the upper grip.
    right_residual = _solve_two_bone(
        armature_obj, "upper_arm.R", "lower_arm.R", grip, Vector((0.45, -1.0, -0.35)),
    )

    # Orient hand.R so the rigid axe's shaft points where the caller asked.
    hand = armature_obj.pose.bones[AXE_BONE]
    rest_rotation = hand.bone.matrix_local.to_3x3()
    rest_shaft = (Vector(AXE_TIP) - Vector(AXE_BUTT)).normalized()
    local_shaft = rest_rotation.inverted() @ rest_shaft
    rotation = local_shaft.rotation_difference(shaft_dir).to_matrix().to_4x4()
    rotation.translation = hand.head.copy()
    hand.matrix = rotation
    bpy.context.view_layer.update()

    # Left hand supports on the lower grip, which is now fully determined.
    lower_target = grip - shaft_dir * (Vector(axe_point(UPPER_GRIP_T)) - Vector(axe_point(LOWER_GRIP_T))).length
    left_residual = _solve_two_bone(
        armature_obj, "upper_arm.L", "lower_arm.L", lower_target, Vector((-0.35, -1.0, -0.45)),
    )
    blade_tip = _rigid_axe_point(armature_obj, AXE_BLADE_TIP)
    return right_residual, left_residual, blade_tip


def solve_left_hand_onto_grip(armature_obj):
    """Analytic two-bone IK putting hand.L's origin on the axe's lower grip.

    The left hand cannot reach the lower grip from the bind pose -- the axe
    hangs at the right side, 1.40m from the left shoulder against a 0.72m arm
    -- so the two-hand grip only exists once the right arm has carried the
    weapon inward. Solving it here rather than hand-tuning Euler angles means
    the grip is correct in every authored pose, and the returned residual is
    the honest measure of whether it actually closed.
    """
    pose = armature_obj.pose
    upper = pose.bones["upper_arm.L"]
    lower = pose.bones["lower_arm.L"]
    bpy.context.view_layer.update()
    target = _rigid_axe_point(armature_obj, axe_point(LOWER_GRIP_T))

    shoulder = upper.head.copy()
    l1 = (upper.tail - upper.head).length
    l2 = (lower.tail - lower.head).length
    to_target = target - shoulder
    distance = to_target.length
    if distance < 1e-5:
        return 0.0
    direction = to_target / distance
    # Clamp into the annulus the two-bone chain can actually span.
    reach = min(max(distance, abs(l1 - l2) + 1e-4), (l1 + l2) - 1e-4)
    along = (l1 * l1 - l2 * l2 + reach * reach) / (2.0 * reach)
    height = math.sqrt(max(0.0, l1 * l1 - along * along))
    # Pole: the elbow drops down and away from the chest, which is where a
    # support hand's elbow actually sits on a two-handed haft.
    reference = Vector((-0.35, -1.0, -0.45))
    perpendicular = reference - direction * reference.dot(direction)
    if perpendicular.length < 1e-5:
        perpendicular = Vector((0.0, 0.0, 1.0)) - direction * direction.z
    perpendicular.normalize()
    elbow = shoulder + direction * along + perpendicular * height

    _aim_bone(upper, elbow, perpendicular)
    _aim_bone(lower, target, perpendicular)
    return (lower.tail - target).length


def add_clip(armature_obj, name, frame_end, poses):
    """Key a clip in two passes.

    Pass 1 keys the torso and legs. Pass 2 re-enters each frame so the body
    is evaluated *from the action*, then solves both arms onto the weapon and
    keys them. Doing it in one interleaved pass silently failed: the solved
    arm pose lived only in memory, so the residual printed 0.0000m while the
    exported clip actually put the left hand 1.4m off the haft. The verify
    pass below re-reads the action after zeroing the pose, which is what
    makes it a real check rather than a reading of stale in-memory state.
    """
    if not armature_obj.animation_data:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = None

    def reset_pose():
        for bone in armature_obj.pose.bones:
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
            bone.location = (0.0, 0.0, 0.0)

    # --- pass 1: body -----------------------------------------------------
    for frame, pose in poses:
        bpy.context.scene.frame_set(frame)
        reset_pose()
        for bone_name, values in pose.items():
            if bone_name == "__weapon__":
                continue
            bone = armature_obj.pose.bones.get(bone_name)
            if not bone:
                continue
            if "r" in values:
                bone.rotation_quaternion = Euler(values["r"], "XYZ").to_quaternion()
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            if "l" in values:
                bone.location = values["l"]
                bone.keyframe_insert(data_path="location", frame=frame)

    # --- pass 2: arms solved from the weapon, on every frame --------------
    # Solving only at the authored keys is not enough: between keys the arms
    # interpolate independently of the weapon they are holding, so the left
    # hand drifted up to 0.42m off the haft mid-swing even though every key
    # was exact. The weapon pose is interpolated here and the IK re-solved
    # per frame, which makes the grip true at every frame the exporter
    # samples rather than only at the keys.
    ARM_BONES = ("upper_arm.R", "lower_arm.R", AXE_BONE, "upper_arm.L", "lower_arm.L")
    weapon_keys = [(frame, pose["__weapon__"]) for frame, pose in poses if "__weapon__" in pose]
    residuals = []
    if weapon_keys:
        first_frame = weapon_keys[0][0]
        last_frame = weapon_keys[-1][0]

        def weapon_at(frame):
            if frame <= first_frame:
                return weapon_keys[0][1]
            if frame >= last_frame:
                return weapon_keys[-1][1]
            for (fa, wa), (fb, wb) in zip(weapon_keys, weapon_keys[1:]):
                if fa <= frame <= fb:
                    span = max(1, fb - fa)
                    t = (frame - fa) / span
                    grip = tuple(wa[0][i] + (wb[0][i] - wa[0][i]) * t for i in range(3))
                    direction = Vector(wa[1]).normalized().lerp(Vector(wb[1]).normalized(), t)
                    return (grip, tuple(direction))
            return weapon_keys[-1][1]

        for frame in range(first_frame, last_frame + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            grip, direction = weapon_at(frame)
            right, left, tip = pose_weapon(armature_obj, grip, direction)
            residuals.append((frame, right, left, tip))
            for bone_name in ARM_BONES:
                armature_obj.pose.bones[bone_name].keyframe_insert(data_path="rotation_quaternion", frame=frame)
    if residuals:
        worst_left = max(residuals, key=lambda item: item[2])
        worst_right = max(residuals, key=lambda item: item[1])
        tips = [item[3] for item in residuals]
        arc = max((a - b).length for a in tips for b in tips)
        print(
            f"  grip[{name}] solve: worst right {worst_right[1]:.4f}m @f{worst_right[0]} | "
            f"worst left {worst_left[2]:.4f}m @f{worst_left[0]} | blade-tip arc {arc:.3f}m"
        )

    # --- verify: zero the pose, then read it back from the action ---------
    baked = []
    for frame, pose in poses:
        if "__weapon__" not in pose:
            continue
        reset_pose()
        bpy.context.view_layer.update()
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        target = _rigid_axe_point(armature_obj, axe_point(LOWER_GRIP_T))
        baked.append((frame, (armature_obj.pose.bones["lower_arm.L"].tail - target).length))
    if baked:
        worst = max(baked, key=lambda item: item[1])
        print(f"  grip[{name}] BAKED: worst left {worst[1]:.4f}m @f{worst[0]}")
    action = armature_obj.animation_data.action

    if action is None:
        raise RuntimeError(f"No animation action created for {name}")
    action.name = name
    track = armature_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = frame_end
    armature_obj.animation_data.action = None
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end, frame_end)


# Two-hand grip.  The axe is rigid to hand.R, so the right arm carries the
# weapon and the left arm is posed onto the shaft below it.  These offsets
# are shared by every clip so the grip stays consistent; per-clip poses layer
# on top of them.
# The right arm carries the weapon; the left arm is not authored here at all,
# because it is solved onto the lower grip by IK after every pose is applied.
GRIP_R = {"upper_arm.R": (-0.30, 0.00, -0.46), "lower_arm.R": (-0.62, 0.10, -0.30), "hand.R": (0.00, 0.00, -0.18)}


def grip(**overrides):
    """Base weapon-carry pose, with optional per-bone overrides."""
    pose = {bone: {"r": value} for bone, value in GRIP_R.items()}
    for bone, value in overrides.items():
        bone_name = bone.replace("__", ".")
        if bone_name in pose:
            pose[bone_name] = {**pose[bone_name], **value}
        else:
            pose[bone_name] = value
    return pose


def add_animations(armature_obj):
    """Author every clip from the weapon outward.

    Each key states where the upper grip sits and which way the shaft points;
    both arms are then solved onto it. This is what makes the two-hand grip
    survive posing, and it is also what makes the swing readable -- the arc
    is authored as the blade's path, which is the thing the player watches.
    """
    # Ready stance: haft diagonal across the chest, head up over the right
    # shoulder. Both grips comfortably inside arm reach.
    READY = ((0.10, 1.44, 0.30), (0.45, 0.86, 0.24))
    # Carry while moving: dropped and tucked slightly closer to the body.
    CARRY = ((0.13, 1.38, 0.26), (0.42, 0.88, 0.22))

    add_clip(armature_obj, "Idle", 30, [
        (1, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}}),
        (15, {"__weapon__": ((0.10, 1.455, 0.305), (0.45, 0.86, 0.24)),
              "chest": {"r": (-0.030, -0.10, 0.016)}, "neck": {"r": (0.022, 0.0, 0.0)},
              "pelvis": {"l": (0.0, 0.012, 0.0)}}),
        (30, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}}),
    ])
    add_clip(armature_obj, "Walk", 24, [
        (1, {"__weapon__": CARRY, "thigh.L": {"r": (0.44, 0, 0)}, "thigh.R": {"r": (-0.44, 0, 0)},
             "shin.L": {"r": (-0.18, 0, 0)}, "chest": {"r": (0.04, 0.02, 0)},
             "pelvis": {"r": (0, -0.10, 0), "l": (0, 0.018, 0)}}),
        (7, {"__weapon__": CARRY, "thigh.L": {"r": (-0.40, 0, 0)}, "thigh.R": {"r": (0.40, 0, 0)},
             "shin.R": {"r": (-0.20, 0, 0)}, "chest": {"r": (0.04, -0.18, 0)},
             "pelvis": {"r": (0, 0.10, 0)}}),
        (13, {"__weapon__": CARRY, "thigh.L": {"r": (0.44, 0, 0)}, "thigh.R": {"r": (-0.44, 0, 0)},
              "shin.L": {"r": (-0.18, 0, 0)}, "chest": {"r": (0.04, 0.02, 0)},
              "pelvis": {"r": (0, -0.10, 0), "l": (0, 0.018, 0)}}),
        (19, {"__weapon__": CARRY, "thigh.L": {"r": (-0.40, 0, 0)}, "thigh.R": {"r": (0.40, 0, 0)},
              "shin.R": {"r": (-0.20, 0, 0)}, "chest": {"r": (0.04, -0.18, 0)},
              "pelvis": {"r": (0, 0.10, 0)}}),
        (24, {"__weapon__": CARRY, "thigh.L": {"r": (0.44, 0, 0)}, "thigh.R": {"r": (-0.44, 0, 0)},
              "shin.L": {"r": (-0.18, 0, 0)}, "chest": {"r": (0.04, 0.02, 0)},
              "pelvis": {"r": (0, -0.10, 0), "l": (0, 0.018, 0)}}),
    ])
    add_clip(armature_obj, "Run", 18, [
        (1, {"__weapon__": CARRY, "pelvis": {"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)},
             "thigh.L": {"r": (0.70, 0, 0)}, "thigh.R": {"r": (-0.70, 0, 0)},
             "shin.L": {"r": (-0.42, 0, 0)}, "chest": {"r": (0.12, 0.04, 0)}}),
        (5, {"__weapon__": CARRY, "pelvis": {"r": (0.13, 0.12, 0)}, "thigh.L": {"r": (-0.64, 0, 0)},
             "thigh.R": {"r": (0.64, 0, 0)}, "shin.R": {"r": (-0.46, 0, 0)},
             "chest": {"r": (0.12, -0.20, 0)}}),
        (9, {"__weapon__": CARRY, "pelvis": {"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)},
             "thigh.L": {"r": (0.70, 0, 0)}, "thigh.R": {"r": (-0.70, 0, 0)},
             "shin.L": {"r": (-0.42, 0, 0)}, "chest": {"r": (0.12, 0.04, 0)}}),
        (13, {"__weapon__": CARRY, "pelvis": {"r": (0.13, 0.12, 0)}, "thigh.L": {"r": (-0.64, 0, 0)},
              "thigh.R": {"r": (0.64, 0, 0)}, "shin.R": {"r": (-0.46, 0, 0)},
              "chest": {"r": (0.12, -0.20, 0)}}),
        (18, {"__weapon__": CARRY, "pelvis": {"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)},
              "thigh.L": {"r": (0.70, 0, 0)}, "thigh.R": {"r": (-0.70, 0, 0)},
              "shin.L": {"r": (-0.42, 0, 0)}, "chest": {"r": (0.12, 0.04, 0)}}),
    ])
    # A four-beat chop: settle, load high behind the right shoulder, drive
    # down across the body, then recover. Measured blade-tip travel from
    # wind-up to impact is ~2.1m, so the swing is legible from the gameplay
    # camera rather than only in the pose data.
    add_clip(armature_obj, "MeleeAttack", 30, [
        (1, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}}),
        (6, {"__weapon__": ((0.22, 1.52, 0.06), (0.38, 0.86, -0.34)),
             "chest": {"r": (-0.14, 0.30, 0.06)}, "pelvis": {"r": (0.0, 0.18, 0.0)},
             "thigh.L": {"r": (-0.12, 0, 0)}, "thigh.R": {"r": (0.14, 0, 0)},
             "head": {"r": (0.10, -0.14, 0)}}),
        # wind-up: fully loaded, weight on the back foot
        (10, {"__weapon__": ((0.34, 1.62, -0.12), (0.30, 0.80, -0.52)),
              "chest": {"r": (-0.26, 0.54, 0.10)}, "pelvis": {"r": (0.0, 0.32, 0.0)},
              "thigh.L": {"r": (-0.22, 0, 0)}, "thigh.R": {"r": (0.26, 0, 0)},
              "shin.R": {"r": (-0.24, 0, 0)}, "head": {"r": (0.16, -0.22, 0)}}),
        # The swing is the fastest part of the clip, so it carries extra keys.
        # Sparse keys here left the interpolated left hand up to 0.15m off the
        # haft between wind-up and impact -- the grip is only rigid at keys,
        # because the arms interpolate independently of the weapon they hold.
        (12, {"__weapon__": ((0.30, 1.56, 0.02), (0.24, 0.58, -0.28)),
              "chest": {"r": (-0.18, 0.42, 0.08)}, "pelvis": {"r": (0.0, 0.20, 0.0)},
              "thigh.L": {"r": (-0.10, 0, 0)}, "thigh.R": {"r": (0.14, 0, 0)},
              "head": {"r": (0.08, -0.12, 0)}}),
        (14, {"__weapon__": ((0.18, 1.36, 0.26), (-0.10, -0.06, 0.36)),
              "chest": {"r": (0.14, -0.18, -0.04)}, "pelvis": {"r": (0.0, -0.10, 0.0)},
              "thigh.L": {"r": (0.16, 0, 0)}, "thigh.R": {"r": (-0.18, 0, 0)},
              "head": {"r": (-0.10, 0.06, 0)}}),
        # impact: blade driven low and forward, hips and chest snapped through
        (16, {"__weapon__": ((0.06, 1.20, 0.44), (-0.42, -0.55, 0.72)),
              "chest": {"r": (0.36, -0.62, -0.12)}, "pelvis": {"r": (0.0, -0.36, 0.0), "l": (0.0, -0.040, 0.0)},
              "thigh.L": {"r": (0.34, 0, 0)}, "thigh.R": {"r": (-0.38, 0, 0)},
              "shin.L": {"r": (-0.30, 0, 0)}, "head": {"r": (-0.20, 0.18, 0)}}),
        # follow-through: the weapon keeps travelling past the target
        (20, {"__weapon__": ((0.00, 1.06, 0.40), (-0.52, -0.62, 0.58)),
              "chest": {"r": (0.30, -0.52, -0.10)}, "pelvis": {"r": (0.0, -0.28, 0.0), "l": (0.0, -0.028, 0.0)},
              "thigh.L": {"r": (0.28, 0, 0)}, "thigh.R": {"r": (-0.30, 0, 0)},
              "head": {"r": (-0.14, 0.12, 0)}}),
        # recovery back to guard
        (30, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}}),
    ])
    add_clip(armature_obj, "Hit", 14, [
        (1, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}}),
        (5, {"__weapon__": ((0.16, 1.40, 0.18), (0.48, 0.82, 0.14)),
             "chest": {"r": (0.18, -0.30, 0.0)}, "head": {"r": (0.16, 0.0, 0.0)},
             "pelvis": {"r": (0.0, -0.20, 0.0), "l": (0.0, -0.022, 0.0)},
             "thigh.R": {"r": (0.18, 0, 0)}}),
        (14, {"__weapon__": READY, "chest": {"r": (0.0, -0.10, 0.0)}, "head": {"r": (0.0, 0.0, 0.0)}}),
    ])
    # Death keeps the two-hand grip through the stumble, then releases: the
    # last two keys author the arms directly so the body can sprawl.
    add_clip(armature_obj, "Death", 30, [
        (1, {"__weapon__": READY, "pelvis": {"r": (0.0, 0.0, 0.0)}}),
        (10, {"__weapon__": ((0.14, 1.24, 0.30), (0.40, 0.80, 0.44)),
              "pelvis": {"r": (0.0, -0.36, 0.0), "l": (0.0, -0.14, 0.0)},
              "thigh.L": {"r": (0.58, 0, 0)}, "thigh.R": {"r": (-0.32, 0, 0)},
              "shin.L": {"r": (-0.50, 0, 0)}, "chest": {"r": (0.88, 0.0, 0.20)},
              "head": {"r": (0.36, 0.0, 0.0)}}),
        (22, {
            "pelvis": {"r": (1.30, 0.0, 0.0), "l": (0.0, -0.56, 0.0)},
            "thigh.L": {"r": (0.84, 0, 0)}, "thigh.R": {"r": (-0.50, 0, 0)},
            "shin.L": {"r": (-0.72, 0, 0)}, "shin.R": {"r": (-0.34, 0, 0)},
            "chest": {"r": (1.40, 0.0, 0.30)}, "head": {"r": (0.62, 0.0, 0.0)},
            "upper_arm.L": {"r": (0.80, 0.0, 0.46)}, "upper_arm.R": {"r": (0.56, 0.0, -0.40)},
            "lower_arm.L": {"r": (-0.30, 0.0, 0.0)}, "lower_arm.R": {"r": (-0.36, 0.0, 0.0)},
        }),
        (30, {
            "pelvis": {"r": (1.37, 0.0, 0.30), "l": (0.0, -0.63, 0.0)},
            "chest": {"r": (1.44, 0.0, 0.32)}, "head": {"r": (0.66, 0.0, 0.0)},
            "thigh.L": {"r": (0.88, 0, 0)}, "thigh.R": {"r": (-0.54, 0, 0)},
            "upper_arm.L": {"r": (0.86, 0.0, 0.50)}, "upper_arm.R": {"r": (0.60, 0.0, -0.44)},
            "lower_arm.L": {"r": (-0.34, 0.0, 0.0)}, "lower_arm.R": {"r": (-0.40, 0.0, 0.0)},
        }),
    ])


def create_materials():
    # Roughness is the third separation axis and the one that survives at
    # distance: matte wool, semi-gloss leather, and a genuinely specular iron
    # so the axe head catches a highlight the cloth never will.
    MATERIALS["cloth"] = material("Warrior_Cloth", MATS["cloth"], 0.94, 0.0)
    MATERIALS["leather"] = material("Warrior_Leather", MATS["leather"], 0.58, 0.06)
    MATERIALS["iron"] = material("Warrior_Iron", MATS["iron"], 0.30, 0.88)
    make_atlas()


def main():
    reset_scene()
    create_materials()
    root_obj = orient_for_babylon(empty("UnitRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root_obj["assetRole"] = "warrior"
    root_obj["forwardAxis"] = "+Z"
    root_obj["upAxis"] = "+Y"
    root_obj["scaleContract"] = 1.0
    root_obj["productionTemplate"] = "Warrior-W2"
    armature_obj = create_armature(root_obj)
    for level in (0, 1, 2):
        body_materials = ["cloth", "leather", "iron"] if level == 0 else (["cloth", "iron"] if level == 1 else ["cloth"])
        axe_materials = ["leather", "iron"] if level < 2 else ["iron"]
        body = create_mesh(add_body_geometry(level), f"LOD{level}_PROD_body", root_obj, armature_obj, body_materials, level)
        axe = create_mesh(add_axe_geometry(level), f"LOD{level}_PROD_axe", root_obj, armature_obj, axe_materials, level)
        body["lodIdentity"] = "militia coat, shawl fur collar, fitted pauldron, layered boots"
        axe["lodIdentity"] = "rigid two-hand ice axe: blade, rear pick, eye, handle, two grips, pommel"
        axe["weaponAttachment"] = f"rigid 100% {AXE_BONE}"
        if level > 0:
            marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            marker.parent = root_obj
            marker["lodLevel"] = level
            marker["identityPreserved"] = True
            body.parent = marker
            axe.parent = marker
        else:
            body.parent = root_obj
            axe.parent = root_obj
    # Weapon locators. These are bone-parented to hand.R, so they travel with
    # the axe through every animation and the runtime can measure real grip
    # contact and a real weapon arc instead of inferring either from a
    # bounding box. `weapon_socket` stays coincident with the upper grip for
    # backwards compatibility with the existing manifest contract.
    locators = {
        "weapon_socket": (axe_point(UPPER_GRIP_T), "two-hand ice axe grip"),
        "upper_grip": (axe_point(UPPER_GRIP_T), "right-hand grip point"),
        "lower_grip": (axe_point(LOWER_GRIP_T), "left-hand support grip point"),
        "axe_tip": (AXE_BLADE_TIP, "cutting-edge tip, drives the swing arc"),
    }
    bone = armature_obj.data.bones[AXE_BONE]
    # Blender parents to the bone *tail*, so the parent-inverse has to undo
    # both that offset and the bone's rest orientation. With it applied, the
    # empty's local location is simply the authored armature-space point.
    tail_space = bone.matrix_local @ Matrix.Translation(Vector((0.0, bone.length, 0.0)))
    for name, (point, role) in locators.items():
        node = empty(name, (0, 0, 0), "EXPORT", "PLAIN_AXES")
        node.parent = armature_obj
        node.parent_type = "BONE"
        node.parent_bone = AXE_BONE
        node.matrix_parent_inverse = tail_space.inverted()
        node.location = Vector(point)
        node["socketRole"] = role
        node["rigidBone"] = AXE_BONE
    socket = bpy.data.objects["weapon_socket"]
    anchor = empty("attackAnchor", (0.0, 1.10, 0.52), "EXPORT", "PLAIN_AXES")
    anchor.parent = root_obj
    anchor["socketRole"] = "melee attack origin"
    collision_box("COL_Unit", (0.82, 2.34, 0.70), (0, 1.16, 0), root_obj)
    add_animations(armature_obj)
    scene = bpy.context.scene
    scene.frame_set(1)
    source_path = os.path.join(ROOT, "assets-source", "blender", "characters", "warrior.blend")
    glb_path = os.path.join(ROOT, "public", "assets", "models", "characters", "warrior.glb")
    save_source(source_path)
    export_glb(glb_path)
    print(f"Warrior production asset written: {glb_path}")


if __name__ == "__main__":
    main()
