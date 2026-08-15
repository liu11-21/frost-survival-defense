"""The Shield's kit: the front rank, the one that stands still and is hit.

Third character through the same pipeline, and the one with the least room to
manoeuvre, because it has to separate from TWO silhouettes rather than one.
At forty pixels the three reads are:

    Hero      tall (1.84 m), lean, small open-face steel cap, long coat that
              flares below the knee, fur shawl, sword.
    Warrior   short (1.70 m), thick-set, a deep HOOD that rounds head and
              shoulders into one soft mass, a jacket cut at the hip, a tabard,
              an ice axe.
    Shield    shortest (1.68 m) and by far the widest, a flat-topped BRIMMED
              HELM, squared pauldrons that make the shoulders the widest point,
              a heavy coat hanging STRAIGHT to the knee, and a shield filling
              most of one side.

The oppositions are deliberate and they are all silhouette, not trim:

    hard-edged helm and brim   against   soft round hood
    squared pauldrons          against   draped mantle
    straight knee-length column against   short jacket over a tabard
    a slab of shield           against   a thin haft

Palette separates too, and the shield face is doing most of the work. The Hero
is dark navy and steel, the Warrior olive canvas and oxide red; this one is
cold grey canvas and iron with a PALE BONE shield face banded dark. A large
light shape against a dark figure survives distance and motion blur in a way
that a trim colour does not.

What this deliberately is NOT: fantasy plate, a tower of pauldrons, or the
Warrior holding a shield. The bulk is padding and iron banding over a working
soldier, and the width comes from the kit rather than from the body being
inflated.
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

# Cold issue kit, iron rather than steel, and a pale shield face.
#
# Routed through the SAME two-material vertex-tint scheme the Warrior proved:
# one cloth slot carrying every soft colour per-face in COLOR_0, one metal
# slot. Three materials is the whole budget for an ordinary unit and the body's
# skin takes one of them.
SURFACES_OVERRIDE = {
    "coat":    (0.196, 0.196, 0.188),   # grey canvas, colder and flatter than olive
    "leather": (0.121, 0.093, 0.068),   # dark strapping
    "fur":     (0.352, 0.330, 0.296),
    "metal":   (0.318, 0.330, 0.352),
    "edge":    (0.540, 0.560, 0.596),
    # The shield face. Pale bone, and the single strongest read this character
    # has at distance -- a big light shape where the other two have none.
    "tabard":  (0.706, 0.678, 0.596),
    "hair":    (0.118, 0.094, 0.071),
}

MATERIAL_OF_OVERRIDE = {
    "tabard": "cloth",
    "leather": "cloth",
    "fur": "cloth",
    "edge": "metal",
}

VERTEX_TINTED = {"cloth"}

MATERIAL_TABLE = (
    # White base, neutral texture: every colour arrives per-face in COLOR_0.
    ("cloth", (1.0, 1.0, 1.0), 0.94, 0.0),
    ("metal", (0.318, 0.330, 0.352), 0.58, 0.80),
)


def build_glove(body, armature, side, thickness_ratio=0.16, diagnostic=False):
    """A heavy gauntlet, swept, and it REPLACES the hand.

    Same reasoning as the Warrior's mitten, and the same measured lesson: a
    round section laid on the forearm's axis cannot contain curled fingers at
    any radius that is not a boxing glove, so the hand mesh is deleted by skin
    weight rather than fitted around. It is also the densest part of the body.
    """
    digits = tuple("%s_%02d_%s" % (d, j, side) for d in
                   ("thumb", "index", "middle", "ring", "pinky") for j in (1, 2, 3))
    data = limb_profile(body, "hand_%s" % side, armature,
                        extra_bones=digits, axis_bone="lowerarm_%s" % side)
    if data is None:
        return None, {"side": side, "built": False, "reason": "no hand profile"}
    b = MeshBuilder(0)
    b.sweep_axis(limb_rings(data, 8, 1.58, 1.46, 2.5,
                            over_head=0.08, over_tail=0.34, over_taper=0.60),
                 "leather", lambda t: {}, data["start"], data["end"],
                 cap_start=True, cap_end=True)
    mesh = bpy.data.meshes.new("HeroGlove_%s" % side)
    mesh.from_pydata(b.vertices, [], b.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    # THIS kit's leather. `import hero_outfit` yields a second module object
    # whose SURFACES never receives the kit overrides -- reading it there once
    # shipped the Warrior's mitten in the Hero's tan.
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
    """Delete the body's own hand: the gauntlet is the hand now.

    `cull_hidden_body` keeps any vertex it cannot see a garment above along the
    vertex normal, which is right for a coat over a chest and useless for a
    fist inside a gauntlet, where the knuckles sit outside the sweep and their
    normals point into open air.
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


