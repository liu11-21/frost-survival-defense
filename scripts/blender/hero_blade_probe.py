"""Which vertices are the blade made of, and what are they bound to?

Edge growth found the tearing but does not say where the metre of geometry
went. Displacement does: at the impact frame, the vertices that end up furthest
from where they started ARE the spike, and their weights name the bone that
dragged them there.

Reported next to each vertex is its rest position as a fraction of the mesh's
own bounding box, so "this is a shoulder vertex being pulled to the hand" and
"this is a hand vertex doing what hand vertices do" can be told apart without
a shared coordinate frame.

    node scripts/run-blender.mjs scripts/blender/hero_blade_probe.py \\
        --input public/assets/models/characters/hero_male.glb
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def evaluated_points(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    source = obj.evaluated_get(depsgraph)
    mesh = source.to_mesh()
    points = [v.co.copy() for v in mesh.vertices]
    source.to_mesh_clear()
    return points


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--clip", default="MeleeAttack")
    parser.add_argument("--phase", type=float, default=0.6)
    parser.add_argument("--top", type=int, default=8)
    args = parser.parse_args(argv)

    path = os.path.abspath(os.path.join(ROOT, args.input))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    print("BLADE_INPUT abs=%s" % path)

    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects
              if o.type == "MESH" and o.name.upper().startswith("LOD0")] \
        or [o for o in bpy.data.objects if o.type == "MESH"]

    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    rests = {obj.name: evaluated_points(obj) for obj in meshes}

    action = next((a for a in bpy.data.actions if args.clip in a.name), None)
    if action is None:
        raise SystemExit("no %s action" % args.clip)
    armature.animation_data.action = action
    if hasattr(armature.animation_data, "action_slot") and action.slots:
        armature.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    bpy.context.scene.frame_set(int(round(start + (end - start) * args.phase)))
    bpy.context.view_layer.update()

    for obj in meshes:
        posed = evaluated_points(obj)
        rest = rests[obj.name]
        if len(posed) != len(rest):
            continue
        names = {g.index: g.name for g in obj.vertex_groups}
        lo = [min(p[axis] for p in rest) for axis in range(3)]
        hi = [max(p[axis] for p in rest) for axis in range(3)]
        moved = sorted(((posed[i] - rest[i]).length, i) for i in range(len(rest)))
        moved.reverse()
        rows = []
        for distance, index in moved[:args.top]:
            weights = sorted(((names.get(g.group, "?"), round(g.weight, 3))
                              for g in obj.data.vertices[index].groups),
                             key=lambda pair: -pair[1])[:3]
            rows.append({
                "v": index,
                "moved_m": round(distance, 4),
                "restBox": [round((rest[index][a] - lo[a]) / max(hi[a] - lo[a], 1e-9), 2)
                            for a in range(3)],
                "weights": [list(w) for w in weights],
            })
        print("BLADE %-24s median=%.4f  top=%s"
              % (obj.name, moved[len(moved) // 2][0], json.dumps(rows[:args.top])))


if __name__ == "__main__":
    main()
