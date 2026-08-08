"""Are the mesh and the armature in the same units?

hero_blade_probe reports vertex displacement from the evaluated mesh, whose
coordinates are in the mesh OBJECT's local space. hero_reach_probe reports
joint drift from pose bones, which are in ARMATURE space. Comparing the two
only means something if those spaces share a scale.

If they do not, "the mesh moved three times further than its bone" is an
arithmetic artefact of two different units, not a bind defect -- and that is
a conclusion worth checking before acting on it.

    node scripts/run-blender.mjs scripts/blender/hero_scale_probe.py \\
        --input public/assets/models/characters/hero_male.glb
"""
import argparse
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args(argv)

    path = os.path.abspath(os.path.join(ROOT, args.input))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)

    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    a_scale = armature.matrix_world.to_scale()
    print("SCALE armature %-14s world=%s" % (
        armature.name, [round(v, 4) for v in a_scale]))

    for obj in sorted((o for o in bpy.data.objects if o.type == "MESH"),
                      key=lambda o: o.name):
        if not obj.name.upper().startswith("LOD0") and len(bpy.data.objects) > 6:
            continue
        scale = obj.matrix_world.to_scale()
        # The ratio that would turn an object-local length into an
        # armature-space one. Anything but 1.0 invalidates a direct comparison.
        ratio = [round(scale[i] / max(a_scale[i], 1e-9), 4) for i in range(3)]
        # Height in both spaces, as an independent read on the same question.
        local = [v.co for v in obj.data.vertices]
        world = [obj.matrix_world @ v.co for v in obj.data.vertices]
        if not local:
            continue
        def extent(points):
            return max(max(p[a] for p in points) - min(p[a] for p in points)
                       for a in range(3))
        print("SCALE mesh %-24s objScale=%s  mesh/arm=%s  localExtent=%.4f "
              "worldExtent=%.4f" % (
                  obj.name, [round(v, 4) for v in scale], ratio,
                  extent(local), extent(world)))


if __name__ == "__main__":
    main()