def _place(b, start, basis, origin):
    """Map every vertex from `start` onward out of a local frame into place.

    The shield is authored flat in its own axes -- width across, height up,
    thickness through -- because that is the only way to state "a slab with a
    rim and a boss" without it turning into whatever a swept section happens to
    produce. It is carried into position afterwards.
    """
    right, up, normal = basis
    for i in range(start, len(b.vertices)):
        x, y, z = b.vertices[i]
        p = origin + right * x + up * y + normal * z
        b.vertices[i] = (p.x, p.y, p.z)


def build_sword(body, armature, height):
    """TWO carried items: a sidearm in the right hand, a shield on the left arm.

    `hero_outfit` accepts a list here precisely because `rigid_weights` puts an
    object entirely on one bone -- which is what stops a carried thing from
    deforming, and also what makes one object incapable of being held in two
    places. The sidearm comes FIRST because the adapter's ally contract reads
    the first carried mesh to place `weapon_socket` and the grips, and those
    describe the weapon, not the shield.

    The shield binds to the FOREARM, not the hand. A door shield is strapped to
    the forearm and gripped behind the boss; binding it to the wrist makes it
    swing with every hand rotation in the retargeted animations, which reads as
    a sign on a pole rather than a braced defence.
    """
    bones = armature.data.bones
    hand_r = bones.get("hand_r") or bones.get("hand.R")
    lower_r = bones.get("lowerarm_r") or bones.get("lower_arm.R")
    hand_l = bones.get("hand_l") or bones.get("hand.L")
    lower_l = bones.get("lowerarm_l") or bones.get("lower_arm.L")
    if hand_r is None or lower_r is None or hand_l is None or lower_l is None:
        return None, None

    carried = []

    # ---- sidearm: a short iron hammer ---------------------------------
    #
    # Not another axe. The Warrior's read is a bladed head standing off a
    # haft; this is a squat rectangular block, which is a different shape at
    # distance and a different job -- a shield unit's free hand is for keeping
    # something off the line, not for cutting.
    grip = armature.matrix_world @ hand_r.head_local
    forearm = (grip - (armature.matrix_world @ lower_r.head_local)).normalized()
    # DOWN IS -Y HERE: the whole import is parented to a pivot rotated -90
    # about X so the builder can stack rings along +Y. Using the Z-up vector
    # puts a hanging haft on a horizontal axis.
    down = Vector((0.0, -1.0, 0.0))
    outward = Vector((grip.x, 0.0, grip.z))
    outward = outward.normalized() if outward.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    # Down and outward, so the haft hangs clear of the thigh rather than
    # through it -- the Warrior paid for that lesson with 25 vertices inside a
    # leg.
    # Down AND well outward, so the haft hangs clear of the thigh. The
    # validator found 124 contacts at 0.58; the head sweeps a disc centred at
    # the hand and the hand sits beside the hip.
    along = (down + outward * 0.78)
    along = along.normalized() if along.length > 1e-6 else down
    butt = grip + along * (height * 0.150)
    top = grip - along * (height * 0.105)

    h = MeshBuilder(0)
    h.sweep_axis([
        (0.00, section(8, 0.016, 0.016, 0.016, 2.4)),
        (0.10, section(8, 0.018, 0.018, 0.018, 2.4)),
        (0.84, section(8, 0.017, 0.017, 0.017, 2.4)),
    ], "metal", lambda t: {}, butt, top, cap_start=True, cap_end=False)
    h.sweep_axis([
        (0.12, section(8, 0.022, 0.022, 0.022, 2.4)),
        (0.56, section(8, 0.022, 0.022, 0.022, 2.4)),
    ], "leather", lambda t: {}, butt, top, cap_start=False, cap_end=False)
    # The head, swept ACROSS the haft. Sweeping a closed section ALONG a haft
    # can only make a solid of revolution however the profile is shaped, which
    # is how an earlier axe head came out reading as a mallet -- here a mallet
    # is what is wanted, but it still has to be a BLOCK and not an ellipsoid,
    # so the same across-the-haft construction is used.
    head_at = butt + (top - butt) * 0.900
    face_dir = (outward - along * outward.dot(along))
    face_dir = face_dir.normalized() if face_dir.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    reach = height * 0.028
    for sign in (1.0, -1.0):
        h.sweep_axis([
            (0.00, section(4, 0.030, 0.040, 0.040, 4.0)),
            (0.72, section(4, 0.030, 0.042, 0.042, 4.4)),
            (1.00, section(4, 0.026, 0.038, 0.038, 4.0)),
        ], "metal", lambda t: {}, head_at, head_at + face_dir * (reach * sign),
            cap_start=False, cap_end=True)
    h.sweep_axis([
        (0.856, section(8, 0.026, 0.026, 0.026, 3.0)),
        (0.912, section(8, 0.028, 0.028, 0.028, 3.0)),
    ], "metal", lambda t: {}, butt, top, cap_start=False, cap_end=False)
    carried.append((h, "hand_r", head_at + face_dir * reach))

    # ---- the shield ----------------------------------------------------
    #
    # A door shield: a tall rounded rectangle, banded top and bottom, with a
    # boss over the grip. Authored FLAT in its own frame and carried into
    # place, because the silhouette is the entire point and a swept section
    # cannot state one.
    wrist = armature.matrix_world @ hand_l.head_local
    elbow = armature.matrix_world @ lower_l.head_local
    # Basis: `up` runs along the forearm so the shield hangs with the arm,
    # `normal` is the face direction (front), `right` completes it.
    # THE LONG AXIS IS WORLD-VERTICAL, NOT THE FOREARM'S.
    #
    # Taking `up` from the forearm looked principled and rendered as a diamond:
    # the bind pose holds the arm down and out at about 45 degrees, so the
    # shield tilted with it and read as a sign hung off an elbow rather than a
    # defence held in front of a body. It still rides the forearm -- the bind
    # is rigid to lower_arm.L and it swings with the arm in every clip -- but
    # its REST orientation is upright, which is what the silhouette is judged
    # on and what a braced shield looks like.
    up = Vector((0.0, 1.0, 0.0))
    normal = Vector((0.0, 0.0, 1.0))
    right = up.cross(normal).normalized()
    # In front of the arm and drawn IN toward the midline, so the inner edge
    # overlaps the torso instead of leaving a gap of daylight between the two.
    inward = Vector((-wrist.x, 0.0, 0.0))
    inward = inward.normalized() if inward.length > 1e-6 else Vector((-1.0, 0.0, 0.0))
    # Measured, not guessed. At 0.062 forward and 0.052 inward the carried-item
    # validator found 624 contacts and 60.7 mm of shield inside the torso: the
    # inward pull that was supposed to close the gap of daylight was pushing
    # the slab through the ribs instead. Forward is what buys clearance; inward
    # is nearly zero, and the overlap the silhouette needs comes from the
    # shield being wide rather than from it being dragged across the body.
    centre = ((elbow + wrist) * 0.5
              + normal * (height * 0.148)
              + inward * (height * 0.012)
              + up * (height * 0.020))

    half_w = height * 0.148          # 0.248 m half-width: 0.50 m across
    half_h = height * 0.212          # 0.356 m half-height: 0.71 m tall
    corner = height * 0.055
    thick = height * 0.019

    def rounded(hw, hh, r, steps=3, shift=0.0):
        """Rounded rectangle as an (x, y) outline, corners first.

        `shift` slides the plate along its own width. It exists because of
        where the clipping actually was: Idle, Walk, Run, Hit and Death are
        clean, and every contact is in MeleeAttack and RangedAttack, where the
        left arm swings ACROSS the body. What sweeps into the torso is the
        INBOARD half of the plate, so that is the half that moves -- the boss
        and the grip stay on the arm, which is also how a strapped shield is
        actually built, with more plate outboard of the fist than inboard.

        Shrinking the shield would have worked too and would have cost the
        character its only real silhouette.
        """
        pts = []
        for cx, cy, a0 in ((hw - r, hh - r, 0.0), (-(hw - r), hh - r, math.tau * 0.25),
                           (-(hw - r), -(hh - r), math.tau * 0.5),
                           (hw - r, -(hh - r), math.tau * 0.75)):
            for i in range(steps + 1):
                a = a0 + math.tau * 0.25 * i / steps
                pts.append((shift + cx + r * math.cos(a), cy + r * math.sin(a)))
        return pts

    # Local +x is OUTBOARD on the left arm: `right` is up x normal, which is
    # world +x, and the left hand sits at positive x.
    outboard = half_w * 0.56

    s = MeshBuilder(0)
    mark = len(s.vertices)
    # Face. Tagged "tabard" so it takes the pale bone tint -- the same
    # per-face COLOR_0 route the Warrior's surcoat uses, so it costs no
    # material.
    s.prism(rounded(half_w, half_h, corner, shift=outboard), 0.0, thick, "tabard", {})
    # Iron bands across the top and bottom thirds, standing slightly proud.
    for cy in (half_h * 0.60, -half_h * 0.60):
        s.prism([(outboard - half_w * 0.98, cy + half_h * 0.085),
                 (outboard + half_w * 0.98, cy + half_h * 0.085),
                 (outboard + half_w * 0.98, cy - half_h * 0.085),
                 (outboard - half_w * 0.98, cy - half_h * 0.085)],
                thick * 0.62, thick * 0.30, "metal", {})
    # Boss over the grip, on the front.
    s.prism(rounded(height * 0.048, height * 0.048, height * 0.030, 3),
            thick * 0.86, thick * 0.62, "metal", {})
    # Grip bar and forearm strap on the BACK, so the shield is held rather
    # than stuck on. Nothing reads these at gameplay distance; they exist so
    # the close-up does not show a slab floating off an arm.
    s.prism([(-height * 0.014, height * 0.052), (height * 0.014, height * 0.052),
             (height * 0.014, -height * 0.052), (-height * 0.014, -height * 0.052)],
            -thick * 0.90, thick * 0.55, "leather", {})
    s.prism([(-height * 0.075, height * 0.128), (height * 0.075, height * 0.128),
             (height * 0.075, height * 0.100), (-height * 0.075, height * 0.100)],
            -thick * 0.80, thick * 0.42, "leather", {})
    _place(s, mark, (right, up, normal), centre)
    carried.append((s, "lowerarm_l", None))

    return carried


