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
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
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


def cone(name, radius_bottom, radius_top, depth, location=(0, 0, 0), mat=None, target="LOD0", vertices=8):
    """A faceted cone used for readable armour, boots and architectural caps."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_bottom,
        radius2=radius_top,
        depth=depth,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, min(0.04, radius_bottom * 0.16))
    return obj


def vertical_cylinder(name, radius, depth, location=(0, 0, 0), mat=None, target="LOD0", vertices=8):
    """Cylinder whose long axis is Y, matching the authoring convention."""
    obj = cylinder(name, radius, depth, location, mat, target, vertices)
    obj.rotation_euler.x = math.pi * 0.5
    return obj


def sphere(name, radius, location=(0, 0, 0), mat=None, target="LOD0"):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, 0.02)
    return obj


def torus(name, major_radius, minor_radius, location=(0, 0, 0), mat=None, target="LOD0"):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=12, minor_segments=5, location=location)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, target)
    if mat:
        apply_style(obj, mat, 0.015)
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


def add_lod_markers(root_obj, asset_kind="building"):
    """Add exported LOD marker nodes and real low-poly proxy meshes.

    LOD0 remains the authored model.  LOD1/LOD2 are deliberately small,
    silhouette-readable meshes that are switched by Babylon at distance.  The
    proxies are kept in their own collections and prefixed so the runtime can
    exclude them from the authored-body list while still validating/exporting
    them as part of the GLB contract.
    """
    proxy_mat = material("MAT_LODProxy", (0.18, 0.24, 0.34), 0.92, 0.05)
    for level, coverage in ((1, 0.35), (2, 0.12)):
        marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
        marker.parent = root_obj
        marker["screenCoverage"] = coverage
        marker["generatedFrom"] = "LOD0-authored"
        marker["proxyGeometry"] = True
        if asset_kind == "character":
            body = cylinder(
                f"LOD{level}_PROXY_body",
                0.42 if level == 1 else 0.46,
                1.35 if level == 1 else 1.5,
                (0, 0.84, 0),
                proxy_mat,
                f"LOD{level}",
                8 if level == 1 else 6,
            )
            head = sphere(
                f"LOD{level}_PROXY_head",
                0.27 if level == 1 else 0.3,
                (0, 1.68, 0),
                proxy_mat,
                f"LOD{level}",
            )
            body["lodLevel"] = level
            head["lodLevel"] = level
            body.parent = marker
            head.parent = marker
        elif asset_kind == "wall":
            wall = box(
                f"LOD{level}_PROXY_wall",
                (3.2 if level == 1 else 2.7, 1.7 if level == 1 else 1.45, 0.65),
                (0, 0.88, 0),
                proxy_mat,
                f"LOD{level}",
                bevel=0.06 if level == 1 else 0.02,
            )
            wall["lodLevel"] = level
            wall.parent = marker
        else:
            base = cylinder(
                f"LOD{level}_PROXY_base",
                1.35 if level == 1 else 1.45,
                1.55 if level == 1 else 1.75,
                (0, 0.78, 0),
                proxy_mat,
                f"LOD{level}",
                8 if level == 1 else 6,
            )
            cap = cone(
                f"LOD{level}_PROXY_cap",
                1.15 if level == 1 else 1.28,
                0.7 if level == 1 else 0.55,
                0.65 if level == 1 else 0.5,
                (0, 1.88, 0),
                proxy_mat,
                f"LOD{level}",
                8 if level == 1 else 6,
            )
            base["lodLevel"] = level
            cap["lodLevel"] = level
            base.parent = marker
            cap.parent = marker


def orient_for_babylon(obj):
    """Convert the script's Y-up authoring coordinates to Babylon Y-up.

    Blender stores scenes Z-up. The baseline scripts intentionally describe
    gameplay dimensions in Y-up coordinates, so the authored root needs this
    quarter-turn before glTF export; otherwise the imported character lies on
    its side and appears to move backwards.
    """
    obj.rotation_euler.x = math.pi * 0.5
    return obj


def parent_all(objects, parent):
    for obj in objects:
        if obj != parent:
            obj.parent = parent


def add_simple_animation(obj, name, property_path="rotation_euler", index=1, start=1, end=20, amount=0.12):
    # Blender 5 uses layered Actions and removed the old public `action.fcurves`
    # collection. Let Blender create the compatible Action through keyframe
    # insertion, which works across 4.x and 5.x, then put it on an NLA strip so
    # every canonical clip is exported together.
    if not obj.animation_data:
        obj.animation_data_create()
    obj.animation_data.action = None
    value = getattr(obj, property_path)
    value[index] = 0.0
    obj.keyframe_insert(data_path=property_path, index=index, frame=start)
    value[index] = amount
    obj.keyframe_insert(data_path=property_path, index=index, frame=(start + end) / 2)
    value[index] = 0.0
    obj.keyframe_insert(data_path=property_path, index=index, frame=end)
    action = obj.animation_data.action
    if action is None:
        raise RuntimeError(f"Blender did not create an Action for {obj.name}:{name}")
    action.name = name
    track = obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, start, action)
    strip.frame_end = end
    obj.animation_data.action = None
    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = max(scene.frame_end, end)
    # Keep the action name as the canonical AnimationGroup name in glTF.
    return action


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.frame_set(1)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_animations=True,
        export_skins=True,
        export_extras=True,
        export_lights=False,
        export_cameras=False,
        use_visible=True,
        export_animation_mode="NLA_TRACKS",
        export_materials="EXPORT",
    )


def save_source(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)
