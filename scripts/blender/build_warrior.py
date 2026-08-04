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

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import collision_box, empty, export_glb, material, orient_for_babylon, reset_scene, save_source, collection  # noqa: E402


# Base colours.  Cloth is a mid-dark blue-grey rather than near-black, fur is
# a mid grey-beige rather than white, so both still hold detail once the
# review lighting stops over-exposing them.
MATS = {
    "cloth": (0.150, 0.196, 0.232),
    "leather": (0.276, 0.166, 0.094),
    "iron": (0.128, 0.142, 0.160),
}
# Sub-surfaces share a material slot but occupy their own atlas band, which is
# how fur/amber read as distinct surfaces while the GLB keeps 3 materials.
# (material_index, atlas_band) -- band 0..3 within that material's column.
SURFACES = {
    "coat": (0, 0),
    "fur": (0, 1),
    "amber": (0, 2),
    "belt": (1, 0),
    "glove": (1, 1),
    "grip": (1, 2),
    "plate": (2, 0),
    "blade": (2, 1),
}
SURFACE_TINT = {
    "coat": (0.150, 0.196, 0.232),
    "fur": (0.520, 0.487, 0.430),
    "amber": (0.760, 0.430, 0.110),
    "belt": (0.276, 0.166, 0.094),
    "glove": (0.220, 0.140, 0.090),
    "grip": (0.196, 0.126, 0.080),
    "plate": (0.128, 0.142, 0.160),
    "blade": (0.205, 0.222, 0.243),
}
MATERIALS = {}


