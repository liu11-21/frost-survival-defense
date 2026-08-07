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
        counts = {len(points) for _, points in rings}
        if len(counts) != 1:
            # Mismatched rings used to fail deep inside the face loop with a
            # bare IndexError, which says nothing about the caller's mistake.
            raise ValueError(
                f"sweep() requires every ring to have the same point count, got {sorted(counts)}. "
                "Vary shape with radii and the superellipse exponent, not with point count."
            )
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

    def sweep_z(self, rings, surface, weight_fn, cap_back=True, cap_front=True):
        """Loft cross-sections along +Z instead of stacking them up +Y.

        Everything else here stacks rings up the body, which is right for a
        torso and wrong for a foot.  A boot's shape lives along the direction
        it points -- heel, arch, ball, toe -- so authoring one out of rings
        stacked in Y forces the author into tapered boxes, and a boot made of
        boxes is exactly what an art audit calls a block.

        ``rings`` is ``(z, [(x, y), ...])``, so a ``section()`` result can be
        reused directly with its second coordinate read as height.  The ring
        order that gives outward normals when stacking up +Y gives inward ones
        when stacking along +Z, because the rotation sense of the section is
        then the same as the stacking axis rather than opposite to it; the
        winding below is reversed to compensate.
        """
        counts = {len(points) for _, points in rings}
        if len(counts) != 1:
            raise ValueError(
                f"sweep_z() requires every ring to have the same point count, got {sorted(counts)}. "
                "Vary shape with radii and the superellipse exponent, not with point count."
            )
        built = []
        for z, section_points in rings:
            built.append([self.vertex((x, y, z), weight_fn(z)) for x, y in section_points])
        count = len(built[0])
        for lower, upper in zip(built, built[1:]):
            for i in range(count):
                j = (i + 1) % count
                self.face((lower[i], upper[i], upper[j], lower[j]), surface)
        for end, ring, forward in ((0, rings[0], False), (-1, rings[-1], True)):
            if not (cap_front if forward else cap_back):
                continue
            z = ring[0]
            centre = self.vertex((0.0, 0.0, z), weight_fn(z))
            cx = sum(p[0] for p in ring[1]) / count
            cy = sum(p[1] for p in ring[1]) / count
            self.vertices[centre] = (cx, cy, z)
            for i in range(count):
                j = (i + 1) % count
                quad = (centre, built[end][i], built[end][j])
                self.face(quad if not forward else (centre, built[end][j], built[end][i]), surface)

    def sweep_axis(self, rings, surface, weight_fn, start, end,
                   cap_start=True, cap_end=True):
        """Loft cross-sections along an ARBITRARY axis.

        `sweep` stacks along +Y and `sweep_z` along +Z, which covers a torso
        and a foot and nothing else. A limb in an A-pose points down and
        outward, so lofting it along the world vertical shears every ring --
        sleeves and trousers came out as flat sheared panels rather than
        garments.

        The frame is built once from the bone:

            T = normalize(end - start)
            F = normalize(globalZ - T * dot(globalZ, T))   (globalX if degenerate)
            S = normalize(T cross F)
            P = start + T*distance + S*u + F*v

        `rings` is ``(t, [(u, v), ...])`` with t in 0..1 along the bone, so a
        caller passes head-to-tail and never sorts by a world coordinate.

        At T = +Y this reduces to exactly `sweep`: F becomes +Z, S becomes +X,
        and P = (u, distance, v) -- the same points `sweep` produces from a
        `section()` result.
        """
        # Plain tuples, no mathutils: this module is shared and is imported by
        # tests that run outside Blender.
        def sub(a, b):
            return (a[0] - b[0], a[1] - b[1], a[2] - b[2])

        def dot(a, b):
            return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

        def scale(a, k):
            return (a[0] * k, a[1] * k, a[2] * k)

        def add(*vs):
            return tuple(sum(v[i] for v in vs) for i in range(3))

        def norm(a):
            length = math.sqrt(dot(a, a))
            if length < 1e-12:
                raise ValueError("sweep_axis() got a degenerate direction")
            return scale(a, 1.0 / length)

        def cross(a, b):
            return (a[1] * b[2] - a[2] * b[1],
                    a[2] * b[0] - a[0] * b[2],
                    a[0] * b[1] - a[1] * b[0])

        start = tuple(float(v) for v in start)
        end = tuple(float(v) for v in end)
        axis = sub(end, start)
        length = math.sqrt(dot(axis, axis))
        if length < 1e-9:
            raise ValueError("sweep_axis() needs a non-degenerate axis")
        tangent = scale(axis, 1.0 / length)

        reference = (0.0, 0.0, 1.0)
        front = sub(reference, scale(tangent, dot(reference, tangent)))
        if math.sqrt(dot(front, front)) < 1e-6:
            reference = (1.0, 0.0, 0.0)
            front = sub(reference, scale(tangent, dot(reference, tangent)))
        front = norm(front)
        side = norm(cross(tangent, front))

        counts = {len(points) for _t, points in rings}
        if len(counts) != 1:
            raise ValueError(
                f"sweep_axis() requires every ring to have the same point count, got {sorted(counts)}."
            )

        built = []
        for t, points in rings:
            base = add(start, scale(tangent, length * t))
            built.append([
                self.vertex(add(base, scale(side, u), scale(front, v)), weight_fn(t))
                for u, v in points
            ])
        count = len(built[0])
        for lower, upper in zip(built, built[1:]):
            for i in range(count):
                j = (i + 1) % count
                self.face((lower[i], lower[j], upper[j], upper[i]), surface)
        for index, (t, points), do_cap, forward in (
            (0, rings[0], cap_start, False), (-1, rings[-1], cap_end, True),
        ):
            if not do_cap:
                continue
            base = add(start, scale(tangent, length * t))
            cu = sum(p[0] for p in points) / count
            cv = sum(p[1] for p in points) / count
            centre = self.vertex(add(base, scale(side, cu), scale(front, cv)), weight_fn(t))
            for i in range(count):
                j = (i + 1) % count
                ring = built[index]
                self.face((centre, ring[j], ring[i]) if not forward
                          else (centre, ring[i], ring[j]), surface)

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


