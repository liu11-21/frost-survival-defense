"""Does the Warrior actually carry the axe, and does the axe stay out of him?

The ally contract validator checks that the locators describe the weapon. This
one checks the two things a contract cannot: that the weapon is rigged to one
hand and nothing else, and that no part of it ends up inside the character on
any frame of any animation.

WHY THE INSIDE TEST LOOKS LIKE THIS
-----------------------------------
Three cheaper tests were tried first and each of them lied.

`closest_point_on_mesh` plus a normal dot product is the textbook containment
test and it needs a closed mesh. The body here is not closed -- hidden faces
are culled away -- so it reported 0.284 m of penetration on an arm a tenth
that thick.

Single-axis ray parity is not enough either. The coat is several overlapping
shells (jacket, mantle, retagged surcoat), so one ray crosses three or five
surfaces and the parity is meaningless. It reported points 0.387 m clear of
any cloth as being inside the character.

Adding "and within 0.12 m of a surface" to suppress that noise made it worse
in the direction that matters: a head buried in the torso is FURTHER from the
cloth than one grazing it, so the rule discarded exactly the deep penetrations
it was meant to catch, and the search built on it was non-monotonic -- a
bigger axe head scoring cleaner than a smaller one at the same position.

Four independent axes voting rejects the multi-shell noise without discarding
depth. That is what is used here.

TWO THINGS THAT ARE DELIBERATELY NOT FAILURES
---------------------------------------------
Anything within GRIP_RADIUS of the hand is skipped. That volume is inside the
fist and the sleeve, it is invisible, and counting it makes a SHORTER blade
score worse than a long one, which is how an earlier search talked itself into
shrinking the head for no benefit.

Sampling is denser for MeleeAttack than for the rest. It is the fastest thing
the character does, so it is the easiest to step over: nine frames per
animation passed a build that thirteen frames caught with 30 mm of steel
inside the coat, and seventeen frames caught the next one with 16 mm. The
ceiling only stopped moving at forty-one.
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

# Frames per animation. MeleeAttack gets the dense pass -- see the module note.
SAMPLING = (("Idle", 17), ("Walk", 21), ("Run", 21), ("MeleeAttack", 41),
            ("Hit", 21), ("Death", 17), ("RangedAttack", 21))

# Inside this radius of the hand the weapon is behind the fist and the cuff.
GRIP_RADIUS = 0.16

# Four axes, three must agree. Three would let an axis-aligned coincidence
# through; four with a majority tolerates one bad crossing per point.
PROBES = (Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)),
          Vector((0.0, 0.0, 1.0)), Vector((1.0, 1.0, 1.0)).normalized())

# Radial distance from the haft axis past which geometry counts as the HEAD
# rather than the shaft. The haft is 0.021 and its collar 0.028.
HEAD_RADIUS = 0.045


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def inside(point, meshes, depsgraph):
    """Depth in metres if `point` is within one of `meshes`, else 0."""
    for mesh in meshes:
        evaluated = mesh.evaluated_get(depsgraph)
        local = evaluated.matrix_world.inverted() @ point
        odd = 0
        for axis in PROBES:
            crossings = 0
            origin = local.copy()
            for _ in range(24):
                hit, position, _normal, _index = evaluated.ray_cast(origin, axis)
                if not hit:
                    break
                crossings += 1
                origin = position + axis * 1e-4
            if crossings % 2 == 1:
                odd += 1
        if odd >= 3:
            found, closest, _n, _i = evaluated.closest_point_on_mesh(local)
            return (local - closest).length if found else 0.001
    return 0.0


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    args = parser.parse_args(argv)

    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects
              if o.type == "MESH" and o.name.startswith("LOD0")]
    axe = next((m for m in meshes
                if "Sword" in (m.data.name or "") or "Axe" in (m.data.name or "")),
               None)

    failures = []
    checks = []

    def check(name, ok, detail):
        checks.append({"check": name, "pass": bool(ok), **detail})
        if not ok:
            failures.append(name)

    check("the character carries a weapon at all", axe is not None,
          {"meshes": [m.data.name for m in meshes]})
    if axe is None:
        print("WEAPON_REPORT %s" % json.dumps({"checks": checks, "pass": False}))
        raise SystemExit("warrior weapon validation FAILED: no weapon mesh")

    body = [m for m in meshes if m is not axe]

    # --- rigged to ONE hand -------------------------------------------
    groups = {g.index: g.name for g in axe.vertex_groups}
    used = {}
    for vertex in axe.data.vertices:
        for entry in vertex.groups:
            if entry.weight > 1e-4:
                used[groups.get(entry.group, "?")] = \
                    used.get(groups.get(entry.group, "?"), 0.0) + entry.weight
    total = sum(used.values()) or 1.0
    dominant = max(used, key=used.get) if used else None
    share = used.get(dominant, 0.0) / total
    check("the weapon is rigged to a single hand bone",
          dominant in ("hand.R", "hand_r") and share > 0.999,
          {"bone": dominant, "share": round(share, 5),
           "bones": sorted(used)})

    # --- locators describe the weapon that is there --------------------
    bone = armature.data.bones.get("hand.R") or armature.data.bones.get("hand_r")
    grip = armature.matrix_world @ bone.head_local
    points = [axe.matrix_world @ v.co for v in axe.data.vertices]
    butt = max(points, key=lambda p: (p - grip).length)
    shaft = (butt - grip)
    shaft = shaft.normalized() if shaft.length > 1e-6 else Vector((0.0, 0.0, -1.0))

    def off_axis(point):
        offset = point - grip
        return (offset - shaft * offset.dot(shaft)).length

    head = [p for p in points if off_axis(p) > HEAD_RADIUS]
    check("the head is a head, not a nub on a stick",
          len(head) >= 8 and max((off_axis(p) for p in head), default=0.0) > 0.06,
          {"headVertices": len(head),
           "reachMetres": round(max((off_axis(p) for p in head), default=0.0), 4)})

    locators = {name: bpy.data.objects[name].matrix_world.translation.copy()
                for name in ("upper_grip", "lower_grip", "axe_tip")
                if name in bpy.data.objects}
    if len(locators) == 3:
        down = locators["lower_grip"] - locators["upper_grip"]
        check("lower_grip runs down the haft from the hand",
              down.length > 1e-6 and down.normalized().dot(shaft) > 0.9,
              {"cosine": round(down.normalized().dot(shaft), 4)
               if down.length > 1e-6 else None})
        check("axe_tip is on the weapon surface",
              min((locators["axe_tip"] - p).length for p in points) < 0.017,
              {"metresToNearestVertex":
                  round(min((locators["axe_tip"] - p).length for p in points), 5)})
    else:
        check("weapon locators are present", False, {"found": sorted(locators)})

    # --- every LOD still holds an axe ----------------------------------
    for level in ("LOD1", "LOD2"):
        lod = [o for o in bpy.data.objects
               if o.type == "MESH" and o.name.startswith(level)
               and ("Sword" in (o.data.name or "") or "Axe" in (o.data.name or ""))]
        faces = sum(len(o.data.polygons) for o in lod)
        # A decimator tuned for a 6000-face body will happily reduce a 130-face
        # prop to a spike. The floor is what keeps an axe an axe at distance.
        check("%s still carries a recognisable axe" % level, faces >= 40,
              {"faces": faces})

    # --- and it stays out of him ---------------------------------------
    if armature.animation_data is None:
        armature.animation_data_create()
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)

    scene = bpy.context.scene
    worst = 0.0
    contacts = 0
    frames = 0
    per_clip = {}
    for name, count in SAMPLING:
        action = bpy.data.actions.get(name)
        if action is None:
            check("animation %s is present" % name, False, {})
            continue
        armature.animation_data.action = action
        start, end = action.frame_range
        clip_worst = 0.0
        clip_contacts = 0
        for index in range(count):
            scene.frame_set(int(start + (end - start) * index / (count - 1.0)))
            depsgraph = bpy.context.evaluated_depsgraph_get()
            posed = axe.evaluated_get(depsgraph)
            hand = armature.matrix_world @ armature.pose.bones[bone.name].head
            frames += 1
            for vertex in posed.data.vertices:
                world = posed.matrix_world @ vertex.co
                if (world - hand).length < GRIP_RADIUS:
                    continue
                depth = inside(world, body, depsgraph)
                if depth > 0.0:
                    clip_contacts += 1
                    clip_worst = max(clip_worst, depth)
        per_clip[name] = {"frames": count, "contacts": clip_contacts,
                          "deepestMetres": round(clip_worst, 5)}
        contacts += clip_contacts
        worst = max(worst, clip_worst)

    check("the axe never enters the character",
          contacts == 0,
          {"contacts": contacts, "deepestMetres": round(worst, 5),
           "framesSampled": frames, "perClip": per_clip})

    print("WEAPON_REPORT %s" % json.dumps(
        {"checks": checks, "failed": failures, "pass": not failures}, indent=1))
    if failures:
        raise SystemExit("warrior weapon validation FAILED: %s" % "; ".join(failures))
    print("WEAPON_PASS")


if __name__ == "__main__":
    main()
