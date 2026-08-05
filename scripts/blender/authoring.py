"""Shared authored-geometry language for every Frostbound Expanse asset.

This is the Warrior-W2 authoring language, promoted verbatim out of
``build_warrior.py`` so the rest of the roster can be rebuilt against the
same rules rather than each script inventing its own.

Why this exists
---------------
The original library built bodies as *stacks of rigid primitives* -- a
typical unit shipped 95 mesh nodes, 118 primitives, 13 materials and 12
embedded images. That is what makes every unit read as the same generic
placeholder with a different hat, and it is also where the draw calls in the
21-unit pressure scenario come from. The Warrior rebuild collapsed that to 6
mesh nodes, 11 primitives, 3 materials and 1 atlas while *improving* the
silhouette, because form moved from primitive count into cross-section shape.

The rules, in short:

* Bodies are swept explicit cross-sections. Never a lathe (a body of
  revolution has circular slices and always reads as turned wood), and never
  a pile of boxes.
* ``section()`` builds superellipses with independent front and back depth,
  so surfaces get flat planes with rounded corners and are not symmetric
  about the coronal plane.
* ``band()`` builds an open shell over an arc, for collars and skirts that
  must not close into a torus.
* Silhouette is carried by the *shape* of the cross-sections, not by segment
  count. Do not add loops or subdivision to reach a triangle target.

See ``docs/art/PRODUCTION_STANDARD.md`` for budgets, material rules, rig and
animation contracts, and the batch plan this module unblocks.
"""
import math


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
