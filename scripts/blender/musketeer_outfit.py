"""The Musketeer's kit: the ranged line, and the only one that is not armoured.

Fourth character through the shared pipeline, and by now the silhouette problem
is the whole problem -- it has to separate from THREE existing reads, not one.

    Hero      1.83 m, lean, small open cap, long coat flaring below the knee,
              sword hanging vertically.
    Warrior   1.71 m, thick-set, deep round hood, jacket cut at the hip, an ice
              axe hanging at the side.
    Shield    1.68 m, broadest, hard brimmed helm, squared pauldrons, straight
              knee-length column, a pale slab filling one side.
    Musketeer 1.80 m and the NARROWEST, a tall crowned cap, a long thin coat,
              and a musket carried as a LONG DIAGONAL across the body.

The oppositions, in order of how far they carry:

    a long diagonal line   -- nobody else has one. The Hero's sword hangs
                              vertical, the Warrior's axe hangs, the Shield is a
                              rectangle. A musket at shoulder-arms cuts across
                              the whole figure and is legible before any detail.
    tall and narrow        -- the exact opposite pole from the Shield, so the
                              two cannot be confused at any distance.
    a crossed bandolier    -- a second diagonal, on a chest where the other
                              three have a plate, a tabard or nothing.
    warm against cold      -- navy-and-steel, olive-and-oxide and grey-and-iron
                              are all cool. This one is brown leather and brass.

Deliberately NOT: a musketeer costume drama. No plumes, no lace, no tricorn
tricks. It is a soldier in a long coat with a bandolier and a firearm, which is
what the frost-apocalypse framing supports.
"""
import json
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import hero_outfit
from authoring import MeshBuilder, section
from hero_outfit import (limb_profile, limb_rings, measure, tuck_front,
                         head_extent, face_direction)

# Warm, and the only warm kit in the roster. Same two-material vertex-tint
# scheme the Warrior proved and the Shield reused: one cloth slot carrying
# every soft colour per-face in COLOR_0, one metal slot, and the body's skin
# takes the third of three.
#
# VALUE SEPARATION IS THE POINT, NOT HUE. The first pass had coat, leather and
# gunstock within 0.07 of each other, and the result was a brown cutout: the
# musket's stock vanished into the coat it crosses and the only part of the
# weapon still legible was the barrel, which alone is a stick. Warm palette,
# but three clearly separated values -- dark boots and straps, mid coat, light
# stock -- with the pale bandolier above all of them.
SURFACES_OVERRIDE = {
    "coat":    (0.150, 0.108, 0.074),   # oiled brown canvas, darkened
    "leather": (0.086, 0.062, 0.044),   # near-black strapping and boots
    "wood":    (0.404, 0.290, 0.166),   # the gunstock, and nothing else
    # The barrel, and the one surface in a warm kit that is deliberately cold.
    # It rides the vertex-tinted cloth slot rather than the metal one because
    # the metal slot is brass: a brass barrel against a wood stock is 0.404 next
    # to 0.322, the two halves of the weapon collapse into one tan value, and
    # the musket goes back to reading as a pole. Dark barrel, light stock, brass
    # only on the bands and the lock -- that contrast IS the firearm read, and
    # losing the metallic response on a 13 mm tube costs nothing at any distance
    # this asset is seen from.
    "barrel":  (0.062, 0.064, 0.072),
    "fur":     (0.330, 0.286, 0.232),
    "metal":   (0.322, 0.268, 0.150),   # brass, not steel
    "edge":    (0.470, 0.420, 0.268),
    # The bandolier and its cartridge blocks. Pale bone against the brown coat,
    # so the diagonal reads as a line rather than as texture.
    "tabard":  (0.640, 0.598, 0.502),
    "hair":    (0.118, 0.094, 0.071),
}

MATERIAL_OF_OVERRIDE = {
    "tabard": "cloth",
    "leather": "cloth",
    "wood": "cloth",
    "barrel": "cloth",
    "fur": "cloth",
    "edge": "metal",
}

VERTEX_TINTED = {"cloth"}

MATERIAL_TABLE = (
    ("cloth", (1.0, 1.0, 1.0), 0.92, 0.0),
    ("metal", (0.322, 0.268, 0.150), 0.52, 0.72),
)


