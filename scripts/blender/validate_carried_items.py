"""Every carried item, on the right bone, on the right character, out of him.

The Warrior had one carried mesh and `validate_warrior_weapon.py` covers it.
The Shield has two, and two is where the interesting failures live: a shield
that quietly shares the sidearm's bone still renders, still passes a triangle
budget, and swings from the wrong wrist; a `weaponTip` written onto the shield
rather than the hammer puts `axe_tip` on a slab; and a shield large enough to
be worth carrying is large enough to sit inside the torso without anyone
noticing from the front.

WHY THE CONTAINMENT TEST IS SHAPED THIS WAY
-------------------------------------------
Inherited whole from the Warrior round, where three cheaper versions each
returned a confident wrong answer:

  `closest_point_on_mesh` plus a normal dot product needs a closed mesh. These
  bodies are culled open, and it reported 0.284 m of penetration on an arm a
  tenth that thick.

  Single-axis ray parity is meaningless against a coat built from overlapping
  shells -- one ray crosses three or five surfaces. It called points 0.387 m
  clear of any cloth "inside".

  Capping that noise with "and within 0.12 m of a surface" discarded exactly
  the deep penetrations it existed to catch, because a slab buried in the
  torso is FURTHER from the cloth than one grazing it.

Four axes voting, no distance cap.

Anything within GRIP_RADIUS of the item's own bone is skipped: that volume is
inside the fist or under the strap, it is invisible, and counting it makes a
SMALLER item score worse than a larger one.
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

SAMPLING = (("Idle", 17), ("Walk", 21), ("Run", 21), ("MeleeAttack", 41),
            ("Hit", 21), ("Death", 17), ("RangedAttack", 21))

GRIP_RADIUS = 0.16

PROBES = (Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0)),
          Vector((0.0, 0.0, 1.0)), Vector((1.0, 1.0, 1.0)).normalized())


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def inside(point, meshes, depsgraph):
    for mesh in meshes:
        evaluated = mesh.evaluated_get(depsgraph)
        local = evaluated.matrix_world.inverted() @ point
        odd = 0
        for axis in PROBES:
            crossings = 0
            origin = local.copy()
            for _ in range(24):
                hit, position, _n, _i = evaluated.ray_cast(origin, axis)
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
    # "name=bone" for every item the asset is supposed to carry. Declared
    # rather than inferred: an item silently missing from the export is the
    # failure this is here to catch, and something inferred from the file
    # cannot be missing from it.
    parser.add_argument("--expect", action="append", default=[],
                        help="mesh-name-fragment=bone, e.g. Sword=hand.R")
    parser.add_argument("--tip-on", default=None,
                        help="mesh fragment that must own the weaponTip locator")
    args = parser.parse_args(argv)

    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects
              if o.type == "MESH" and o.name.startswith("LOD0")]

    checks = []
    failures = []

    def check(name, ok, detail):
        checks.append({"check": name, "pass": bool(ok), **detail})
        if not ok:
            failures.append(name)

    expected = []
    for entry in args.expect:
        fragment, _, bone = entry.partition("=")
        expected.append((fragment, bone))

    carried = []
    for fragment, bone in expected:
        found = [m for m in meshes if fragment in (m.data.name or "")]
        check("%s is present in the export" % fragment, len(found) == 1,
              {"matches": [m.data.name for m in found],
               "allMeshes": [m.data.name for m in meshes]})
        if len(found) != 1:
            continue
        obj = found[0]
        carried.append((fragment, bone, obj))

        # --- rigid, and on the declared bone --------------------------
        groups = {g.index: g.name for g in obj.vertex_groups}
        weight = {}
        for vertex in obj.data.vertices:
            for entry in vertex.groups:
                if entry.weight > 1e-4:
                    key = groups.get(entry.group, "?")
                    weight[key] = weight.get(key, 0.0) + entry.weight
        total = sum(weight.values()) or 1.0
        dominant = max(weight, key=weight.get) if weight else None
        share = weight.get(dominant, 0.0) / total
        check("%s is rigid on one bone" % fragment,
              share > 0.999 and len(weight) == 1,
              {"bone": dominant, "share": round(share, 5),
               "bones": sorted(weight)})
        check("%s is on %s" % (fragment, bone), dominant == bone,
              {"bone": dominant, "expected": bone})

    # --- no two items may share a bone --------------------------------
    bones_used = {}
    for fragment, bone, _obj in carried:
        bones_used.setdefault(bone, []).append(fragment)
    shared = {b: f for b, f in bones_used.items() if len(f) > 1}
    check("no two carried items share a bone", not shared, {"shared": shared})

    # --- the tip locator belongs to the weapon, not the shield ---------
    tip = bpy.data.objects.get("axe_tip")
    if args.tip_on and tip is not None:
        owner = [m for m in meshes if args.tip_on in (m.data.name or "")]
        other = [m for _f, _b, m in carried if args.tip_on not in (m.data.name or "")]
        if owner:
            points = [owner[0].matrix_world @ v.co for v in owner[0].data.vertices]
            on_weapon = min((tip.matrix_world.translation - p).length for p in points)
            check("axe_tip sits on %s" % args.tip_on, on_weapon < 0.020,
                  {"metresToNearestVertex": round(on_weapon, 5)})
            for slab in other:
                slab_points = [slab.matrix_world @ v.co for v in slab.data.vertices]
                on_slab = min((tip.matrix_world.translation - p).length
                              for p in slab_points)
                check("axe_tip is NOT on %s" % slab.data.name.split(".")[0],
                      on_slab > on_weapon,
                      {"metresToWeapon": round(on_weapon, 5),
                       "metresToThis": round(on_slab, 5)})

    # --- and none of them ends up inside him ---------------------------
    body = [m for m in meshes
            if not any(m is obj for _f, _b, obj in carried)]
    if armature.animation_data is None:
        armature.animation_data_create()
    for track in list(armature.animation_data.nla_tracks):
        armature.animation_data.nla_tracks.remove(track)

    scene = bpy.context.scene
    per_item = {}
    for fragment, bone, obj in carried:
        pose_bone = armature.pose.bones.get(bone)
        worst = 0.0
        contacts = 0
        frames = 0
        per_clip = {}
        for name, count in SAMPLING:
            action = bpy.data.actions.get(name)
            if action is None:
                continue
            armature.animation_data.action = action
            start, end = action.frame_range
            clip_contacts = 0
            clip_worst = 0.0
            for index in range(count):
                scene.frame_set(int(start + (end - start) * index / (count - 1.0)))
                depsgraph = bpy.context.evaluated_depsgraph_get()
                posed = obj.evaluated_get(depsgraph)
                anchor = (armature.matrix_world @ pose_bone.head
                          if pose_bone else Vector((0.0, 0.0, 0.0)))
                frames += 1
                for vertex in posed.data.vertices:
                    world = posed.matrix_world @ vertex.co
                    if (world - anchor).length < GRIP_RADIUS:
                        continue
                    depth = inside(world, body, depsgraph)
                    if depth > 0.0:
                        contacts += 1
                        clip_contacts += 1
                        worst = max(worst, depth)
                        clip_worst = max(clip_worst, depth)
            per_clip[name] = {"frames": count, "contacts": clip_contacts,
                              "deepestMetres": round(clip_worst, 5)}
        per_item[fragment] = {"contacts": contacts,
                              "deepestMetres": round(worst, 5),
                              "framesSampled": frames, "perClip": per_clip}
        check("%s never enters the character" % fragment, contacts == 0,
              per_item[fragment])

    print("CARRIED_REPORT %s" % json.dumps(
        {"checks": checks, "failed": failures, "pass": not failures}, indent=1))
    if failures:
        raise SystemExit("carried-item validation FAILED: %s" % "; ".join(failures))
    print("CARRIED_PASS")


if __name__ == "__main__":
    main()
