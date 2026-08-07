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


def limb_measure(body, bone_name, armature, samples=5):
    """Radius of the limb, from vertices that bone actually owns.

    Same contamination as the torso had: sampling everything near the bone
    axis picks up the ribcage around an upper arm in an A-pose, so the radius
    came back as a torso half-width and the shoulder lames lofted as
    half-metre discs. Only vertices this bone dominates are counted.
    """
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        return 0.06
    group = body.vertex_groups.get(bone_name)
    if group is None:
        return 0.06
    a = armature.matrix_world @ bone.head
    b = armature.matrix_world @ bone.tail
    axis = (b - a)
    length = axis.length
    if length < 1e-6:
        return 0.06
    axis = axis.normalized()

    radii = []
    for vertex in body.data.vertices:
        weight = next((g.weight for g in vertex.groups if g.group == group.index), 0.0)
        if weight < 0.55:
            continue
        world = body.matrix_world @ vertex.co
        along = (world - a).dot(axis)
        if not (0.0 <= along <= length):
            continue
        radii.append(((world - a) - axis * along).length)
    if not radii:
        return 0.06
    radii.sort()
    return radii[min(len(radii) - 1, int(len(radii) * 0.90))]


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
        bone = armature.pose.bones.get(f"upperarm_{side.lower()}")
        if bone is None:
            continue
        origin = armature.matrix_world @ bone.head
        radius = limb_measure(body, f"upperarm_{side.lower()}", armature)
        for lame in range(lames):
            drop = height * 0.030 * lame
            grow = 1.0 + 0.13 * lame
            b.sweep([
                (origin.y - drop, section(n_limb, radius * 1.30 * grow, radius * 1.30 * grow,
                                          radius * 1.24 * grow, 3.0, centre_x=origin.x, centre_z=origin.z)),
                (origin.y - drop - height * 0.034, section(n_limb, radius * 1.42 * grow, radius * 1.40 * grow,
                                                           radius * 1.34 * grow, 3.0, centre_x=origin.x * 1.04, centre_z=origin.z)),
            ], "metal", lambda y: {}, cap_bottom=False, cap_top=False)
            b.sweep([
                (origin.y - drop - height * 0.034, section(n_limb, radius * 1.42 * grow, radius * 1.40 * grow, radius * 1.34 * grow, 3.0, centre_x=origin.x * 1.04, centre_z=origin.z)),
                (origin.y - drop - height * 0.042, section(n_limb, radius * 1.33 * grow, radius * 1.31 * grow, radius * 1.26 * grow, 3.0, centre_x=origin.x * 1.04, centre_z=origin.z)),
            ], "edge", lambda y: {}, cap_bottom=False, cap_top=False)

    # --- sleeves, gloves, trousers, boots ------------------------------
    for side in ("l", "r"):
        for bone_name, surface, pad, tail_pad in (
            (f"upperarm_{side}", "coat", 1.22, 1.16),
            (f"lowerarm_{side}", "coat", 1.16, 1.10),
            (f"hand_{side}", "leather", 1.16, 1.10),
            (f"thigh_{side}", "coat", 1.14, 1.10),
            (f"calf_{side}", "coat", 1.12, 1.16),
            (f"foot_{side}", "leather", 1.22, 1.30),
        ):
            bone = armature.pose.bones.get(bone_name)
            if bone is None:
                continue
            a = armature.matrix_world @ bone.head
            c = armature.matrix_world @ bone.tail
            radius = max(0.03, limb_measure(body, bone_name, armature))
            steps = 4
            rings = []
            for i in range(steps + 1):
                t = i / steps
                point = a.lerp(c, t)
                grow = pad + (tail_pad - pad) * t
                rings.append((point.y, section(n_limb, radius * grow, radius * grow,
                                               radius * grow, 2.8, centre_x=point.x, centre_z=point.z)))
            rings.sort(key=lambda r: r[0])
            b.sweep(rings, surface, lambda y: {}, cap_bottom=False, cap_top=False)

    # --- helmet: open face --------------------------------------------
    head = armature.pose.bones.get("head")
    if head is not None:
        origin = armature.matrix_world @ head.head
        crown = top
        skull = max(m["collar"]["halfWidth"], 0.09)
        for i, (frac, grow) in enumerate(((0.16, 1.14), (0.42, 1.16), (0.70, 1.06), (0.92, 0.72))):
            pass
        rings = []
        for frac, grow in ((0.14, 1.16), (0.42, 1.18), (0.70, 1.08), (0.94, 0.66)):
            y = origin.y + (crown - origin.y) * frac
            rings.append((y, section(n, skull * grow, skull * grow * 1.02, skull * grow, 2.9,
                                     centre_x=origin.x, centre_z=origin.z)))
        b.sweep(rings, "metal", lambda y: {}, cap_bottom=False)
        brim = rings[0][0]
        b.sweep([
            (brim, section(n, skull * 1.16, skull * 1.18, skull * 1.16, 2.9, centre_x=origin.x, centre_z=origin.z)),
            (brim - (crown - origin.y) * 0.05, section(n, skull * 1.26, skull * 1.28, skull * 1.26, 3.0, centre_x=origin.x, centre_z=origin.z)),
            (brim - (crown - origin.y) * 0.09, section(n, skull * 1.10, skull * 1.12, skull * 1.10, 2.9, centre_x=origin.x, centre_z=origin.z)),
        ], "edge", lambda y: {}, cap_bottom=False, cap_top=False)
        # Cheek guards, framing the face rather than covering it.
        for sign in (-1, 1):
            b.prism([
                (origin.x + sign * skull * 0.92, brim),
                (origin.x + sign * skull * 1.24, brim - (crown - origin.y) * 0.06),
                (origin.x + sign * skull * 1.16, brim - (crown - origin.y) * 0.44),
                (origin.x + sign * skull * 0.84, brim - (crown - origin.y) * 0.38),
            ], origin.z + skull * 0.20, skull * 0.62, "metal", {})

    return b, m, floor, top, height


