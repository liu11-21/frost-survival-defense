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
import math

import bpy
from mathutils import Vector

import hero_outfit
from authoring import MeshBuilder, section
from hero_outfit import (limb_profile, limb_rings, measure, tuck_front,
                         head_extent, face_direction)

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


MATERIAL_OF_OVERRIDE = {"tabard": "tabard"}

# Issued kit against the Hero's tailoring: olive canvas and hide, not navy wool
# and steel. This has to be the material table and not just the surface tints,
# because the detail maps bake their tint in -- overriding only SURFACES left
# every texture the Hero's colour and the Warrior came out navy.
MATERIAL_TABLE = (
    ("cloth", (0.226, 0.221, 0.169), 0.95, 0.0),
    # Darkened hard: at 0.196/0.132/0.082 the bracers and boots sat within a
    # few percent of the skin tone and the figure read as bare-armed and
    # barefoot in a coat.
    ("leather", (0.104, 0.070, 0.044), 0.76, 0.03),
    ("metal", (0.318, 0.334, 0.356), 0.66, 0.78),
    ("hair", (0.118, 0.094, 0.071), 0.88, 0.0),
    # Oxide red, matte: the unit marking, and the only saturated thing on him.
    ("tabard", (0.486, 0.213, 0.157), 0.93, 0.0),
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
    b.sweep_axis(limb_rings(data, 8, 1.34, 1.30, 2.5,
                            over_head=0.06, over_tail=0.16, over_taper=0.60),
                 "leather", lambda t: {}, data["start"], data["end"],
                 cap_start=True, cap_end=True)
    mesh = bpy.data.meshes.new("HeroGlove_%s" % side)
    mesh.from_pydata(b.vertices, [], b.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    hero_outfit.add_cylindrical_uvs(mesh)
    obj = bpy.data.objects.new("HeroGlove_%s" % side, mesh)
    bpy.context.collection.objects.link(obj)
    return obj, {"side": side, "built": True, "triangles": len(b.faces)}


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
    butt = grip - along * (height * 0.105)      # lower_grip, above the hand
    tip = grip + along * (height * 0.290)       # axe_tip, the head below it

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
    #
    # THIN across the haft and DEEP along it, with a high exponent so the
    # section is a flat wedge rather than an ellipse. The first head used
    # 0.036 across against 0.092 deep at exponent 2.3, which rounded into an
    # ellipsoid: from the side it read as a wooden mallet, not an axe. The
    # cutting edge (front) runs long and flares before it tapers; the pick
    # (back) is short and stays blunt.
    b.sweep_axis([
        (0.845, section(8, 0.022, 0.034, 0.030, 3.4)),
        (0.880, section(8, 0.020, 0.118, 0.058, 4.2)),
        (0.930, section(8, 0.018, 0.126, 0.050, 4.4)),
        (0.972, section(8, 0.013, 0.104, 0.030, 4.2)),
        (1.000, section(8, 0.006, 0.030, 0.012, 3.0)),
    ], "metal", lambda t: {}, butt, tip, cap_start=False, cap_end=True)
    return b, "hand_r"


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
    b.sweep([
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

    # --- tabard ---------------------------------------------------------
    # The unit marking, and half the silhouette: a straight vertical slab of
    # colour against the Hero's flared skirt.
    #
    # Two earlier attempts failed for the same underlying reason -- the panel
    # was FLAT and the body is round. As a one-sided strip of points the loft
    # twisted it into a wedge; as a thin flat section standing proud of the
    # jacket it read from the side as a pair of braces floating clear of the
    # figure, because its edges stayed at panel depth while the waist fell away
    # behind them.
    #
    # So it is not a panel at all now. It is a thin over-layer that FOLLOWS the
    # jacket -- same elliptical section, one centimetre further out -- with its
    # side segments drawn back inside the jacket, where the wool hides them.
    # What shows is a broad band of colour down the front and back that sits on
    # the body, and from the side nothing but the edge.
    tabard_start = len(b.vertices)
    rings = []
    # Every pad here must clear the jacket AND its quilting ribs, which reach
    # 0.100. At 0.094-0.100 the two surfaces interpenetrated and the tabard came
    # out as a ragged red blotch where the ribs punched through it.
    # Well clear of the jacket (max pad 0.090). Decimation moves both surfaces,
    # so a 2 cm gap is not enough at LOD0 -- they tore through each other.
    for key, pad in (("hem", 0.122), ("thighTop", 0.126), ("hip", 0.126),
                     ("waist", 0.124), ("chest", 0.124), ("upperChest", 0.120)):
        d = m[key]
        ring_pts = section(n, d["halfWidth"] + pad, d["front"] + pad,
                           d["back"] + pad, 3.0)
        rings.append((d["y"], _hide_sides(ring_pts, d["halfWidth"] + pad)))
    b.sweep(rings, "tabard", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", tabard_start, len(b.vertices)))

    # --- wide belt ------------------------------------------------------
    belt_start = len(b.vertices)
    d = m["waist"]
    # Outside the tabard (pads 0.120-0.126), not under it. Buckled beneath, the
    # belt vanished behind the tabard and survived only as two stubs at the
    # hips, which read as a mistake rather than as a belt.
    b.sweep([
        (d["y"] - height * 0.020, section(n, d["halfWidth"] + 0.168,
                                          d["front"] + 0.168, d["back"] + 0.168, 3.2)),
        (d["y"] + height * 0.020, section(n, d["halfWidth"] + 0.170,
                                          d["front"] + 0.170, d["back"] + 0.170, 3.2)),
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
            (f"foot_{side}", "leather", 1.30, 1.56, 2.4, (f"ball_{side}",),
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
    b.sweep([
        ring("chest", 0.134, 2.9),
        ring("upperChest", 0.126, 2.8),
        ring("shoulder", 0.114, 2.7),
        ring("neck", 0.086, 2.6),
        ring("collar", 0.064, 2.5),
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
