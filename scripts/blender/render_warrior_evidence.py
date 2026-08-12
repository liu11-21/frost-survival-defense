"""Warrior V1 evidence: orbit views, a real face close-up, action poses, and a
side-by-side against the Hero.

Separate from render_human_candidates.py because that harness frames a 1.84 m
Hero: its "head" shot sits at 0.935 of body height at 0.42 of it away, which on
a 1.70 m Warrior lands on the side of the hood and shows no face at all. A
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
OUT = os.path.join(ROOT, "reports", "warrior-v1")

ORBITS = (("front", 0.0), ("back", 180.0), ("side", 90.0), ("three-quarter", 38.0))
POSES = (("melee", "MeleeAttack", 0.38), ("walk", "Walk", 0.30), ("run", "Run", 0.28))


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    return meshes, armature


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


def shoot(path, width=900, height=1200):
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
    parser.add_argument("--warrior", required=True)
    parser.add_argument("--hero", default=None)
    args = parser.parse_args(argv)
    os.makedirs(OUT, exist_ok=True)

    # --- orbit views + action poses -----------------------------------
    clear()
    meshes, armature = load(args.warrior)
    focus = bpy.data.objects.new('focus', None)
    bpy.context.collection.objects.link(focus)
    lo0, hi0 = bounds(meshes)
    focus.location = ((lo0.x + hi0.x) * 0.5, (lo0.y + hi0.y) * 0.5,
                      lo0.z + (hi0.z - lo0.z) * 0.62)
    studio(focus)
    lo, hi = bounds(meshes)
    height = hi.z - lo.z
    centre = Vector(((lo.x + hi.x) * 0.5, (lo.y + hi.y) * 0.5, lo.z + height * 0.52))
    for label, azimuth in ORBITS:
        camera(centre, height * 2.30, azimuth, height * 0.10, 0.62)
        shoot(os.path.join(OUT, "warrior-%s.png" % label))

    head, forward, ahead, behind = face_proof(meshes, armature)
    print("FACE_PROOF %s" % {"ahead": ahead, "behind": behind})
    if ahead <= behind:
        raise SystemExit(
            "face camera would frame the BACK of the head (%d ahead vs %d behind)"
            % (ahead, behind))
    aim = head + Vector((0.0, 0.0, height * 0.045))
    cam_pos = aim + forward * (height * 0.34)
    cam_data = bpy.data.cameras.new("face")
    cam_data.angle = 0.62
    cam = bpy.data.objects.new("face", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = cam_pos
    cam.rotation_euler = (aim - cam_pos).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    shoot(os.path.join(OUT, "warrior-face.png"), 900, 900)

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
            shoot(os.path.join(OUT, "warrior-%s.png" % label))

    # --- silhouette comparison ----------------------------------------
    if args.hero:
        clear()
        # Move the WHOLE hierarchy, armature included. Shifting only the meshes
        # left each one skinned to an armature still at the origin, and the
        # Hero's arms stretched halfway across the frame -- the comparison shot
        # showed a deformed Hero and proved nothing about either silhouette.
        before = set(bpy.data.objects)
        w_meshes, _ = load(args.warrior)
        for obj in bpy.data.objects:
            if obj not in before and obj.parent is None:
                obj.location.x -= 0.62
        before = set(bpy.data.objects)
        h_meshes, _ = load(args.hero)
        for obj in bpy.data.objects:
            if obj not in before and obj.parent is None:
                obj.location.x += 0.62
        focus = bpy.data.objects.new('focus', None)
        bpy.context.collection.objects.link(focus)
        lo0, hi0 = bounds(w_meshes + h_meshes)
        focus.location = (0.0, 0.0, lo0.z + (hi0.z - lo0.z) * 0.55)
        studio(focus, scale=0.42)
        lo, hi = bounds(w_meshes + h_meshes)
        tall = hi.z - lo.z
        centre = Vector((0.0, 0.0, lo.z + tall * 0.52))
        camera(centre, tall * 2.05, 0.0, tall * 0.06, 0.72)
        shoot(os.path.join(OUT, "hero-vs-warrior.png"), 1400, 1100)

    print("WARRIOR_EVIDENCE_OK %s" % ", ".join(sorted(os.listdir(OUT))))


if __name__ == "__main__":
    main()