class MeshBuilder:
    """Accumulates one skinned mesh.  Faces carry a named surface, which
    selects both the material slot and the atlas band."""

    def __init__(self, level):
        self.level = level
        self.vertices = []
        self.faces = []
        self.surfaces = []
        self.weights = []

    def vertex(self, co, weights):
        self.vertices.append(tuple(float(v) for v in co))
        self.weights.append(dict(weights))
        return len(self.vertices) - 1

    def face(self, indices, surface):
        if len(indices) >= 3 and len(set(indices)) == len(indices):
            self.faces.append(tuple(indices))
            self.surfaces.append(surface)

    def sweep(self, rings, surface, weight_fn, cap_bottom=True, cap_top=True):
        """Loft a stack of explicit cross-sections.

        ``rings`` is a list of ``(y, [(x, z), ...])``.  Every ring must carry
        the same point count.  Unlike a lathe this imposes no rotational
        symmetry, so the caller controls the actual shape of every slice.
        """
        built = []
        for y, section_points in rings:
            built.append([self.vertex((x, y, z), weight_fn(y)) for x, z in section_points])
        count = len(built[0])
        for lower, upper in zip(built, built[1:]):
            for i in range(count):
                j = (i + 1) % count
                self.face((lower[i], lower[j], upper[j], upper[i]), surface)
        if cap_bottom:
            y0 = rings[0][0]
            centre = self.vertex((0.0, y0, 0.0), weight_fn(y0))
            # A real centroid keeps the cap flat when the section is offset.
            cx = sum(p[0] for p in rings[0][1]) / count
            cz = sum(p[1] for p in rings[0][1]) / count
            self.vertices[centre] = (cx, y0, cz)
            for i in range(count):
                j = (i + 1) % count
                self.face((centre, built[0][j], built[0][i]), surface)
        if cap_top:
            y1 = rings[-1][0]
            centre = self.vertex((0.0, y1, 0.0), weight_fn(y1))
            cx = sum(p[0] for p in rings[-1][1]) / count
            cz = sum(p[1] for p in rings[-1][1]) / count
            self.vertices[centre] = (cx, y1, cz)
            for i in range(count):
                j = (i + 1) % count
                self.face((centre, built[-1][i], built[-1][j]), surface)

    def band(self, rings, surface, weight_fn):
        """An open shell swept over an arc, used for the shawl collar.

        ``rings`` is ``(y, outer_points, inner_points)``.  The band is left
        open at the front and capped at both arc ends, so it reads as a
        collar sitting on the shoulders rather than a closed ring hovering
        around the neck.
        """
        outer = []
        inner = []
        for y, outer_points, inner_points in rings:
            outer.append([self.vertex((x, y, z), weight_fn(y)) for x, z in outer_points])
            inner.append([self.vertex((x, y, z), weight_fn(y)) for x, z in inner_points])
        count = len(outer[0])
        for lo, up in zip(outer, outer[1:]):
            for i in range(count - 1):
                self.face((lo[i], lo[i + 1], up[i + 1], up[i]), surface)
        for lo, up in zip(inner, inner[1:]):
            for i in range(count - 1):
                self.face((lo[i + 1], lo[i], up[i], up[i + 1]), surface)
        # Top and bottom rims close the shell into a solid band.
        for shell in (0, -1):
            o, n = outer[shell], inner[shell]
            for i in range(count - 1):
                if shell == 0:
                    self.face((o[i + 1], o[i], n[i], n[i + 1]), surface)
                else:
                    self.face((o[i], o[i + 1], n[i + 1], n[i]), surface)
        # Arc end caps.
        for end in (0, count - 1):
            for lo_o, up_o, lo_i, up_i in zip(outer, outer[1:], inner, inner[1:]):
                quad = (lo_o[end], up_o[end], up_i[end], lo_i[end])
                self.face(quad if end == 0 else tuple(reversed(quad)), surface)

    def box(self, centre, dimensions, surface, weights, rotate_z=0.0, taper=1.0):
        """A tapered box.  ``taper`` scales the top face, which is what turns a
        cube into a boot sole, a grip wrap or a pommel rather than a brick."""
        w, h, d = (v * 0.5 for v in dimensions)
        ca, sa = math.cos(rotate_z), math.sin(rotate_z)

        def place(x, y, z):
            return (centre[0] + x * ca - y * sa, centre[1] + x * sa + y * ca, centre[2] + z)

        lower = [self.vertex(place(x, -h, z), weights) for x, z in ((-w, -d), (w, -d), (w, d), (-w, d))]
        upper = [self.vertex(place(x * taper, h, z * taper), weights) for x, z in ((-w, -d), (w, -d), (w, d), (-w, d))]
        self.face(tuple(reversed(lower)), surface)
        self.face(tuple(upper), surface)
        for i in range(4):
            j = (i + 1) % 4
            self.face((lower[i], lower[j], upper[j], upper[i]), surface)

    def prism(self, points, z_centre, thickness, surface, weights):
        """Extrude an X/Y silhouette.  The axe blade and ice pick are authored
        this way so their profile is unmistakable in a front view."""
        front = [self.vertex((x, y, z_centre + thickness * 0.5), weights) for x, y in points]
        back = [self.vertex((x, y, z_centre - thickness * 0.5), weights) for x, y in points]
        n = len(points)
        self.face(tuple(front), surface)
        self.face(tuple(reversed(back)), surface)
        for i in range(n):
            j = (i + 1) % n
            self.face((front[i], back[i], back[j], front[j]), surface)


def section(n, half_width, depth_front, depth_back, exponent=2.6, centre_x=0.0, centre_z=0.0, lean=0.0):
    """A superellipse cross-section with independent front and back depth.

    ``exponent`` above 2 flattens the front, back and side planes while
    keeping the corners rounded -- the planar transitions the art review
    asked for.  Separate front/back depths break the rotational symmetry a
    lathe would impose.
    """
    points = []
    for i in range(n):
        angle = math.tau * i / n
        c, s = math.cos(angle), math.sin(angle)
        sx = math.copysign(abs(c) ** (2.0 / exponent), c)
        sz = math.copysign(abs(s) ** (2.0 / exponent), s)
        depth = depth_front if sz >= 0 else depth_back
        x = centre_x + half_width * sx
        z = centre_z + depth * sz
        points.append((x + lean * sz, z))
    return points


def arc(n, half_width, depth, start, end, centre_z=0.0):
    points = []
    for i in range(n):
        t = i / (n - 1)
        angle = start + (end - start) * t
        points.append((half_width * math.sin(angle), centre_z + depth * math.cos(angle)))
    return points


