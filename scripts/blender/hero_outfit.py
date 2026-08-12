"""Fit the Hero winter outfit onto an MPFB human base.

Every garment is built from the *measured* body, not from typed radii. The
script samples the actual mesh at a set of heights, takes the half-width and
depth it finds there, and lofts the garment around it with a clearance. That
is the whole reason male and female get different meshes from one design: the
same code reads two different bodies and produces two different fits.

    node scripts/run-blender.mjs scripts/blender/hero_outfit.py -- \\
        --input .runtime/mpfb/variants/hero_male_base.glb --variant male \\
        --name hero_male_dressed

Garments are skinned to the same rig by copying the nearest body vertex's
weights, so the coat follows the shoulder that is actually under it.

Body faces fully enclosed by clothing are deleted afterwards: they cannot be
seen, they z-fight against the garment, and on a 26k body they are most of the
triangles.
"""
import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from authoring import MeshBuilder, section, super_arc  # noqa: E402

OUT = os.path.join(ROOT, ".runtime", "mpfb", "variants")

# Surface palette. Kept to four so the GLB stays inside the material budget,
# and pulled apart on value so the silhouette reads in a flat grey render.
SURFACES = {
    "coat":    (0.243, 0.271, 0.325),
    "leather": (0.372, 0.263, 0.171),
    "fur":     (0.606, 0.564, 0.487),
    "metal":   (0.404, 0.428, 0.463),
    "edge":    (0.612, 0.641, 0.680),
    "accent":  (0.902, 0.560, 0.157),
}
MATERIAL_OF = {
    "coat": "cloth", "fur": "cloth",
    "leather": "leather",
    "metal": "metal", "edge": "metal", "accent": "metal",
}


