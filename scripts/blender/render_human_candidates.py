"""Render the human candidates so a person can finally look at them.

Blender EEVEE, neutral three-point light, identical camera and framing for
every variant so male and female are directly comparable.

    node scripts/run-blender.mjs scripts/blender/render_human_candidates.py -- \
        --input public/assets/models/characters/hero_male.glb --label hero_male

This is NOT the Babylon runtime evidence the review standard asks for. It is
the fastest honest way to see whether the mature human base is actually there,
and it is labelled as a Blender render everywhere it appears.
"""
import argparse
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "reports", "human-candidates")

SHOTS = (
    # label,        azimuth deg, elevation, height frac, distance frac, fov
    ("front", 0.0, 0.10, 0.52, 2.35, 0.62),
    ("three-quarter", 38.0, 0.12, 0.52, 2.40, 0.62),
    ("side", 90.0, 0.10, 0.52, 2.40, 0.62),
    ("head", 16.0, 0.06, 0.935, 0.42, 0.50),
    ("hands", 26.0, -0.02, 0.47, 0.62, 0.50),
)


def clear():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def light_rig():
    """Neutral three-point. Key front-left, broad fill, cool rim behind."""
    def add(name, kind, location, rotation, energy, colour, size=6.0):
        data = bpy.data.lights.new(name, kind)
        data.energy = energy
        data.color = colour
        if kind == "AREA":
            data.size = size
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        obj.rotation_euler = rotation
        bpy.context.collection.objects.link(obj)
        return obj

    add("key", "AREA", (2.6, -3.2, 3.0), (0.95, 0.0, 0.62), 900.0, (1.0, 0.97, 0.93), 5.0)
    add("fill", "AREA", (-3.4, -2.2, 1.6), (1.25, 0.0, -0.95), 300.0, (0.78, 0.84, 0.96), 7.0)
    add("rim", "AREA", (-1.4, 3.6, 2.6), (1.05, 0.0, 3.5), 620.0, (0.66, 0.78, 1.0), 5.0)

    world = bpy.data.worlds.new("review") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.055, 0.062, 0.075, 1.0)
        bg.inputs[1].default_value = 1.0


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--width", type=int, default=900)
    parser.add_argument("--height", type=int, default=1200)
    args = parser.parse_args(argv)

    clear()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    # Only LOD0, and drop the collision proxy.
    for obj in list(meshes):
        name = obj.name.lower()
        if name.startswith(("lod1", "lod2")) or "col_" in name or "icosphere" in name:
            bpy.data.objects.remove(obj, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no LOD0 mesh in %s" % args.input)

    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for mesh in meshes:
        for corner in mesh.bound_box:
            world = mesh.matrix_world @ Vector(corner)
            lo = Vector((min(lo[i], world[i]) for i in range(3)))
            hi = Vector((max(hi[i], world[i]) for i in range(3)))
    centre = (lo + hi) * 0.5
    size = max(hi[i] - lo[i] for i in range(3))

    light_rig()
    scene = bpy.context.scene
    # Pick whichever EEVEE this build actually offers rather than guessing at
    # the name; 5.2 exposes BLENDER_EEVEE, some builds BLENDER_EEVEE_NEXT.
    available = {item.identifier for item in
                 bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items}
    for candidate in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        if candidate in available:
            scene.render.engine = candidate
            break
    try:
        scene.eevee.taa_render_samples = 32
    except AttributeError:
        pass
    scene.render.resolution_x = args.width
    scene.render.resolution_y = args.height
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"

    camera_data = bpy.data.cameras.new("review")
    camera = bpy.data.objects.new("review", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    import math
    os.makedirs(OUT, exist_ok=True)
    written = []
    for label, azimuth, elevation, height_frac, distance_frac, fov in SHOTS:
        camera_data.angle = fov
        target = Vector((centre.x, centre.y, lo.z + (hi.z - lo.z) * height_frac))
        radius = size * distance_frac
        angle = math.radians(azimuth)
        # Blender is Z-up; the imported glTF faces -Y after conversion.
        camera.location = Vector((
            target.x + math.sin(angle) * radius,
            target.y - math.cos(angle) * radius,
            target.z + radius * elevation + (hi.z - lo.z) * 0.02,
        ))
        direction = target - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        path = os.path.join(OUT, "%s-%s.png" % (args.label, label))
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        written.append(path)

    print("RENDER_OK %s" % ", ".join(os.path.basename(p) for p in written))


if __name__ == "__main__":
    main()
