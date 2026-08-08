"""How far is a garment vertex from the bone it was bound to?

The sleeve tears at melee impact while the body underneath it holds its
shape, under the same pose and the same skeleton. The only thing the garment
has that the body does not is a *transferred* weight, so the question worth
asking is whether the transfer put weight on bones that have no business
driving that vertex.

Distance answers it directly. A vertex weighted 0.8 to the forearm should be
within a few centimetres of the forearm. If it is 40 cm away it is somewhere
else entirely on the character, and it will fly across the screen the moment
that bone moves -- which is what a blade-shaped extrusion is.

    node scripts/run-blender.mjs scripts/blender/hero_bind_probe.py \\
        --input .runtime/mpfb/variants/hero_male_dressed.glb
"""
import argparse
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

# Bones a garment vertex may only be bound to if it is genuinely near them.
WATCH = ("lowerarm_r", "lowerarm_l", "hand_r", "hand_l", "upperarm_r", "upperarm_l",
         "lower_arm.R", "lower_arm.L", "hand.R", "hand.L")


def segment_distance(point, head, tail):
    axis = tail - head
    along = max(0.0, min(1.0, (point - head).dot(axis) / max(axis.length_squared, 1e-9)))
    return (point - (head + axis * along)).length


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args(argv)

    path = os.path.abspath(os.path.join(ROOT, args.input))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    print("PROBE_INPUT abs=%s bytes=%d" % (path, os.path.getsize(path)))

    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for obj in sorted((o for o in bpy.data.objects if o.type == "MESH"),
                      key=lambda o: o.name):
        if not obj.vertex_groups:
            continue
        names = {g.index: g.name for g in obj.vertex_groups}
        for bone_name in WATCH:
            bone = armature.data.bones.get(bone_name)
            if bone is None:
                continue
            # Compare in ARMATURE space. Mixing the mesh's world matrix with
            # the armature's put every mesh, body included, a flat ~0.9 m from
            # every bone -- half the body height, i.e. a systematic frame
            # error, not a finding.
            head = bone.head_local
            tail = bone.tail_local
            into_armature = armature.matrix_world.inverted() @ obj.matrix_world
            bound = []
            for vertex in obj.data.vertices:
                weight = sum(g.weight for g in vertex.groups
                             if names.get(g.group) == bone_name)
                if weight > args.threshold:
                    bound.append((segment_distance(into_armature @ vertex.co,
                                                   head, tail), vertex.index,
                                  round(weight, 3)))
            if not bound:
                continue
            bound.sort(reverse=True)
            # Absolute distance turned out not to discriminate: bone.head_local
            # is not in the meshes' rest frame here, so even the body's own
            # forearm vertices read ~0.9 m. Position within the model's own
            # bounding box needs no shared frame at all, and answers the
            # question that matters -- are these vertices ON the sleeve, or
            # somewhere else on the coat that merely sat next to the arm in the
            # A-pose?
            picked = [obj.data.vertices[i].co for _d, i, _w in bound]
            def spread(axis):
                values = sorted(c[axis] for c in picked)
                lo = min(v.co[axis] for v in obj.data.vertices)
                hi = max(v.co[axis] for v in obj.data.vertices)
                span = max(hi - lo, 1e-9)
                return "%.2f-%.2f" % ((values[0] - lo) / span,
                                      (values[-1] - lo) / span)
            print("PROBE_SPAN %-12s %-12s n=%d  x=%s y=%s z=%s"
                  % (obj.name, bone_name, len(bound),
                     spread(0), spread(1), spread(2)))
            print("PROBE %-12s %-12s bound=%4d maxDist=%.4f median=%.4f worst=%s"
                  % (obj.name, bone_name, len(bound), bound[0][0],
                     bound[len(bound) // 2][0],
                     [(round(d, 3), i) for d, i, _w in bound[:3]]))


if __name__ == "__main__":
    main()
