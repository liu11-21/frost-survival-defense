"""Shared Blender 4.x helpers for Frostbound Expanse authored assets.

The scripts deliberately use only bpy and the built-in glTF exporter. They are
safe to run headlessly and leave the project usable when Blender is absent.
"""
import os
import math
from mathutils import Vector

import bpy


COLLECTIONS = ("LOD0", "LOD1", "LOD2", "COLLISION", "EXPORT", "RIG")


def reset_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name != "Collection":
            bpy.data.collections.remove(collection)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.film_transparent = True
    scene.world.color = (0.035, 0.05, 0.09)
    for name in COLLECTIONS:
        collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
        if collection.name not in [child.name for child in scene.collection.children]:
            scene.collection.children.link(collection)
    return scene


def collection(name):
    return bpy.data.collections.get(name) or bpy.context.scene.collection


def move_to(obj, name):
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection(name).objects.link(obj)
    return obj


def material(name, color, roughness=0.75, metallic=0.0, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        shader.inputs["Emission Color"].default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = 2.0
    return mat


def apply_style(obj, mat, bevel=0.04):
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)
    if bevel and obj.type == "MESH":
        modifier = obj.modifiers.new("soft bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def box(name, dimensions, location=(0, 0, 0), mat=None, target="LOD0", bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, bevel)
    return obj


def cylinder(name, radius, depth, location=(0, 0, 0), mat=None, target="LOD0", vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, min(0.035, radius * 0.2))
    return obj


def sphere(name, radius, location=(0, 0, 0), mat=None, target="LOD0"):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, 0.02)
    return obj


def empty(name, location=(0, 0, 0), target="EXPORT", display="PLAIN_AXES"):
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = display
    obj.location = location
    collection(target).objects.link(obj)
    return obj


def collision_box(name, dimensions, location=(0, 0, 0), parent=None):
    obj = box(name, dimensions, location, None, "COLLISION", 0)
    obj.display_type = "WIRE"
    obj.hide_render = True
    obj.hide_viewport = True
    obj.hide_set(True)
    if parent:
        obj.parent = parent
    return obj


def root(name):
    return empty(name, (0, 0, 0), "EXPORT", "CUBE")


def parent_all(objects, parent):
    for obj in objects:
        if obj != parent:
            obj.parent = parent


def add_simple_animation(obj, name, property_path="rotation_euler", index=1, start=1, end=20, amount=0.12):
    action = bpy.data.actions.new(name)
    fcurve = action.fcurves.new(data_path=property_path, index=index)
    fcurve.keyframe_points.insert(start, 0.0)
    fcurve.keyframe_points.insert((start + end) / 2, amount)
    fcurve.keyframe_points.insert(end, 0.0)
    # Exporter picks up actions through a temporary NLA track.
    if not obj.animation_data:
        obj.animation_data_create()
    obj.animation_data.action = action
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, start, action)
    strip.frame_end = end
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = max(scene.frame_end, end)
    # Keep the action name as the canonical AnimationGroup name in glTF.
    return action


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(path)[0] + ".blend")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_extras=True,
        export_lights=False,
        export_cameras=False,
        export_materials="EXPORT",
    )


def save_source(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
