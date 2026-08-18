"""Semantic validation of the ally contract for a FIREARM.

`validate_warrior_semantics.py` is the same idea and most of the same code, and
it stays exactly as it is: it encodes what an axe is. Three of its rules are
statements about an axe specifically, and every one of them is false here --

    "weapon_socket sits at the right hand"
        The musket is carried in the LEFT. That is not a style choice; it is
        the only clip in the set that is asymmetric (MeleeAttack, 0.117 m of
        left-hand travel against 0.753 m of right) and it was the only clip
        that ever collided. The hand is not hardcoded in either direction here:
        it is read off the weapon's own weights, which is also how the adapter
        now places the locators.

    "axe_tip is the point standing furthest OFF the haft"
        On an axe that is the steel. On a musket the point standing furthest
        off the long axis is the lock plate or the trigger guard, and the tip
        belongs on the MUZZLE. This is what the kit's `tipRule = "far"`
        declares and what this checks: furthest ALONG the axis, and nearly on
        it rather than off it.

    "the head stands proud enough to read as an axe"
        A firearm that had a head standing 0.06 m off its axis would be a
        defect. The equivalent statement about a musket is that the barrel is
        long and thin, so that is what is measured -- a length-to-width ratio
        no blade or axe head could pass.

Everything else -- stray meshes, the skinned skeleton, the LOD markers, the
socket being coincident with upper_grip, nothing stranded in the wrong
coordinate system, attackAnchor in front of the chest -- is about the contract
and not about the weapon, so it is identical on purpose.

As there, every threshold is a fraction of the character's own measured height.
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def load(path):
    """Import the GLB and return ONLY what it brought with it.

    MPFB leaves an Icosphere in the startup scene and creates another DURING
    the import, so neither "everything in the file" nor a naive before/after
    diff measures the asset. Parentage under UnitRoot is the honest test.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))
    for obj in list(before):
        bpy.data.objects.remove(obj, do_unlink=True)
    return [o for o in bpy.data.objects if o not in before]


