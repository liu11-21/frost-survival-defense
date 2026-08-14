"""The Warrior's kit: rank-and-file frost infantry, not the protagonist.

Shares the Hero's pipeline deliberately -- the same measured lofting, the same
weight transfer, the same face-window enforcement -- because those are the
parts that took a dozen rounds to get right and are not specific to one
character. What is NOT shared is the garment set. Reusing the Hero's coat would
hand the Warrior the one silhouette the brief rules out.

Read at gameplay distance the two must separate instantly:

    Hero      tall (1.84 m), lean, small open-face steel cap, long coat that
              flares below the knee, fur shawl, sword.
    Warrior   short (1.70 m), thick-set, a deep HOOD that widens the head and
              shoulders into one mass, a SHORT padded jacket cut at the hip, a
              TABARD hanging to mid-thigh, heavy bracers, no sword.

So the reads are: round-headed and boxy against capped and flowing, and short
and wide against tall and narrow. Those survive being forty pixels tall, which
a difference in trim colour would not.

The palette separates too: the Warrior is canvas and hide -- olive-drab and
tan, issued kit -- against the Hero's dark navy and steel.
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

# Roll of the axe head about its own haft, in degrees; zero points the cutting
# edge straight away from the body. See build_sword for why it is zero and why
# that took a search to establish.
HEAD_ROLL_DEG = 0.0

# Issued kit, not the Hero's tailoring. Overrides the shared surface table so
# `to_object` tints and slots these the same way it does the Hero's.
SURFACES_OVERRIDE = {
    "coat":    (0.226, 0.221, 0.169),   # olive canvas, cold and drab
    "leather": (0.104, 0.070, 0.044),   # darker hide than the Hero's straps
    "fur":     (0.396, 0.352, 0.283),
    "metal":   (0.352, 0.372, 0.402),
    "edge":    (0.560, 0.585, 0.620),
    # Oxide red, and routed to the CLOTH slot: the shared table sends "accent"
    # to metal, which would have rendered the tabard as painted steel.
    "tabard":  (0.486, 0.213, 0.157),
    "hair":    (0.118, 0.094, 0.071),
}


# One soft material, told apart by the per-face tint in COLOR_0.
#
# The cap is three materials INCLUDING the body's skin, so the kit gets two.
# Letting the adapter merge to the budget was not an option: it drops leather
# and the bracers, boots, belt and mittens all render as cloth, which loses the
# cloth/leather/metal read the brief requires.
#
# Carrying colour in COLOR_0 instead needed one bug fixed first. The exporter
# defaults to writing every colour attribute, and it emitted TWO channels from
# a mesh holding a single "Tint": a white COLOR_0 and the real tint as COLOR_1.
# glTF multiplies base colour by COLOR_0 and ignores the rest, so the right
# values shipped on a channel nothing reads -- and neutralising the textures to
# let the tint carry the colour produced a pure white character. Exporting only
# the ACTIVE layer puts Tint on COLOR_0, and this works.
#
# Leather joins cloth because their PBR response is close (0.76 against 0.95
# roughness, near-zero metallic both), so the merge costs a little sheen and no
# colour at all. Metal stays separate: 0.78 metallic is a different material
# response, not a different colour.
MATERIAL_OF_OVERRIDE = {
    "tabard": "cloth",
    "leather": "cloth",
    "fur": "cloth",
    "edge": "metal",
}

VERTEX_TINTED = {"cloth"}

MATERIAL_TABLE = (
    # White base and a neutral texture: every colour arrives per-face from
    # SURFACES via COLOR_0. Baking a tint in as well would multiply twice.
    ("cloth", (1.0, 1.0, 1.0), 0.92, 0.0),
    ("metal", (0.318, 0.334, 0.356), 0.66, 0.78),
)


def build_glove(body, armature, side, thickness_ratio=0.16, diagnostic=False):
    """A heavy mitten, swept, rather than a copy of the hand's own surface.

    The shared glove duplicates the body's hand and finger faces and pushes
    them out. On the Hero that buys five separate fingers; on an ordinary unit
    it buys 3173 triangles PER HAND -- 6346 of a 14691 budget, 43 per cent of
    the whole character, for a pair of hands that are a few pixels across at
    gameplay distance.

    Infantry in this climate wear mittens anyway, so the fingers are not a
    loss: a swept tube over the hand and finger vertices, closed at the end.
    Same measured fit as every other limb piece, roughly a twentieth of the
    cost.
    """
    digits = tuple("%s_%02d_%s" % (d, j, side) for d in
                   ("thumb", "index", "middle", "ring", "pinky") for j in (1, 2, 3))
    data = limb_profile(body, "hand_%s" % side, armature,
                        extra_bones=digits, axis_bone="lowerarm_%s" % side)
    if data is None:
        return None, {"side": side, "built": False, "reason": "no hand profile"}
    b = MeshBuilder(0)
    # These numbers are silhouette, not coverage: the mitten REPLACES the hand,
    # see cull_hand below.
    #
    # Chasing coverage with them does not converge. The sweep lays a roughly
    # round section on the forearm's axis while the fingers curl away from it,
    # so no radius contains the whole hand without turning into a boxing glove.
    # 1.34/1.30 left the thumb standing 26 mm proud -- a bare skin-coloured
    # spur beside the grip, one of the seams the brief names outright. Widening
    # to 1.80/1.62 swallowed the thumb and still left 16 mm of knuckle through
    # the front.
    b.sweep_axis(limb_rings(data, 8, 1.55, 1.45, 2.5,
                            over_head=0.06, over_tail=0.34, over_taper=0.60),
                 "leather", lambda t: {}, data["start"], data["end"],
                 cap_start=True, cap_end=True)
    mesh = bpy.data.meshes.new("HeroGlove_%s" % side)
    mesh.from_pydata(b.vertices, [], b.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # Its own Tint layer. This mesh is built here rather than through
    # `to_object`, so nothing had written one, and with the colour now carried
    # in COLOR_0 an untinted mitten renders pure white on an otherwise
    # correctly coloured figure.
    # THIS kit's leather, not hero_outfit.SURFACES["leather"].
    #
    # run-blender executes hero_outfit as __main__, so the `import hero_outfit`
    # at the top of this file is a SECOND module object whose SURFACES table
    # never receives the kit's overrides. Reading it here handed back the
    # Hero's 0.372/0.263/0.171 and the mitten shipped in the Hero's tan while
    # the boots beside it were the Warrior's dark hide. Same trap that once put
    # the Hero's whole coat on this character.
    tint = SURFACES_OVERRIDE["leather"]
    colours = mesh.color_attributes.new(name="Tint", type="BYTE_COLOR",
                                        domain="CORNER")
    # foreach_set, not a per-loop assignment. Writing `colours.data[loop].color`
    # one loop at a time on a freshly built mesh produced a rotating permutation
    # of the three channel values -- 0.074/0.245/0.272 then 0.556/0.243/0.074 --
    # i.e. the writes were landing at the wrong stride. A flat buffer cannot
    # misalign.
    colours.data.foreach_set(
        "color", [tint[0], tint[1], tint[2], 1.0] * len(mesh.loops))
    hero_outfit.add_cylindrical_uvs(mesh)
    obj = bpy.data.objects.new("HeroGlove_%s" % side, mesh)
    bpy.context.collection.objects.link(obj)
    removed = cull_hand(body, side, digits)
    return obj, {"side": side, "built": True, "triangles": len(b.faces),
                 "handFacesCulled": removed}


def cull_hand(body, side, digits):
    """Delete the body's own hand: the mitten is the hand now.

    `cull_hidden_body` cannot do this, and the reason is worth keeping. It
    keeps any vertex it cannot see a garment ABOVE, along the vertex normal --
    right for a coat over a chest, useless for a fist inside a mitten, where
    the knuckles sit outside the sweep and their normals point into open air.
    Left to it, 133 vertices stood up to 16 mm proud of the leather as bare
    skin-coloured specks on both hands, and no amount of padding closed them.

    Deleting by SKIN WEIGHT rather than by line of sight is the production
    answer, and here it is unconditional: infantry in this climate have no bare
    hands in any frame, so the hand mesh is not something to fit a mitten
    around, it is something to remove. It pays for itself too -- the fingers
    are the densest part of the body mesh and none of it was ever going to be
    seen.

    The wrist survives. A vertex has to be MOSTLY hand or digit to go, so the
    band where the forearm still dominates stays, and the sleeve and the
    mitten's own cuff overlap across it.
    """
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
    """Not a sword -- the Warrior's ice axe. Hooked here because the shared
    pipeline calls `build_sword` for whatever the character carries.

    A working tool, not a fantasy battle axe: a short haft, a thick steel head
    with a cutting edge one side and a pick the other. Read at gameplay
    distance it says close-quarters infantry, and it shares nothing with the
    Hero's long straight blade.

    Geometry is laid out from the SAME two bones the adapter uses to place
    `upper_grip`, `lower_grip` and `axe_tip`, in the same rest space, so the
    locators land on the weapon instead of near it. Deriving the axis from the
    hand bone's own tangent -- which is what the Hero's sword does -- would put
    the haft at an angle to the locators and the contract would describe a
    weapon that is not there.

    Rigid to hand_r: one bone, no split skinning between the hands. The support
    hand meets the haft because the haft runs through where it grips, not
    because a second bone drags it there.
    """
    bones = armature.data.bones
    hand = bones.get("hand_r") or bones.get("hand.R")
    lower = bones.get("lowerarm_r") or bones.get("lower_arm.R")
    if hand is None or lower is None:
        return None, None
    grip = armature.matrix_world @ hand.head_local
    # The haft crosses the palm; it does not fold back along the arm.
    #
    # The first version used the forearm direction itself, so the weapon ran
    # from the hand back toward the elbow and the entire axe was buried inside
    # the arm and torso. Nothing caught it: the locators shared that axis, so
    # geometry and contract agreed with each other, and "on the character"
    # cannot tell inside from outside.
    #
    # A held haft is roughly PERPENDICULAR to the forearm. Taking world-down
    # and removing its forearm component gives that perpendicular, pointing
    # down, which is where an axe hangs in an A-pose -- clear of the body on
    # every side.
    forearm = (grip - (armature.matrix_world @ lower.head_local)).normalized()
    # DOWN IS -Y HERE. hero_outfit.main parents the whole import to a pivot and
    # rotates it -90 degrees about X so the builder can stack rings along +Y;
    # in that space world-down is (0, -1, 0), not (0, 0, -1). Using the Z-up
    # vector put the haft on a horizontal axis while the adapter -- which runs
    # in Z-up -- placed axe_tip 0.4 m lower, so the weapon and its own contract
    # described different objects.
    down = Vector((0.0, -1.0, 0.0))
    # Down AND outward. Straight down put 25 of the axe's 77 vertices inside
    # the thigh: the hand rests beside the hip in an A-pose, so a vertical haft
    # runs through the leg. Swinging it away from the body's midline clears the
    # leg and is how a haft actually hangs from a relaxed arm.
    outward = Vector((grip.x, 0.0, grip.z))
    outward = outward.normalized() if outward.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    along = down + outward * 0.62
    along = along.normalized() if along.length > 1e-6 else down
    # Identical to human_source_adapter.emit_ally_contract.
    # THE HEAD SITS AT THE TOP OF THE HAFT, JUST ABOVE THE HAND.
    #
    # It was the other way round: the butt was above the fist and the head hung
    # 0.49 m below it, so the character carried the thing like a hoe -- gripping
    # the very top of a long shaft with the blade swinging near his knee. An ice
    # axe is held at the head end; the shaft runs DOWN from the hand and the
    # steel is a hand's width above it.
    butt = grip + along * (height * 0.300)      # shaft end, below the hand
    tip = grip - along * (height * 0.110)       # head end, just above it

    b = MeshBuilder(0)
    # Haft, butt (t=0) to cutting edge (t=1). upper_grip falls at t = 0.266.
    b.sweep_axis([
        (0.00, section(8, 0.016, 0.016, 0.016, 2.4)),
        (0.08, section(8, 0.018, 0.018, 0.018, 2.4)),
        (0.80, section(8, 0.017, 0.017, 0.017, 2.4)),
        (0.86, section(8, 0.021, 0.021, 0.021, 2.6)),
    ], "metal", lambda t: {}, butt, tip, cap_start=True, cap_end=False)
    # Bound grip, covering both hand positions so the support hand has
    # something to hold rather than bare steel.
    b.sweep_axis([
        (0.10, section(8, 0.021, 0.021, 0.021, 2.4)),
        (0.42, section(8, 0.021, 0.021, 0.021, 2.4)),
    ], "leather", lambda t: {}, butt, tip, cap_start=False, cap_end=False)
    # Head: asymmetric on purpose -- the deep side is the cutting edge, the
    # shallow side the pick. One section carries both.
    # The head is swept ACROSS the haft, not around it.
    #
    # Two earlier heads were built by sweeping a closed section ALONG the haft,
    # which can only ever produce a solid of revolution: however thin and deep
    # the profile, it rounds into an ellipsoid and reads from the side as a
    # mallet. An axe is a flat wedge standing out sideways from its handle, so
    # the edge and the pick are their own sweeps, each running out from the
    # haft on its own axis, with a section that is THIN across the blade face
    # and tall along the haft.
    head_at = butt + (tip - butt) * 0.880
    # Perpendicular to the haft and pointing AWAY FROM THE MIDLINE.
    #
    # This was `along.cross(up)`, which sounds lateral and is not: the
    # horizontal part of `along` IS `outward`, so crossing it with up returns
    # something perpendicular to outward -- a fore-aft vector. The edge stood
    # out in front of and behind the hip, exactly the plane the arm swings in,
    # and Walk and Run drove it through the body. The guard below it never
    # fired either: a vector perpendicular to `outward` has dot(outward) == 0,
    # so which way the edge faced was down to floating-point noise.
    #
    # Projecting `outward` off the haft gives the true perpendicular that still
    # leans away from the body. Arm swing then moves the edge fore-aft through
    # air beside the hip instead of into it.
    blade_dir = outward - along * outward.dot(along)
    if blade_dir.length < 1e-6:
        blade_dir = Vector((1.0, 0.0, 0.0)) if grip.x >= 0.0 else Vector((-1.0, 0.0, 0.0))
    blade_dir.normalize()
    # HOW FAR THE HEAD STANDS OFF THE HAFT, AND WHY IT IS THIS SMALL.
    #
    # This wants to be big. A real ice axe head spans roughly a fifth of its
    # haft, and an earlier 0.082 of body height read as a small pick rather
    # than a weapon, which is why it had been pushed up to 0.125.
    #
    # What settles it is that the hand hangs 27 mm from the coat. The head is
    # rigid in hand space and the head station sits within a few centimetres of
    # the grip, so the edge sweeps a disc centred beside the hip: at 0.125 of
    # height some part of that disc is inside the character in almost any
    # orientation. Searching the roll angle over all seven animations only
    # traded one animation against another -- the floor was 46 mm of steel
    # inside the coat, at a roll that also turned the edge inward where it
    # reads worst.
    #
    # Below 0.68 of that reach the disc fits in the air beside the body and the
    # clipping does not merely get smaller, it stops: zero contacts at EVERY
    # roll angle. That buys back the orientation, so the edge can face straight
    # out from the body where it is most legible from a tower-defence camera.
    #
    # The ceiling was found twice, and the first answer -- 0.60 -- was too
    # cautious because the search that produced it discarded any sample more
    # than 0.12 m from a garment surface, to suppress false positives from
    # single-axis ray parity on a multi-shell coat. That threw away exactly the
    # samples that matter: a head deep inside the torso is FURTHER from the
    # cloth than one grazing it, so the worst penetrations were scored as
    # clean, and the sweep was non-monotonic in a way that should have been the
    # tell. Voting four independent axes rejects the far-field noise without
    # discarding depth, and it puts the real ceiling 14 per cent higher.
    #
    # The rest of that headroom went back into SAMPLING, and the sequence is
    # the point: nine frames per animation passed 0.0838, thirteen found 30 mm
    # of steel inside the coat, seventeen found 16 mm at 0.0737. Every time the
    # sampling got denser it found a worse frame, always in MeleeAttack --
    # the fastest thing the character does and so the easiest to step over.
    # Sampling that one animation at forty-one frames is what actually
    # converged, and it puts the ceiling here.
    reach = height * 0.0690

    # Everything from here on is the HEAD, and it gets rolled about the haft
    # as a finished solid once it is built. See HEAD_ROLL_DEG.
    head_start = len(b.vertices)

    # Cutting edge: broad, flaring slightly before it thins to the bit.
    b.sweep_axis([
        (0.00, section(6, 0.022, 0.060, 0.046, 3.6)),
        (0.42, section(6, 0.020, 0.076, 0.062, 4.0)),
        (0.80, section(6, 0.014, 0.086, 0.072, 4.2)),
        (1.00, section(6, 0.005, 0.080, 0.066, 3.4)),
    ], "metal", lambda t: {}, head_at, head_at + blade_dir * reach,
        cap_start=False, cap_end=True)

    # Pick: the other side, short and square, for a tool that also bites ice.
    #
    # It points INWARD, back across the hip, so its length is what decides
    # whether the weapon clips the coat. At 0.62 of the edge's reach it stood
    # 13 cm inboard of the grip and dipped into the jacket on Hit and on the
    # recovery half of MeleeAttack. Nothing else was ever inside the body --
    # the skin mesh was clean throughout -- so the pick alone was shortened
    # rather than moving the whole weapon further off the body, which would
    # have made the arm read as held out at an angle.
    b.sweep_axis([
        (0.00, section(6, 0.021, 0.052, 0.042, 3.6)),
        (0.60, section(6, 0.015, 0.034, 0.030, 3.4)),
        (1.00, section(6, 0.006, 0.014, 0.012, 3.0)),
    ], "metal", lambda t: {}, head_at, head_at - blade_dir * (reach * 0.34),
        cap_start=False, cap_end=True)

    # Collar where the head is seated on the haft.
    b.sweep_axis([
        (0.828, section(8, 0.026, 0.026, 0.026, 3.0)),
        (0.884, section(8, 0.028, 0.028, 0.028, 3.0)),
    ], "metal", lambda t: {}, butt, tip, cap_start=False, cap_end=False)

    # ROLL THE FINISHED HEAD ABOUT THE HAFT.
    #
    # Which way the edge faces has to be measured against the animations, not
    # chosen: the head is rigid in hand space, so a direction that clears the
    # body in the rest pose swings into the torso as soon as the arm moves.
    #
    # It is applied HERE, to built geometry, rather than by rotating
    # `blade_dir` before the sweeps -- and that distinction is the whole
    # reason this works. `sweep_axis` derives its own frame from the axis it
    # is handed, so turning `blade_dir` does not turn the finished wedge; it
    # rebuilds a differently-shaped one. A search that assumed otherwise
    # predicted a deepest contact of 0.046 m and the build that came out of it
    # measured 0.193 m. Rotating the solid after the fact is the operation the
    # search actually models, so the number it reports is the number the asset
    # has.
    roll = Matrix.Rotation(math.radians(HEAD_ROLL_DEG), 4, along)

    def rolled(point):
        return head_at + (roll @ (point - head_at))

    for i in range(head_start, len(b.vertices)):
        b.vertices[i] = tuple(rolled(Vector(b.vertices[i])))

    # Hand the tip back explicitly. The adapter otherwise takes the vertex
    # furthest from the hand, and with the head now at the TOP the furthest
    # point is the butt of the shaft -- it would have pinned axe_tip to the
    # wrong end of the weapon.
    blade_tip = rolled(head_at + blade_dir * reach)
    return b, "hand_r", blade_tip


def build_outfit(body, armature, variant):
    """Loft the Warrior's kit around the measured body.

    Same contract as hero_outfit.build_outfit: returns the builder, the torso
    measurements, floor, top, height and the per-region family tags the weight
    transfer and the region gate need.
    """
    b = MeshBuilder(0)
    n = 20
    n_limb = 12

    H = {
        "hem": 0.40, "thighTop": 0.52, "hip": 0.56, "waist": 0.62,
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

    # --- short padded jacket -------------------------------------------
    # Cut at the hip and held nearly straight from there up. The Hero's coat
    # flares below the knee and is what gives him his outline; stopping this
    # one at the hip is most of what makes the Warrior read as infantry.
    # A high exponent keeps the section boxy rather than tubular, which is how
    # quilted padding actually sits.
    jacket_start = len(b.vertices)
    jacket_faces = len(b.faces)
    b.sweep([
        # Down to mid-thigh: the surcoat is part of this surface now, so the
        # jacket has to reach where the surcoat used to hang.
        ring("hem", 0.094, 3.0),
        # Reaches the top of the thigh. Cut at the hip it left a band of bare
        # skin between the jacket and the trousers, straight across the groin.
        ring("thighTop", 0.090, 3.1),
        ring("hip", 0.086, 3.2),
        ring("waist", 0.074, 3.3),
        ring("lowRib", 0.078, 3.3),
        ring("chest", 0.086, 3.2),
        ring("upperChest", 0.082, 3.1),
        ring("shoulder", 0.070, 2.9),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", jacket_start, len(b.vertices)))

    # The jacket had three quilting ribs swept 1 cm off its own surface. At
    # LOD0's decimation ratio the two surfaces move enough to interpenetrate,
    # and the close-up came back as shattered green patches across the tabard.
    # Padding is already carried by the boxy section and the weave normal map;
    # ribs that only survive at full density are not worth the tearing.

    # --- surcoat: a COLOURED REGION of the jacket, not a layer on top of it -
    #
    # It was a separate shell floating 12-15 cm off the jacket, and every
    # version of that fought decimation: at LOD1 and LOD2 the two surfaces move
    # independently and tore through each other, spraying red shards across the
    # chest. Widening the gap stopped the tearing and made the surcoat read as
    # an apron -- the clearance became the silhouette.
    #
    # A surcoat at this budget is not geometry. It is the front and back of the
    # jacket in a different colour, so there is no second surface, nothing to
    # interpenetrate, and no gap to tune. The faces are retagged after the
    # sweep, which is what `surfaces` being per-face is for.
    width = m["hip"]["halfWidth"]
    # Below the collarbone. Taken to the chest landmark the surcoat climbed to
    # the base of the throat and read as a bib in close-up.
    top = m["chest"]["y"] - height * 0.030
    bottom = m["hem"]["y"]
    tagged = 0
    for index in range(jacket_faces, len(b.faces)):
        points = [b.vertices[v] for v in b.faces[index]]
        cx = sum(p[0] for p in points) / len(points)
        cy = sum(p[1] for p in points) / len(points)
        # Wide enough to be a surcoat rather than a stripe, but short of the
        # side planes so it still reads as a front and back panel.
        if abs(cx) <= width * 0.74 and bottom <= cy <= top:
            b.surfaces[index] = "tabard"
            tagged += 1
    print("SURCOAT_FACES %d" % tagged)

    # --- wide belt ------------------------------------------------------
    belt_start = len(b.vertices)
    d = m["waist"]
    # Just clear of the jacket (max pad 0.094). It was pushed out to 0.176 to
    # clear the old free-standing tabard shell; with the surcoat now painted on
    # the jacket there is nothing to clear, and that offset left the belt
    # floating off the body as two detached hoops.
    b.sweep([
        (d["y"] - height * 0.020, section(n, d["halfWidth"] + 0.104,
                                          d["front"] + 0.104, d["back"] + 0.104, 3.2)),
        (d["y"] + height * 0.020, section(n, d["halfWidth"] + 0.106,
                                          d["front"] + 0.106, d["back"] + 0.106, 3.2)),
    ], "leather", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", belt_start, len(b.vertices)))

    # --- limbs ----------------------------------------------------------
    # Same measured tubes the Hero uses: this is the part that took the longest
    # to stop clipping at the knee, the ankle and the toes, and none of it is
    # Hero-specific. The Warrior's are padded thicker.
    for side in ("l", "r"):
        for bone_name, surface, pad, tail_pad, exp, extra, axis_bone, over_head, over_tail in (
            # over_head 0.0 left the top of the shoulder uncovered: the jacket ring
            # stops at 0.83 and the sleeve started at the joint, so a hole opened
            # over each shoulder. The Hero hides the same seam under a pauldron;
            # infantry have none, so the sleeve has to reach up onto the shoulder.
            (f"upperarm_{side}", "coat", 1.30, 1.24, 2.8, (), None, 0.26, 0.16),
            (f"lowerarm_{side}", "leather", 1.34, 1.28, 2.8, (), None, 0.14, 0.08),
            (f"thigh_{side}", "coat", 1.26, 1.36, 2.9, (), None, 0.20, 0.36),
            (f"calf_{side}", "coat", 1.42, 1.22, 2.9, (), None, 0.44, 0.12),
            # tail_pad 1.78, up from 1.56: the boot ran 2.4 mm inside the
            # outer toe and let a skin-coloured sliver through the side of the
            # foot. Small, and visible in every frame the unit stands in.
            (f"foot_{side}", "leather", 1.30, 1.78, 2.4, (f"ball_{side}",),
             f"foot_{side}", 0.12, 0.18),
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

    # --- hood -----------------------------------------------------------
    # The head read. A deep cowl that starts at the shoulders and closes over
    # the skull, so head and shoulders become one mass -- the opposite of the
    # Hero's small cap sitting on a bare neck. The face stays open: the front
    # of every ring below the brow is tucked under the skin, and
    # sink_face_window enforces it afterwards against the body itself.
    head_data = limb_profile(body, "head", armature, slices=9)
    if head_data is not None:
        start, end = head_data["start"], head_data["end"]
        anat = head_extent(body, start, end) or (lambda t: t)
        sign = (1.0 if face_direction(body, head_data).dot(head_data["front"]) > 0
                else -1.0)
        # Brow at 0.60 of head height, same landmark hero_face.py paints to.
        front_edge, fade = 0.68, 0.12
        shell = []
        for entry in head_data["slices"]:
            t = entry["t"]
            a = anat(t)
            # Down past the jaw line. Starting at 0.24 left roughly 35 mm of
            # bare neck between the hood and the mantle. The face stays open
            # regardless: sink_face_window enforces that against the body.
            if a < 0.04:
                continue
            # Wider than a helmet and barely tapered at the crown: a hood has
            # slack in it, and the extra width is the silhouette.
            # Never below 1.16: tapering to 0.86 put the crown of the hood
            # inside the skull and the bare head came through the top as a
            # disc of skin. A hood has slack in it and does not shrink-wrap.
            grow = 1.34 if a < 0.88 else max(1.16, 1.34 - (a - 0.88) * 1.5)
            offset = entry["centre"] - (start + (end - start) * t)
            centre_x = offset.dot(head_data["side"])
            centre_z = offset.dot(head_data["front"])
            width = entry["halfWidth"] * grow
            depth = entry["front"] * grow
            ring_pts = section(n, width, depth, entry["back"] * grow * 1.18, 2.6,
                               centre_x=centre_x, centre_z=centre_z)
            sink = max(0.0, min(1.0, (front_edge - a) / fade))
            shell.append((t, tuck_front(ring_pts, centre_x, centre_z, depth, width,
                                        (1.0 - 0.46 / 1.34) * sink, reach=0.95,
                                        face_sign=sign)))
        if len(shell) >= 2:
            # The head BONE stops short of the head. Measured on this body its
            # axis spans 0.239 m while the head's own vertices run from 0.004 to
            # 0.245 along it, so the last profile slice (t = 1) sits at 0.974 of
            # head height and the crown needs t = 1.026. Capping the shell there
            # closed it about 6 mm BELOW the top of the skull, and the bare head
            # came through as a disc of scalp -- which no amount of extra grow
            # at t = 1 could fix, because the cap was simply in the wrong place.
            #
            # `sweep_axis` places rings at start + (end - start) * t and does not
            # care that t exceeds 1, so the hood is closed with two rings above
            # the last slice: one to draw it in, one to cap it over the crown.
            last = head_data["slices"][-1]
            offset = last["centre"] - (start + (end - start) * last["t"])
            cx = offset.dot(head_data["side"])
            cz = offset.dot(head_data["front"])
            for extra_t, shrink in ((1.045, 0.74), (1.085, 0.30)):
                cap_w = last["halfWidth"] * 1.34 * shrink
                cap_d = last["front"] * 1.34 * shrink
                shell.append((extra_t, section(
                    n, cap_w, cap_d, last["back"] * 1.34 * shrink, 2.6,
                    centre_x=cx, centre_z=cz)))
            mark = len(b.vertices)
            b.sweep_axis(shell, "coat", lambda t: {}, start, end,
                         cap_start=False, cap_end=True)
            regions.append(("helmet", mark, len(b.vertices)))

    # --- mantle ----------------------------------------------------------
    # The hood's skirt over the shoulders: what fuses head and shoulder into
    # one mass at distance, and what closes the bare neck between hood and
    # jacket.
    #
    # It flared from a 0.128 pad at the chest up to 0.072 at the neck, which is
    # an inverted cone -- widest at the bottom, narrowing upward -- and read as
    # a lampshade sitting on the shoulders. It now starts close to the jacket's
    # own pad (0.086) and tapers gently, so it lies ON the shoulders instead of
    # standing off them, and carries on up past the neck to the collar.
    mantle_start = len(b.vertices)
    # Clear of the jacket at every height. At 0.074 against the jacket's 0.070
    # the two surfaces sat within 4 mm of each other and interpenetrated over
    # the shoulders, opening a hole on each side that only showed under strong
    # light -- the studio render found it, the softer one did not.
    #
    # It has to carry ON UP past the collar landmark and close under the chin.
    # Stopping at the collar left the throat open by 50 mm, and because the
    # neck skin beneath is culled as hidden, that gap was not bare skin -- it
    # was a hole. The face render looked straight through the character's
    # throat to the inside of the tabard behind it.
    #
    # Capped just under the chin, measured off the head group rather than
    # scaled off body height: the same fix, and the same reason, as the Hero's
    # fur collar, which read as a head sunk into a cowl when a fixed fraction
    # put its top ring 66 mm above the chin.
    head_group = body.vertex_groups.get("head")
    chin = min([(body.matrix_world @ v.co).y for v in body.data.vertices
                if any(g.group == head_group.index and g.weight > 0.5
                       for g in v.groups)] or [0.0]) if head_group else 0.0
    # Above the chin, and on this body that is not the constraint it sounds
    # like. Measured here: chin 1.4722, collar landmark 1.4916 -- the landmark
    # is ALREADY above the jaw, because "collar" is 0.875 of body height and
    # this build's chin falls at 0.864. So the floor below, not the chin clamp,
    # is what actually sets the ring, at 1.5086.
    #
    # Which also explains why raising this further does nothing visible, and
    # that is correct behaviour rather than a bug to chase: `sink_face_window`
    # runs afterwards and pushes any garment intruding on the face window back
    # behind the skin. The collar closes the neck at the SIDES and BACK; the
    # throat under the jaw stays open because a hood with a face opening is
    # supposed to leave it open. Two rounds went into trying to close it --
    # first by reaching the collar forward, which made the cull eat the jaw,
    # then by raising it, which the face window silently undid.
    throat = (min(m["collar"]["y"] + height * 0.070, chin + 0.026)
              if chin else m["collar"]["y"] + height * 0.048)
    # Never below the ring it grows from, or a short-necked build folds the
    # mantle back through itself.
    throat = max(throat, m["collar"]["y"] + height * 0.010)
    gorget = m["collar"]["y"] + (throat - m["collar"]["y"]) * 0.55
    print("WARRIOR_COLLAR %s" % json.dumps(
        {"chin": round(chin, 4), "collarY": round(m["collar"]["y"], 4),
         "byHeight": round(m["collar"]["y"] + height * 0.070, 4),
         "byChin": round(chin + 0.026, 4) if chin else None,
         "throat": round(throat, 4), "gorget": round(gorget, 4),
         "height": round(height, 4)}))

    # HIGH, but TIGHT: the front pad is only a little larger than the sides.
    #
    # Reaching the collar forward under the jaw to close the sightline seemed
    # obvious and backfired. `cull_hidden_body` deletes any skin face with a
    # garment above it along the vertex normal, within 0.075 of body height --
    # so a collar sitting out in front of the chin is a garment above the CHIN,
    # and the cull ate the jaw. What that left was worse than the gap it
    # closed: a ragged hole in the face with the dark inside of the hood
    # showing through it.
    #
    # A ring that hugs the neck clears the chin's normals, so the jaw survives,
    # and being above the cull boundary is enough to hide the stair-stepped
    # edge the cull leaves on the neck. Height closes the gap; width does not.
    def at(y, pad, front_pad, back_pad, exp):
        d = m["collar"]
        return (y, section(n, d["halfWidth"] + pad, d["front"] + front_pad,
                           d["back"] + back_pad, exp))

    b.sweep([
        ring("chest", 0.134, 2.9),
        ring("upperChest", 0.126, 2.8),
        ring("shoulder", 0.114, 2.7),
        ring("neck", 0.086, 2.6),
        ring("collar", 0.064, 2.5),
        at(gorget, 0.048, 0.056, 0.054, 2.4),
        at(throat, 0.032, 0.040, 0.042, 2.3),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", mantle_start, len(b.vertices)))

    return b, m, floor, top, height, regions


def _hide_sides(ring, half_width, keep=0.40, sink=0.74):
    """Pull the side segments of a ring inward so a garment beneath hides them.

    The mirror of `tuck_front`, which hides the FRONT of a hood under the skin.
    Here the over-layer must show only across the front and back of the torso;
    at the sides it is drawn in behind the jacket rather than cut away, so the
    ring stays closed and there is no open edge to cap.
    """
    if half_width <= 1e-6:
        return ring
    out = []
    for x, z in ring:
        lateral = abs(x) / half_width
        if lateral <= keep:
            out.append((x, z))
            continue
        t = min(1.0, (lateral - keep) / (1.0 - keep))
        scale = 1.0 - (1.0 - sink) * (t * t * (3.0 - 2.0 * t))
        out.append((x * scale, z * scale))
    return out


def _panel_profile(n):
    """Unit-width cross-section for a flat hanging panel.

    A tabard is a slab, not a tube: the section is nearly straight across the
    front with the corners rolled just enough that the edge catches light.
    """
    out = []
    for i in range(n):
        angle = math.tau * i / n
        c = math.cos(angle)
        out.append(math.copysign(min(1.0, abs(c) ** 0.45), c))
    return out
