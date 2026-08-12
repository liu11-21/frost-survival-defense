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


def build_sword(body, armature, height):
    """No sword. Infantry carry the ice axe the ally contract already defines;
    the Hero's sword is his alone and is exactly what this silhouette must not
    echo."""
    return None, None


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

    # Quilting: three shallow ribs round the jacket. Padding is the whole point
    # of a winter garment and a smooth tube does not say padded.
    for key, pad in (("waist", 0.090), ("lowRib", 0.094), ("chest", 0.100)):
        mark = len(b.vertices)
        d = m[key]
        b.sweep([
            (d["y"] - height * 0.008, section(n, d["halfWidth"] + pad * 0.86,
                                              d["front"] + pad * 0.86,
                                              d["back"] + pad * 0.86, 3.3)),
            (d["y"], section(n, d["halfWidth"] + pad, d["front"] + pad,
                             d["back"] + pad, 3.3)),
            (d["y"] + height * 0.008, section(n, d["halfWidth"] + pad * 0.86,
                                              d["front"] + pad * 0.86,
                                              d["back"] + pad * 0.86, 3.3)),
        ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
        regions.append(("torso", mark, len(b.vertices)))

    # --- tabard ---------------------------------------------------------
    # Two flat panels, front and back, hanging from the chest to mid-thigh.
    # This is the unit marking and the second half of the silhouette: a
    # straight vertical slab against the Hero's flared skirt.
    tabard_start = len(b.vertices)
    for sign in (1.0, -1.0):
        for key_lo, key_hi in (("hem", "upperChest"),):
            lo_d, hi_d = m[key_lo], m[key_hi]
            half_lo = lo_d["halfWidth"] * 0.80
            half_hi = hi_d["halfWidth"] * 0.72
            # Must clear the padded jacket beneath it (pad up to 0.100) or
            # the panel sits inside the quilting and only a sliver shows.
            depth_lo = (lo_d["front"] if sign > 0 else lo_d["back"]) + 0.132
            depth_hi = (hi_d["front"] if sign > 0 else hi_d["back"]) + 0.128
            b.sweep([
                (lo_d["y"], [(x * half_lo, sign * depth_lo)
                             for x in _panel_profile(n)]),
                (m["hip"]["y"], [(x * (half_lo + half_hi) * 0.5,
                                  sign * (depth_lo + depth_hi) * 0.5)
                                 for x in _panel_profile(n)]),
                (hi_d["y"], [(x * half_hi, sign * depth_hi)
                             for x in _panel_profile(n)]),
            ], "tabard", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", tabard_start, len(b.vertices)))

    # --- wide belt ------------------------------------------------------
    belt_start = len(b.vertices)
    d = m["waist"]
    b.sweep([
        (d["y"] - height * 0.020, section(n, d["halfWidth"] + 0.098,
                                          d["front"] + 0.098, d["back"] + 0.098, 3.2)),
        (d["y"] + height * 0.020, section(n, d["halfWidth"] + 0.100,
                                          d["front"] + 0.100, d["back"] + 0.100, 3.2)),
    ], "leather", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", belt_start, len(b.vertices)))

    # --- limbs ----------------------------------------------------------
    # Same measured tubes the Hero uses: this is the part that took the longest
    # to stop clipping at the knee, the ankle and the toes, and none of it is
    # Hero-specific. The Warrior's are padded thicker.
    for side in ("l", "r"):
        for bone_name, surface, pad, tail_pad, exp, extra, axis_bone, over_head, over_tail in (
            (f"upperarm_{side}", "coat", 1.30, 1.24, 2.8, (), None, 0.0, 0.16),
            (f"lowerarm_{side}", "leather", 1.34, 1.28, 2.8, (), None, 0.14, 0.08),
            (f"thigh_{side}", "coat", 1.24, 1.18, 2.9, (), None, 0.0, 0.26),
            (f"calf_{side}", "coat", 1.20, 1.16, 2.9, (), None, 0.30, 0.12),
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
            if a < 0.24:
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
            mark = len(b.vertices)
            # Capped: an open top ring showed as a hole in the crown of the hood.
            b.sweep_axis(shell, "coat", lambda t: {}, start, end,
                         cap_start=False, cap_end=True)
            regions.append(("helmet", mark, len(b.vertices)))

    # --- mantle ----------------------------------------------------------
    # Skirt of the hood falling over the shoulders, which is what fuses the
    # head and shoulder masses into one shape at distance.
    mantle_start = len(b.vertices)
    b.sweep([
        ring("upperChest", 0.128, 2.8),
        ring("shoulder", 0.112, 2.7),
        ring("neck", 0.072, 2.6),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", mantle_start, len(b.vertices)))

    return b, m, floor, top, height, regions


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
