"""Semantic validation of the ally contract, at transform level.

Node presence is not a contract. The JSON validator proves the runtime will
find `weapon_socket`; it says nothing about whether that socket is at the hand
or three metres behind the character in the wrong axis convention, and a
locator in the wrong place fails silently at runtime as a weapon floating in
the air.

So this re-imports the EXPORTED GLB -- not the authoring scene -- and asks
where everything actually ended up, in world space, after the exporter's own
Z-up to Y-up conversion. Anything the export mangles shows up here and nowhere
else.

Every threshold is a fraction of the character's own measured height, so this
works on a 1.70 m Warrior and a 1.84 m Hero without being retuned.
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector


def load(path):
    """Import the GLB and return ONLY what it brought with it.

    The Blender this runs in has MPFB enabled, and the add-on leaves an
    Icosphere in the startup scene. Treating everything in the file as part of
    the import reported that sphere as a stray mesh shipped inside the
    candidate -- a defect in the asset that did not exist. Diffing the object
    set around the import is the difference between measuring the GLB and
    measuring the tool that opened it.
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

    # What belongs to the asset is what hangs off UnitRoot. Diffing the object
    # set around the import was not enough: MPFB creates its Icosphere DURING
    # the import, so it landed in the diff and was reported as a stray mesh
    # shipped inside the candidate -- a defect that did not exist. Parentage is
    # the honest test, and it is also what the runtime instantiates.
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
    # Anything not bound to the rig is not the character, and letting it into
    # the measurement corrupts every threshold below: a stray 2 m debug sphere
    # in the export put "height" at 2.61 m on a 1.70 m man and inflated each
    # limit by half again.
    skeleton_probe = find("UnitSkeleton")
    body_meshes = [m for m in meshes
                   if any(mod.type == "ARMATURE" for mod in m.modifiers)] or meshes
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in body_meshes:
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
            hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
    # Blender's glTF importer converts Y-up back to Z-up, so height is along Z.
    height = hi.z - lo.z
    centre = (lo + hi) * 0.5

    # COL_* is the collision box, a deliberate part of the asset.
    stray = [m.name for m in meshes
             if m not in body_meshes and not m.name.startswith("COL_")]
    check("no unskinned stray meshes in the export", not stray,
          {"stray": stray})

    # --- UnitSkeleton is a real, skinned armature -----------------------
    skeleton = find("UnitSkeleton")
    skinned = [m for m in meshes
               if any(mod.type == "ARMATURE" and mod.object is skeleton
                      for mod in m.modifiers)]
    check("UnitSkeleton is a skinned armature",
          skeleton is not None and skeleton.type == "ARMATURE" and bool(skinned),
          {"armatures": [a.name for a in armatures],
           "skinnedMeshes": len(skinned),
           "bones": len(skeleton.data.bones) if skeleton else 0})

    # --- LOD markers survive the export --------------------------------
    for level in ("LOD1", "LOD2"):
        node = find(level)
        check("%s node present after export" % level, node is not None,
              {"found": node.name if node else None})

    # --- the hand the weapon hangs off ---------------------------------
    hand = None
    if skeleton:
        # Rest position: the GLB ships a bind pose, and comparing a locator
        # against a POSE-space bone measures the pose, not the contract.
        bone = (skeleton.data.bones.get("hand.R")
                or skeleton.data.bones.get("hand_r"))
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
        check("weapon_socket sits at the right hand", distance < height * 0.09,
              {"metres": round(distance, 4), "limit": round(height * 0.09, 4)})

    if places["weapon_socket"] is not None and places["upper_grip"] is not None:
        d = (places["weapon_socket"] - places["upper_grip"]).length
        check("weapon_socket is coincident with upper_grip", d < 0.005,
              {"metres": round(d, 5)})

    # --- haft: order, spacing, and roughly collinear --------------------
    if all(places[k] is not None for k in ("upper_grip", "lower_grip", "axe_tip")):
        down = places["lower_grip"] - places["upper_grip"]
        out = places["axe_tip"] - places["upper_grip"]
        check("lower_grip is a hand's spacing below upper_grip",
              height * 0.05 < down.length < height * 0.22,
              {"metres": round(down.length, 4)})
        # THE LOCATORS ARE CHECKED AGAINST THE WEAPON MESH, NOT AGAINST AN
        # ASSUMED WEAPON SHAPE.
        #
        # What stood here was "axe_tip is further from the hand than lower_grip
        # is, and roughly opposite it" -- true of a sword, where the point is
        # the far end of the axis, and false of this weapon. An ice axe is held
        # AT THE HEAD: the steel is a hand's width from the grip and the far end
        # is the butt of the haft. The rule would have passed a weapon with
        # axe_tip pinned to the shaft butt and failed the correct one, so
        # loosening its threshold was not the fix -- the premise was wrong.
        #
        # These replace it and are strictly harder to satisfy: they compare the
        # locators to the exported geometry, so a contract that describes a
        # weapon that is not there cannot pass, whatever shape it claims to be.
        axe_mesh = None
        for obj in meshes:
            name = (obj.data.name or "")
            if "Sword" in name or "Axe" in name:
                axe_mesh = obj
                break
        if axe_mesh is not None and len(axe_mesh.data.vertices) > 8:
            points = [axe_mesh.matrix_world @ v.co for v in axe_mesh.data.vertices]
            grip_point = places["upper_grip"]
            butt = max(points, key=lambda p: (p - grip_point).length)
            haft = (butt - grip_point)
            haft = haft.normalized() if haft.length > 1e-6 else Vector((0.0, 0.0, -1.0))

            def off_axis(point):
                v = point - grip_point
                return (v - haft * v.dot(haft)).length

            # lower_grip has to be ON the haft, not merely somewhere below the
            # hand: a support hand that misses the shaft is a broken contract.
            stray = off_axis(places["lower_grip"])
            check("lower_grip lies on the haft",
                  stray < height * 0.020,
                  {"offAxisMetres": round(stray, 4),
                   "limit": round(height * 0.020, 4)})
            check("lower_grip runs toward the butt, not away from it",
                  down.normalized().dot(haft) > 0.9,
                  {"cosine": round(down.normalized().dot(haft), 4)})

            # axe_tip has to be ON the head: the point of the weapon standing
            # furthest off the haft, and actually on the surface.
            widest = max(off_axis(p) for p in points)
            tip_off = off_axis(places["axe_tip"])
            check("axe_tip is the point standing furthest off the haft",
                  widest > 1e-6 and tip_off > widest * 0.98,
                  {"tipOffAxis": round(tip_off, 4),
                   "widestOnMesh": round(widest, 4)})
            on_mesh = min((places["axe_tip"] - p).length for p in points)
            check("axe_tip sits on the weapon surface",
                  on_mesh < height * 0.010,
                  {"metresToNearestVertex": round(on_mesh, 5)})
            # And the head has to be a head -- big enough to read, not a nub.
            check("the head stands proud enough to read as an axe",
                  height * 0.035 < widest < height * 0.30,
                  {"headReachMetres": round(widest, 4)})

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
    # The character faces -Y once Blender has converted the export back to
    # Z-up, so "in front" is a NEGATIVE y offset from the body centre.
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
        "locators": {k: [round(c, 4) for c in v] if v else None
                     for k, v in places.items()},
        "checks": checks,
        "failed": fail,
        "pass": not fail,
    }
    print("SEMANTIC_REPORT %s" % json.dumps(report, indent=1))
    if fail:
        raise SystemExit("ally contract semantics FAILED: %s" % ", ".join(fail))
    print("SEMANTIC_PASS")


if __name__ == "__main__":
    main()
