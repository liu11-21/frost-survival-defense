"""Musketeer V1 evidence: orbit views, a real face close-up, action poses, and a
side-by-side against the Hero.

Separate from render_human_candidates.py because that harness frames a 1.84 m
Hero: its "head" shot sits at 0.935 of body height at 0.42 of it away, which on
a 1.70 m Musketeer lands on the side of the hood and shows no face at all. A
close-up that misses the face is exactly the failure the Hero round was about.

The face camera is placed from the HEAD BONE and aimed along the character's
own forward axis, never a world axis, and the frame is checked before it is
kept: MakeHuman meshes the face densely and the cranium sparsely, so the half
of the head nearer the camera must have more vertices. A back-of-head frame
fails loudly instead of being filed as evidence.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "reports", "musketeer-v1")

ORBITS = (("front", 0.0), ("back", 180.0), ("side-left", 90.0),
          ("side-right", 270.0), ("three-quarter", 38.0))
# Melee sampled twice: the load, where the haft should be back and both
# hands on it, and the impact, where the head should be through the arc
# without the axe crossing the torso or the face.
POSES = (("melee-load", "MeleeAttack", 0.18), ("melee-impact", "MeleeAttack", 0.52),
         ("walk", "Walk", 0.30), ("run", "Run", 0.28))

# Close-ups, framed on a rig landmark so they follow the body.
# (label, bone, aim offset up, distance, fov)
# (label, bone, aim lift as fraction of height, distance as fraction, fov)
# One landmark per shot. "knee-boots" tried to be both and was neither: aimed
# at the knee with a frame 0.54 m tall, it covered z 0.23 to 0.77 on a
# character whose boots sit between 0.01 and 0.20, so the only close-up of the
# boots did not contain them. The bare toe that shipped through the side of one
# was found by hand, not by this shot.
# The rig names the forearm `lower_arm.L`. Written as `lowerarm.L` these two
# entries matched nothing, the loop skipped them without a word, and the run
# reported success with no musketeer close-up in the set at all -- the same shape
# of failure as the Warrior's boot shot, which was framed on the knee.
DETAILS = (("musket", "hand.R", 0.10, 0.78, 0.68),
           ("musket-grip", "hand.R", 0.00, 0.26, 0.60),
           ("muzzle", "hand.R", 0.34, 0.44, 0.62),
           ("cap", "head", 0.03, 0.44, 0.62),
           ("bandolier", "chest", 0.06, 0.52, 0.66),
           ("knee", "shin.R", 0.02, 0.30, 0.62),
           ("boots", "foot.R", 0.00, 0.26, 0.66))


PAIR_W, PAIR_H = 760, 1180
PAIR_FOV = 0.55
PAIR_EYE = Vector((0.0, -5.2, 1.35))
PAIR_AIM = Vector((0.0, 0.0, 0.92))


def rest_pose(armature):
    """Put a rig in its bind pose: no action, no NLA, frame 0."""
    if armature is None:
        return
    if armature.animation_data:
        armature.animation_data.action = None
        for track in armature.animation_data.nla_tracks:
            track.mute = True
    for bone in armature.pose.bones:
        bone.matrix_basis.identity()
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()


def composite(panels, path):
    """Join rendered panels side by side without touching either subject.

    Compositing pixels is the only way to place two characters in one frame
    that cannot possibly deform either of them.
    """
    import numpy

    images = [bpy.data.images.load(p) for p in panels]
    width, height = images[0].size
    out = bpy.data.images.new("pair", width=width * len(images), height=height)
    canvas = numpy.zeros((height, width * len(images), 4), dtype=numpy.float32)
    for index, image in enumerate(images):
        buf = numpy.empty(width * height * 4, dtype=numpy.float32)
        image.pixels.foreach_get(buf)
        canvas[:, index * width:(index + 1) * width, :] = buf.reshape(height, width, 4)
    out.pixels.foreach_set(canvas.reshape(-1))
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    # The composite is a deliverable; the panels it was joined from are
    # scratch and get deleted by the caller. Record the one and forget the
    # others, or the evidence listing names five files that are not there and
    # omits the two that are.
    WRITTEN.append(os.path.basename(path))
    for panel in panels:
        name = os.path.basename(panel)
        if name in WRITTEN:
            WRITTEN.remove(name)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    """Import a character and return only the meshes that ARE the character.

    MPFB leaves an Icosphere in the scene, and counting it as part of the
    subject put "height" at 2.6 m on a 1.7 m man, which pushed the camera back
    to six metres and shrank every orbit shot. Parentage under UnitRoot is the
    same test the contract validator uses.
    """
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))

    def in_asset(obj):
        node = obj
        while node is not None:
            if node.name == "UnitRoot":
                return True
            node = node.parent
        return False

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and in_asset(o)]
    armature = next((o for o in bpy.data.objects
                     if o.type == "ARMATURE" and in_asset(o)), None)
    return meshes or [o for o in bpy.data.objects if o.type == "MESH"], armature


def apply_vertex_colour(meshes):
    """Wire COLOR_0 into the imported materials, as a glTF runtime would.

    Blender's glTF importer does NOT connect COLOR_0 to base colour, but the
    spec says a renderer multiplies by it. So a correct asset whose colour
    lives in the vertex tint imports as pure white here, and a render of it is
    a picture of the importer rather than of the asset. Reconnecting it is what
    makes these shots show what Babylon will show.
    """
    wired = []
    for mesh in meshes:
        if not mesh.data.color_attributes:
            continue
        for slot in mesh.material_slots:
            material = slot.material
            if material is None or not material.use_nodes:
                continue
            if material.get("tintWired"):
                continue
            tree = material.node_tree
            bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if bsdf is None:
                continue
            base = bsdf.inputs["Base Color"]
            source = base.links[0].from_socket if base.is_linked else None
            attribute = tree.nodes.new("ShaderNodeVertexColor")
            attribute.layer_name = mesh.data.color_attributes[0].name
            mix = tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            if source is not None:
                tree.links.new(source, mix.inputs[6])
            else:
                mix.inputs[6].default_value = base.default_value
            tree.links.new(attribute.outputs["Color"], mix.inputs[7])
            tree.links.new(mix.outputs["Result"], base)
            material["tintWired"] = True
            wired.append(material.name)
    print("TINT_WIRED %s" % sorted(set(wired)))
    return wired


def bounds(meshes):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, world.x), min(lo.y, world.y), min(lo.z, world.z)))
            hi = Vector((max(hi.x, world.x), max(hi.y, world.y), max(hi.z, world.z)))
    return lo, hi


def studio(target=None, scale=1.0):
    """Neutral three-point light and a grey backdrop, same for every shot."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    # Standard view transform with a little negative exposure. Three rounds of
    # dropping light power (0.55 -> 0.34 -> 0.22) never recovered the face: the
    # skin was clipping in the view transform, not in the lighting, so the brows
    # and mouth were being crushed out no matter how dim the key got.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.0
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.16, 0.18, 0.22, 1.0)
    scene.world = world
    # The character faces -Y, so the key sits on that side. At 900 W it was far
    # too dim for the face close-up and the head fell into shadow; at 3200 W it
    # blew the face out to flat white. Neither is evidence anyone can judge a
    # face from. These values read on skin at close range without clipping.
    for name, location, energy, size in (
        ("key", (1.7, -2.6, 2.2), 1250.0, 2.4),
        ("fill", (-2.4, -1.9, 1.3), 520.0, 3.0),
        ("front", (0.0, -2.2, 1.5), 620.0, 2.0),
        ("rim", (0.0, 3.0, 2.4), 700.0, 3.0),
    ):
        light = bpy.data.lights.new(name, type="AREA")
        light.energy = energy * scale
        light.size = size
        obj = bpy.data.objects.new(name, light)
        obj.location = location
        bpy.context.collection.objects.link(obj)
        track = obj.constraints.new("TRACK_TO")
        track.track_axis = "TRACK_NEGATIVE_Z"
        track.up_axis = "UP_Y"
        if target is not None:
            track.target = target