def build_outfit(body, armature, variant):
    """Loft the Shield's kit around the measured body.

    Same contract as hero_outfit.build_outfit: builder, torso measurements,
    floor, top, height and the per-region family tags the weight transfer and
    the region gate need.
    """
    b = MeshBuilder(0)
    n = 20
    n_limb = 12

    H = {
        "hem": 0.30, "thighTop": 0.52, "hip": 0.56, "waist": 0.62,
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

    # --- the coat: a straight column to the knee ------------------------
    #
    # The Hero's coat flares below the knee and the Warrior's stops at the hip.
    # This one goes DOWN to the knee and does not flare: near-constant padding
    # from hem to chest, so the outline is a rectangle standing on two legs.
    # That is the "sits down behind a shield and does not move" read, and it is
    # the opposite of both other characters at the one place all three are
    # widest in a front view.
    coat_start = len(b.vertices)
    b.sweep([
        ring("hem", 0.104, 3.2),
        ring("thighTop", 0.106, 3.2),
        ring("hip", 0.100, 3.1),
        ring("waist", 0.086, 3.0),
        ring("lowRib", 0.090, 3.0),
        ring("chest", 0.096, 3.1),
        ring("upperChest", 0.094, 3.1),
        ring("shoulder", 0.086, 2.9),
    ], "coat", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("skirt", coat_start, coat_start + 3 * n))
    regions.append(("torso", coat_start + 3 * n, len(b.vertices)))

    # --- wide belt with a hanging apron ---------------------------------
    belt_start = len(b.vertices)
    d = m["waist"]
    b.sweep([
        (d["y"] - height * 0.026, section(n, d["halfWidth"] + 0.112,
                                          d["front"] + 0.112, d["back"] + 0.112, 3.4)),
        (d["y"] + height * 0.026, section(n, d["halfWidth"] + 0.114,
                                          d["front"] + 0.114, d["back"] + 0.114, 3.4)),
    ], "leather", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", belt_start, len(b.vertices)))

    # --- limbs -----------------------------------------------------------
    # Measured tubes, as on both other characters -- this is the part that took
    # longest to stop clipping at the knee, the ankle and the toes and none of
    # it is character-specific. Padded heaviest here.
    for side in ("l", "r"):
        for bone_name, surface, pad, tail_pad, exp, extra, axis_bone, over_head, over_tail in (
            (f"upperarm_{side}", "coat", 1.38, 1.30, 2.9, (), None, 0.28, 0.16),
            (f"lowerarm_{side}", "leather", 1.40, 1.32, 2.9, (), None, 0.16, 0.08),
            (f"thigh_{side}", "coat", 1.30, 1.14, 3.0, (), None, 0.20, 0.20),
            (f"calf_{side}", "coat", 1.98, 0.90, 3.0, (), None, 0.44, 0.12),
            # The trouser tucks INTO the boot (calf tail_pad 0.90) and the boot
            # stays near 1 at the ankle: widening the ankle ring scales the
            # measured BACK depth, and the back of the ankle is the heel, which
            # is how the Warrior grew a 106 mm flipper before this was measured.
            (f"foot_{side}", "leather", 1.14, 1.80, 2.4, (f"ball_{side}",),
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

    # --- squared pauldrons ----------------------------------------------
    #
    # Where the Warrior has a draped mantle, this has two hard plates. They are
    # what makes the shoulders the widest point of the figure and they are the
    # main reason the two do not read as the same person in different coats.
    # Kept as SEPARATE caps rather than a ring so the outline is two corners,
    # not a dome.
    for side in ("l", "r"):
        arm = armature.data.bones.get("upperarm_%s" % side)
        if arm is None:
            continue
        shoulder = armature.matrix_world @ arm.head_local
        elbow_bone = armature.data.bones.get("lowerarm_%s" % side)
        drop = ((armature.matrix_world @ elbow_bone.head_local) - shoulder).normalized() \
            if elbow_bone else Vector((0.0, -1.0, 0.0))
        mark = len(b.vertices)
        b.sweep_axis([
            (-0.10, section(10, 0.088, 0.104, 0.100, 4.2)),
            (0.16, section(10, 0.108, 0.118, 0.114, 4.4)),
            (0.40, section(10, 0.094, 0.104, 0.100, 4.0)),
        ], "metal", lambda t: {}, shoulder, shoulder + drop * (height * 0.150),
            cap_start=True, cap_end=True)
        regions.append(("sleeve_%s" % side, mark, len(b.vertices)))

    # --- brimmed helm ----------------------------------------------------
    #
    # A hard shell with a flat top and a brim that stands out all round -- the
    # deliberate opposite of the Warrior's soft cowl, and readable as a
    # different head shape at forty pixels. The face stays open: every ring
    # below the brow is tucked under the skin and sink_face_window enforces it
    # against the body afterwards.
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
            # FROM THE BROW UP, AND NO LOWER.
            #
            # Started at 0.30 the shell reached down over the face and fought
            # `sink_face_window` for the same space: the render came back with
            # the helmet swallowing the head and a thin flange slicing across
            # the eyes. A helm sits ON the skull; the neck is the gorget's job.
            if a < 0.52:
                continue
            # The lowest ring IS the brim. Built as a separate disc at the brow
            # it crossed the face opening, because the shell's front is tucked
            # under the skin there and a disc is not -- so the flare lives in
            # the same sweep, at the same height, and cannot cross anything the
            # shell does not.
            if a < 0.60:
                grow = 1.52
            elif a < 0.86:
                grow = 1.20
            else:
                grow = max(1.10, 1.20 - (a - 0.86) * 1.1)
            offset = entry["centre"] - (start + (end - start) * t)
            centre_x = offset.dot(head_data["side"])
            centre_z = offset.dot(head_data["front"])
            width = entry["halfWidth"] * grow
            depth = entry["front"] * grow
            ring_pts = section(n, width, depth, entry["back"] * grow * 1.34, 3.4,
                               centre_x=centre_x, centre_z=centre_z)
            sink = max(0.0, min(1.0, (front_edge - a) / fade))
            shell.append((t, tuck_front(ring_pts, centre_x, centre_z, depth, width,
                                        (1.0 - 0.48 / 1.22) * sink, reach=0.95,
                                        face_sign=sign)))
        if len(shell) >= 2:
            last = head_data["slices"][-1]
            offset = last["centre"] - (start + (end - start) * last["t"])
            cx = offset.dot(head_data["side"])
            cz = offset.dot(head_data["front"])
            # Two rings above the last slice: the head BONE stops short of the
            # skull, so capping at t = 1 closes the shell below the crown and
            # the scalp comes through. Flat, because this is a helm.
            for extra_t, shrink in ((1.030, 0.96), (1.070, 0.62)):
                b_w = last["halfWidth"] * 1.22 * shrink
                b_d = last["front"] * 1.22 * shrink
                shell.append((extra_t, section(
                    n, b_w, b_d, last["back"] * 1.22 * shrink, 3.6,
                    centre_x=cx, centre_z=cz)))
            mark = len(b.vertices)
            b.sweep_axis(shell, "metal", lambda t: {}, start, end,
                         cap_start=False, cap_end=True)
            regions.append(("helmet", mark, len(b.vertices)))

    # --- gorget ----------------------------------------------------------
    #
    # Closes the neck at the sides and the back. It carries ON UP past the
    # "collar" landmark, which on these bodies sits ABOVE the jaw, and the
    # floor clamp rather than the chin is what actually sets the top ring.
    #
    # The BACK pad is the largest of the three. Reaching the front forward
    # under the chin puts cloth ABOVE the jaw, and `cull_hidden_body` then
    # deletes the jaw -- that mistake cost the Warrior two rounds. The nape is
    # where the gap actually is.
    head_group = body.vertex_groups.get("head")
    chin = min([(body.matrix_world @ v.co).y for v in body.data.vertices
                if any(g.group == head_group.index and g.weight > 0.5
                       for g in v.groups)] or [0.0]) if head_group else 0.0
    throat = (min(m["collar"]["y"] + height * 0.070, chin + 0.026)
              if chin else m["collar"]["y"] + height * 0.048)
    throat = max(throat, m["collar"]["y"] + height * 0.010)
    gorget = m["collar"]["y"] + (throat - m["collar"]["y"]) * 0.55

    def at(y, pad, front_pad, back_pad, exp):
        d = m["collar"]
        return (y, section(n, d["halfWidth"] + pad, d["front"] + front_pad,
                           d["back"] + back_pad, exp))

    gorget_start = len(b.vertices)
    b.sweep([
        ring("chest", 0.128, 3.2),
        ring("upperChest", 0.120, 3.2),
        ring("shoulder", 0.108, 3.0),
        ring("neck", 0.082, 2.8),
        ring("collar", 0.062, 2.6),
        at(gorget, 0.046, 0.050, 0.086, 2.5),
        at(throat, 0.030, 0.038, 0.078, 2.4),
    ], "metal", lambda y: {}, cap_bottom=False, cap_top=False)
    regions.append(("torso", gorget_start, len(b.vertices)))

    print("SHIELD_OUTFIT_REGIONS %s" % json.dumps(
        {"vertices": len(b.vertices), "faces": len(b.faces),
         "regions": len(regions)}))
    return b, m, floor, top, height, regions
