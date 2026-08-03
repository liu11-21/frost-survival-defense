"""Render the Hero source blend for R4 clay/topology review.

This is an evidence renderer only. It loads the already-built Hero blend,
hides LOD1/LOD2 and collision, and renders neutral clay and textured views;
it does not change or save the source asset.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector


def _arg(name, default):
    if name not in sys.argv:
        return default
    index = sys.argv.index(name)
    return sys.argv[index + 1] if index + 1 < len(sys.argv) else default


def _look_at(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _clay_material():
    material = bpy.data.materials.new("R4_Clay_Review")
    material.diffuse_color = (0.42, 0.46, 0.52, 1.0)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    if shader:
        shader.inputs["Base Color"].default_value = (0.32, 0.38, 0.48, 1.0)
        shader.inputs["Roughness"].default_value = 0.72
        shader.inputs["Metallic"].default_value = 0.0
    return material


def _setup_scene(clay=False):
    scene = bpy.context.scene
    # The shipped HeroRoot carries the Babylon Y-up orientation correction.
    # For a Blender clay sheet, neutralize that export-only rotation so the
    # review camera can inspect the authored source in its natural Y-up pose.
    root = bpy.data.objects.get("HeroRoot")
    if root:
        # Preserve each child's authored world shape while removing the
        # export correction, including the parent-inverse matrices Blender
        # stores on the armature-bound meshes.
        root_world = root.matrix_world.copy()
        neutralize = root_world.inverted()
        for obj in list(bpy.data.objects):
            if obj == root or obj.parent is None:
                continue
            world = obj.matrix_world.copy()
            obj.parent = None
            obj.matrix_world = neutralize @ world
        root.matrix_world = Matrix.Identity(4)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.025, 0.035, 0.055)
    scene.view_settings.look = "AgX - Medium High Contrast"

    clay_mat = _clay_material() if clay else None
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            name = obj.name.lower()
            obj.hide_render = name.startswith("lod1_") or name.startswith("lod2_") or name.startswith("col_")
            if clay and not obj.hide_render:
                obj.data.materials.clear()
                obj.data.materials.append(clay_mat)
        elif obj.name in {"LOD1", "LOD2", "COL_Hero"}:
            obj.hide_render = True

    ground_data = bpy.data.meshes.new("R4ReviewGroundMesh")
    ground_data.from_pydata([(-5, -5, -0.04), (5, -5, -0.04), (5, 5, -0.04), (-5, 5, -0.04)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new("R4ReviewGround", ground_data)
    bpy.context.collection.objects.link(ground)
    ground_mat = bpy.data.materials.new("R4ReviewGroundMaterial")
    ground_mat.diffuse_color = (0.035, 0.05, 0.075, 1.0)
    ground.data.materials.append(ground_mat)

    camera_data = bpy.data.cameras.new("R4ReviewCamera")
    camera = bpy.data.objects.new("R4ReviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera

    def add_area(name, location, energy, size, color):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light_data.color = color
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        _look_at(light, (0, 0, 1.05))

    add_area("R4Key", (3.2, 4.2, 4.4), 900, 3.0, (0.78, 0.88, 1.0))
    add_area("R4Fill", (-3.4, 2.6, 1.8), 520, 2.5, (0.35, 0.52, 1.0))
    add_area("R4Rim", (0.0, -3.4, 3.8), 750, 2.2, (0.55, 0.70, 1.0))
    return scene, camera


def render_view(scene, camera, output_dir, name, location, target=(0, 1.08, 0), lens=58):
    camera.location = location
    camera.data.lens = lens
    _look_at(camera, target)
    scene.render.filepath = os.path.join(output_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)


def main():
    output_dir = os.path.abspath(_arg("--output", os.path.join(os.getcwd(), "reports", "art-previews", "hero-commercial-r4", "R4-A")))
    os.makedirs(output_dir, exist_ok=True)
    scene, camera = _setup_scene(clay=True)
    render_view(scene, camera, output_dir, "clay-front", (0.0, 5.6, 1.15), target=(0, 0, 1.15), lens=58)
    render_view(scene, camera, output_dir, "clay-side", (5.6, 0.0, 1.15), target=(0, 0, 1.15), lens=58)
    render_view(scene, camera, output_dir, "clay-back", (0.0, -5.6, 1.15), target=(0, 0, 1.15), lens=58)
    render_view(scene, camera, output_dir, "clay-three-quarter", (4.4, 4.4, 1.15), target=(0, 0, 1.15), lens=58)

    # Restore authored materials for the two visual identity views.
    bpy.ops.wm.open_mainfile(filepath=bpy.data.filepath)
    scene, camera = _setup_scene(clay=False)
    render_view(scene, camera, output_dir, "textured-front", (0.0, 5.3, 1.15), target=(0, 0, 1.15), lens=60)
    render_view(scene, camera, output_dir, "textured-close-up", (2.25, 3.0, 1.65), target=(0, 0, 1.35), lens=72)
    render_view(scene, camera, output_dir, "gameplay", (4.8, 6.2, 2.35), target=(0, 0, 1.0), lens=52)
    print(f"R4 Hero review renders written to {output_dir}")


if __name__ == "__main__":
    main()
