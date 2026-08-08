"""Where exactly is the bone, and where exactly is the flesh it drives?

The bones sit ~0.9 m from the vertices weighted to them, nine times what the
project's own asset reads. Distance alone does not say WHY. Printing both
positions in the same space does: a bone displaced along one axis is a
different bug from a bone whose coordinates are a permutation of the mesh's
(a Y-up / Z-up mix-up) or one sitting at the origin (a rest pose that was
never fitted).

    node scripts/run-blender.mjs scripts/blender/hero_bindpose_offset.py \\
        --input public/assets/models/characters/hero_male.glb
"""
import argparse
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args(argv)

    path = os.path.abspath(os.path.join(ROOT, args.input))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    print("OFFSET_INPUT abs=%s" % path)

    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.data.objects
              if o.type == "MESH" and o.name.upper().startswith("LOD0")] \
        or [o for o in bpy.data.objects if o.type == "MESH"]
    # The biggest mesh is the body; the small ones are gloves and props.
    body = max(meshes, key=lambda o: len(o.data.vertices))
    names = {g.index: g.name for g in body.vertex_groups}
    into_armature = armature.matrix_world.inverted() @ body.matrix_world

    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for vertex in body.data.vertices:
        point = into_armature @ vertex.co
        for axis in range(3):
            lo[axis] = min(lo[axis], point[axis])
            hi[axis] = max(hi[axis], point[axis])
    print("OFFSET mesh %s  bbox min=%s max=%s"
          % (body.name, [round(v, 3) for v in lo], [round(v, 3) for v in hi]))

    b_lo = Vector((1e9, 1e9, 1e9))
    b_hi = Vector((-1e9, -1e9, -1e9))
    for bone in armature.data.bones:
        for axis in range(3):
            b_lo[axis] = min(b_lo[axis], bone.head_local[axis])
            b_hi[axis] = max(b_hi[axis], bone.head_local[axis])
    print("OFFSET bones          bbox min=%s max=%s"
          % ([round(v, 3) for v in b_lo], [round(v, 3) for v in b_hi]))

    for bone_name in ("lowerarm_r", "lower_arm.R", "hand_r", "hand.R",
                      "head", "pelvis"):
        bone = armature.data.bones.get(bone_name)
        group = body.vertex_groups.get(bone_name)
        if bone is None or group is None:
            continue
        owned = [into_armature @ v.co for v in body.data.vertices
                 if any(g.group == group.index and g.weight > 0.5
                        for g in v.groups)]
        if not owned:
            continue
        centroid = sum(owned, Vector((0.0, 0.0, 0.0))) / len(owned)
        head = bone.head_local
        print("OFFSET %-12s boneHead=%s  fleshCentroid=%s  delta=%s  |delta|=%.4f"
              % (bone_name,
                 [round(v, 3) for v in head],
                 [round(v, 3) for v in centroid],
                 [round(centroid[a] - head[a], 3) for a in range(3)],
                 (centroid - head).length))


if __name__ == "__main__":
    main()