def build_glove(body, armature, side, thickness_ratio=0.16, diagnostic=False):
    """A close leather glove, swept, and it REPLACES the hand.

    Thinner than the Warrior's mitten or the Shield's gauntlet -- this one
    loads a firearm -- but built the same way and for the same measured reason:
    a round section on the forearm's axis cannot contain curled fingers at any
    radius that is not a boxing glove, so the hand mesh goes by skin weight
    rather than being fitted around.
    """
    digits = tuple("%s_%02d_%s" % (d, j, side) for d in
                   ("thumb", "index", "middle", "ring", "pinky") for j in (1, 2, 3))
    data = limb_profile(body, "hand_%s" % side, armature,
                        extra_bones=digits, axis_bone="lowerarm_%s" % side)
    if data is None:
        return None, {"side": side, "built": False, "reason": "no hand profile"}
    #
    # AND IT HAS TO ACTUALLY BE CLOSE, not merely described as close. Inherited
    # at 1.42 wide with 0.30 of over-tail, this glove reached about 0.19 m past
    # the wrist -- a mitten with a long point -- and every contact the
    # carried-item validator reported against the musket, in all seven clips,
    # was the stock passing through it between 0.16 and 0.19 m from the grip.
    # Not the coat, not the leg, not the head: the glove. That is a hand
    # holding a firearm, so the oversized geometry is what shrinks, not the
    # weapon and not the validator's grip radius. Every finger is still covered
    # -- the body's own hand is deleted underneath it.
    b = MeshBuilder(0)
    b.sweep_axis(limb_rings(data, 8, 1.30, 1.20, 2.5,
                            over_head=0.06, over_tail=0.10, over_taper=0.50),
                 "leather", lambda t: {}, data["start"], data["end"],
                 cap_start=True, cap_end=True)
    mesh = bpy.data.meshes.new("HeroGlove_%s" % side)
    mesh.from_pydata(b.vertices, [], b.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # THIS kit's leather. `import hero_outfit` yields a second module object
    # whose SURFACES never receives the kit overrides.
    tint = SURFACES_OVERRIDE["leather"]
    colours = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR",
                                        domain="CORNER")
    colours.data.foreach_set(
        "color", [tint[0], tint[1], tint[2], 1.0] * len(mesh.loops))
    hero_outfit.add_cylindrical_uvs(mesh)
    obj = bpy.data.objects.new("HeroGlove_%s" % side, mesh)
    bpy.context.collection.objects.link(obj)
    removed = cull_hand(body, side, digits)
    return obj, {"side": side, "built": True, "triangles": len(b.faces),
                 "handFacesCulled": removed}


def cull_hand(body, side, digits):
    """Delete the body's own hand: the glove is the hand now."""
    names = {"hand_%s" % side} | set(digits)
    groups = {g.index for g in body.vertex_groups if g.name in names}
    if not groups:
        return 0
    doomed_verts = set()
    for vertex in body.data.vertices:
        total = sum(g.weight for g in vertex.groups)
        mine = sum(g.weight for g in vertex.groups if g.group in groups)
        if total > 1e-6 and mine / total > 0.5:
            doomed_verts.add(vertex.index)
    mesh = bmesh.new()
    mesh.from_mesh(body.data)
    mesh.verts.ensure_lookup_table()
    doomed = [f for f in mesh.faces if all(v.index in doomed_verts for v in f.verts)]
    removed = len(doomed)
    bmesh.ops.delete(mesh, geom=doomed, context="FACES")
    bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if not v.link_faces],
                     context="VERTS")
    mesh.to_mesh(body.data)
    mesh.free()
    body.data.update()
    return removed