def camera(target, distance, azimuth_deg, elevation, fov):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.angle = fov
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.collection.objects.link(cam)
    a = math.radians(azimuth_deg)
    cam.location = target + Vector((math.sin(a) * distance,
                                    -math.cos(a) * distance,
                                    elevation))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


WRITTEN = []


def shoot(path, width=900, height=1200):
    WRITTEN.append(os.path.basename(path))
    scene = bpy.context.scene
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def face_proof(meshes, armature):
    """Head-bone position plus an anatomy check of which way it faces."""
    body = max(meshes, key=lambda o: len(o.data.vertices))
    bone = armature.pose.bones.get("head") or armature.pose.bones.get("head_01")
    if bone is None:
        raise SystemExit("no head bone")
    head = armature.matrix_world @ bone.head
    # Forward from the rig root, brought into the body's own space along with
    # the vertices, so animated and bind-pose data are never mixed.
    forward = (armature.matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))).normalized()
    world = body.matrix_world
    zs = [(world @ v.co).z for v in body.data.vertices]
    floor = min(zs) + (max(zs) - min(zs)) * 0.86
    ahead = behind = 0
    cx = cy = 0.0
    n = 0
    for v in body.data.vertices:
        p = world @ v.co
        if p.z < floor:
            continue
        cx += p.x
        cy += p.y
        n += 1
    cx /= max(n, 1)
    cy /= max(n, 1)
    for v in body.data.vertices:
        p = world @ v.co
        if p.z < floor:
            continue
        d = (p.x - cx) * forward.x + (p.y - cy) * forward.y
        if d > 0.002:
            ahead += 1
        elif d < -0.002:
            behind += 1
    return head, forward, ahead, behind


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--musketeer", required=True)
    parser.add_argument("--hero", default=None)
    parser.add_argument("--warrior", default=None)
    parser.add_argument("--shield", default=None)
    args = parser.parse_args(argv)
    os.makedirs(OUT, exist_ok=True)

    # --- orbit views + action poses -----------------------------------
    clear()
    meshes, armature = load(args.musketeer)
    apply_vertex_colour(meshes)
    # BIND POSE FIRST, and before `bounds` -- everything from here to the end
    # of the close-ups is supposed to be the asset standing still.
    #
    # It was not. rest_pose ran only for the LOD sheet and the Hero pair, so
    # the orbits, the face shot and every close-up were rendered on whatever
    # frame the scene happened to be sitting on with the NLA tracks live. The
    # side view showed a character leaning back about 20 degrees -- invisible
    # from the front, which is why it survived several rounds of review -- and
    # the close-ups were aimed at rig landmarks in their REST positions while
    # the mesh was somewhere else, which is how the boot shot came back with no
    # boot in it. Framing and bounds are both computed after this now.
    rest_pose(armature)
    focus = bpy.data.objects.new('focus', None)
    bpy.context.collection.objects.link(focus)
    lo0, hi0 = bounds(meshes)
    focus.location = ((lo0.x + hi0.x) * 0.5, (lo0.y + hi0.y) * 0.5,
                      lo0.z + (hi0.z - lo0.z) * 0.62)
    # The kit is olive canvas and dark hide; at full key they both washed out
    # to pale grey and the leather stopped being distinguishable from the
    # cloth, which is one of the things these shots exist to judge.
    # Skin clipped to pure white at 0.55 and the face lost its brows, eyes
    # and mouth -- the one thing a face close-up exists to show.
    # 1250 W of area light at 2.5 m is far more than a 1.7 m figure needs:
    # skin at 0.721 base albedo clipped white and took the brows and mouth
    # with it. Dropping the light power is what fixed it; three rounds of
    # tweaking the view transform never could.
    studio(focus, scale=0.10)
    lo, hi = bounds(meshes)
    height = hi.z - lo.z
    centre = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z + height * 0.52))
    for label, azimuth in ORBITS:
        camera(centre, height * 2.30, azimuth, height * 0.10, 0.62)
        shoot(os.path.join(OUT, "musketeer-%s.png" % label))

    head, forward, ahead, behind = face_proof(meshes, armature)
    print("FACE_PROOF %s" % {"ahead": ahead, "behind": behind})
    if ahead <= behind:
        raise SystemExit(
            "face camera would frame the BACK of the head (%d ahead vs %d behind)"
            % (ahead, behind))
    # The head BONE is at the skull base. Aiming 0.045 above it put the hood
    # across the top of frame and cut the jaw off the bottom; 0.02 with a
    # longer lens frames brow to chin.
    aim = head + Vector((0.0, 0.0, height * 0.020))
    cam_pos = aim + forward * (height * 0.46)
    cam_data = bpy.data.cameras.new("face")
    cam_data.angle = 0.62
    cam = bpy.data.objects.new("face", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = cam_pos
    cam.rotation_euler = (aim - cam_pos).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    shoot(os.path.join(OUT, "musketeer-face.png"), 900, 900)

    # --- close-ups on rig landmarks ------------------------------------
    for label, bone_name, lift, span, fov in DETAILS:
        bone = armature.pose.bones.get(bone_name) if armature else None
        if bone is None:
            raise SystemExit(
                "close-up %r asks for bone %r, which this rig does not have: %s"
                % (label, bone_name,
                   ", ".join(sorted(b.name for b in armature.pose.bones))))
        target = (armature.matrix_world @ bone.head) + Vector((0.0, 0.0, height * lift))
        # Look in from OUTSIDE the body. A fixed azimuth put the camera inside
        # the sleeve for the hand shots -- 34 degrees from a landmark that sits
        # at the character's side points straight into the torso, and the
        # close-up came back as a wall of cloth.
        away = Vector((target.x - centre.x, target.y - centre.y, 0.0))
        if away.length < 1e-3:
            away = Vector((0.0, -1.0, 0.0))
        away.normalize()
        # Swing it forward a little so the shot is three-quarter, not flat side.
        away = (away + Vector((0.0, -0.65, 0.0))).normalized()
        distance = height * span
        cam_data = bpy.data.cameras.new(label)
        cam_data.angle = fov
        cam = bpy.data.objects.new(label, cam_data)
        bpy.context.collection.objects.link(cam)
        cam.location = target + away * distance + Vector((0.0, 0.0, distance * 0.22))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.scene.camera = cam
        # Aim the lights at what is being photographed. They TRACK_TO the
        # whole-body focus, which is right for the orbits and wrong here: a
        # boot at z = 0.15 or a grip at the character's side sits at the very
        # edge of a beam pointed at the chest, and the grip close-up came back
        # too dark to judge leather against cloth -- which is the one thing it
        # exists to show.
        focus.location = target
        bpy.context.view_layer.update()
        shoot(os.path.join(OUT, "musketeer-%s.png" % label), 900, 900)
    focus.location = centre

    if armature and armature.animation_data:
        for label, clip, phase in POSES:
            action = bpy.data.actions.get(clip)
            if action is None:
                continue
            armature.animation_data.action = action
            start, end = action.frame_range
            bpy.context.scene.frame_set(int(start + (end - start) * phase))
            bpy.context.view_layer.update()
            camera(centre, height * 2.30, 38.0, height * 0.10, 0.62)
            shoot(os.path.join(OUT, "musketeer-%s.png" % label))

    # --- LOD comparison -------------------------------------------------
    lod_frames = []
    for level in (0, 1, 2):
        for obj in meshes:
            obj.hide_render = ("LOD%d_" % level) not in obj.name
        rest_pose(armature)
        camera(centre, height * 2.30, 20.0, height * 0.10, 0.62)
        frame = os.path.join(OUT, "_lod%d.png" % level)
        shoot(frame, 620, 1000)
        lod_frames.append(frame)
    for obj in meshes:
        obj.hide_render = False
    composite(lod_frames, os.path.join(OUT, "musketeer-lod-comparison.png"))
    for frame in lod_frames:
        os.remove(frame)

    # --- silhouette comparison ----------------------------------------
    # Rendered as two separate passes and composited, so NOTHING is moved.
    #
    # Putting both characters in one scene meant translating one of them, and
    # every version of that was wrong: shifting only the meshes left them
    # skinned to an armature still at the origin, and shifting the meshes AND
    # the armature applied the offset twice, because the armature modifier
    # evaluates in world space. Either way the Hero came out with stretched
    # arms and off the ground -- a comparison shot that proved nothing about
    # either silhouette, which is exactly the failure mode this whole evidence
    # standard exists to catch.
    #
    # Each character is therefore rendered alone, in its own hierarchy, at its
    # own origin, against the SAME absolute camera: same world position, same
    # target, same focal length, same lights, same ground plane at z = 0. The
    # camera is deliberately NOT scaled to body height -- scaling it per subject
    # is how you manufacture a height difference, or hide one.
    if args.hero:
        panels = []
        for label, path in (("hero", args.hero), ("warrior", args.warrior),
                            ("shield", args.shield), ("musketeer", args.musketeer)):
            if path is None:
                continue
            clear()
            subject, arm = load(path)
            apply_vertex_colour(subject)
            # Force the bind pose on BOTH. The action loop above leaves the
            # scene sitting on a Run frame, and a freshly imported rig with NLA
            # tracks is evaluated at whatever frame is current -- which is why
            # the Hero appeared with his arms stretched across the frame and his
            # feet off the ground even though nothing had been moved. A
            # comparison is only a comparison if both are in the same pose.
            rest_pose(arm)
            focus = bpy.data.objects.new("focus", None)
            bpy.context.collection.objects.link(focus)
            focus.location = (0.0, 0.0, PAIR_AIM.z)
            studio(focus, scale=0.24)
            cam_data = bpy.data.cameras.new("pair")
            cam_data.angle = PAIR_FOV
            cam = bpy.data.objects.new("pair", cam_data)
            bpy.context.collection.objects.link(cam)
            cam.location = PAIR_EYE
            cam.rotation_euler = (PAIR_AIM - PAIR_EYE).to_track_quat("-Z", "Y").to_euler()
            bpy.context.scene.camera = cam
            lo, hi = bounds(subject)
            print("PAIR_SUBJECT %s" % {"who": label,
                                       "height": round(hi.z - lo.z, 4),
                                       "feetZ": round(lo.z, 4)})
            frame = os.path.join(OUT, "_pair-%s.png" % label)
            shoot(frame, PAIR_W, PAIR_H)
            panels.append(frame)
        composite(panels, os.path.join(OUT, "roster-four.png"))
        for frame in panels:
            os.remove(frame)

    # The files this run WROTE, not everything sitting in the directory.
    # Listing the directory reported `musketeer-side.png` and `musketeer-melee.png`
    # as fresh evidence for months after the orbit and pose sets stopped
    # producing them -- nothing in this script writes those names. Stale
    # evidence that announces itself as current is worse than no evidence.
    print("MUSKETEER_EVIDENCE_OK %s" % ", ".join(sorted(WRITTEN)))


if __name__ == "__main__":
    main()
