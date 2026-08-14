"""A skin texture for the MPFB body, painted in 3D rather than in UV space.

The head cannot be textured by drawing into a rectangle. Its UVs are not an
island: measured on the actual body, the 4235 head-weighted vertices span
u 0.0118..0.9935 and v 0.0119..0.9584 -- essentially the whole square,
interleaved with the rest of the body. Anything painted as a 2D shape would
land in pieces all over the character.

So the map is built the other way round. Every UV triangle is rasterised once
to recover, for each texel, the 3D point on the body that texel actually
covers. Features are then placed by ANATOMY -- "just above the eye line",
"the width of the mouth" -- and the UV layout never has to be understood at
all. The same code would work on a different unwrap.

Landmarks are measured from the mesh, not typed in: the head's own bounding
box sets the scale and the nose is found by looking for the protrusion, so a
different macro, a taller variant or a re-export moves them with the body.
"""
import math

import bpy

SIZE = 512


def _smoothstep(edge0, edge1, value):
    """Soft 0..1 ramp. Hard `if` boundaries alias badly here: the head gets only
    a slice of a whole-body 512 map, so an eye is a few dozen texels across and
    every sharp edge shows as a staircase."""
    if edge1 <= edge0:
        return 0.0 if value < edge0 else 1.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def _mix(a, b, t):
    return a + (b - a) * t


def _head_frame(body, armature):
    """Head bounding box and facing direction, measured off this mesh.

    Typing in a facing would be a guess that survives until someone re-exports
    with a different convention -- which has already happened twice in this
    pipeline. The nose is simply the furthest the face protrudes from the
    skull's centre at eye height, so the sign comes from the geometry.
    """
    names = {g.index: g.name for g in body.vertex_groups}
    head_ids = {i for i, n in names.items() if n == "head"}
    points = [body.matrix_world @ v.co for v in body.data.vertices
              if sum(g.weight for g in v.groups if g.group in head_ids) > 0.5]
    if len(points) < 50:
        return None

    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    height = hi[2] - lo[2]
    centre_y = (lo[1] + hi[1]) * 0.5

    # Eye height is the classic half-way point between chin and crown.
    eye_z = lo[2] + height * 0.52
    band = [p for p in points if abs(p[2] - eye_z) < height * 0.10]
    if not band:
        band = points
    forward = 1.0 if (max(p[1] for p in band) - centre_y) >= (centre_y - min(p[1] for p in band)) else -1.0
    return {
        "lo": lo, "hi": hi, "height": height,
        # The head is NOT centred on the world origin -- measured on this rig it
        # sits at x = 0.12. Every feature below is placed relative to this, and
        # the first version was not: it used raw world x, so the eye pair
        # straddled x = 0, which is off the side of the skull. One eye landed
        # smeared on the left edge, the other missed the head entirely, and the
        # face rendered blank except for a dark band where the brow wrapped
        # round. Nothing about it looked like a centring bug from the front.
        "centreX": (lo[0] + hi[0]) * 0.5,
        "eyeZ": eye_z,
        "browZ": lo[2] + height * 0.60,
        # 0.26 put the band on the philtrum, under the nose. The lips sit
        # lower than the "quarter of the way up" rule of thumb suggests.
        "mouthZ": lo[2] + height * 0.205,
        "eyeX": (hi[0] - lo[0]) * 0.21,
        "forward": forward,
        "faceY": max(p[1] for p in band) if forward > 0 else min(p[1] for p in band),
    }