def build_sword(body, armature, height):
    """A musket, carried at shoulder-arms, rigid to the trigger hand.

    THE TWO-HANDED PROBLEM, AND WHY THIS CARRY.

    `rigid_weights` puts a carried object entirely on ONE bone. That is what
    stops it deforming, and it means a firearm cannot be gripped by both hands:
    the left hand would have to be posed onto the fore-stock, and these clips
    are retargeted generic humanoid animations that know nothing about a
    weapon. Splitting the weights between two hands is the one thing the brief
    rules out, because it turns a rigid object into a rubber one.

    So the carry is the one that is genuinely single-handed. The musket rests
    back along the shoulder with the right hand at the small of the stock and
    the butt low, which is how a soldier carries a long arm when not firing,
    and which puts the barrel across the figure as the long diagonal the
    silhouette is built around.

    THE TIP. The adapter's default rule finds the point furthest OFF the
    weapon's long axis, which is an axe head and, on a firearm, the trigger
    guard. This kit declares `tipRule = "far"` so `axe_tip` lands on the
    muzzle -- the fourth value in the returned tuple.
    """
    # THE LEFT HAND, AND IT IS NOT A STYLE CHOICE.
    #
    # Every collision this weapon ever produced came from exactly one clip.
    # Measured travel of the hand bone over each clip's full range, left/right:
    #
    #     Idle 0.008 / 0.008   Walk 0.187 / 0.177   Run  0.346 / 0.341
    #     Hit  0.106 / 0.061   Death 0.406 / 0.406  Ranged 0.309 / 0.320
    #     MeleeAttack ................ 0.117 LEFT, 0.753 RIGHT
    #
    # Six of the seven are symmetric and all six were already clean. The
    # seventh is a right-handed swing that drags anything rigid to hand_r
    # through the thigh, the skull and the left arm in turn -- which is why
    # three rounds of retilting the barrel only moved the contact from one body
    # part to the next instead of removing it. On the left hand the same weapon
    # travels 0.117 m in that clip and the problem does not arise.
    #
    # It is also the better carry to have been forced into: the support hand
    # holds the musket, the right hand is free for the butt-stroke the melee
    # clip actually plays, and the diagonal mirrors the three characters who
    # all carry on the right.
    bones = armature.data.bones
    hand = bones.get("hand_l") or bones.get("hand.L")
    lower = bones.get("lowerarm_l") or bones.get("lower_arm.L")
    if hand is None or lower is None:
        return None, None

    grip = armature.matrix_world @ hand.head_local
    # DOWN IS -Y HERE: the import is parented to a pivot rotated -90 about X so
    # the builder can stack rings along +Y.
    down = Vector((0.0, -1.0, 0.0))
    up = -down
    outward = Vector((grip.x, 0.0, grip.z))
    outward = outward.normalized() if outward.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    forward = Vector((0.0, 0.0, 1.0))

    # The barrel axis: up and FORWARD, tilted out from the body. Up-and-back
    # would bury the muzzle in the shoulder; up-and-forward keeps the whole
    # length in open air and gives the diagonal something to cross.
    # THE OUTWARD COMPONENT CUTS BOTH WAYS, and the first pass only counted one
    # of them. `along` runs butt-to-muzzle, so tilting the MUZZLE outboard
    # tilts the BUTT inboard by the same angle -- at 0.46 the butt plate sat
    # 0.068 m off the centreline, which is inside the right thigh before any
    # animation plays, and the Run clip drove it 0.096 m in. Measured, not
    # guessed: the barrel never touched anything at any frame, in any clip.
    #
    # So the muzzle keeps only enough outward tilt to stay off the shoulder,
    # and the butt overhang is cut from 0.150 to 0.118 of height. It stays well
    # clear of the validator's 0.16 m grip exclusion -- shortening it under that
    # radius would have made the contacts vanish from the report without moving
    # the geometry out of the leg, which is passing the test rather than the
    # asset.
    #
    # AND TILTING IT UPRIGHT TRADES THE THIGH FOR THE HEAD. Measured, at
    # outward 0.05: the leg cleared completely and MeleeAttack put 125 contacts
    # 0.069 m into the skull, because a near-vertical weapon rigid to a rising
    # hand sweeps straight through it. Outward tilt protects the head and
    # spears the thigh; upright protects the thigh and spears the head. There is
    # no value of that one number that clears both.
    #
    # So the tilt goes FORWARD instead of outward. With almost no lateral
    # component the whole weapon stays in the sagittal plane through the hand --
    # 0.19 m off the centreline, outboard of both the thigh and the skull -- and
    # the forward lean puts the muzzle 0.75 m in front of the chest where the
    # arm can raise under it. It also stops being a shoulder-arms carry and
    # becomes an advance, which is the better read for a ranged unit anyway.
    along = (up * 0.74 + forward * 0.58 + outward * 0.16)
    #
    # ACROSS THE PALM, NOT DOWN THE FINGERS -- and this is why the Warrior's
    # axe and the Shield's hammer clear their mittens while this did not.
    #
    # A hand is about 0.19 m from wrist to fingertip, so the glove necessarily
    # reaches past the validator's 0.16 m grip exclusion. Their hafts sit
    # roughly PERPENDICULAR to the forearm, cross the palm and are out of the
    # glove within a few centimetres. The musket's butt pointed down-and-back,
    # which in an A-pose is almost exactly along the forearm, so the stock ran
    # the full length of the hand INSIDE the leather -- 367 contacts across
    # seven clips, every one of them the glove and not one of them the body.
    #
    # Removing the forearm component keeps the intended direction as closely as
    # a perpendicular can and puts the stock across the palm, which is also how
    # a long arm is actually carried one-handed.
    forearm = grip - (armature.matrix_world @ lower.head_local)
    forearm = forearm.normalized() if forearm.length > 1e-6 else up
    along = along - forearm * along.dot(forearm)
    # Then swing it OUTBOARD within that plane. Perpendicularity fixes the
    # glove but says nothing about where in the perpendicular circle the
    # weapon points, and the projection landed it 33 degrees forward with only
    # 0.095 of lateral -- which is a genuine lean that the front camera
    # foreshortens into a vertical rod beside the head. Rotating about the
    # forearm keeps the dot product at zero by construction while trading depth
    # for width, and 25 degrees puts the muzzle 0.74 m off the centreline: a
    # 28-degree diagonal on screen, and off the face.
    along = (Matrix.Rotation(-0.36, 4, forearm) @ along)
    along = along.normalized() if along.length > 1e-6 else up

    butt = grip - along * (height * 0.101)
    muzzle = grip + along * (height * 0.585)

    b = MeshBuilder(0)
    # Barrel: a long octagonal tube, thinning toward the muzzle.
    b.sweep_axis([
        (0.32, section(8, 0.016, 0.016, 0.016, 3.2)),
        (0.62, section(8, 0.014, 0.014, 0.014, 3.2)),
        (0.97, section(8, 0.013, 0.013, 0.013, 3.2)),
        (1.00, section(8, 0.015, 0.015, 0.015, 3.2)),
    ], "barrel", lambda t: {}, butt, muzzle, cap_start=False, cap_end=True)
    # The stock: ONE piece of wood from butt plate to fore-end, which is what a
    # musket actually is and what the first pass got wrong by building the butt
    # and the fore-stock as two separate rounded tubes -- they read as an oar
    # blade with a pole through it.
    #
    # The profile is asymmetric ON PURPOSE. `section(sides, halfWidth, front,
    # back, exp)` gives thickness in halfWidth and the comb-to-toe depth in
    # front/back, so a stock is THIN across and TALL fore-aft: 0.024 against
    # 0.058 at the plate. Rounding both to the same number is how the oar
    # happened. The waist at t = 0.19 is the wrist of the stock, and the hand
    # sits just past it at t = 0.21.
    b.sweep_axis([
        (0.000, section(6, 0.023, 0.054, 0.029, 2.4)),   # butt plate
        (0.038, section(6, 0.025, 0.058, 0.032, 2.5)),   # heel and toe
        (0.098, section(6, 0.025, 0.045, 0.030, 2.7)),   # comb
        (0.168, section(6, 0.023, 0.029, 0.025, 3.0)),   # wrist, at the hand
        (0.240, section(6, 0.025, 0.034, 0.027, 3.0)),   # over the lock
        (0.320, section(6, 0.023, 0.029, 0.023, 2.8)),
        (0.545, section(6, 0.020, 0.024, 0.020, 2.8)),
        (0.710, section(6, 0.016, 0.020, 0.016, 2.8)),   # fore-end cap
    ], "wood", lambda t: {}, butt, muzzle, cap_start=True, cap_end=True)
    # Lock plate and trigger guard, standing off the side. Small, and the
    # reason the default tip rule cannot be used on this weapon.
    side_dir = along.cross(forward)
    side_dir = side_dir.normalized() if side_dir.length > 1e-6 else outward
    lock_at = butt + (muzzle - butt) * 0.235
    b.sweep_axis([
        (0.00, section(4, 0.012, 0.026, 0.022, 3.4)),
        (1.00, section(4, 0.008, 0.020, 0.017, 3.2)),
    ], "metal", lambda t: {}, lock_at, lock_at + side_dir * (height * 0.020),
        cap_start=False, cap_end=True)
    b.sweep_axis([
        (0.00, section(4, 0.010, 0.014, 0.012, 3.0)),
        (1.00, section(4, 0.007, 0.011, 0.010, 3.0)),
    ], "metal", lambda t: {}, lock_at - along * (height * 0.012),
        lock_at - along * (height * 0.012) - Vector((0.0, height * 0.026, 0.0)),
        cap_start=False, cap_end=True)
    # Barrel bands, so the wood and steel read as assembled rather than moulded.
    for t0 in (0.44, 0.60):
        b.sweep_axis([
            (t0, section(8, 0.020, 0.022, 0.020, 3.4)),
            (t0 + 0.020, section(8, 0.020, 0.022, 0.020, 3.4)),
        ], "metal", lambda t: {}, butt, muzzle, cap_start=False, cap_end=False)

    return [(b, "hand_l", muzzle, "far")]