# --- skin weighting -------------------------------------------------------

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
    n_torso = (20, 12, 8)[level]
    n_head = (16, 10, 6)[level]
    n_limb = (14, 8, 6)[level]

    # --- torso ------------------------------------------------------------
    # Broad across the shoulders, tucked at the waist, flaring into a coat
    # hem.  The chest is deeper in front than behind; the waist is shallow.
    torso_rings = [
        (0.72, section(n_torso, 0.360, 0.222, 0.238, 2.4)),   # hem, flared
        (0.86, section(n_torso, 0.330, 0.206, 0.222, 2.5)),
        (1.02, section(n_torso, 0.300, 0.190, 0.202, 2.7)),   # waist, tucked
        (1.18, section(n_torso, 0.318, 0.208, 0.204, 2.8)),
        (1.36, section(n_torso, 0.360, 0.238, 0.214, 2.9)),   # lower chest
        (1.52, section(n_torso, 0.402, 0.256, 0.222, 2.9)),   # chest, deepest front
        (1.66, section(n_torso, 0.412, 0.240, 0.216, 2.8)),
        (1.76, section(n_torso, 0.378, 0.208, 0.198, 2.6)),   # shoulder line
    ]
    b.sweep(torso_rings, "coat", torso_weights)

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
            (1.70, 0.300, 0.268, 0.196, 0.176),
            (1.82, 0.338, 0.300, 0.180, 0.162),
            (1.92, 0.300, 0.268, 0.166, 0.150),
        ):
            collar.append((
                y,
                arc(n_collar, outer_w, outer_d, -2.42, 2.42),
                arc(n_collar, inner_w, inner_d, -2.42, 2.42),
            ))
        b.band(collar, "fur", lambda y: blend("chest", "neck", 0.42))

    # --- head -------------------------------------------------------------
    # Explicit skull rings.  The brow is the widest and sits furthest forward,
    # the jaw tucks under and back, and the cranium closes over a rounded
    # crown rather than tapering to a point -- W2's first pass ended in a
    # narrow spike, which read as a faceless cone rather than a hooded head.
    head_rings = [
        (1.96, section(n_head, 0.108, 0.112, 0.104, 2.2, centre_z=0.006)),   # neck junction
        (2.03, section(n_head, 0.132, 0.140, 0.122, 2.4, centre_z=0.022)),   # jaw base
        (2.09, section(n_head, 0.152, 0.158, 0.138, 2.6, centre_z=0.026)),   # jaw / chin
        (2.16, section(n_head, 0.168, 0.170, 0.150, 2.8, centre_z=0.022)),   # cheek
        (2.23, section(n_head, 0.176, 0.178, 0.158, 3.1, centre_z=0.016)),   # brow, widest
        (2.30, section(n_head, 0.174, 0.170, 0.160, 2.9, centre_z=0.006)),   # upper brow
        (2.37, section(n_head, 0.162, 0.156, 0.156, 2.7, centre_z=-0.002)),  # cranium
        (2.43, section(n_head, 0.138, 0.132, 0.136, 2.5, centre_z=-0.008)),  # upper cranium
        (2.47, section(n_head, 0.100, 0.098, 0.102, 2.3, centre_z=-0.012)),  # crown, rounded
    ]
    b.sweep(head_rings, "coat", head_weights, cap_bottom=False)
    if level == 0:
        # Hood brim over the brow, and a cheek guard either side: small planes
        # that give the head a facing direction without a second object.
        b.box((0.0, 2.238, 0.166), (0.250, 0.032, 0.052), "plate", blend("head", "neck", 0.10), taper=0.80)
        for sign in (-1, 1):
            b.box((sign * 0.152, 2.130, 0.070), (0.036, 0.150, 0.108), "plate", blend("head", "neck", 0.10), taper=0.86)

    # --- shoulders --------------------------------------------------------
    # One fitted pauldron that follows the shoulder curve, much smaller than
    # the W1 wedge.
    if level <= 1:
        # A shallow plate that caps the deltoid and skirts outward, rather
        # than a rounded blob sitting on top of it.
        n_sh = (10, 6)[level]
        b.sweep([
            (1.74, section(n_sh, 0.104, 0.104, 0.100, 2.6, centre_x=-0.392)),
            (1.66, section(n_sh, 0.156, 0.150, 0.144, 3.0, centre_x=-0.400)),
            (1.56, section(n_sh, 0.168, 0.158, 0.152, 3.2, centre_x=-0.408)),
            (1.49, section(n_sh, 0.150, 0.140, 0.136, 3.0, centre_x=-0.414)),
        ], "plate", lambda y: blend("upper_arm.L", "chest", 0.34))

    # --- belt and faction strip ------------------------------------------
    b.sweep([
        (0.99, section(n_torso, 0.312, 0.200, 0.212, 2.8)),
        (1.07, section(n_torso, 0.318, 0.206, 0.218, 2.8)),
    ], "belt", torso_weights, cap_bottom=False, cap_top=False)
    if level == 0:
        b.box((0.0, 1.42, 0.268), (0.104, 0.190, 0.026), "amber", blend("chest", "spine", 0.34), rotate_z=-0.13)
        b.box((0.0, 1.03, 0.216), (0.086, 0.074, 0.030), "plate", blend("pelvis", "spine", 0.40))

    # --- arms -------------------------------------------------------------
    for side, sign in (("L", -1), ("R", 1)):
        shoulder_x = sign * 0.402
        elbow_x = sign * 0.560
        wrist_x = sign * 0.552
        # Upper arm: deltoid swell into a narrower elbow.
        b.sweep([
            (1.60, section(n_limb, 0.126, 0.128, 0.124, 2.3, centre_x=shoulder_x)),
            (1.46, section(n_limb, 0.116, 0.118, 0.114, 2.4, centre_x=sign * 0.470)),
            (1.32, section(n_limb, 0.098, 0.100, 0.098, 2.5, centre_x=elbow_x)),
        ], "coat", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        # Forearm: tapers to the wrist.
        b.sweep([
            (1.32, section(n_limb, 0.098, 0.100, 0.098, 2.5, centre_x=elbow_x)),
            (1.12, section(n_limb, 0.092, 0.094, 0.092, 2.6, centre_x=sign * 0.556)),
            (0.94, section(n_limb, 0.078, 0.080, 0.080, 2.6, centre_x=wrist_x, centre_z=0.028)),
        ], "coat", lambda y, s=side: arm_weights(s, y), cap_bottom=False, cap_top=False)
        # Glove: a distinct leather volume, slightly wider than the wrist.
        b.sweep([
            (0.94, section(n_limb, 0.082, 0.084, 0.084, 2.5, centre_x=wrist_x, centre_z=0.030)),
            (0.84, section(n_limb, 0.090, 0.094, 0.090, 2.4, centre_x=sign * 0.542, centre_z=0.056)),
            (0.74, section(n_limb, 0.072, 0.082, 0.076, 2.2, centre_x=sign * 0.512, centre_z=0.086)),
        ], "glove", lambda y, s=side: arm_weights(s, y), cap_bottom=False)

    # --- legs -------------------------------------------------------------
    for side, sign in (("L", -1), ("R", 1)):
        hip_x = sign * 0.186
        knee_x = sign * 0.204
        ankle_x = sign * 0.196
        b.sweep([
            (0.80, section(n_limb, 0.168, 0.166, 0.172, 2.5, centre_x=hip_x)),   # hip
            (0.66, section(n_limb, 0.152, 0.152, 0.158, 2.6, centre_x=sign * 0.194)),
            (0.50, section(n_limb, 0.124, 0.132, 0.126, 2.8, centre_x=knee_x)),  # knee, flatter front
            (0.36, section(n_limb, 0.112, 0.116, 0.116, 2.6, centre_x=sign * 0.200)),
            (0.22, section(n_limb, 0.098, 0.100, 0.104, 2.5, centre_x=ankle_x)),  # ankle
        ], "coat", lambda y, s=side: leg_weights(s, y), cap_top=False)

        # --- boots: three distinct layers -------------------------------
        boot_weights = blend(f"foot.{side}", f"shin.{side}", 0.16)
        # 1. ankle cuff
        b.sweep([
            (0.22, section(n_limb, 0.106, 0.108, 0.112, 2.4, centre_x=ankle_x)),
            (0.14, section(n_limb, 0.116, 0.124, 0.120, 2.4, centre_x=ankle_x, centre_z=0.014)),
        ], "belt", lambda y, w=boot_weights: w, cap_bottom=False, cap_top=False)
        # 2. foot upper, extending forward over the toes
        b.sweep([
            (0.14, section(n_limb, 0.116, 0.124, 0.120, 2.4, centre_x=ankle_x, centre_z=0.014)),
            (0.07, section(n_limb, 0.112, 0.178, 0.116, 2.9, centre_x=ankle_x, centre_z=0.062)),
        ], "belt", lambda y, w=boot_weights: w, cap_bottom=False, cap_top=False)
        # 3. sole, wider and flatter than the upper, with a real toe overhang
        b.box((ankle_x, 0.035, 0.078), (0.238, 0.070, 0.412), "plate", boot_weights, taper=0.92)

    return b


# --- ice axe --------------------------------------------------------------
# Rigid weapon contract (Warrior-W2 §7): the entire axe is weighted 100% to
# hand.R.  W1 split every axe vertex 50/50 between hand.L and hand.R, which
# stretched the weapon between the two hands whenever they moved apart.  The
# left hand is brought onto the shaft by the animation instead.
AXE_BONE = "hand.R"
# Shaft axis, authored in the bind pose so it passes through the right hand
# at (0.56, 0.92, 0.03) and hangs naturally at the warrior's side.  The head
# end is kicked outward and forward so the blade clears the arm and torso in
# a front view instead of hiding behind the shoulder.
AXE_BUTT = (0.474, 0.286, -0.086)
AXE_TIP = (0.686, 1.824, 0.174)


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

    # 2. lower grip wrap
    b.sweep([
        shaft_ring(0.11, 0.0392),
        shaft_ring(0.30, 0.0384),
    ], "belt", lambda y: w, cap_bottom=False, cap_top=False)

    # 3. upper grip wrap -- where the right hand actually holds it.
    b.sweep([
        shaft_ring(0.36, 0.0400),
        shaft_ring(0.55, 0.0392),
    ], "belt", lambda y: w, cap_bottom=False, cap_top=False)

    # 4. pommel -- a flared butt cap so the shaft does not just end.
    butt = axe_point(0.0)
    b.box((butt[0], butt[1] - 0.014, butt[2]), (0.086, 0.062, 0.086), "plate", w, taper=1.34)

    if level <= 1:
        # 5. axe eye / connector -- the collar clamping head to shaft.
        eye = axe_point(0.895)
        b.box((eye[0], eye[1], eye[2]), (0.088, 0.132, 0.090), "plate", w, taper=0.90)

    # 6. axe blade -- a broad bit with a curved cutting edge, swept forward.
    head = axe_point(0.905)
    bx, by, bz = head
    blade = [
        (bx + 0.012, by - 0.070),
        (bx + 0.104, by - 0.104),
        (bx + 0.216, by - 0.070),
        (bx + 0.262, by + 0.020),
        (bx + 0.234, by + 0.114),
        (bx + 0.130, by + 0.152),
        (bx + 0.026, by + 0.116),
    ]
    b.prism(blade, bz, 0.040 if level == 0 else 0.046, "blade", w)

    # 7. rear ice pick -- the counterweight spike opposite the blade, which
    # is what makes the silhouette read as an ice axe rather than a hatchet.
    pick = [
        (bx - 0.010, by - 0.052),
        (bx - 0.128, by - 0.030),
        (bx - 0.226, by + 0.036),
        (bx - 0.132, by + 0.038),
        (bx - 0.014, by + 0.086),
    ]
    b.prism(pick, bz, 0.034 if level == 0 else 0.040, "blade", w)
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
    bands = {
        0: (("coat", "fur", "amber", "coat"), 0),
        1: (("belt", "glove", "grip", "belt"), 1),
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


def add_clip(armature_obj, name, frame_end, poses):
    if not armature_obj.animation_data:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = None
    for frame, pose in poses:
        bpy.context.scene.frame_set(frame)
        for bone in armature_obj.pose.bones:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (0.0, 0.0, 0.0)
            bone.location = (0.0, 0.0, 0.0)
        for bone_name, values in pose.items():
            bone = armature_obj.pose.bones.get(bone_name)
            if not bone:
                continue
            if "r" in values:
                bone.rotation_euler = values["r"]
                bone.keyframe_insert(data_path="rotation_euler", frame=frame)
            if "l" in values:
                bone.location = values["l"]
                bone.keyframe_insert(data_path="location", frame=frame)
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
GRIP_R = {"upper_arm.R": (-0.30, 0.00, -0.46), "lower_arm.R": (-0.62, 0.10, -0.30), "hand.R": (0.00, 0.00, -0.18)}
GRIP_L = {"upper_arm.L": (-0.52, 0.00, 0.86), "lower_arm.L": (-1.02, -0.22, 0.30), "hand.L": (0.00, 0.00, 0.20)}


def grip(**overrides):
    """Base two-hand grip pose, with optional per-bone overrides."""
    pose = {bone: {"r": value} for bone, value in {**GRIP_R, **GRIP_L}.items()}
    for bone, value in overrides.items():
        bone_name = bone.replace("__", ".")
        if bone_name in pose:
            pose[bone_name] = {**pose[bone_name], **value}
        else:
            pose[bone_name] = value
    return pose


def add_animations(armature_obj):
    add_clip(armature_obj, "Idle", 30, [
        (1, grip(chest={"r": (0.0, 0.0, 0.0)})),
        (15, grip(chest={"r": (-0.030, 0.0, 0.016)}, neck={"r": (0.022, 0.0, 0.0)},
                  pelvis={"l": (0.0, 0.012, 0.0)})),
        (30, grip(chest={"r": (0.0, 0.0, 0.0)})),
    ])
    add_clip(armature_obj, "Walk", 24, [
        (1, grip(thigh__L={"r": (0.44, 0, 0)}, thigh__R={"r": (-0.44, 0, 0)}, shin__L={"r": (-0.18, 0, 0)},
                 chest={"r": (0.04, 0.10, 0)}, pelvis={"r": (0, -0.10, 0), "l": (0, 0.018, 0)})),
        (7, grip(thigh__L={"r": (-0.40, 0, 0)}, thigh__R={"r": (0.40, 0, 0)}, shin__R={"r": (-0.20, 0, 0)},
                 chest={"r": (0.04, -0.10, 0)}, pelvis={"r": (0, 0.10, 0)})),
        (13, grip(thigh__L={"r": (0.44, 0, 0)}, thigh__R={"r": (-0.44, 0, 0)}, shin__L={"r": (-0.18, 0, 0)},
                  chest={"r": (0.04, 0.10, 0)}, pelvis={"r": (0, -0.10, 0), "l": (0, 0.018, 0)})),
        (19, grip(thigh__L={"r": (-0.40, 0, 0)}, thigh__R={"r": (0.40, 0, 0)}, shin__R={"r": (-0.20, 0, 0)},
                  chest={"r": (0.04, -0.10, 0)}, pelvis={"r": (0, 0.10, 0)})),
        (24, grip(thigh__L={"r": (0.44, 0, 0)}, thigh__R={"r": (-0.44, 0, 0)}, shin__L={"r": (-0.18, 0, 0)},
                  chest={"r": (0.04, 0.10, 0)}, pelvis={"r": (0, -0.10, 0), "l": (0, 0.018, 0)})),
    ])
    add_clip(armature_obj, "Run", 18, [
        (1, grip(pelvis={"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)}, thigh__L={"r": (0.70, 0, 0)},
                 thigh__R={"r": (-0.70, 0, 0)}, shin__L={"r": (-0.42, 0, 0)}, chest={"r": (0.10, 0.14, 0)})),
        (5, grip(pelvis={"r": (0.13, 0.12, 0)}, thigh__L={"r": (-0.64, 0, 0)}, thigh__R={"r": (0.64, 0, 0)},
                 shin__R={"r": (-0.46, 0, 0)}, chest={"r": (0.10, -0.14, 0)})),
        (9, grip(pelvis={"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)}, thigh__L={"r": (0.70, 0, 0)},
                 thigh__R={"r": (-0.70, 0, 0)}, shin__L={"r": (-0.42, 0, 0)}, chest={"r": (0.10, 0.14, 0)})),
        (13, grip(pelvis={"r": (0.13, 0.12, 0)}, thigh__L={"r": (-0.64, 0, 0)}, thigh__R={"r": (0.64, 0, 0)},
                  shin__R={"r": (-0.46, 0, 0)}, chest={"r": (0.10, -0.14, 0)})),
        (18, grip(pelvis={"r": (0.13, -0.12, 0), "l": (0, 0.036, 0)}, thigh__L={"r": (0.70, 0, 0)},
                  thigh__R={"r": (-0.70, 0, 0)}, shin__L={"r": (-0.42, 0, 0)}, chest={"r": (0.10, 0.14, 0)})),
    ])
    # MeleeAttack: a committed overhead chop.  The axe is rigid to hand.R, so
    # rotating the shoulder through this arc swings the whole weapon.
    add_clip(armature_obj, "MeleeAttack", 30, [
        (1, grip(chest={"r": (0.0, 0.0, 0.0)})),
        # wind-up: weight back, weapon cocked high over the right shoulder
        (9, grip(
            upper_arm__R={"r": (-1.72, 0.10, -0.30)}, lower_arm__R={"r": (-1.02, 0.16, -0.22)},
            upper_arm__L={"r": (-1.34, 0.00, 0.62)}, lower_arm__L={"r": (-1.20, -0.20, 0.24)},
            chest={"r": (-0.24, 0.52, 0.10)}, pelvis={"r": (0.0, 0.30, 0.0)},
            thigh__L={"r": (-0.20, 0, 0)}, thigh__R={"r": (0.24, 0, 0)}, head={"r": (0.16, -0.20, 0)})),
        # impact: driven down and across the body
        (16, grip(
            upper_arm__R={"r": (0.86, -0.14, -0.58)}, lower_arm__R={"r": (-0.22, 0.06, -0.34)},
            upper_arm__L={"r": (0.30, 0.00, 0.92)}, lower_arm__L={"r": (-0.72, -0.24, 0.34)},
            chest={"r": (0.34, -0.70, -0.10)}, pelvis={"r": (0.0, -0.34, 0.0), "l": (0.0, -0.036, 0.0)},
            thigh__L={"r": (0.30, 0, 0)}, thigh__R={"r": (-0.34, 0, 0)}, head={"r": (-0.18, 0.16, 0)})),
        # follow-through
        (21, grip(
            upper_arm__R={"r": (0.52, -0.10, -0.54)}, lower_arm__R={"r": (-0.40, 0.08, -0.32)},
            upper_arm__L={"r": (0.06, 0.00, 0.90)}, lower_arm__L={"r": (-0.86, -0.24, 0.32)},
            chest={"r": (0.22, -0.52, -0.08)}, pelvis={"r": (0.0, -0.24, 0.0)})),
        (30, grip(chest={"r": (0.0, 0.0, 0.0)})),
    ])
    add_clip(armature_obj, "Hit", 14, [
        (1, grip(chest={"r": (0.0, 0.0, 0.0)})),
        (5, grip(chest={"r": (0.16, -0.26, 0.0)}, head={"r": (0.14, 0.0, 0.0)},
                 pelvis={"r": (0.0, -0.18, 0.0), "l": (0.0, -0.020, 0.0)},
                 thigh__R={"r": (0.16, 0, 0)})),
        (14, grip(chest={"r": (0.0, 0.0, 0.0)}, head={"r": (0.0, 0.0, 0.0)})),
    ])
    # Death keeps the grip until the collapse, then the arms splay as the
    # body settles onto the ground.
    add_clip(armature_obj, "Death", 30, [
        (1, grip(pelvis={"r": (0.0, 0.0, 0.0)})),
        (10, grip(pelvis={"r": (0.0, -0.36, 0.0), "l": (0.0, -0.14, 0.0)},
                  thigh__L={"r": (0.58, 0, 0)}, thigh__R={"r": (-0.32, 0, 0)}, shin__L={"r": (-0.50, 0, 0)},
                  chest={"r": (0.88, 0.0, 0.20)}, head={"r": (0.36, 0.0, 0.0)})),
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
    MATERIALS["cloth"] = material("Warrior_Cloth", MATS["cloth"], 0.86, 0.02)
    MATERIALS["leather"] = material("Warrior_Leather", MATS["leather"], 0.64, 0.04)
    MATERIALS["iron"] = material("Warrior_Iron", MATS["iron"], 0.46, 0.72)
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
    # The socket sits on the shaft at the right hand's grip point, so runtime
    # tooling can reason about the weapon without unpacking skin weights.
    socket_point = axe_point(0.455)
    socket = empty("weapon_socket", socket_point, "EXPORT", "PLAIN_AXES")
    socket.parent = root_obj
    socket["socketRole"] = "two-hand ice axe grip"
    socket["rigidBone"] = AXE_BONE
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