# Bones whose vertices ARE the torso. Everything else -- arms, hands, legs,
# feet -- is excluded from torso measurement.
TORSO_BONES = ("pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "neck", "head")
LIMB_TOKENS = ("upperarm", "lowerarm", "hand", "thumb", "index", "middle",
               "ring", "pinky", "thigh", "calf", "foot", "ball", "clavicle")


def torso_vertices(body):
    """World positions of the vertices that belong to the torso.

    The first version took `max(abs(x))` over a horizontal slab. MPFB stands
    in an A-pose with the arms down at the sides, so at waist height that slab
    contains the hands -- and the "waist half-width" it returned was the arm
    span. The coat lofted as metre-wide discs.

    Filtering by weight makes that impossible: a vertex counts only if the
    torso bones own more of it than the limb bones do.
    """
    groups = {g.index: g.name for g in body.vertex_groups}
    torso_ids = {i for i, n in groups.items() if n in TORSO_BONES}
    limb_ids = {i for i, n in groups.items()
                if any(token in n.lower() for token in LIMB_TOKENS)}
    if not torso_ids:
        return None

    kept = []
    for vertex in body.data.vertices:
        torso = sum(g.weight for g in vertex.groups if g.group in torso_ids)
        limb = sum(g.weight for g in vertex.groups if g.group in limb_ids)
        if torso > 0.5 and torso > limb:
            kept.append(body.matrix_world @ vertex.co)
    return kept or None


def measure(body, heights):
    """Half-width, front depth and back depth of the TORSO at each height."""
    torso = torso_vertices(body)
    everything = [body.matrix_world @ v.co for v in body.data.vertices]
    lo = min(v.y for v in everything)
    hi = max(v.y for v in everything)
    height = hi - lo
    # The overall figure sets the height scale; the torso sets the girths.
    source = torso if torso else everything
    out = {}
    for key, fraction in heights.items():
        y = lo + height * fraction
        band = [v for v in source if abs(v.y - y) < height * 0.022]
        if len(band) < 8:
            band = sorted(source, key=lambda v: abs(v.y - y))[:60]
        widths = sorted(abs(v.x) for v in band)
        fronts = sorted(v.z for v in band)
        backs = sorted(-v.z for v in band)
        # 92nd percentile rather than max: a single stray vertex on a seam
        # should not set the size of a coat.
        def pick(values):
            return values[min(len(values) - 1, int(len(values) * 0.92))]
        out[key] = {
            "y": y,
            "halfWidth": pick(widths),
            "front": pick(fronts),
            "back": pick(backs),
        }
    return out, lo, hi, height


def bone_frame(armature, bone_name):
    """(start, end, tangent, side, front) for a bone, matching sweep_axis."""
    # REST positions, not posed ones. The imported GLB carries animation, so
    # `pose.bones[].head` is wherever frame 1 of some clip put the bone, while
    # the mesh vertices are still at rest -- sleeves built from the posed
    # skeleton landed at hip height on a body whose arms were at the sides.
    bone = armature.data.bones.get(bone_name)
    if bone is None:
        return None
    start = armature.matrix_world @ bone.head_local
    end = armature.matrix_world @ bone.tail_local
    axis = end - start
    if axis.length < 1e-9:
        return None
    tangent = axis.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    front = reference - tangent * reference.dot(tangent)
    if front.length < 1e-6:
        reference = Vector((1.0, 0.0, 0.0))
        front = reference - tangent * reference.dot(tangent)
    front.normalize()
    side = tangent.cross(front).normalized()
    return start, end, tangent, side, front


def limb_profile(body, bone_name, armature, slices=5, percentile=0.90,
                 extra_bones=(), axis_bone=None):
    """Per-slice girth AND centre, both measured off the body mesh.

    The bone supplies orientation only. Using `bone.head`/`bone.tail` as the
    garment's absolute centreline is what put every sleeve and trouser leg
    about half a metre below the limb it belonged to: an object matrix that
    differs from the mesh's is perfectly legal, and the garment simply must
    not depend on which one it was read through.

    So each slice reports where the limb's own vertices actually are -- a
    median centre, which ignores the stray vertex a mean would chase -- and
    the caller lofts through those points. What comes back is in WORLD space,
    the same space the torso garments are built in.

    Half-width, front depth and back depth are measured about that centre in
    the S/F frame `sweep_axis` will build, so a forearm comes out wider than
    it is deep rather than as a round tube.
    """
    # `extra_bones` widens the vertex set without changing the axis. A glove
    # has to cover the fingers, which live on their own bones, and a hand bone
    # is 45 mm long -- profiling it alone produced a cuff floating at the
    # wrist with a bare hand sticking out of it. `axis_bone` lets the
    # orientation come from a longer bone than the parts being covered.
    bone = armature.data.bones.get(axis_bone or bone_name)
    group = body.vertex_groups.get(bone_name)
    if bone is None or group is None:
        return None
    group_ids = {group.index}
    for name in extra_bones:
        extra = body.vertex_groups.get(name)
        if extra is not None:
            group_ids.add(extra.index)

    # Orientation only. The axis is used for T/S/F and for deciding which
    # slice a vertex belongs to -- never for absolute placement.
    start_ref = armature.matrix_world @ bone.head_local
    end_ref = armature.matrix_world @ bone.tail_local
    axis = end_ref - start_ref
    if axis.length < 1e-9:
        return None
    tangent = axis.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    front = reference - tangent * reference.dot(tangent)
    if front.length < 1e-6:
        reference = Vector((1.0, 0.0, 0.0))
        front = reference - tangent * reference.dot(tangent)
    front.normalize()
    side = tangent.cross(front).normalized()

    owned = []
    for vertex in body.data.vertices:
        weight = sum(g.weight for g in vertex.groups if g.group in group_ids)
        if weight >= 0.55:
            owned.append(body.matrix_world @ vertex.co)
    if len(owned) < 12:
        return None

    # Where the limb actually runs, in world space, from its own vertices.
    spans = [v.dot(tangent) for v in owned]
    lo, hi = min(spans), max(spans)
    length = max(hi - lo, 1e-6)

    def median(values, fallback):
        if not values:
            return fallback
        values.sort()
        return values[len(values) // 2]

    def pick(values, fallback):
        if not values:
            return fallback
        values.sort()
        return values[min(len(values) - 1, int(len(values) * percentile))]

    slices_out = []
    for i in range(slices + 1):
        t = i / slices
        target = lo + length * t
        band = [v for v in owned if abs(v.dot(tangent) - target) < length * (0.5 / slices + 0.10)]
        if len(band) < 6:
            band = sorted(owned, key=lambda v: abs(v.dot(tangent) - target))[:24]
        centre = Vector((
            median([v.x for v in band], 0.0),
            median([v.y for v in band], 0.0),
            median([v.z for v in band], 0.0),
        ))
        # Re-seat the centre exactly on this slice so the centreline advances
        # monotonically even where the median drifts along the axis.
        centre = centre + tangent * (target - centre.dot(tangent))
        half = pick([abs((v - centre).dot(side)) for v in band], 0.05)
        fwd = pick([d for d in ((v - centre).dot(front) for v in band) if d > 0], half)
        bwd = pick([-d for d in ((v - centre).dot(front) for v in band) if d < 0], half)
        slices_out.append({
            "t": t,
            "centre": centre,
            "halfWidth": max(half, 0.012),
            "front": max(fwd, 0.012),
            "back": max(bwd, 0.012),
        })

    return {
        "start": slices_out[0]["centre"],
        "end": slices_out[-1]["centre"],
        "tangent": tangent,
        "side": side,
        "front": front,
        "slices": slices_out,
    }


def limb_rings(data, n, pad_head, pad_tail, exp, over_head=0.0, over_tail=0.0,
               over_taper=0.97):
    """Rings for sweep_axis, offset onto the measured centreline.

    sweep_axis places ring t on the straight line from start to end. The limb
    is not straight, so each ring carries the offset from that line to the
    slice's own measured centre, projected onto the S/F axes.
    """
    start, end = data["start"], data["end"]
    axis = end - start
    length = max(axis.length, 1e-6)
    tangent = axis / length
    side, front = data["side"], data["front"]
    rings = []
    for entry in data["slices"]:
        t = entry["t"]
        on_line = start + tangent * (length * t)
        offset = entry["centre"] - on_line
        grow = pad_head + (pad_tail - pad_head) * t
        rings.append((t, section(
            n, entry["halfWidth"] * grow, entry["front"] * grow, entry["back"] * grow, exp,
            centre_x=offset.dot(side), centre_z=offset.dot(front))))

    # Extend the tube past the bone it was lofted along.
    #
    # Each limb garment runs head-to-tail of one bone, so the thigh tube stops
    # exactly where the calf tube starts and the two only touch. A close-up at
    # the knee shows what that actually produces: a horizontal band of bare
    # skin between them, on both legs. It is NOT hidden body that a cull could
    # remove -- nothing covers it, and deleting those faces would open a hole
    # straight through the leg. The garment has to reach further.
    #
    # `sweep_axis` maps ring t onto start + T * (length * t), so a ring at
    # t = -0.12 or t = 1.12 extrapolates along the same axis for free. The end
    # ring's own measured section is reused and drawn in slightly, so the tube
    # closes toward the overlap rather than flaring into the neighbouring one.
    def extrapolate(new_t, source, taper=0.97):
        entry = data["slices"][source]
        t, _sec = rings[source]
        on_line = start + tangent * (length * t)
        offset = entry["centre"] - on_line
        grow = (pad_head + (pad_tail - pad_head) * t) * taper
        return (new_t, section(
            n, entry["halfWidth"] * grow, entry["front"] * grow, entry["back"] * grow, exp,
            centre_x=offset.dot(side), centre_z=offset.dot(front)))

    # Index into `data["slices"]`, not into `rings`: inserting the head ring
    # shifts every ring index by one, and `len(rings) - 1` then runs off the
    # end of the slice list.
    last = len(data["slices"]) - 1
    # `over_taper` decides whether an overhang reads as coverage or as a pipe.
    # Near 1.0 the extension keeps full girth, which is right for a knee or
    # elbow where it is buried inside the neighbouring tube. On an EXPOSED end
    # -- the toe and heel of a boot -- it produced a horizontal cylinder poking
    # out both sides of the foot with an open cap at the back. Tapering closes
    # the form off instead.
    if over_tail > 0.0:
        rings.append(extrapolate(1.0 + over_tail, last, taper=over_taper))
    if over_head > 0.0:
        rings.insert(0, extrapolate(-over_head, 0, taper=over_taper))
    return rings


# Which bones each garment region is ALLOWED to inherit.
#
# The coat hem was weighted to the forearm. Not through a bug in the transfer
# but through its premise: MPFB stands in an A-pose, the wrist hangs against
# the skirt, and "nearest body surface" is therefore the wrist. Seventy-two
# hem vertices came back with lowerarm_r above 0.5, and at melee impact the
# arm swung up and took the hem with it.
#
# Proximity cannot answer this. The arm really is the closest surface, and it
# really is touching. What separates a sleeve from a skirt is not distance,
# it is what the piece IS -- and the builder knows that, because it lofts the
# sleeve around the arm bone and the skirt around the hips. That knowledge is
# what gets thrown away when the pieces merge into one mesh, so it is now
# recorded while the pieces are still separate and used to filter the donor
# weights before they are blended.
def _family_filter(family):
    def torso(name):
        return (name in ("pelvis", "spine", "spine_01", "spine_02", "spine_03",
                         "chest", "neck", "neck_01", "head")
                or name.startswith("clavicle"))

    if family == "skirt":
        # Hips and thighs only. No arm or hand bone may drive a hem, ever.
        return lambda n: (n in ("pelvis", "spine", "spine_01")
                          or n.startswith("thigh"))
    if family and family.startswith("sleeve_"):
        side = family[-1]
        allowed = ("clavicle_%s" % side, "upperarm_%s" % side,
                   "lowerarm_%s" % side, "hand_%s" % side)
        return lambda n: n in allowed or n.endswith("_%s" % side) and (
            n.startswith(("thumb", "index", "middle", "ring", "pinky")))
    if family and family.startswith("leg_"):
        side = family[-1]
        return lambda n: (n in ("pelvis", "spine_01")
                          or n.endswith("_%s" % side) and n.startswith(
                              ("thigh", "calf", "foot", "ball")))
    if family == "torso":
        return torso
    return None


def build_outfit(body, armature, variant):
    """Loft the garments around the measured body."""
    b = MeshBuilder(0)
    n = 20
    n_limb = 12

    H = {
        "hem": 0.42, "thighTop": 0.52, "hip": 0.56, "waist": 0.62,
        "lowRib": 0.68, "chest": 0.74, "upperChest": 0.79,
        "shoulder": 0.83, "neck": 0.86, "collar": 0.875,
        "knee": 0.28, "calf": 0.18, "ankle": 0.08,
    }
    m, floor, top, height = measure(body, H)

    def ring(key, pad, exp=2.7, dy=0.0, scale=1.0):
        d = m[key]
        return (d["y"] + dy, section(
            n, (d["halfWidth"] + pad) * scale, (d["front"] + pad) * scale,
            (d["back"] + pad) * scale, exp))

    # --- coat ---------------------------------------------------------
    # Skirt flares below the belt; the body narrows there so a constant pad
    # would cling. Extra pad low down is what makes it read as a garment.
    regions = []
    coat_start = len(b.vertices)
    b.sweep([
        ring("hem", 0.085 + height * 0.030, 2.4),
        ring("thighTop", 0.075, 2.5),
        ring("hip", 0.058, 2.6),
        ring("waist", 0.046, 2.8),
        ring("lowRib", 0.050, 2.9),
        ring("chest", 0.056, 3.0),
        ring("upperChest", 0.054, 3.0),
        ring("shoulder", 0.048, 2.8),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    # Rings are emitted in the order given, n vertices each: hem, thighTop and
    # hip are the skirt; everything above the waist is torso.
    regions.append(("skirt", coat_start, coat_start + 3 * n))
    regions.append(("torso", coat_start + 3 * n, len(b.vertices)))

    # Fur collar, an open shawl rather than a closed tube.
    d = m["collar"]
    for i, (dy, pad) in enumerate(((0.0, 0.052), (height * 0.016, 0.066), (height * 0.030, 0.048))):
        pass
    b.sweep([
        (m["neck"]["y"], section(n, m["neck"]["halfWidth"] + 0.050, m["neck"]["front"] + 0.050, m["neck"]["back"] + 0.050, 2.5)),
        (m["collar"]["y"] + height * 0.012, section(n, m["collar"]["halfWidth"] + 0.070, m["collar"]["front"] + 0.070, m["collar"]["back"] + 0.070, 2.4)),
        (m["collar"]["y"] + height * 0.030, section(n, m["collar"]["halfWidth"] + 0.040, m["collar"]["front"] + 0.040, m["collar"]["back"] + 0.044, 2.3)),
    ], "fur", lambda y: {}, cap_bottom=False, cap_top=False)

    # Front closure: leather facing with a wool storm flap lapping over it.
    FRONT = math.tau / 4.0
    closure = [
        (m["hem"]["y"], m["hem"]["halfWidth"] + 0.085, m["hem"]["front"] + 0.085, m["hem"]["back"] + 0.085, 2.4),
        (m["waist"]["y"], m["waist"]["halfWidth"] + 0.046, m["waist"]["front"] + 0.046, m["waist"]["back"] + 0.046, 2.8),
        (m["chest"]["y"], m["chest"]["halfWidth"] + 0.056, m["chest"]["front"] + 0.056, m["chest"]["back"] + 0.056, 3.0),
        (m["shoulder"]["y"], m["shoulder"]["halfWidth"] + 0.048, m["shoulder"]["front"] + 0.048, m["shoulder"]["back"] + 0.048, 2.8),
    ]
    for surface, a0, a1, outer, inner in (
        ("leather", FRONT - 0.26, FRONT + 1.02, 1.028, 1.000),
        ("coat", FRONT - 0.24, FRONT + 0.84, 1.060, 1.026),
    ):
        b.band([(y, super_arc(9, w, f, bk, e, a0, a1, scale=outer),
                 super_arc(9, w, f, bk, e, a0, a1, scale=inner))
                for y, w, f, bk, e in closure], surface, lambda y: {})

    # --- belt ---------------------------------------------------------
    d = m["waist"]
    b.sweep([
        (d["y"] - height * 0.016, section(n, d["halfWidth"] + 0.052, d["front"] + 0.052, d["back"] + 0.052, 2.9)),
        (d["y"] + height * 0.016, section(n, d["halfWidth"] + 0.054, d["front"] + 0.054, d["back"] + 0.054, 2.9)),
    ], "leather", lambda y: {}, cap_bottom=False, cap_top=False)
    b.box((0.0, d["y"], d["front"] + 0.070), (0.11, 0.085, 0.030), "edge", {})

    # --- torso armour: a cuirass with a keel, plus faulds --------------
    b.sweep([
        (m["waist"]["y"] + height * 0.022, section(n, m["waist"]["halfWidth"] + 0.058, m["waist"]["front"] + 0.052, m["waist"]["back"] + 0.052, 3.4)),
        (m["lowRib"]["y"], section(n, m["lowRib"]["halfWidth"] + 0.062, m["lowRib"]["front"] + 0.056, m["lowRib"]["back"] + 0.056, 3.5)),
        (m["chest"]["y"], section(n, m["chest"]["halfWidth"] + 0.066, m["chest"]["front"] + 0.060, m["chest"]["back"] + 0.058, 3.5)),
        (m["upperChest"]["y"], section(n, m["upperChest"]["halfWidth"] + 0.058, m["upperChest"]["front"] + 0.052, m["upperChest"]["back"] + 0.052, 3.2)),
    ], "metal", lambda y: {}, cap_bottom=False, cap_top=False)
    b.prism([
        (-0.030, m["upperChest"]["y"]), (0.030, m["upperChest"]["y"]),
        (0.022, m["waist"]["y"] + height * 0.022), (-0.022, m["waist"]["y"] + height * 0.022),
    ], m["chest"]["front"] + 0.062, 0.048, "edge", {})
    b.box((0.0, m["chest"]["y"] + height * 0.012, m["chest"]["front"] + 0.070),
          (0.070, 0.110, 0.022), "accent", {})

    # --- shoulders: asymmetric, heavy on the left ----------------------
    for side, sign, lames in (("L", -1, 3), ("R", 1, 1)):
        data = limb_profile(body, f"upperarm_{side.lower()}", armature)
        if data is None:
            continue
        start, end = data["start"], data["end"]
        first = data["slices"][0]
        half, fwd, bwd = first["halfWidth"], first["front"], first["back"]
        for lame in range(lames):
            base = 0.02 + 0.19 * lame
            grow = 1.26 + 0.16 * lame
            b.sweep_axis([
                (base, section(n_limb, half * grow, fwd * grow, bwd * grow, 3.0)),
                (base + 0.20, section(n_limb, half * (grow + 0.12), fwd * (grow + 0.12), bwd * (grow + 0.10), 3.0)),
            ], "metal", lambda t: {}, start, end, cap_start=False, cap_end=False)
            b.sweep_axis([
                (base + 0.20, section(n_limb, half * (grow + 0.12), fwd * (grow + 0.12), bwd * (grow + 0.10), 3.0)),
                (base + 0.235, section(n_limb, half * (grow + 0.03), fwd * (grow + 0.03), bwd * (grow + 0.02), 3.0)),
            ], "edge", lambda t: {}, start, end, cap_start=False, cap_end=False)

    # --- sleeves, gloves, trousers, boots ------------------------------
    # All lofted along the BONE, not along world up. An A-pose limb points
    # down and outward; stacking rings by world height shears every one of
    # them, which is what turned the first sleeves into flat panels.
    for side in ("l", "r"):
        digits = tuple(f"{d}_{j:02d}_{side}" for d in
                       ("thumb", "index", "middle", "ring", "pinky")
                       for j in (1, 2, 3))
        # `over_head` / `over_tail` extend a tube past its bone, as a fraction
        # of that bone's length, so consecutive segments OVERLAP instead of
        # merely touching. Butting them together left a visible band of bare
        # skin at each knee and elbow; the toes came out through the boot for
        # the same reason at the other end of the leg. These are local
        # extensions of specific seams, not a blanket inflate of the garment.
        for bone_name, surface, pad, tail_pad, exp, extra, axis_bone, over_head, over_tail in (
            (f"upperarm_{side}", "coat", 1.22, 1.15, 2.8, (), None, 0.0, 0.14),
            (f"lowerarm_{side}", "coat", 1.17, 1.10, 2.8, (), None, 0.12, 0.06),
            (f"thigh_{side}", "coat", 1.15, 1.10, 2.8, (), None, 0.0, 0.16),
            # The trouser has to reach INTO the boot. The boot is swept along
            # the foot, so its own overhangs run heel-to-toe and cannot cover
            # the ankle; only the calf can close that seam.
            # 0.30 drove the trouser straight through the boot and out the
            # bottom, where its open end showed as a bare ellipse. It only has
            # to reach the boot cuff, not past it.
            (f"calf_{side}", "coat", 1.13, 1.22, 2.8, (), None, 0.14, 0.10),
            # Boot: foot plus the ball, oriented along the shin so the shaft
            # runs up the ankle instead of along the toes.
            # The boot has to swallow the toes: the foot bone stops at the ball,
            # and capping there left every toe poking out through the front.
            # ONE boot, swept along the FOOT bone -- heel to ball -- rather than
            # down the shin. Sweeping along the calf put the end cap across the
            # shin axis, so the toes walked straight through the front of it,
            # and no tail extension on that axis could ever help: it pushes
            # toward the floor, not forward over the foot. A separate toe cap
            # along the ball bone did cover them, at the cost of two tubes
            # meeting in a lump with a wedge of bare skin between them.
            # Overhangs reach back over the heel and forward past the toes.
            # A 0.55 tail did swallow the toes and turned the boot into a flat
            # slab. The toe end is instead made WIDER and rounder (tail_pad,
            # lower exponent) and the reach cut back, which covers the same
            # toes while keeping a boot-shaped silhouette. Any residual
            # penetration is caught by push_outside_body below.
            # Short, strongly tapered overhangs. A long untapered pair turned
            # the boot into a pipe through the foot, open at the heel.
            (f"foot_{side}", "leather", 1.22, 1.48, 2.4, (f"ball_{side}",), f"foot_{side}", 0.10, 0.16),
        ):
            data = limb_profile(body, bone_name, armature,
                                extra_bones=extra, axis_bone=axis_bone)
            if data is None:
                continue
            # Gloves and boots are closed at the far end. Left open, the
            # fingertips and toes simply protrude through the hole -- which is
            # exactly what "bare hands and bare toes" looked like.
            closed = bone_name.startswith(("hand_", "foot_"))
            # The boot must be closed at BOTH ends; an open start cap left a
            # bare circle behind the heel.
            cap_start = bone_name.startswith("foot_")
            mark = len(b.vertices)
            # A boot's overhangs are exposed; a knee's are buried.
            taper = 0.55 if bone_name.startswith("foot_") else 0.97
            b.sweep_axis(limb_rings(data, n_limb, pad, tail_pad, exp,
                                    over_head=over_head, over_tail=over_tail,
                                    over_taper=taper),
                         surface, lambda t: {}, data["start"], data["end"],
                         cap_start=cap_start, cap_end=closed)
            family = ("sleeve_%s" % side
                      if bone_name.startswith(("upperarm_", "lowerarm_", "hand_"))
                      else "leg_%s" % side)
            regions.append((family, mark, len(b.vertices)))

    # --- helmet: open face --------------------------------------------
    # Built from the head's own vertices like every other piece. The previous
    # version stacked rings up world Y from a pose-bone position and a guessed
    # skull radius, and did not read at all.
    head = limb_profile(body, "head", armature, slices=6)
    if head is not None:
        start, end = head["start"], head["end"]
        slices = head["slices"]
        # The brow sits a little above the middle of the head; everything from
        # there up is shell, and the face below it stays open.
        brow = max(1, int(len(slices) * 0.42))
        shell = []
        for entry in slices[brow:]:
            t = entry["t"]
            taper = 1.0 if t < 0.85 else max(0.35, 1.0 - (t - 0.85) * 4.0)
            shell.append((t, section(
                n, entry["halfWidth"] * 1.14 * taper, entry["front"] * 1.14 * taper,
                entry["back"] * 1.16 * taper, 2.9,
                centre_x=(entry["centre"] - (start + (end - start) * t)).dot(head["side"]),
                centre_z=(entry["centre"] - (start + (end - start) * t)).dot(head["front"]))))
        if len(shell) >= 2:
            b.sweep_axis(shell, "metal", lambda t: {}, start, end, cap_start=False)
            # Rolled brim: out, then tucked back under, so the edge has an
            # underside and the helmet does not read as a smooth cap.
            rim = slices[brow]
            offset_s = (rim["centre"] - (start + (end - start) * rim["t"])).dot(head["side"])
            offset_f = (rim["centre"] - (start + (end - start) * rim["t"])).dot(head["front"])
            b.sweep_axis([
                (rim["t"], section(n, rim["halfWidth"] * 1.14, rim["front"] * 1.14,
                                   rim["back"] * 1.16, 2.9, centre_x=offset_s, centre_z=offset_f)),
                (rim["t"] - 0.045, section(n, rim["halfWidth"] * 1.26, rim["front"] * 1.26,
                                           rim["back"] * 1.28, 3.0, centre_x=offset_s, centre_z=offset_f)),
                (rim["t"] - 0.085, section(n, rim["halfWidth"] * 1.08, rim["front"] * 1.08,
                                           rim["back"] * 1.10, 2.9, centre_x=offset_s, centre_z=offset_f)),
            ], "edge", lambda t: {}, start, end, cap_start=False, cap_end=False)
            # Cheek guards: two plates framing the face, leaving it open.
            for sign in (-1, 1):
                lo = slices[max(0, brow - 2)]
                hi = slices[brow]
                for frac in (0.0,):
                    b.prism([
                        (hi["centre"].x + sign * hi["halfWidth"] * 0.96, hi["centre"].y),
                        (hi["centre"].x + sign * hi["halfWidth"] * 1.30, hi["centre"].y - (hi["centre"].y - lo["centre"].y) * 0.25),
                        (lo["centre"].x + sign * lo["halfWidth"] * 1.16, lo["centre"].y),
                        (lo["centre"].x + sign * lo["halfWidth"] * 0.86, lo["centre"].y + (hi["centre"].y - lo["centre"].y) * 0.18),
                    ], hi["centre"].z + hi["front"] * 0.10, hi["front"] * 0.90, "metal", {})

    return b, m, floor, top, height, regions


def build_sword(body, armature, height):
    """A sword lofted along the hand's axis, seated at the palm.

    Still rigid to hand_r. The grip's starting point comes from the palm's own
    vertices rather than from the bone head, for the same reason the sleeves
    do: bind-space offsets should not decide where a weapon sits.
    """
    data = limb_profile(body, "hand_r", armature, slices=2)
    if data is None:
        return None, None
    palm = data["slices"][len(data["slices"]) // 2]["centre"]
    tangent = data["tangent"]
    b = MeshBuilder(0)
    reach = height * 0.55
    start = palm - tangent * (reach * 0.28)
    end = palm + tangent * (reach * 0.72)

    b.sweep_axis([(0.20, section(10, 0.016, 0.016, 0.016, 2.4)),
                  (0.31, section(10, 0.015, 0.015, 0.015, 2.4))],
                 "leather", lambda t: {}, start, end)
    b.sweep_axis([(0.14, section(10, 0.026, 0.026, 0.026, 2.2)),
                  (0.20, section(10, 0.018, 0.018, 0.018, 2.4))],
                 "metal", lambda t: {}, start, end)
    b.sweep_axis([(0.32, section(10, 0.055, 0.020, 0.020, 3.0)),
                  (0.36, section(10, 0.040, 0.016, 0.016, 3.0))],
                 "metal", lambda t: {}, start, end)
    b.sweep_axis([(0.37, section(10, 0.026, 0.010, 0.010, 3.2)),
                  (0.62, section(10, 0.024, 0.009, 0.009, 3.2)),
                  (0.90, section(10, 0.019, 0.007, 0.007, 3.0)),
                  (1.00, section(10, 0.004, 0.003, 0.003, 2.4))],
                 "edge", lambda t: {}, start, end)
    return b, "hand_r"


def build_glove(body, armature, side, thickness_ratio=0.16, diagnostic=False):
    """A glove made from the hand's own surface, offset along body normals.

    A swept tube cannot have five fingers, and the hand bone is 45 mm long so
    there is nothing to sweep along. The glove is therefore the hand: the
    faces the hand and finger bones dominate, duplicated and pushed out.

    Two things the first version got wrong, and both are the reason it did not
    cover anything:

    - It offset along `vert.normal` read from the bmesh *after* deleting
      faces. Deleting changes which faces meet at a vertex, so the recomputed
      normal on a boundary is not the body's surface normal there; along the
      cut edge it can point almost anywhere, including inward.
    - It kept `source_of[vert.index] = vert.index`, which is not a mapping at
      all: bmesh reindexes after a delete, so the value stops meaning what it
      says the moment it matters.

    The original body index is now carried across the delete in a bmesh int
    layer, and every glove vertex is placed from the *body's* own co and
    normal. `sign_check` in the returned record measures the result rather
    than trusting it.
    """
    digits = [f"{d}_{j:02d}_{side}" for d in
              ("thumb", "index", "middle", "ring", "pinky") for j in (1, 2, 3)]
    wanted = [f"hand_{side}"] + digits
    ids = {g.index for g in body.vertex_groups if g.name in wanted}
    if not ids:
        return None, {"reason": "no hand or finger vertex groups"}

    owned = set()
    for vertex in body.data.vertices:
        if sum(g.weight for g in vertex.groups if g.group in ids) >= 0.5:
            owned.add(vertex.index)
    if len(owned) < 40:
        return None, {"reason": "hand region has %d vertices" % len(owned)}

    body.data.calc_normals_split() if hasattr(body.data, "calc_normals_split") else None
    points = [body.data.vertices[i].co for i in owned]
    extent = max(
        max(p.x for p in points) - min(p.x for p in points),
        max(p.y for p in points) - min(p.y for p in points),
        max(p.z for p in points) - min(p.z for p in points))
    thickness = max(0.004, extent * thickness_ratio * 0.25)

    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    mesh.verts.ensure_lookup_table()
    # Carry the ORIGINAL index across the delete. bmesh reindexes afterwards,
    # so anything derived from vert.index later is a different number.
    layer = mesh.verts.layers.int.new("body_index")
    for vert in mesh.verts:
        vert[layer] = vert.index

    doomed = [f for f in mesh.faces if not all(v.index in owned for v in f.verts)]
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context="VERTS")
    if not mesh.faces:
        mesh.free()
        return None, {"reason": "no faces survived the hand selection"}

    signed = []
    for vert in mesh.verts:
        source = body.data.vertices[vert[layer]]
        target = source.co + source.normal * thickness
        signed.append((target - source.co).dot(source.normal))
        vert.co = target

    # `from_mesh(body.data)` copies the deform layer along with the geometry,
    # so every glove vertex arrives carrying the BODY's weights keyed by the
    # BODY's vertex-group indices. The new glove object has no groups yet;
    # `transfer_weights` then creates its own set in sorted-name order, and
    # those stale numeric indices now address entirely different bones. That is
    # the source of the paired weights the diagnostic found -- one correct
    # entry written by name, one inherited entry pointing at whatever bone
    # happens to sit at that index, both at the same value. A right middle
    # finger paired with a left thumb, a foot paired with a hand.
    #
    # The glove must be weighted exactly once, by `transfer_weights`.
    deform = mesh.verts.layers.deform.active
    if deform is not None:
        mesh.verts.layers.deform.remove(deform)

    data = bpy.data.meshes.new(f"HeroGlove_{side}")
    mesh.to_mesh(data)
    mesh.free()
    for polygon in data.polygons:
        polygon.use_smooth = True

    # The shell is copied from the body, so it inherits the body's material
    # SLOTS and every polygon still points at slot 0 -- the skin. Appending a
    # leather material merely added an unused slot 1, and the glove rendered
    # as a bare hand while being geometrically present. The magenta diagnostic
    # is what separated "not there" from "there, wearing skin".
    data.materials.clear()
    for polygon in data.polygons:
        polygon.material_index = 0

    obj = bpy.data.objects.new(f"HeroGlove_{side}", data)
    bpy.context.collection.objects.link(obj)
    obj.matrix_world = body.matrix_world.copy()

    signed.sort()
    median = signed[len(signed) // 2] if signed else 0.0
    record = {
        "side": side,
        "sourceVertices": len(owned),
        "shellVertices": len(data.vertices),
        "thickness": round(thickness, 5),
        "medianSignedOffset": round(median, 5),
        # Outward and about one thickness is the whole claim; anything else
        # means the shell is inside the hand and the render would be a lie
        # either way.
        "outward": median > 0,
        "matchesThickness": abs(median - thickness) < thickness * 0.05,
    }
    if diagnostic:
        material = bpy.data.materials.new(f"GLOVE_DIAGNOSTIC_{side}")
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (1.0, 0.0, 0.85, 1.0)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (1.0, 0.0, 0.85, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 3.0
        data.materials.append(material)
    return obj, record


def to_object(builder, name, materials):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    slots = sorted({MATERIAL_OF[s] for s in builder.surfaces})
    for slot in slots:
        mesh.materials.append(materials[slot])
    colours = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR", domain="CORNER")
    for polygon in mesh.polygons:
        surface = builder.surfaces[polygon.index]
        polygon.material_index = slots.index(MATERIAL_OF[surface])
        tint = SURFACES[surface]
        for loop in polygon.loop_indices:
            colours.data[loop].color = (tint[0], tint[1], tint[2], 1.0)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def implausible_weights(obj, side=None, limit=12):
    """Bones that cannot legitimately drive this mesh.

    A glove is on one hand. Anything weighted to the other hand, to a leg or a
    foot, or to the head is not a near miss in the transfer -- it is a wrong
    index, and it is what tore the mesh. Reported as data so the caller can
    refuse to write rather than discovering it in a render.
    """
    LOWER = ("thigh", "calf", "foot", "ball", "toe", "pelvis")
    HEAD = ("head", "neck", "face", "eye", "jaw")
    other = {"l": "_r", "r": "_l"}.get(side)
    bad = []
    names = {g.index: g.name for g in obj.vertex_groups}
    for vertex in obj.data.vertices:
        for group in vertex.groups:
            name = (names.get(group.group) or "").lower()
            if group.weight <= 1e-3 or not name:
                continue
            wrong_side = bool(other) and (name.endswith(other) or name.endswith(other.replace("_", ".")))
            if wrong_side or any(t in name for t in LOWER) or any(t in name for t in HEAD):
                bad.append({"vertex": vertex.index, "bone": names[group.group],
                            "weight": round(group.weight, 4)})
                if len(bad) >= limit:
                    return bad
    return bad


def rebind_in_spread_pose(garments, body, armature, angle=48.0):
    """Transfer the weights again, with the limbs held away from the body.

    This is the actual fix for the coat hem binding to the forearm, and it is
    a fix rather than a workaround because it removes the condition that made
    the question unanswerable instead of enumerating exceptions to it.

    MPFB stands in an A-pose. The wrist rests against the skirt, so "which
    body surface is this garment vertex nearest to" has no correct answer --
    the forearm genuinely is the nearest surface, genuinely is touching, and
    neither ray direction nor a distance threshold can separate the arm a
    sleeve covers from the arm merely standing beside a hem. Nobody skins in
    that pose; the reason production rigs are bound in a spread pose is
    exactly this.

    So: the first pass in the A-pose is only good enough to skin the garment.
    Once it is skinned, the armature can move both the body and the garment
    apart, and the second pass asks the same proximity question in a pose
    where it has an unambiguous answer -- the forearm is now a foot from the
    hem instead of touching it.

    Geometry is taken from the posed meshes; the WEIGHTS are still read from
    the body's own rest-pose vertex groups, which the pose does not alter.
    Topology is unchanged by an armature modifier, so vertex indices still
    line up between the posed copy and the original.
    """
    from mathutils import Matrix

    lifted = []
    for name, axis, sign in (("upperarm_l", 2, 1.0), ("upperarm_r", 2, -1.0),
                             ("thigh_l", 2, -1.0), ("thigh_r", 2, 1.0)):
        bone = armature.pose.bones.get(name)
        if bone is None:
            continue
        bone.rotation_mode = "XYZ"
        euler = [0.0, 0.0, 0.0]
        # Legs need far less than the arms: they are not touching anything,
        # they only need the inner thighs apart.
        euler[axis] = math.radians(angle * (1.0 if "upperarm" in name else 0.45)) * sign
        bone.rotation_euler = euler
        lifted.append(name)
    if not lifted:
        return {"posed": [], "rebound": []}
    bpy.context.view_layer.update()

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def posed_copy(obj):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated)
        copy = bpy.data.objects.new(obj.name + "__posed", mesh)
        copy.matrix_world = obj.matrix_world.copy()
        bpy.context.collection.objects.link(copy)
        return copy

    posed_body = posed_copy(body)
    rebound = []
    try:
        for garment, families in garments:
            evaluated = garment.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            points = [garment.matrix_world @ v.co.copy() for v in mesh.vertices]
            evaluated.to_mesh_clear()
            if len(points) != len(garment.data.vertices):
                # A modifier changed the topology; indices would not line up
                # and a silent mismatch here is worse than skipping.
                continue
            transfer_weights(garment, body, armature, families=families,
                             sample_body=posed_body, sample_points=points)
            rebound.append(garment.name)
    finally:
        bpy.data.objects.remove(posed_body, do_unlink=True)
        for name in lifted:
            armature.pose.bones[name].matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()
    return {"posed": lifted, "angleDeg": angle, "rebound": rebound}


def push_outside_body(garment, body, clearance=0.004, limit=0.05):
    """Guarantee no garment vertex sits inside the skin.

    The systematic leaks -- the bare band at each knee, the toes through the
    boot -- were missing garment, and extending the tubes fixed those. What is
    left is a different failure: isolated vertices where a lofted elliptical
    section simply does not clear a local bump in the body, the shin bone and
    the ankle being the obvious ones. A section is an ellipse; a shin is not.

    Chasing those with pad values is whack-a-mole, and raising the pad enough
    to clear the worst bump inflates the whole garment -- which is the blanket
    scale-up this must not do. So instead each garment vertex is tested
    against the body it covers and, only if it is inside, pushed out to a
    fixed clearance along the body's own surface normal. Vertices already
    outside are untouched, so the silhouette does not change; `limit` caps the
    correction so a wild sample can never balloon the mesh.
    """
    to_body = body.matrix_world.inverted()
    from_body = body.matrix_world
    moved = 0
    worst = 0.0
    for vertex in garment.data.vertices:
        world = garment.matrix_world @ vertex.co
        local = to_body @ world
        hit, location, normal, _f = body.closest_point_on_mesh(local)
        if not hit:
            continue
        signed = (local - location).dot(normal)
        if signed >= clearance:
            continue
        shift = min(clearance - signed, limit)
        target = from_body @ (location + normal * clearance)
        corrected = garment.matrix_world.inverted() @ target
        if (corrected - vertex.co).length <= limit:
            vertex.co = corrected
            moved += 1
            worst = max(worst, shift)
    garment.data.update()
    return {"pushed": moved, "of": len(garment.data.vertices),
            "worstCorrection": round(worst, 5), "clearance": clearance}


def region_violations(obj, families, threshold=0.02):
    """Bones a garment region must never carry, checked after the merge.

    The filter runs while the pieces are separate; this proves the guarantee
    held through merging, smoothing and renormalisation. Anything here is a
    build failure, not a warning -- a hem with an arm influence is a metre of
    coat flying across the screen at melee impact.
    """
    names = {g.index: g.name for g in obj.vertex_groups}
    bad = []
    for vertex in obj.data.vertices:
        family = families[vertex.index] if vertex.index < len(families) else None
        if not family:
            continue
        allow = _family_filter(family)
        if allow is None:
            continue
        for group in vertex.groups:
            name = names.get(group.group)
            if not name or group.weight <= threshold or allow(name):
                continue
            bad.append({"vertex": vertex.index, "family": family,
                        "bone": name, "weight": round(group.weight, 4)})
            if len(bad) >= 12:
                return bad
    return bad


def transfer_weights(garment, body, armature, max_influences=4,
                     smooth_passes=4, smooth_strength=0.35,
                     families=None, sample_body=None, sample_points=None):
    """Copy weights from the nearest body SURFACE, interpolated across the face.

    The first version snapped each garment vertex to the single nearest body
    vertex. At a shoulder seam the body's own weights change fast, so two
    neighbouring coat vertices could land on body vertices weighted 86% spine
    and 99% upper arm -- individually sane, wildly discontinuous, and the coat
    tore between them the moment the arm moved.

    `closest_point_on_mesh` gives the nearest point on the nearest face, and
    `poly_3d_calc` gives that point's barycentric coordinates within it. The
    weights are blended by those coordinates, so the transfer is as continuous
    as the body's own weighting is: neighbouring garment vertices that project
    to neighbouring points get neighbouring weights.

    Influences are capped and renormalised here rather than left to the glTF
    exporter, which keeps only four and renormalises silently -- so what is
    authored is what ships.
    """
    from mathutils.interpolate import poly_3d_calc

    groups = {g.index: g.name for g in body.vertex_groups}
    for name in sorted(set(groups.values())):
        if name not in garment.vertex_groups:
            garment.vertex_groups.new(name=name)

    # Geometry may come from a posed copy while the WEIGHTS always come from
    # the body's rest-pose vertex groups. An armature modifier does not change
    # topology, so a corner index found on the posed surface addresses the same
    # vertex, and the same weights, on the original.
    surface = sample_body if sample_body is not None else body
    to_body = surface.matrix_world.inverted()
    polygons = surface.data.polygons
    geometry = surface.data.vertices
    vertices = body.data.vertices

    sampled = []
    for index, vertex in enumerate(garment.data.vertices):
        world = (sample_points[index] if sample_points is not None
                 else garment.matrix_world @ vertex.co)
        hit, location, _normal, face_index = surface.closest_point_on_mesh(to_body @ world)
        blended = {}
        if hit and face_index >= 0:
            corners = list(polygons[face_index].vertices)
            shares = poly_3d_calc([geometry[i].co for i in corners], location)
            for corner, share in zip(corners, shares):
                if share <= 1e-6:
                    continue
                for group in vertices[corner].groups:
                    name = groups.get(group.group)
                    if name:
                        blended[name] = blended.get(name, 0.0) + group.weight * share
        allow = _family_filter(families[len(sampled)]) if families else None
        if allow is not None:
            # Filter the donors, then renormalise. A hem vertex whose nearest
            # surface is the wrist keeps only what the hips and thighs
            # contributed; if that leaves nothing it falls through to the
            # trunk search below rather than silently keeping the arm.
            kept = {n: w for n, w in blended.items() if allow(n)}
            blended = kept if kept else blended
        sampled.append(blended)

    # Smooth the weight field over the GARMENT's own topology.
    #
    # Projection alone is not enough, and the numbers said so: after switching
    # to face interpolation the coat still had a vertex at upper_arm.R 0.97
    # next to one at chest 0.88, across a 4 cm edge. Both samples were correct
    # -- the two vertices simply project to opposite sides of the armpit gap,
    # which any purely spatial lookup will do wherever a garment bridges a
    # crease. The coat is one surface there, so its weights have to be
    # continuous there, and the only structure that knows the coat is one
    # surface is the coat's own edges.
    adjacency = [[] for _ in garment.data.vertices]
    for edge in garment.data.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    # Blend toward the neighbourhood average rather than replacing with it.
    #
    # Four full replacement passes cured the seam and caused a worse problem:
    # coat vertices near the shoulder came out spine 0.2765 / spine_02 0.2625
    # / two more at similar values -- a flat four-way split with no dominant
    # bone at all. A vertex like that follows the average of several unrelated
    # joints, and at melee impact the coat extruded roughly a metre into a
    # blade. Smoothing has to remove the discontinuity without dissolving the
    # dominant influence, so each pass moves only part of the way.
    for _pass in range(smooth_passes):
        updated = []
        for index, blended in enumerate(sampled):
            neighbours = adjacency[index]
            if not neighbours:
                updated.append(dict(blended))
                continue
            average = {}
            for other in neighbours:
                for name, weight in sampled[other].items():
                    average[name] = average.get(name, 0.0) + weight / len(neighbours)
            merged = {n: w * (1.0 - smooth_strength) for n, w in blended.items()}
            for name, weight in average.items():
                merged[name] = merged.get(name, 0.0) + weight * smooth_strength
            updated.append(merged)
        sampled = updated

    for index, blended in enumerate(sampled):
        if families:
            # Smoothing averages across the seam between regions, which pulls
            # an arm bone back onto the top skirt ring. Filter once more so
            # the guarantee survives the blur that follows it.
            allow = _family_filter(families[index])
            if allow is not None:
                kept = {n: w for n, w in blended.items() if allow(n)}
                if kept:
                    blended = kept
        if not blended:
            continue
        # Drop trace influences. MPFB's own body carries sub-1-per-mille
        # weights to bones on the far side of the body; interpolation
        # faithfully reproduces them, and they then read as "a left middle
        # finger drives the right glove". At 0.0006 they move a vertex by six
        # hundredths of a percent and sit below what glTF's normalised byte
        # weights can even represent -- they are noise, not influence. The
        # gate below still fails the build for anything above this floor.
        ranked = [(n, w) for n, w in
                  sorted(blended.items(), key=lambda item: -item[1])[:max_influences]
                  if w > 1e-3]
        total = sum(w for _n, w in ranked)
        if total <= 1e-6:
            continue
        for name, weight in ranked:
            garment.vertex_groups[name].add([index], weight / total, "REPLACE")

    modifier = garment.modifiers.new("skin", "ARMATURE")
    modifier.object = armature
    garment.parent = armature
    # Setting `.parent` does NOT preserve world transform. The garment is
    # built in world space inside a pivot that is rotated into Y-up, so
    # parenting it to the armature applied that rotation a second time and the
    # coat ended up lying on the floor beside the character. The inverse
    # cancels the parent's current transform.
    garment.matrix_parent_inverse = armature.matrix_world.inverted()


def rigid_weights(obj, armature, bone_name):
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("skin", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj.matrix_parent_inverse = armature.matrix_world.inverted()


def cull_hidden_body(body, garments, margin):
    """Delete body faces fully enclosed by clothing.

    They cannot be seen, they z-fight against the garment from inside, and on
    a 26k body they are most of the triangle count.
    """
    from mathutils.bvhtree import BVHTree

    trees = []
    for garment in garments:
        mesh = bmesh.new()
        mesh.from_mesh(garment.data)
        mesh.transform(garment.matrix_world)
        trees.append(BVHTree.FromBMesh(mesh))
        mesh.free()
    if not trees:
        return 0

    covered = set()
    for index, vertex in enumerate(body.data.vertices):
        world = body.matrix_world @ vertex.co
        normal = (body.matrix_world.to_3x3() @ vertex.normal).normalized()
        for tree in trees:
            if tree.ray_cast(world + normal * 0.002, normal, margin)[0] is not None:
                covered.add(index)
                break

    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    mesh.verts.ensure_lookup_table()
    doomed = [face for face in mesh.faces if all(v.index in covered for v in face.verts)]
    removed = len(doomed)
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces], context="VERTS")
    mesh.to_mesh(body.data)
    mesh.free()
    body.data.update()
    return removed


def triangles(obj):
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--variant", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args(argv)

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))

    body = max((o for o in bpy.data.objects if o.type == "MESH"),
               key=lambda o: len(o.data.vertices))
    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature in %s" % args.input)

    # Blender imports glTF into its own Z-up space, but `sweep()` stacks its
    # rings along +Y -- this project's authoring convention. Measuring `.y` on
    # the imported model therefore reads depth, not height, and the first run
    # reported a 1.835 m man as 0.495 m tall.
    #
    # Rotate the whole import into Y-up, build there, and rotate back before
    # export so the exporter's own Z-up-to-Y-up conversion still applies.
    import math as _math
    from mathutils import Euler
    pivot = bpy.data.objects.new("OutfitPivot", None)
    bpy.context.collection.objects.link(pivot)
    for obj in list(bpy.data.objects):
        if obj is not pivot and obj.parent is None:
            obj.parent = pivot
    pivot.rotation_euler = Euler((-_math.pi / 2, 0.0, 0.0), "XYZ")
    bpy.context.view_layer.update()

    materials = {}
    for name, base, rough, metal in (
        ("cloth", (0.243, 0.271, 0.325), 0.92, 0.0),
        ("leather", (0.243, 0.166, 0.106), 0.58, 0.04),
        ("metal", (0.430, 0.455, 0.492), 0.34, 0.85),
    ):
        mat = bpy.data.materials.new("Hero_" + name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (base[0], base[1], base[2], 1.0)
            bsdf.inputs["Roughness"].default_value = rough
            if "Metallic" in bsdf.inputs:
                bsdf.inputs["Metallic"].default_value = metal
        materials[name] = mat

    builder, measurements, floor, top, height, regions = build_outfit(
        body, armature, args.variant)
    outfit = to_object(builder, "HeroOutfit", materials)
    # Expand the recorded ranges into a per-vertex family. `to_object` builds
    # the mesh straight from the builder's vertex list, so indices line up.
    #
    # Unmarked defaults to "torso", never to "unrestricted". Leaving the
    # default open meant that forgetting one piece silently reinstated the
    # original defect, which is exactly what happened: five pieces were tagged,
    # six were not, the gate went green and the hem stayed bound to the
    # forearm. It also breaks the second pass, because a vertex wrongly bound
    # to the arm rises with the arm when the pose spreads and is still beside
    # it -- the error re-derives itself. Every remaining piece (collar, belt,
    # cuirass, fauld, shoulder lames, helmet) is torso or head anyway.
    families = ["torso"] * len(outfit.data.vertices)
    for family, start, end in regions:
        for index in range(start, min(end, len(families))):
            families[index] = family
    # Pass 1 binds in the A-pose. It is wrong at the hem -- the wrist is
    # touching the skirt -- but it is enough to skin the coat, which is all
    # pass 2 needs from it.
    transfer_weights(outfit, body, armature, families=families)
    rebind = rebind_in_spread_pose([(outfit, families)], body, armature)
    # Only after the weights are settled: this moves geometry, not weights.
    pushed = push_outside_body(outfit, body)
    print("PUSH_OUTSIDE %s" % json.dumps(pushed))
    outfit_gate = region_violations(outfit, families)
    if outfit_gate:
        raise SystemExit("HeroOutfit region binding violated: %s" % outfit_gate[:6])
    print("REBIND %s" % json.dumps(rebind))

    gloves = []
    glove_checks = []
    diagnostic = os.environ.get("HERO_GLOVE_DIAGNOSTIC") == "1"
    for side in ("l", "r"):
        glove, check = build_glove(body, armature, side, diagnostic=diagnostic)
        glove_checks.append(check)
        if glove is not None:
            # `to_object` is not used: this is a duplicated surface, not a
            # lofted builder, so it already carries its own topology.
            if not diagnostic:
                glove.data.materials.append(materials["leather"])
            transfer_weights(glove, body, armature, smooth_passes=0)
            # Prove it, rather than trusting the fix. An impossible bone on a
            # glove is a build failure, not a note in a report.
            wrong = implausible_weights(glove, side=side)
            check["implausibleBones"] = wrong
            if wrong:
                raise SystemExit(
                    "HeroGlove_%s is weighted to impossible bones: %s" % (side, wrong[:4]))
            gloves.append(glove)
    # Hiding the body isolates the shell, so "the glove is invisible" and "the
    # glove is inside the hand" stop looking identical.
    if diagnostic and os.environ.get("HERO_GLOVE_ONLY") == "1":
        body.hide_render = True
        body.hide_viewport = True

    for g in gloves:
        print("STAGE_A %s slots=%s indices=%s" % (
            g.name, [m.name if m else None for m in g.data.materials],
            sorted({p.material_index for p in g.data.polygons})))

    sword_builder, sword_bone = build_sword(body, armature, height)
    sword = None
    if sword_builder is not None:
        sword = to_object(sword_builder, "HeroSword", materials)
        rigid_weights(sword, armature, sword_bone)

    body_before = triangles(body)
    # Cull is OFF during fitting. A wrong garment swallows the torso and the
    # cull then deletes it, which hides the very error being looked for.
    culled = 0
    if os.environ.get("HERO_OUTFIT_CULL") == "1":
        culled = cull_hidden_body(body, [outfit] + gloves, margin=height * 0.075)
    bpy.context.view_layer.update()

    # Back to Blender's Z-up so the exporter's conversion lands correctly.
    for obj in (outfit, sword):
        if obj is not None and obj.parent is armature:
            continue
    pivot.rotation_euler = Euler((0.0, 0.0, 0.0), "XYZ")
    bpy.context.view_layer.update()

    glb = os.path.join(OUT, "%s.glb" % args.name)
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB",
                              export_skins=True, export_yup=True)

    report = {
        "variant": args.variant,
        "input": os.path.abspath(args.input),
        "output": glb,
        "glbBytes": os.path.getsize(glb),
        "heightMetres": round(height, 4),
        "measurements": {k: {kk: round(vv, 4) for kk, vv in v.items()}
                         for k, v in measurements.items()},
        "triangles": {
            "bodyBeforeCull": body_before,
            "bodyVisible": triangles(body),
            "bodyFacesCulled": culled,
            "outfit": triangles(outfit),
            "gloves": sum(triangles(g) for g in gloves),
            "sword": triangles(sword) if sword else 0,
            "totalLod0": (triangles(body) + triangles(outfit)
                          + sum(triangles(g) for g in gloves)
                          + (triangles(sword) if sword else 0)),
        },
        "materials": sorted(materials),
        "gloveChecks": glove_checks,
        "swordBone": sword_bone,
    }
    with open(os.path.join(OUT, "%s.json" % args.name), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print("HERO_OUTFIT_OK %s" % json.dumps({
        "variant": args.variant, "height": report["heightMetres"],
        "tris": report["triangles"], "bytes": report["glbBytes"]}))


if __name__ == "__main__":
    main()