def build_outfit(body, armature, variant):
    """Loft the Musketeer's kit around the measured body."""
    b = MeshBuilder(0)
    n = 20
    n_limb = 12

    H = {
        "hem": 0.24, "seat": 0.487, "thighTop": 0.52, "hip": 0.56, "waist": 0.62,
        "lowRib": 0.68, "chest": 0.74, "upperChest": 0.79,
        "shoulder": 0.83, "neck": 0.86, "collar": 0.875,
        "knee": 0.28, "calf": 0.18, "ankle": 0.08,
    }
    m, floor, top, height = measure(body, H)
    regions = []

    def ring(key, pad, exp=2.7, dy=0.0, scale=1.0):
        d = m[key]
        return (d["y"] + dy, section(
            n, (d["halfWidth"] + pad) * scale, (d["front"] + pad) * scale,
            (d["back"] + pad) * scale, exp))

    # --- a long, narrow coat --------------------------------------------
    #
    # Longer than any of the other three -- to mid-calf -- and the thinnest
    # padding in the roster. The Hero's coat is long and FLARES; the Shield's
    # is straight but stops at the knee and is 0.10 thick. This one is long,
    # straight and close, which with the taller narrower body is the "not
    # armoured, stands at the back" read.
    #
    # THE EXPONENT MATTERS MORE THAN THE PAD DOWN HERE. `section` is a
    # superellipse fitted to the measured half-width and depth, so a low
    # exponent pulls the surface IN at the diagonals -- and the hip is exactly
    # where the cross-section is two thighs side by side, widest on the
    # diagonal and not on either axis. At 2.6 the skirt pinched inside the body
    # at 45 degrees and a patch of bare hip came through a coat that measures as
    # 48 mm of clearance everywhere the ring was sampled.
    coat_start = len(b.vertices)
    b.sweep([
        ring("hem", 0.068, 3.0),
        # A ring ON THE SEAT. Between hem and thighTop the skirt was a straight
        # loft, and a straight loft between two rings cuts the corner off
        # whatever bulges between them -- 42 vertices of bare backside at
        # z 0.858 to 0.895, which is 0.477 to 0.497 of height, almost exactly
        # half way. Sampled there, the coat follows the body instead of
        # chording past it.
        ring("seat", 0.092, 3.2),
        ring("thighTop", 0.062, 3.1),
        ring("hip", 0.056, 3.0),
        ring("waist", 0.044, 2.9),
        ring("lowRib", 0.044, 2.9),
        ring("chest", 0.048, 3.0),
        ring("upperChest", 0.046, 3.0),
        ring("shoulder", 0.042, 2.8),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("skirt", coat_start, coat_start + 3 * n))
    regions.append(("torso", coat_start + 3 * n, len(b.vertices)))

    # --- the bandolier ---------------------------------------------------
    #
    # The second diagonal, and the one piece of kit nobody else has. Right
    # shoulder to left hip, with cartridge blocks along it. Tagged "tabard" so
    # it takes the pale tint off the same cloth slot -- a light line on a dark
    # coat, which is what makes it read at distance rather than as trim.
    #
    # IT HAS TO SIT ON THE COAT, NOT IN THE BODY. The first pass anchored the
    # strap at `front * 0.30` -- thirty per cent of the way from the body's
    # centreline to its own skin, which is inside the ribcage, and then the coat
    # was lofted 0.048 outside that. The strap was built, exported and
    # completely invisible. Every offset here is measured from the COAT's outer
    # surface: the same padded value the coat's chest ring uses, plus the
    # strap's own half-depth so it stands proud instead of z-fighting.
    strap_start = len(b.vertices)
    surface = m["chest"]["front"] + 0.048 + 0.018
    shoulder_r = Vector((-m["shoulder"]["halfWidth"] * 0.64,
                         m["shoulder"]["y"] - height * 0.006, surface))
    # It runs PAST the hip, not to it. Stopping on the hip ring left the strap
    # ending in mid-skirt as a blunt pale plank; carried on and outboard it goes
    # round the body the way a belt does, and the taper at both ends keeps the
    # silhouette a line rather than a strip of paper laid on the chest.
    hip_l = Vector((m["hip"]["halfWidth"] * 1.02,
                    m["hip"]["y"] - height * 0.052, surface * 0.62))
    b.sweep_axis([
        (0.00, section(6, 0.024, 0.014, 0.012, 3.4)),
        (0.10, section(6, 0.032, 0.018, 0.015, 3.4)),
        (0.50, section(6, 0.036, 0.020, 0.015, 3.4)),
        (0.88, section(6, 0.032, 0.018, 0.015, 3.4)),
        (1.00, section(6, 0.022, 0.013, 0.011, 3.4)),
    ], "tabard", lambda t: {}, shoulder_r, hip_l, cap_start=True, cap_end=True)
    # Cartridge blocks: four along the strap, near-black leather on the pale
    # line. The alternation is what reads as a loaded bandolier rather than a
    # sash, and it only works because the two values are far apart.
    for t0 in (0.22, 0.38, 0.54, 0.70):
        at = shoulder_r + (hip_l - shoulder_r) * t0
        at = Vector((at.x, at.y, at.z + 0.016))
        b.box(at, (0.030, 0.046, 0.034), "leather", {},
              rotate_z=0.0, taper=0.88)
    regions.append(("torso", strap_start, len(b.vertices)))

    # --- belt -------------------------------------------------------------
    belt_start = len(b.vertices)
    d = m["waist"]
    b.sweep([
        (d["y"] - height * 0.016, section(n, d["halfWidth"] + 0.052,
                                          d["front"] + 0.052, d["back"] + 0.052, 3.0)),
        (d["y"] + height * 0.016, section(n, d["halfWidth"] + 0.054,
                                          d["front"] + 0.054, d["back"] + 0.054, 3.0)),
    ], "leather", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", belt_start, len(b.vertices)))

    # --- limbs -------------------------------------------------------------
    for side in ("l", "r"):
        for bone_name, surface, pad, tail_pad, exp, extra, axis_bone, over_head, over_tail in (
            # NARROW IS THE WHOLE IDENTITY, and the first pass lost it here
            # rather than in the coat. An upper arm padded 1.24 with 0.26 of
            # over-head builds a cap of cloth standing off the shoulder, which
            # is a PAULDRON; a thigh at 1.22 under a coat skirt reads as a
            # TASSET. Both are the Shield's vocabulary, and in brown the whole
            # figure came back as a recoloured Warrior. Close sleeves, close
            # legs, and let the long coat be the only wide thing.
            # 0.06 of over-head was too far the other way: it killed the
            # pauldron read and opened 24 vertices of bare deltoid and
            # collarbone at z 1.42-1.43 where the sleeve no longer met the
            # coat's shoulder ring. 0.13 closes it and is still half what the
            # first pass had.
            #
            # AND THEN BACK OUT BY A FEW MILLIMETRES. 1.13 of a 0.05 m arm is
            # 6 mm of clearance and the decimator eats that: the live LOD
            # comparison has LOD0 clean and LOD1/LOD2 with skin coming through
            # at the shoulders, upper arms and thighs, where the merged Warrior
            # and Shield -- looser sleeves -- show only a sliver at the ankle.
            # The cost is 3 mm a side and it is still well short of 1.24.
            (f"upperarm_{side}", "coat", 1.20, 1.16, 2.8, (), None, 0.13, 0.14),
            (f"lowerarm_{side}", "coat", 1.21, 1.18, 2.8, (), None, 0.14, 0.08),
            (f"thigh_{side}", "coat", 1.19, 1.12, 2.9, (), None, 0.12, 0.20),
            (f"calf_{side}", "leather", 1.68, 0.90, 2.9, (), None, 0.44, 0.12),
            # Trouser tucks INTO the boot; the boot's ankle ring stays near 1,
            # because widening it scales the measured BACK depth and the back
            # of the ankle is the heel -- that is how the Warrior grew a 106 mm
            # flipper before it was measured.
            (f"foot_{side}", "leather", 1.12, 1.76, 2.4, (f"ball_{side}",),
             f"foot_{side}", 0.08, 0.18),
        ):
            data = limb_profile(body, bone_name, armature,
                                extra_bones=extra, axis_bone=axis_bone)
            if data is None:
                continue
            closed = bone_name.startswith("foot_")
            cap_start = bone_name.startswith("foot_")
            mark = len(b.vertices)
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

    # --- a tall crowned cap -----------------------------------------------
    #
    # Vertical emphasis, which none of the other three has: the Hero's cap is
    # small and close, the Warrior's hood is round and wide, the Shield's helm
    # is a flat disc with a wide brim. This one is tall with a narrow turned-up
    # band, so at forty pixels the head is a column rather than a dome.
    #
    # It starts at the brow, not lower. Reaching down over the face fights
    # `sink_face_window` for the same space -- on the Shield that produced a
    # helm swallowing the head with a flange across the eyes -- and the neck is
    # the collar's job.
    head_data = limb_profile(body, "head", armature, slices=9)
    if head_data is not None:
        start, end = head_data["start"], head_data["end"]
        anat = head_extent(body, start, end) or (lambda t: t)
        sign = (1.0 if face_direction(body, head_data).dot(head_data["front"]) > 0
                else -1.0)
        front_edge, fade = 0.66, 0.12
        shell = []
        for entry in head_data["slices"]:
            t = entry["t"]
            a = anat(t)
            if a < 0.54:
                continue
            # The turned-up band at the bottom, then a near-straight crown.
            if a < 0.62:
                grow = 1.30
            elif a < 0.90:
                grow = 1.12
            else:
                grow = 1.10
            offset = entry["centre"] - (start + (end - start) * t)
            centre_x = offset.dot(head_data["side"])
            centre_z = offset.dot(head_data["front"])
            width = entry["halfWidth"] * grow
            depth = entry["front"] * grow
            ring_pts = section(n, width, depth, entry["back"] * grow * 1.28, 3.0,
                               centre_x=centre_x, centre_z=centre_z)
            sink = max(0.0, min(1.0, (front_edge - a) / fade))
            shell.append((t, tuck_front(ring_pts, centre_x, centre_z, depth, width,
                                        (1.0 - 0.48 / 1.12) * sink, reach=0.95,
                                        face_sign=sign)))
        # A neck drape at the BACK, for the reason the Shield had to learn: a
        # head covering that starts at the brow leaves the nape bare, the
        # 380-pixel orbit renders do not show it, and it cannot be closed from
        # the collar because raising the collar's front puts cloth above the
        # chin and the cull then deletes the jaw.
        if shell:
            base = head_data["slices"][0]
            offset = base["centre"] - (start + (end - start) * base["t"])
            bx = offset.dot(head_data["side"])
            bz = offset.dot(head_data["front"])
            drape = []
            # FOUR RINGS, AND FURTHER DOWN. Three stopping at -0.58 left a
            # 370-vertex band of bare nape between z 1.548 and 1.634 -- the
            # Shield's defect, in the same place, found the same way: the
            # 380-pixel orbit renders showed nothing and the live inspection
            # showed a neck. The lowest ring now reaches past where the collar
            # arrives, so the two overlap instead of meeting.
            # FURTHER STILL, because lowering the collar to clear the chin
            # lowered its BACK by the same amount -- one ring height serves
            # both -- and the nape went from 370 exposed vertices to 449. The
            # front of the collar and the back of the neck want opposite
            # things, so the drape is what closes the back and the collar is
            # free to sit under the jaw where it belongs.
            for extra_t, grow, back in ((shell[0][0] - 1.70, 1.00, 1.98),
                                        (shell[0][0] - 1.28, 1.03, 1.94),
                                        (shell[0][0] - 0.86, 1.07, 1.86),
                                        (shell[0][0] - 0.44, 1.12, 1.66)):
                w = base["halfWidth"] * grow
                d = base["front"] * grow
                pts = section(n, w, d, base["back"] * grow * back, 3.0,
                              centre_x=bx, centre_z=bz)
                drape.append((extra_t,
                              tuck_front(pts, bx, bz, d, w, 1.0 - 0.48 / 1.12,
                                         reach=0.95, face_sign=sign)))
            shell = drape + shell
        if len(shell) >= 2:
            last = head_data["slices"][-1]
            offset = last["centre"] - (start + (end - start) * last["t"])
            cx = offset.dot(head_data["side"])
            cz = offset.dot(head_data["front"])
            # The head BONE stops short of the skull, so capping at t = 1 closes
            # the shell below the crown and the scalp comes through. Tall, and
            # closed well above.
            # TALL is the point -- a column at forty pixels, against the
            # Warrior's dome and the Shield's disc. The first pass closed the
            # crown at 1.18 and came back a pillbox.
            for extra_t, shrink in ((1.10, 1.04), (1.22, 1.02), (1.33, 0.94),
                                    (1.38, 0.48)):
                cw = last["halfWidth"] * 1.12 * shrink
                cdp = last["front"] * 1.12 * shrink
                shell.append((extra_t, section(
                    n, cw, cdp, last["back"] * 1.12 * shrink, 3.0,
                    centre_x=cx, centre_z=cz)))
            mark = len(b.vertices)
            b.sweep_axis(shell, "coat", lambda t: {}, start, end,
                         cap_start=False, cap_end=True)
            regions.append(("helmet", mark, len(b.vertices)))

    # --- collar ------------------------------------------------------------
    #
    # Closes the neck at the sides and back. The BACK pad is the largest and
    # the top ring's FRONT pad is negative: cloth reaching forward under the
    # chin is cloth ABOVE the chin, and `cull_hidden_body` then deletes the
    # jaw. That cost the Warrior two rounds and the Shield one.
    head_group = body.vertex_groups.get("head")
    chin = min([(body.matrix_world @ v.co).y for v in body.data.vertices
                if any(g.group == head_group.index and g.weight > 0.5
                       for g in v.groups)] or [0.0]) if head_group else 0.0
    # BELOW THE CHIN, NOT LEVEL WITH IT. The comment above says exactly what
    # goes wrong and it happened anyway: at `chin + 0.022` the collar's top
    # ring sat above the jaw, `cull_hidden_body` deleted the faces under it,
    # and the live inspection shows the mouth cut off by a stepped cloth edge
    # with the chin missing entirely. Measured: collar front reaching z 1.597
    # against a chin at 1.484. The clearance is now negative on purpose.
    throat = (min(m["collar"]["y"] + height * 0.062, chin - 0.026)
              if chin else m["collar"]["y"] + height * 0.044)
    throat = max(throat, m["collar"]["y"] + height * 0.010)
    gorget = m["collar"]["y"] + (throat - m["collar"]["y"]) * 0.55

    def at(y, pad, front_pad, back_pad, exp):
        d = m["collar"]
        return (y, section(n, d["halfWidth"] + pad, d["front"] + front_pad,
                           d["back"] + back_pad, exp))

    collar_start = len(b.vertices)
    b.sweep([
        ring("chest", 0.066, 3.0),
        ring("upperChest", 0.060, 3.0),
        ring("shoulder", 0.054, 2.9),
        ring("neck", 0.046, 2.7),
        ring("collar", 0.038, 2.6),
        at(gorget, 0.030, 0.034, 0.070, 2.5),
        at(throat, 0.022, 0.026, 0.064, 2.4),
        at(throat + height * 0.008, 0.018, -0.078, 0.092, 2.4),
        # A REAR FLANGE, above the collar proper. The front and the back of a
        # collar want opposite heights -- under the jaw, and up the nape -- and
        # one ring cannot be at two heights. This one keeps the same negative
        # front pad, so it adds nothing under the chin, and carries a much
        # larger back pad, so it rises behind the neck to meet the cap's drape
        # coming down. Between them the nape closes without the collar ever
        # reaching the jaw.
        at(throat + height * 0.046, 0.013, -0.078, 0.112, 2.4),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", collar_start, len(b.vertices)))

    print("MUSKETEER_OUTFIT_REGIONS %s" % json.dumps(
        {"vertices": len(b.vertices), "faces": len(b.faces),
         "regions": len(regions)}))
    return b, m, floor, top, height, regions