def _rasterise_positions(body):
    """Per-texel 3D position, by drawing every UV triangle once.

    This is the step that makes painting by anatomy possible: it inverts the
    unwrap, so a texel can be asked "where on the body are you?".
    """
    uv_layer = body.data.uv_layers.active
    if uv_layer is None:
        return None
    positions = [None] * (SIZE * SIZE)
    matrix = body.matrix_world

    for polygon in body.data.polygons:
        loops = list(polygon.loop_indices)
        # Fan-triangulate: quads are the common case in this base mesh.
        for k in range(1, len(loops) - 1):
            tri = (loops[0], loops[k], loops[k + 1])
            uvs = [uv_layer.data[i].uv for i in tri]
            cos = [matrix @ body.data.vertices[body.data.loops[i].vertex_index].co
                   for i in tri]
            xs = [uv[0] * SIZE for uv in uvs]
            ys = [uv[1] * SIZE for uv in uvs]
            # Pad by a texel so neighbouring triangles overlap slightly; gaps
            # on a seam would show as unpainted specks on the skin.
            x0 = max(0, int(min(xs)) - 1)
            x1 = min(SIZE - 1, int(max(xs)) + 1)
            y0 = max(0, int(min(ys)) - 1)
            y1 = min(SIZE - 1, int(max(ys)) + 1)
            if x1 < x0 or y1 < y0:
                continue
            ax, ay = xs[0], ys[0]
            bx, by = xs[1], ys[1]
            cx, cy = xs[2], ys[2]
            denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(denominator) < 1e-12:
                continue
            for py in range(y0, y1 + 1):
                sy = py + 0.5
                for px in range(x0, x1 + 1):
                    sx = px + 0.5
                    w0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / denominator
                    w1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / denominator
                    w2 = 1.0 - w0 - w1
                    if w0 < -0.02 or w1 < -0.02 or w2 < -0.02:
                        continue
                    positions[py * SIZE + px] = (
                        cos[0][0] * w0 + cos[1][0] * w1 + cos[2][0] * w2,
                        cos[0][1] * w0 + cos[1][1] * w1 + cos[2][1] * w2,
                        cos[0][2] * w0 + cos[1][2] * w1 + cos[2][2] * w2,
                    )
    return positions


def _shade(point, frame, base):
    """Skin colour at a 3D point: features placed by anatomy, not by UV."""
    x, y, z = point
    x -= frame["centreX"]          # head-relative, not world; see _head_frame
    red, green, blue = base
    face = frame["forward"] * (y - frame["faceY"]) > -frame["height"] * 0.55

    # Everything below is gated on being on the FRONT of the head; the same
    # heights on the back of the skull are just scalp.
    if face and frame["lo"][2] <= z <= frame["hi"][2]:
        # Brows: a soft bar above each eye, thicker toward the nose.
        for side in (-1.0, 1.0):
            dx = abs(x - side * frame["eyeX"])
            dz = abs(z - frame["browZ"])
            if dx < frame["eyeX"] * 1.05 and dz < frame["height"] * 0.022:
                falloff = (1.0 - dx / (frame["eyeX"] * 1.05)) * (1.0 - dz / (frame["height"] * 0.022))
                shade = 0.92 * falloff
                red *= 1.0 - shade * 0.72
                green *= 1.0 - shade * 0.78
                blue *= 1.0 - shade * 0.80
        # Eyes.
        #
        # The first version drew concentric discs: a round sclera with an iris
        # floating in it. That is not what an eye looks like -- the lids cover
        # the top and bottom of the eyeball, so what shows is an ALMOND, and
        # the iris is clipped by the upper lid rather than sitting clear of it.
        # Drawn as full discs it read as a staring zombie.
        #
        # So the aperture is an ellipse two and a half times wider than it is
        # tall, and the iris is deliberately made TALLER than the aperture: the
        # lids then cut it, which is what makes an eye look open rather than
        # painted on. Every boundary is a smoothstep, because at this texel
        # density a hard edge is a visible staircase.
        for side in (-1.0, 1.0):
            dx = x - side * frame["eyeX"]
            dz = z - frame["eyeZ"]
            half_w = frame["eyeX"] * 0.54
            half_h = frame["eyeX"] * 0.21
            aperture = math.sqrt((dx / half_w) ** 2 + (dz / half_h) ** 2)
            if aperture > 1.9:
                continue
            # Socket/crease shading OUTSIDE the lids, so the eye sits in a
            # hollow instead of on a flat plane.
            socket = (1.0 - _smoothstep(0.95, 1.85, aperture)) * 0.30
            red *= 1.0 - socket * 0.45
            green *= 1.0 - socket * 0.50
            blue *= 1.0 - socket * 0.50

            open_eye = 1.0 - _smoothstep(0.88, 1.02, aperture)
            if open_eye <= 0.002:
                continue
            radius = math.sqrt(dx * dx + dz * dz)
            iris_r = frame["eyeX"] * 0.25
            pupil_r = frame["eyeX"] * 0.105
            # Cool grey-blue, darker at the limbus: a flat disc reads as a
            # sticker, the darker rim is what gives it depth.
            edge = min(1.0, radius / iris_r)
            iris_rgb = (0.30 - 0.13 * edge, 0.36 - 0.15 * edge, 0.41 - 0.16 * edge)
            # Not pure white -- a white sclera glows against skin -- and
            # shaded toward the corners where the lids overhang.
            corner = 1.0 - 0.20 * _smoothstep(0.3, 1.0, aperture)
            # The upper lid throws a shadow across the top of the eyeball.
            lid = 1.0 - 0.22 * _smoothstep(-0.2, 1.0, dz / half_h)
            sclera_rgb = (0.79 * corner * lid, 0.78 * corner * lid, 0.75 * corner * lid)

            to_pupil = _smoothstep(pupil_r * 0.72, pupil_r * 1.18, radius)
            to_sclera = _smoothstep(iris_r * 0.90, iris_r * 1.10, radius)
            eye = [
                _mix(_mix(p, i, to_pupil), s, to_sclera)
                for p, i, s in zip((0.045, 0.040, 0.038), iris_rgb, sclera_rgb)
            ]
            red = _mix(red, eye[0], open_eye)
            green = _mix(green, eye[1], open_eye)
            blue = _mix(blue, eye[2], open_eye)
        # Lips: warmer and slightly darker, widest at the centre line.
        dz = abs(z - frame["mouthZ"])
        half = frame["eyeX"] * 1.30
        if abs(x) < half and dz < frame["height"] * 0.035:
            falloff = (1.0 - abs(x) / half) * (1.0 - dz / (frame["height"] * 0.035))
            # Restrained: at 0.30 the added red read as a smear rather than
            # as a mouth, and skin only shifts a little toward the lip.
            red = red * (1.0 - falloff * 0.06) + 0.11 * falloff
            green *= 1.0 - falloff * 0.17
            blue *= 1.0 - falloff * 0.15

    # Everywhere: a little tonal drift so skin is not one flat value.
    drift = math.sin(x * 41.0) * math.sin(z * 37.0) * 0.018
    return (max(0.0, min(1.0, red + drift)),
            max(0.0, min(1.0, green + drift)),
            max(0.0, min(1.0, blue + drift)))


