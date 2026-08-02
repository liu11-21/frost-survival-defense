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
    # Keep the low-poly palette simple, but give cloth, leather and metal a
    # physically legible highlight response in both Blender review renders
    # and Babylon's glTF PBR material.  Blender 4/5 renamed a few Principled
    # inputs, so use guarded lookups for forward-compatible headless exports.
    coat_weight = shader.inputs.get("Coat Weight") or shader.inputs.get("Clearcoat")
    coat_roughness = shader.inputs.get("Coat Roughness") or shader.inputs.get("Clearcoat Roughness")
    sheen_weight = shader.inputs.get("Sheen Weight") or shader.inputs.get("Sheen")
    specular_level = shader.inputs.get("Specular IOR Level") or shader.inputs.get("Specular")
    if coat_weight:
        coat_weight.default_value = 0.28 if metallic >= 0.5 else (0.10 if roughness < 0.55 else 0.025)
    if coat_roughness:
        coat_roughness.default_value = 0.18 if metallic >= 0.5 else 0.32
    if sheen_weight:
        sheen_weight.default_value = 0.12 if roughness >= 0.72 else 0.025
    if specular_level:
        specular_level.default_value = 0.42 if metallic >= 0.5 else 0.28
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
        # Broad silhouette pieces get one extra bevel segment so they catch a
        # deliberate highlight without turning the whole library into a
        # subdivision-heavy asset. Small fasteners stay at two segments.
        modifier.segments = 3 if bevel >= 0.05 else 2
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        # Weighted normals keep bevel highlights broad and intentional on
        # stylized plates, boxes and prism faces.  The modifier is applied by
        # the glTF export step, so Babylon receives clean vertex normals rather
        # than a runtime-only Blender shading trick.
        normal = obj.modifiers.new("weighted surface normals", "WEIGHTED_NORMAL")
        normal.keep_sharp = True
        normal.weight = 50
    return obj


def assign_surface_variants(objects, families):
    """Add deterministic top/underside material breakup to authored parts.

    The asset language is intentionally low-poly, but a single flat material
    on every primitive still reads like a blockout.  This helper reuses the
    existing light/dark palette variants on upward and underside polygons,
    creating a restrained hand-painted-style value break without external
    textures.  It runs before parenting/rig binding, so it has no runtime or
    animation cost beyond the additional material slots in the GLB.

    ``families`` is an ordered list of ``(token, light, dark)`` tuples.  The
    token is matched against the source material name, which keeps the helper
    usable by both the unit and facility palettes.
    """
    for obj in objects:
        if obj.type != "MESH" or not obj.data.materials or len(obj.data.polygons) < 4:
            continue
        source = obj.data.materials[0]
        if source is None:
            continue
        source_name = source.name.lower()
        chosen = next((entry for entry in families if entry[0] in source_name), None)
        if chosen is None:
            continue
        _, light, dark = chosen
        if light is None or dark is None or light == dark:
            continue

        def slot_for(mat):
            index = obj.data.materials.find(mat.name)
            if index < 0:
                obj.data.materials.append(mat)
                index = len(obj.data.materials) - 1
            return index

        light_slot = slot_for(light)
        dark_slot = slot_for(dark)
        for polygon in obj.data.polygons:
            # Every second upward face receives the light value, while only a
            # subset of downward faces receives the shadow value.  The index
            # test keeps round primitives from turning into a checkerboard.
            if polygon.normal.z > 0.72 and polygon.index % 2 == 0:
                polygon.material_index = light_slot
            elif polygon.normal.z < -0.72 and polygon.index % 3 == 0:
                polygon.material_index = dark_slot