def build_sword(armature, height):
    """A sword the hand actually holds, rigid to hand_r.

    Built along the hand bone's own axis and weighted 100% to it, which is the
    only construction where the blade cannot drift away from the fingers.
    """
    bone = armature.pose.bones.get("hand_r")
    if bone is None:
        return None, None
    b = MeshBuilder(0)
    origin = armature.matrix_world @ bone.head
    direction = ((armature.matrix_world @ bone.tail) - origin)
    forward = direction.normalized() if direction.length > 1e-6 else Vector((0, -1, 0))
    scale = height * 0.55

    def at(t):
        return origin + forward * (scale * t)

    def ring(t, half, depth, expo=2.4):
        point = at(t)
        return (point.y, section(10, half, depth, depth, expo,
                                 centre_x=point.x, centre_z=point.z))

    # The grip runs back through the closed fist, the guard sits at the
    # knuckles, and the blade goes forward from there.
    b.sweep([ring(-0.20, 0.016, 0.016), ring(-0.02, 0.015, 0.015)], "leather", lambda y: {})
    b.sweep([ring(-0.25, 0.026, 0.026, 2.2), ring(-0.20, 0.018, 0.018)], "metal", lambda y: {})
    b.sweep([ring(0.00, 0.052, 0.020, 3.0), ring(0.05, 0.040, 0.016, 3.0)], "metal", lambda y: {})
    b.sweep([
        ring(0.06, 0.026, 0.010, 3.2), ring(0.45, 0.024, 0.009, 3.2),
        ring(0.88, 0.019, 0.007, 3.0), ring(1.02, 0.004, 0.003, 2.4),
    ], "edge", lambda y: {})
    return b, "hand_r"


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


def transfer_weights(garment, body, armature):
    """Copy each garment vertex's weights from the nearest body vertex.

    A coat has to follow the shoulder underneath it, and nearest-point
    transfer is what makes that true for a shape nobody hand-weighted.
    """
    from mathutils.kdtree import KDTree

    groups = {g.index: g.name for g in body.vertex_groups}
    for name in sorted(set(groups.values())):
        garment.vertex_groups.new(name=name)

    points = [body.matrix_world @ v.co for v in body.data.vertices]
    kd = KDTree(len(points))
    for index, point in enumerate(points):
        kd.insert(point, index)
    kd.balance()

    for index, vertex in enumerate(garment.data.vertices):
        world = garment.matrix_world @ vertex.co
        _co, nearest, _dist = kd.find(world)
        source = body.data.vertices[nearest]
        usable = [(groups.get(g.group), g.weight) for g in source.groups
                  if groups.get(g.group) and g.weight > 1e-4]
        total = sum(w for _n, w in usable) or 1.0
        for name, weight in usable:
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
        ("leather", (0.372, 0.263, 0.171), 0.62, 0.04),
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

    builder, measurements, floor, top, height = build_outfit(body, armature, args.variant)
    outfit = to_object(builder, "HeroOutfit", materials)
    transfer_weights(outfit, body, armature)

    sword_builder, sword_bone = build_sword(armature, height)
    sword = None
    if sword_builder is not None:
        sword = to_object(sword_builder, "HeroSword", materials)
        rigid_weights(sword, armature, sword_bone)

    body_before = triangles(body)
    # Cull is OFF during fitting. A wrong garment swallows the torso and the
    # cull then deletes it, which hides the very error being looked for.
    culled = 0
    if os.environ.get("HERO_OUTFIT_CULL") == "1":
        culled = cull_hidden_body(body, [outfit], margin=height * 0.075)
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
            "sword": triangles(sword) if sword else 0,
            "totalLod0": triangles(body) + triangles(outfit) + (triangles(sword) if sword else 0),
        },
        "materials": sorted(materials),
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