def thin(rings, level, keep=(1, 1, 2)):
    """Drop cross-sections at coarse tiers, always keeping both ends.

    There are two ways to decimate a lofted body and only one of them is
    good.  Lowering the point count rounds every section back toward the
    circle the superellipse exponent was raised to escape, so the silhouette
    goes soft everywhere at once.  Dropping *rings* costs only the places
    where the profile changes along the axis -- and on a torso, a limb or a
    boot the profile changes slowly, so half the rings can go while the
    outline stays.  Prefer this over reaching for a smaller ``n``.
    """
    step = keep[level]
    if step <= 1 or len(rings) <= 3:
        return list(rings)
    kept = [rings[i] for i in range(0, len(rings) - 1, step)]
    kept.append(rings[-1])
    return kept


def super_arc(n, half_width, depth_front, depth_back, exponent, start, end,
              centre_x=0.0, centre_z=0.0, scale=1.0):
    """A *partial* superellipse, sampled over an angle range.

    ``section()`` returns a closed ring, which is what a limb or a torso
    wants.  A garment panel wants the same curve over part of it: a coat
    facing, a shoulder yoke or a skirt vent has to lie *on* the body, and the
    body is a superellipse.  Sampling ``arc()`` instead puts a circle against
    a superellipse, and at 45 degrees an exponent-3 section sits about 11%
    further out than the circle does -- so the panel sinks into the chest at
    exactly the corners where it should be catching the light.

    Angles follow ``section``: 0 is +X, tau/4 is +Z (front).  ``scale``
    offsets the curve radially, which is how ``band()`` gets its outer and
    inner shells from one call each.
    """
    points = []
    for i in range(n):
        angle = start + (end - start) * (i / (n - 1))
        c, s = math.cos(angle), math.sin(angle)
        sx = math.copysign(abs(c) ** (2.0 / exponent), c)
        sz = math.copysign(abs(s) ** (2.0 / exponent), s)
        depth = depth_front if sz >= 0 else depth_back
        points.append((centre_x + half_width * scale * sx,
                       centre_z + depth * scale * sz))
    return points


def arc(n, half_width, depth, start, end, centre_z=0.0):
    points = []
    for i in range(n):
        t = i / (n - 1)
        angle = start + (end - start) * t
        points.append((half_width * math.sin(angle), centre_z + depth * math.cos(angle)))
    return points


# --- skin weighting -------------------------------------------------------