def author_surface_paint(objects, seed=0, textured=False):
    """Author a projected UV, vertex-paint and packed brush layer.

    The procedural palette is intentionally restrained: it supplies a soft
    hand-painted value breakup and edge lift while retaining the existing
    Principled material as the dominant colour. Vertex colour is part of the
    glTF contract (COLOR_0), so Babylon receives the breakup without a runtime
    shader. Assets can opt into a packed colour-aware brush image through
    ``textured=True``. UVs use a deterministic per-face projection so vertical
    walls, top plates and side panels all receive visible height variation
    instead of a flat X/Z projection.
    """
    def make_brush_texture(mat, base_color, material_seed):
        """Create a packed, material-aware brush texture.

        The image is deterministic and deliberately tile-friendly. It is not a
        substitute for a hand-painted atlas, but it gives every authored asset
        a materially different surface response while keeping each source
        blend self-contained and avoiding external texture paths.
        """
        image_name = f"ART_PAINT_{mat.name}"
        image = bpy.data.images.get(image_name)
        texture_size = 64
        if image is None or image.size[0] != texture_size or image.size[1] != texture_size:
            if image is not None:
                bpy.data.images.remove(image)
            image = bpy.data.images.new(image_name, width=texture_size, height=texture_size, alpha=True)
            tag = mat.name.lower()
            is_metal = any(token in tag for token in ("metal", "gold", "steel", "iron"))
            is_wood = any(token in tag for token in ("wood", "darkwood", "leather"))
            is_stone = any(token in tag for token in ("stone", "brick", "masonry"))
            is_cloth = any(token in tag for token in ("cloth", "snow", "skin"))
            is_ice = any(token in tag for token in ("ice", "glass", "glow", "frost"))
            pixels = []
            for y in range(texture_size):
                for x in range(texture_size):
                    # A layered low-frequency field reads as painted breakup,
                    # while the material branches add grain, weave, scratches
                    # or mineral flecks instead of reusing one generic noise.
                    wave = math.sin((x + material_seed) * 0.16) * 0.035
                    wave += math.cos((y * 1.7 + material_seed) * 0.115) * 0.028
                    wave += math.sin((x + y * 0.42 + material_seed) * 0.055) * 0.022
                    if is_metal:
                        grain = math.sin((x * 0.82 + y * 0.08 + material_seed) * 0.52)
                        scratch = 0.075 if grain > 0.88 and ((x + y + material_seed) % 13) < 5 else 0.0
                        wave += scratch - (0.018 if grain < -0.88 else 0.0)
                    elif is_wood:
                        grain = math.sin((x * 0.11 + y * 1.65 + material_seed) * 0.32)
                        wave += grain * 0.065
                        wave += 0.028 if ((y + material_seed) % 17) in (0, 1) else 0.0
                    elif is_stone:
                        fleck = math.sin((x * 0.37 + material_seed) * 1.7) * math.cos((y + material_seed) * 0.91)
                        wave += fleck * 0.06
                        wave += 0.035 if ((x * 3 + y * 5 + material_seed) % 29) < 3 else 0.0
                    elif is_cloth:
                        weave = math.sin(x * 1.35 + material_seed) * math.sin(y * 1.55 + material_seed * 0.7)
                        wave += weave * 0.024
                    elif is_ice:
                        crystal = math.sin((x - y + material_seed) * 0.22)
                        wave += crystal * 0.052
                        wave += 0.045 if ((x + y * 2 + material_seed) % 23) < 2 else 0.0
                    else:
                        wave += 0.025 if ((x // 9 + y // 11 + material_seed) % 5 == 0) else 0.0
                    # A gentle painted edge lift keeps silhouette-facing areas
                    # readable without making every asset look plastic.
                    edge = min(x, y, texture_size - 1 - x, texture_size - 1 - y) / 8.0
                    value = max(0.74, min(1.14, 0.94 + wave + (0.018 if edge < 1 else 0.0)))
                    pixels.extend((
                        max(0.0, min(1.0, base_color[0] * value)),
                        max(0.0, min(1.0, base_color[1] * value)),
                        max(0.0, min(1.0, base_color[2] * value)),
                        1.0,
                    ))
            image.pixels = pixels
            image.pack()
        return image

    def connect_material(mat, material_seed):
        if mat is None or not getattr(mat, "use_nodes", False):
            return
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        if shader is None or shader.inputs.get("Base Color") is None:
            return
        attr = nodes.get("ArtTint Attribute") or nodes.new("ShaderNodeVertexColor")
        attr.name = "ArtTint Attribute"
        attr.label = "Authored surface tint"
        attr.layer_name = "ArtTint"
        mix = nodes.get("ArtTint Multiply") or nodes.new("ShaderNodeMix")
        mix.name = "ArtTint Multiply"
        mix.label = "Subtle hand-painted value breakup"
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = 1.0
        base_input = shader.inputs["Base Color"]
        # Blender 5's Mix node exposes duplicate A/B sockets for every data
        # type; RGBA is indices 6/7. Keeping the graph in this canonical form
        # lets the stock glTF exporter detect COLOR_0 as a base-colour factor.
        if textured:
            base_color = tuple(base_input.default_value[:3])
            texture = nodes.get("ArtSurfaceTexture") or nodes.new("ShaderNodeTexImage")
            texture.name = "ArtSurfaceTexture"
            texture.label = "Packed authored brush texture"
            texture.image = make_brush_texture(mat, base_color, material_seed)
            texture.interpolation = "Linear"
            if not mix.inputs[6].is_linked:
                links.new(texture.outputs["Color"], mix.inputs[6])
        elif not mix.inputs[6].is_linked:
            mix.inputs[6].default_value = base_input.default_value
        if not mix.inputs[7].is_linked:
            links.new(attr.outputs["Color"], mix.inputs[7])
        if not base_input.is_linked or base_input.links[0].from_node != mix:
            links.new(mix.outputs["Result"], base_input)
        # Keep this as one canonical Texture/Base Color -> Mix -> Vertex Color
        # -> Base Color chain. Blender's stock exporter recognizes the graph
        # and preserves COLOR_0 while embedding the optional packed texture.

    for object_index, obj in enumerate(objects):
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        mesh = obj.data
        for material_slot_index, material_slot in enumerate(mesh.materials):
            connect_material(material_slot, seed + object_index + material_slot_index)
        if not mesh.uv_layers:
            uv_layer = mesh.uv_layers.new(name="UVMap")
        else:
            uv_layer = mesh.uv_layers.active or mesh.uv_layers[0]
        # Project each polygon onto its dominant plane. This is a small but
        # important production distinction: the same packed brush can now
        # travel down a vertical torso, across a roof, or around a side wall
        # without collapsing the whole surface into one horizontal strip.
        for polygon in mesh.polygons:
            normal = polygon.normal
            if abs(normal.z) >= abs(normal.x) and abs(normal.z) >= abs(normal.y):
                axes = (0, 1)  # front/back panels: X/Y
            elif abs(normal.x) >= abs(normal.y):
                axes = (2, 1)  # side panels: Z/Y
            else:
                axes = (0, 2)  # top/bottom panels: X/Z
            values = [
                (mesh.vertices[mesh.loops[loop_index].vertex_index].co[axes[0]],
                 mesh.vertices[mesh.loops[loop_index].vertex_index].co[axes[1]])
                for loop_index in polygon.loop_indices
            ]
            if not values:
                continue
            low_u = min(pair[0] for pair in values)
            high_u = max(pair[0] for pair in values)
            low_v = min(pair[1] for pair in values)
            high_v = max(pair[1] for pair in values)
            span_u = max(high_u - low_u, 1e-4)
            span_v = max(high_v - low_v, 1e-4)
            for loop_index in polygon.loop_indices:
                vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                uv_layer.data[loop_index].uv = (
                    (vertex[axes[0]] - low_u) / span_u,
                    (vertex[axes[1]] - low_v) / span_v,
                )

        color_layer = mesh.color_attributes.get("ArtTint")
        if color_layer is None:
            color_layer = mesh.color_attributes.new(
                name="ArtTint", type="BYTE_COLOR", domain="CORNER"
            )
        for polygon in mesh.polygons:
            normal = polygon.normal
            normal_bias = 0.045 if normal.z > 0.55 else (-0.035 if normal.z < -0.55 else 0.0)
            for loop_index in polygon.loop_indices:
                # The phase avoids a visible checkerboard while keeping the
                # result stable across repeated batch exports.
                phase = ((object_index + 1) * 0.61803398875 + polygon.index * 0.38196601125 + seed) % 1.0
                variation = 0.965 + phase * 0.055 + normal_bias
                color_layer.data[loop_index].color = (
                    max(0.82, min(1.08, variation * 1.02)),
                    max(0.82, min(1.08, variation)),
                    max(0.82, min(1.08, variation * 0.98)),
                    1.0,
                )
        # Mark the attribute as the render colour layer. Blender's glTF
        # exporter distinguishes this from merely having an active layer.
        try:
            mesh.color_attributes.render_color_index = mesh.color_attributes.find("ArtTint")
        except (AttributeError, TypeError):
            pass


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


def prism(name, points, depth, location=(0, 0, 0), mat=None, target="LOD0", bevel=0.025):
    """Create a faceted extruded 2D profile for cloth, plates and signage.

    Most of the authoring language is intentionally low-poly, but silhouettes
    should not be limited to axis-aligned boxes.  This small polygon helper
    keeps the scripts deterministic while giving capes, coat tails, armour
    plates and architectural braces an authored outline.
    """
    vertices = [(x, y, -depth * 0.5) for x, y in points]
    vertices += [(x, y, depth * 0.5) for x, y in points]
    count = len(points)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection(target).objects.link(obj)
    obj.location = location
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
    # Source .blend files are generated artifacts in this pipeline. Disable
    # Blender's rotating .blend1 backup for this one deterministic save so a
    # batch export does not leave dozens of ignored backup files beside the
    # authored workspace.
    filepaths = bpy.context.preferences.filepaths
    previous_versions = getattr(filepaths, "save_version", 1)
    filepaths.save_version = 0
    try:
        bpy.ops.wm.save_as_mainfile(filepath=path)
    finally:
        filepaths.save_version = previous_versions