def find(name):
    return bpy.data.objects.get(name)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    args = parser.parse_args(argv)

    load(args.glb)
    checks = []
    fail = []

    def check(name, ok, detail):
        checks.append({"check": name, "pass": bool(ok), **detail})
        if not ok:
            fail.append(name)

    def in_asset(obj):
        node = obj
        while node is not None:
            if node.name == "UnitRoot":
                return True
            node = node.parent
        return False

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and in_asset(o)]
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE" and in_asset(o)]

    # --- body frame, from the SKINNED meshes only -----------------------
    body_meshes = [m for m in meshes
                   if any(mod.type == "ARMATURE" for mod in m.modifiers)] or meshes
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in body_meshes:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    height = hi.z - lo.z
    centre = (lo + hi) * 0.5

    stray = [m.name for m in meshes
             if m not in body_meshes and not m.name.startswith("COL_")]
    check("no unskinned stray meshes in the export", not stray, {"stray": stray})

    skeleton = find("UnitSkeleton")
    skinned = [m for m in meshes
               if any(mod.type == "ARMATURE" and mod.object is skeleton
                      for mod in m.modifiers)]
    check("UnitSkeleton is a skinned armature",
          skeleton is not None and skeleton.type == "ARMATURE" and bool(skinned),
          {"armatures": [a.name for a in armatures],
           "skinnedMeshes": len(skinned),
           "bones": len(skeleton.data.bones) if skeleton else 0})

    for level in ("LOD1", "LOD2"):
        node = find(level)
        check("%s node present after export" % level, node is not None,
              {"found": node.name if node else None})

    # --- the weapon, and the hand it is actually bound to ----------------
    #
    # Found by weights, not by name and not by side. An asset whose locators
    # describe one hand while its geometry is rigid to the other is precisely
    # the failure this exists to catch, and hardcoding either side here would
    # make the check agree with whichever mistake the pipeline made.
    weapon = None
    for obj in meshes:
        name = (obj.data.name or "")
        if "Sword" in name or "Axe" in name:
            weapon = obj
            break
    grip_bone = None
    if weapon is not None and weapon.vertex_groups:
        weight = {}
        names = {g.index: g.name for g in weapon.vertex_groups}
        for vertex in weapon.data.vertices:
            for entry in vertex.groups:
                if entry.weight > 1e-4:
                    key = names.get(entry.group, "")
                    weight[key] = weight.get(key, 0.0) + entry.weight
        if weight:
            grip_bone = max(weight, key=weight.get)
    check("the musket is rigid to a single hand bone",
          grip_bone in ("hand.L", "hand_l", "hand.R", "hand_r"),
          {"bone": grip_bone})

    hand = None
    if skeleton and grip_bone:
        # REST position. The GLB ships a bind pose, and comparing a locator
        # against a pose-space bone measures the pose, not the contract.
        bone = skeleton.data.bones.get(grip_bone)
        if bone:
            hand = skeleton.matrix_world @ bone.head_local

    socket = find("weapon_socket")
    upper = find("upper_grip")
    lower = find("lower_grip")
    tip = find("axe_tip")
    anchor = find("attackAnchor")
    places = {}
    for name, node in (("weapon_socket", socket), ("upper_grip", upper),
                       ("lower_grip", lower), ("axe_tip", tip),
                       ("attackAnchor", anchor)):
        places[name] = node.matrix_world.translation.copy() if node else None

    if hand is not None and places["weapon_socket"] is not None:
        distance = (places["weapon_socket"] - hand).length
        check("weapon_socket sits at the hand the musket is bound to",
              distance < height * 0.09,
              {"bone": grip_bone, "metres": round(distance, 4),
               "limit": round(height * 0.09, 4)})

    if places["weapon_socket"] is not None and places["upper_grip"] is not None:
        d = (places["weapon_socket"] - places["upper_grip"]).length
        check("weapon_socket is coincident with upper_grip", d < 0.005,
              {"metres": round(d, 5)})

    # --- barrel: the tip is the muzzle, and the thing is a firearm -------
    if (weapon is not None and len(weapon.data.vertices) > 8
            and all(places[k] is not None
                    for k in ("upper_grip", "lower_grip", "axe_tip"))):
        points = [weapon.matrix_world @ v.co for v in weapon.data.vertices]
        grip_point = places["upper_grip"]
        far = max(points, key=lambda p: (p - grip_point).length)
        axis = (far - grip_point)
        axis = axis.normalized() if axis.length > 1e-6 else Vector((0.0, 0.0, 1.0))

        def off_axis(point):
            v = point - grip_point
            return (v - axis * v.dot(axis)).length

        # The support hand goes on the fore-stock: along the barrel, toward the
        # muzzle, and ON the axis rather than merely somewhere near the weapon.
        down = places["lower_grip"] - places["upper_grip"]
        check("lower_grip is a hand's spacing along the stock from upper_grip",
              height * 0.05 < down.length < height * 0.22,
              {"metres": round(down.length, 4)})
        strayed = off_axis(places["lower_grip"])
        check("lower_grip lies on the barrel axis", strayed < height * 0.020,
              {"offAxisMetres": round(strayed, 4),
               "limit": round(height * 0.020, 4)})
        check("lower_grip runs toward the muzzle, not toward the butt",
              down.normalized().dot(axis) > 0.9,
              {"cosine": round(down.normalized().dot(axis), 4)})

        # THE TIP IS THE MUZZLE. The axe rule -- furthest OFF the axis -- picks
        # the lock plate here, which is why the kit declares `tipRule = "far"`.
        # The two halves of that: furthest ALONG, and essentially ON.
        reach_along = max((p - grip_point).dot(axis) for p in points)
        tip_along = (places["axe_tip"] - grip_point).dot(axis)
        check("axe_tip is the point furthest along the barrel",
              reach_along > 1e-6 and tip_along > reach_along * 0.98,
              {"tipAlongAxis": round(tip_along, 4),
               "furthestOnMesh": round(reach_along, 4)})
        tip_off = off_axis(places["axe_tip"])
        check("axe_tip is on the barrel axis, not off to one side",
              tip_off < height * 0.012,
              {"offAxisMetres": round(tip_off, 4),
               "limit": round(height * 0.012, 4)})
        on_mesh = min((places["axe_tip"] - p).length for p in points)
        check("axe_tip sits on the weapon surface", on_mesh < height * 0.010,
              {"metresToNearestVertex": round(on_mesh, 5)})

        # And it has to be a long arm. A blade or an axe head cannot pass this:
        # the weapon is measured along its own axis against its own widest
        # point, and a musket is an order of magnitude longer than it is wide.
        widest = max(off_axis(p) for p in points)
        total = max((p - grip_point).dot(axis) for p in points) \
            - min((p - grip_point).dot(axis) for p in points)
        check("the musket is long and thin enough to read as a firearm",
              total > height * 0.55 and widest < height * 0.06
              and total > widest * 8.0,
              {"lengthMetres": round(total, 4),
               "widestOffAxisMetres": round(widest, 4),
               "ratio": round(total / widest, 2) if widest > 1e-6 else None})

    # --- nothing stranded in the wrong coordinate system ----------------
    reach = height * 0.75
    for name, position in places.items():
        if position is None:
            continue
        offset = position - centre
        check("%s is on the character, not in space" % name,
              offset.length < reach,
              {"metresFromCentre": round(offset.length, 4),
               "limit": round(reach, 4)})

    # --- attackAnchor is in front of the chest --------------------------
    if places["attackAnchor"] is not None:
        anchor_pos = places["attackAnchor"]
        chest_lo = lo.z + height * 0.50
        chest_hi = lo.z + height * 0.80
        check("attackAnchor is at chest height",
              chest_lo <= anchor_pos.z <= chest_hi,
              {"z": round(anchor_pos.z, 4),
               "band": [round(chest_lo, 4), round(chest_hi, 4)]})
        forward = centre.y - anchor_pos.y
        check("attackAnchor is in front of the body, within reach",
              height * 0.05 < forward < height * 0.45,
              {"forwardMetres": round(forward, 4),
               "band": [round(height * 0.05, 4), round(height * 0.45, 4)]})

    report = {
        "glb": os.path.abspath(args.glb),
        "measuredHeight": round(height, 4),
        "feetZ": round(lo.z, 4),
        "gripBone": grip_bone,
        "locators": {k: [round(c, 4) for c in v] if v else None
                     for k, v in places.items()},
        "checks": checks,
        "failed": fail,
        "pass": not fail,
    }
    print("SEMANTIC_REPORT %s" % json.dumps(report, indent=1))
    if fail:
        raise SystemExit("firearm contract semantics FAILED: %s" % ", ".join(fail))
    print("SEMANTIC_PASS")


if __name__ == "__main__":
    main()