def build(body, armature, base_colour, name="Hero_skin_map"):
    """Paint and pack a skin texture for `body`. Returns the image or None."""
    frame = _head_frame(body, armature)
    if frame is None:
        return None, {"applied": False, "reason": "head landmarks not found"}
    positions = _rasterise_positions(body)
    if positions is None:
        return None, {"applied": False, "reason": "body has no UV layer"}

    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=False)
    pixels = [0.0] * (SIZE * SIZE * 4)
    painted = 0
    for index, point in enumerate(positions):
        target = index * 4
        if point is None:
            # Unmapped texels keep the flat tone, so a seam can never show as
            # a black speck.
            red, green, blue = base_colour
        else:
            red, green, blue = _shade(point, frame, base_colour)
            painted += 1
        pixels[target] = red
        pixels[target + 1] = green
        pixels[target + 2] = blue
        pixels[target + 3] = 1.0
    image.pixels = pixels
    image.pack()
    return image, {
        "applied": True,
        "texelsCovered": painted,
        "of": SIZE * SIZE,
        "facing": "+Y" if frame["forward"] > 0 else "-Y",
        # Logged because a wrong value here is invisible in every render: the
        # face simply comes out blank rather than obviously misplaced.
        "centreX": round(frame["centreX"], 4),
        "eyeZ": round(frame["eyeZ"], 4),
        "mouthZ": round(frame["mouthZ"], 4),
    }


def attach(material, image):
    """Drive the skin material's base colour from the painted map."""
    if material is None or not material.use_nodes:
        return False
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (bsdf.location.x - 420, bsdf.location.y)
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return True
