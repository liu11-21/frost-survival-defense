"""Build the authored Hero as a small set of continuous character meshes.

R7 keeps the production contract and reallocates the existing authored loops,
profiles, atlas values and animation keys.  No new render objects, bones or
LOD systems are introduced; the low-detail tiers remain authored silhouette
meshes rather than generic head-and-cylinder proxies.
"""

import math
import os
import sys
from array import array

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import (  # noqa: E402
    author_surface_paint,
    collision_box,
    empty,
    export_glb,
    material,
    move_to,
    orient_for_babylon,
    parent_all,
    reset_scene,
    save_source,
)
from build_units import add_armature_clip, make_skeleton  # noqa: E402


def _mesh_object(name, vertices, faces, materials, material_indices=None, origin=(0.0, 0.0, 0.0), target="LOD0", smooth=True):
    """Create one render mesh with optional material slots and a useful pivot."""
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.data.collections.get(target).objects.link(obj)
    obj.location = origin
    for mat in materials:
        mesh.materials.append(mat)
    if material_indices:
        for index, polygon in enumerate(mesh.polygons):
            polygon.material_index = material_indices[index] if index < len(material_indices) else 0
            polygon.use_smooth = smooth
    elif smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    return obj


def _loft_mesh(name, rings, segments, materials, origin=(0.0, 0.0, 0.0), target="LOD0", override=None):
    """Build a continuous, rounded vertical volume from elliptical sections.

    A ring is ``(y, radius_x, radius_z, center_x, center_z, material_index)``.
    ``override`` can assign a material to a side face using its averaged
    center, which is used for the visor and chest armour without introducing
    another object.
    """
    vertices = []
    for y, radius_x, radius_z, center_x, center_z, _ in rings:
        for segment in range(segments):
            theta = math.tau * segment / segments
            vertices.append((
                center_x + radius_x * math.cos(theta) - origin[0],
                y - origin[1],
                center_z + radius_z * math.sin(theta) - origin[2],
            ))
    faces = []
    material_indices = []
    faces.append(tuple(range(segments - 1, -1, -1)))
    material_indices.append(rings[0][5])
    for ring_index in range(len(rings) - 1):
        current = rings[ring_index]
        following = rings[ring_index + 1]
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            face = (
                ring_index * segments + segment,
                ring_index * segments + next_segment,
                (ring_index + 1) * segments + next_segment,
                (ring_index + 1) * segments + segment,
            )
            faces.append(face)
            center_x = sum(vertices[index][0] for index in face) / 4.0 + origin[0]
            center_y = sum(vertices[index][1] for index in face) / 4.0 + origin[1]
            center_z = sum(vertices[index][2] for index in face) / 4.0 + origin[2]
            material_indices.append(
                override(ring_index, segment, center_x, center_y, center_z, current, following)
                if override else current[5]
            )
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + segment for segment in range(segments)))
    material_indices.append(rings[-1][5])
    return _mesh_object(name, vertices, faces, materials, material_indices, origin, target, smooth=True)


def _multi_loft_mesh(name, volumes, materials, target="LOD0"):
    """Combine several authored loop volumes into one render mesh.

    R4 clothing uses this for the two shoulder caps, chest plate and backpack
    so those forms share one mesh/material contract without reverting to a
    forest of floating primitive objects.
    """
    vertices = []
    faces = []
    material_indices = []
    for volume in volumes:
        rings = volume["rings"]
        segments = volume.get("segments", 32)
        override = volume.get("override")
        offset = len(vertices)
        for y, radius_x, radius_z, center_x, center_z, _ in rings:
            for segment in range(segments):
                theta = math.tau * segment / segments
                vertices.append((
                    center_x + radius_x * math.cos(theta),
                    y,
                    center_z + radius_z * math.sin(theta),
                ))
        faces.append(tuple(offset + segment for segment in range(segments - 1, -1, -1)))
        material_indices.append(rings[0][5])
        for ring_index in range(len(rings) - 1):
            current = rings[ring_index]
            following = rings[ring_index + 1]
            for segment in range(segments):
                next_segment = (segment + 1) % segments
                face = (
                    offset + ring_index * segments + segment,
                    offset + ring_index * segments + next_segment,
                    offset + (ring_index + 1) * segments + next_segment,
                    offset + (ring_index + 1) * segments + segment,
                )
                faces.append(face)
                center_x = sum(vertices[index][0] for index in face) / 4.0
                center_y = sum(vertices[index][1] for index in face) / 4.0
                center_z = sum(vertices[index][2] for index in face) / 4.0
                material_indices.append(
                    override(ring_index, segment, center_x, center_y, center_z, current, following)
                    if override else current[5]
                )
        top_start = offset + (len(rings) - 1) * segments
        faces.append(tuple(top_start + segment for segment in range(segments)))
        material_indices.append(rings[-1][5])
    return _mesh_object(name, vertices, faces, materials, material_indices, target=target, smooth=True)


def _shape_rings(rings, *, center_y=0.0, y_scale=1.0, x_scale=1.0, z_scale=1.0):
    """Apply a restrained proportional edit to an existing loop profile.

    R6 reshapes the established loops in place instead of adding primitives;
    render meshes, UVs and the existing skinning envelopes therefore remain
    unchanged.
    """
    return [
        (
            center_y + (y - center_y) * y_scale,
            radius_x * x_scale,
            radius_z * z_scale,
            center_x * x_scale,
            center_z * z_scale,
            material_index,
        )
        for y, radius_x, radius_z, center_x, center_z, material_index in rings
    ]


def _profile_mesh(name, components, materials, origin=(0.0, 0.0, 0.0), target="LOD0"):
    """Extrude several designed 2D profiles into one equipment mesh.

    Components are ``(points_xy, z_center, thickness, material_index)``.  The
    profiles share one Blender mesh so a blade/guard/hilt or ranged assembly is
    one authored object rather than a collection of boxes and toruses.
    """
    vertices = []
    faces = []
    material_indices = []
    for points, z_center, thickness, material_index in components:
        start = len(vertices)
        vertices.extend((x, y, z_center - thickness * 0.5) for x, y in points)
        vertices.extend((x, y, z_center + thickness * 0.5) for x, y in points)
        count = len(points)
        faces.append(tuple(start + count - 1 - index for index in range(count)))
        material_indices.append(material_index)
        faces.append(tuple(start + count + index for index in range(count)))
        material_indices.append(material_index)
        for index in range(count):
            next_index = (index + 1) % count
            faces.append((start + index, start + next_index, start + count + next_index, start + count + index))
            material_indices.append(material_index)
    return _mesh_object(name, vertices, faces, materials, material_indices, origin, target, smooth=False)


def _cape_mesh(name, origin, materials, target="LOD0", detail=4):
    """One gently curved double-sided coat/cape panel with a clean silhouette."""
    levels = [
        # The panel starts at the waist seam, then tapers back toward the
        # legs.  This reads as a tailored coat tail instead of a rigid plate
        # hanging from the chest and reduces leg intersection in locomotion.
        (1.12, 0.22, -0.22),
        (1.04, 0.30, -0.25),
        (0.92, 0.36, -0.23),
        (0.76, 0.34, -0.18),
        (0.56, 0.25, -0.12),
        (0.38, 0.17, -0.08),
    ]
    if detail <= 3:
        levels = levels[::2] + [levels[-1]]
    columns = 3
    vertices = []
    # Front/back surfaces use a centre seam to make the coat read as a single
    # tailored panel rather than two flat cards.
    for back in (-1, 1):
        for y, width, z in levels:
            for column in range(columns):
                fraction = column / (columns - 1) - 0.5
                level_shift = -0.035 if y < 0.80 else 0.018
                slit_offset = -0.020 if column == 0 and y < 0.72 else 0.0
                local_x = fraction * width + level_shift + slit_offset
                local_z = z + (0.035 if column == 1 else 0.0) * back
                vertices.append((local_x - origin[0], y - origin[1], local_z - origin[2] + back * 0.025))
    faces = []
    material_indices = []
    stride = len(levels) * columns
    for back in range(2):
        base = back * stride
        for level in range(len(levels) - 1):
            for column in range(columns - 1):
                a = base + level * columns + column
                b = a + 1
                c = a + columns + 1
                d = a + columns
                faces.append((a, b, c, d) if back == 1 else (d, c, b, a))
                material_indices.append(0 if (level + column + back) % 3 else 1)
    for level in range(len(levels) - 1):
        for column in (0, columns - 1):
            a = level * columns + column
            b = (level + 1) * columns + column
            c = stride + b
            d = stride + a
            faces.append((a, b, c, d))
            material_indices.append(1)
    return _mesh_object(name, vertices, faces, materials, material_indices, origin, target, smooth=True)


def _r4_body_rings():
    """R7-A anatomy loops: chest-to-waist rhythm with a shaped hip break."""
    return [
        (0.43, 0.24, 0.20, 0.00, -0.030, 1),
        (0.48, 0.30, 0.23, 0.00, -0.030, 1),
        (0.54, 0.34, 0.25, 0.00, -0.020, 1),
        (0.60, 0.35, 0.26, 0.00, -0.010, 1),
        (0.66, 0.33, 0.25, 0.00, 0.000, 1),
        (0.72, 0.29, 0.23, 0.00, 0.000, 0),
        (0.78, 0.25, 0.21, 0.00, 0.000, 0),
        (0.84, 0.24, 0.205, 0.00, 0.010, 0),
        (0.90, 0.27, 0.22, 0.00, 0.020, 0),
        (0.98, 0.33, 0.26, 0.00, 0.030, 0),
        (1.06, 0.39, 0.29, 0.00, 0.030, 0),
        (1.14, 0.44, 0.31, 0.00, 0.025, 0),
        (1.22, 0.48, 0.33, 0.00, 0.020, 0),
        (1.28, 0.50, 0.34, 0.00, 0.010, 2),
        (1.34, 0.48, 0.33, 0.00, 0.000, 2),
        (1.40, 0.43, 0.30, 0.00, -0.005, 0),
        (1.46, 0.38, 0.27, 0.00, -0.010, 0),
        (1.52, 0.29, 0.22, 0.00, -0.020, 0),
        (1.57, 0.21, 0.18, 0.00, -0.020, 0),
        (1.59, 0.16, 0.15, 0.00, -0.020, 0),
    ]


def _r4_head_rings():
    """R7-A compact helmet/head loops with a directional crown and neck gap."""
    return _shape_rings([
        (1.53, 0.20, 0.19, 0.00, -0.020, 0),
        (1.58, 0.24, 0.22, 0.00, -0.015, 0),
        (1.64, 0.28, 0.25, 0.00, -0.005, 0),
        (1.70, 0.31, 0.28, 0.00, 0.005, 0),
        (1.77, 0.33, 0.30, 0.00, 0.012, 0),
        (1.84, 0.33, 0.30, 0.00, 0.016, 2),
        (1.91, 0.32, 0.29, 0.00, 0.012, 2),
        (1.98, 0.30, 0.27, 0.00, 0.005, 0),
        (2.05, 0.27, 0.24, 0.00, -0.005, 0),
        (2.11, 0.22, 0.20, 0.00, -0.015, 3),
        (2.16, 0.17, 0.16, 0.00, -0.022, 3),
        (2.20, 0.11, 0.11, 0.00, -0.025, 3),
        (2.23, 0.05, 0.06, 0.00, -0.025, 3),
    ], center_y=1.88, y_scale=0.95, x_scale=0.94, z_scale=0.93)


def _r5_helmet_brow_rings():
    """R7-A visor housing with a stepped brow rather than parallel bands."""
    return _shape_rings([
        (1.69, 0.23, 0.050, 0.00, 0.245, 0),
        (1.75, 0.31, 0.066, 0.00, 0.270, 1),
        (1.81, 0.35, 0.074, 0.00, 0.278, 1),
        (1.88, 0.30, 0.062, 0.00, 0.252, 1),
        (1.96, 0.18, 0.042, 0.00, 0.215, 0),
    ], center_y=1.82, y_scale=0.96, x_scale=0.92, z_scale=0.88)


def _r5_helmet_cheek_rings(side):
    """Cheek/ear guard volume pulled close with an angled lower break."""
    x = side * 0.285
    return _shape_rings([
        (1.61, 0.065, 0.115, x * 0.90, 0.012, 0),
        (1.69, 0.090, 0.135, x, 0.022, 0),
        (1.78, 0.098, 0.145, x * 1.03, 0.014, 1),
        (1.87, 0.082, 0.126, x * 1.01, -0.002, 1),
        (1.96, 0.050, 0.090, x * 0.94, -0.018, 0),
    ], center_y=1.80, y_scale=0.96, x_scale=0.90, z_scale=0.90)


def _r5_helmet_rear_ridge_rings():
    """A low rear ridge with a sloped top and a clear pack/collar gap."""
    return _shape_rings([
        (1.72, 0.060, 0.042, 0.00, -0.275, 0),
        (1.84, 0.078, 0.052, 0.00, -0.300, 1),
        (1.95, 0.070, 0.046, 0.00, -0.292, 1),
        (2.05, 0.040, 0.034, 0.00, -0.245, 0),
    ], center_y=1.88, y_scale=0.96, x_scale=0.90, z_scale=0.88)


def _r4_arm_rings(side):
    """R7-A faceted sleeves with distinct deltoid, elbow and wrist breaks."""
    shoulder = 0.46 if side < 0 else 0.45
    return [
        (1.48, 0.150, 0.145, side * shoulder, 0.00, 0),
        (1.44, 0.178, 0.160, side * (shoulder + 0.032), 0.01, 0),
        (1.39, 0.192, 0.172, side * (shoulder + 0.056), 0.02, 0),
        (1.33, 0.182, 0.160, side * (shoulder + 0.072), 0.035, 0),
        (1.26, 0.164, 0.145, side * (shoulder + 0.076), 0.050, 0),
        (1.20, 0.142, 0.128, side * (shoulder + 0.064), 0.065, 0),
        (1.14, 0.130, 0.118, side * (shoulder + 0.052), 0.078, 0),
        (1.08, 0.145, 0.126, side * (shoulder + 0.044), 0.090, 0),
        (1.02, 0.156, 0.134, side * (shoulder + 0.038), 0.100, 0),
        (0.96, 0.145, 0.126, side * (shoulder + 0.030), 0.105, 2),
        (0.90, 0.134, 0.118, side * (shoulder + 0.022), 0.105, 2),
        (0.84, 0.124, 0.110, side * (shoulder + 0.015), 0.102, 2),
        (0.78, 0.118, 0.104, side * (shoulder + 0.008), 0.098, 2),
        (0.72, 0.114, 0.100, side * shoulder, 0.095, 1),
        (0.66, 0.108, 0.096, side * (shoulder - 0.006), 0.092, 1),
        (0.60, 0.100, 0.090, side * (shoulder - 0.014), 0.090, 1),
        (0.55, 0.090, 0.082, side * (shoulder - 0.022), 0.090, 1),
        (0.51, 0.078, 0.073, side * (shoulder - 0.030), 0.090, 1),
    ]


def _r4_leg_rings(side):
    """R7-A anatomical legs with a forward knee and compact rescue boot."""
    hip = 0.215 if side < 0 else 0.225
    return [
        (0.72, 0.160, 0.160, side * hip, -0.040, 0),
        (0.66, 0.178, 0.172, side * (hip + 0.008), -0.015, 0),
        (0.60, 0.188, 0.180, side * (hip + 0.014), 0.010, 0),
        (0.54, 0.184, 0.172, side * (hip + 0.014), 0.020, 0),
        (0.48, 0.170, 0.160, side * (hip + 0.012), 0.030, 0),
        (0.42, 0.160, 0.150, side * (hip + 0.006), 0.042, 0),
        (0.36, 0.158, 0.142, side * hip, 0.050, 0),
        (0.30, 0.145, 0.132, side * hip, 0.055, 1),
        (0.24, 0.132, 0.122, side * hip, 0.060, 1),
        (0.18, 0.122, 0.112, side * (hip - 0.008), 0.070, 1),
        (0.12, 0.110, 0.105, side * (hip - 0.008), 0.082, 1),
        (0.08, 0.118, 0.118, side * (hip - 0.008), 0.105, 2),
        (0.04, 0.136, 0.150, side * (hip - 0.008), 0.145, 2),
        (0.01, 0.150, 0.182, side * (hip - 0.008), 0.190, 2),
        (0.00, 0.152, 0.196, side * (hip - 0.008), 0.235, 2),
        (0.00, 0.142, 0.182, side * (hip - 0.008), 0.275, 2),
        (0.01, 0.126, 0.150, side * (hip - 0.008), 0.310, 2),
    ]


def _r5_jacket_rings():
    """R7-A tailored coat with non-parallel collar, waist and hip breaks."""
    return [
        (0.52, 0.31, 0.255, 0.00, -0.020, 0),
        (0.60, 0.36, 0.280, 0.00, -0.005, 0),
        (0.68, 0.38, 0.290, 0.00, 0.005, 0),
        (0.76, 0.32, 0.250, 0.00, 0.010, 0),
        (0.84, 0.28, 0.220, 0.00, 0.015, 0),
        (0.92, 0.27, 0.220, 0.00, 0.020, 0),
        (1.00, 0.31, 0.250, 0.00, 0.025, 0),
        (1.08, 0.36, 0.280, 0.00, 0.030, 0),
        (1.16, 0.42, 0.300, 0.00, 0.025, 0),
        (1.24, 0.46, 0.320, 0.00, 0.020, 0),
        (1.31, 0.49, 0.330, 0.00, 0.010, 0),
        (1.38, 0.47, 0.310, 0.00, 0.000, 0),
        (1.45, 0.40, 0.280, 0.00, -0.010, 0),
        (1.51, 0.30, 0.230, 0.00, -0.020, 0),
    ]


def _r5_helmet_rings():
    """R7-A helmet shell with a low directional dome and rear extension."""
    return _shape_rings([
        (1.55, 0.21, 0.19, 0.00, -0.020, 0),
        (1.61, 0.26, 0.23, 0.00, -0.010, 0),
        (1.68, 0.30, 0.27, 0.00, 0.000, 0),
        (1.75, 0.32, 0.29, 0.00, 0.008, 0),
        (1.82, 0.33, 0.30, 0.00, 0.012, 0),
        (1.90, 0.32, 0.29, 0.00, 0.010, 0),
        (1.98, 0.30, 0.27, 0.00, 0.002, 0),
        (2.05, 0.26, 0.23, 0.00, -0.008, 0),
        (2.11, 0.21, 0.19, 0.00, -0.016, 0),
        (2.16, 0.16, 0.15, 0.00, -0.022, 0),
        (2.20, 0.10, 0.10, 0.00, -0.025, 0),
        (2.23, 0.04, 0.05, 0.00, -0.025, 0),
    ], center_y=1.90, y_scale=0.95, x_scale=0.94, z_scale=0.93)


def _add_hero_lods(root, mats):
    """Build production LODs from the R4 mid-poly loop volumes.

    LOD1 and LOD2 deliberately keep the complete identity read—helmet/visor,
    shoulders, arms, legs, coat, survival pack, goggles and weapons—while
    reducing loop density.  They are authored meshes, not the old six-piece
    proxy stack, and stay under the runtime's existing LOD marker nodes.
    """

    def sample(rings, count):
        if len(rings) <= count:
            return list(rings)
        return [rings[round(index * (len(rings) - 1) / (count - 1))] for index in range(count)]

    def tag(obj, level, marker, identity):
        obj["lodLevel"] = level
        obj["identityPart"] = identity
        obj["generatedFrom"] = "R4-B-mid-poly-loop-base"
        obj["productionLod"] = True
        obj["proxyGeometry"] = False
        obj.parent = marker
        return obj

    def marker_for(level):
        marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
        marker.parent = root
        marker["screenCoverage"] = 0.35 if level == 1 else 0.12
        marker["generatedFrom"] = "R4-D-production-lod-from-mid-poly"
        marker["proxyGeometry"] = False
        marker["productionLod"] = True
        marker["identityFeatures"] = "expedition-helmet,visor,cheek-guards,shoulders,arms,legs,pack,coat,goggles,weapons"
        return marker

    def jacket_rings(level):
        source = _r5_jacket_rings()
        return sample(source, 10 if level == 1 else 6)

    def helmet_rings(level):
        source = _r5_helmet_rings()
        return sample(source, 10 if level == 1 else 7)

    def armor_rings():
        # A compact chest bib exposes the waist and leaves the shoulder line
        # to the jacket/body volume instead of reading as a second torso.
        return [
            (1.08, 0.30, 0.075, 0.0, -0.275, 2),
            (1.13, 0.38, 0.090, 0.0, -0.285, 2),
            (1.24, 0.41, 0.095, 0.0, -0.280, 2),
            (1.32, 0.31, 0.070, 0.0, -0.255, 2),
        ]

    def pack_rings(level):
        return [
            (0.72, 0.27, 0.075, 0.0, 0.50, 1),
            (0.86, 0.33, 0.095, 0.0, 0.51, 1),
            (1.08, 0.35, 0.105, 0.0, 0.52, 1),
            (1.30, 0.30, 0.085, 0.0, 0.49, 1),
        ][: (4 if level == 1 else 3)]

    def weapon_components(level):
        blade = [
            ([(-0.10, -0.18), (0.10, -0.18), (0.15, 0.04), (0.085, 0.46), (0.0, 0.78), (-0.085, 0.46), (-0.15, 0.04)], 0.02, 0.075, 0),
            ([(-0.045, -0.28), (0.045, -0.28), (0.052, -0.055), (-0.052, -0.055)], 0.02, 0.10, 1),
            ([(-0.21, -0.07), (0.21, -0.07), (0.15, 0.025), (-0.15, 0.025)], 0.02, 0.065, 1),
            ([(-0.030, 0.10), (0.030, 0.10), (0.035, 0.56), (0.0, 0.64), (-0.035, 0.56)], 0.02, 0.045, 2),
        ]
        # R7-B keeps the carbine as one existing authored profile mesh.  The
        # stock sits near the right hand, the receiver has a thicker centre,
        # and the lowered carry line leaves the chest and visor readable.
        carbine = [
            # receiver: compact centre with a deeper lower rail
            ([(-0.11, 0.07), (0.18, 0.07), (0.21, 0.17), (0.16, 0.29), (-0.10, 0.31), (-0.17, 0.19)], 0.10, 0.24, 1),
            # barrel and muzzle: short, narrow, and stepped away from receiver
            ([(-0.56, 0.17), (-0.16, 0.17), (-0.13, 0.22), (-0.17, 0.27), (-0.56, 0.24)], 0.10, 0.13, 2),
            # stock: compact wedge, angled toward the right shoulder
            ([(0.12, 0.10), (0.34, 0.12), (0.40, 0.18), (0.28, 0.25), (0.10, 0.24)], 0.10, 0.18, 1),
            # handguard: a raised support rail for the left hand
            ([(-0.40, 0.22), (-0.15, 0.22), (-0.12, 0.31), (-0.36, 0.32)], 0.10, 0.17, 0),
            # right grip: diagonal enough to read in silhouette
            ([(-0.01, -0.04), (0.11, -0.04), (0.13, 0.14), (0.01, 0.17)], 0.10, 0.18, 2),
            # vertical energy cell / magazine
            ([(-0.08, -0.04), (0.04, -0.04), (0.06, 0.11), (-0.06, 0.11)], 0.10, 0.15, 3),
        ]
        if level == 1:
            blade.append(([(-0.040, 0.14), (0.040, 0.14), (0.040, 0.52), (-0.040, 0.52)], 0.02, 0.07, 0))
        return blade + carbine

    lod_parts = []
    for level in (1, 2):
        target = f"LOD{level}"
        marker = marker_for(level)
        if level == 1:
            body_segments, body_count = 40, 20
            limb_segments, limb_count = 18, 20
            head_segments, head_count = 28, 14
            arm_segments, arm_count = 16, 18
            gear_segments = 20
        else:
            body_segments, body_count = 24, 10
            limb_segments, limb_count = 12, 10
            head_segments, head_count = 18, 8
            arm_segments, arm_count = 12, 8
            gear_segments = 14

        body = _multi_loft_mesh(
            f"LOD{level}_PROD_body",
            [
                {"rings": sample(_r4_body_rings(), body_count), "segments": body_segments},
                {"rings": sample(_r4_leg_rings(-1), limb_count), "segments": limb_segments},
                {"rings": sample(_r4_leg_rings(1), limb_count), "segments": limb_segments},
            ],
            [mats["cloth"], mats["leather"], mats["metal"]],
            target=target,
        )
        tag(body, level, marker, "body-shoulders-legs")

        head = _multi_loft_mesh(
            f"LOD{level}_PROD_head",
            [
                {"rings": helmet_rings(level), "segments": head_segments},
                {"rings": _r5_helmet_brow_rings(), "segments": max(14, head_segments // 2)},
                {"rings": _r5_helmet_cheek_rings(-1), "segments": max(12, head_segments // 2)},
                {"rings": _r5_helmet_cheek_rings(1), "segments": max(12, head_segments // 2)},
                {"rings": _r5_helmet_rear_ridge_rings(), "segments": max(10, head_segments // 2)},
            ],
            [mats["cloth"], mats["metal"], mats["accent"], mats["accent"]],
            target=target,
        )
        tag(head, level, marker, "helmet-visor-goggles")

        arms = _multi_loft_mesh(
            f"LOD{level}_PROD_arms",
            [
                {"rings": sample(_r4_arm_rings(-1), arm_count), "segments": arm_segments},
                {"rings": sample(_r4_arm_rings(1), arm_count), "segments": arm_segments},
            ],
            [mats["cloth"]],
            target=target,
        )
        tag(arms, level, marker, "arms-sleeves")

        if level == 1:
            legs = _multi_loft_mesh(
                f"LOD{level}_PROD_legs",
                [
                    {"rings": sample(_r4_leg_rings(-1), limb_count), "segments": limb_segments},
                    {"rings": sample(_r4_leg_rings(1), limb_count), "segments": limb_segments},
                ],
                [mats["leather"]],
                target=target,
            )
            tag(legs, level, marker, "legs-boots")
        else:
            legs = None

        gear = _multi_loft_mesh(
            f"LOD{level}_PROD_gear",
            [
                {"rings": jacket_rings(level), "segments": gear_segments},
                {"rings": armor_rings(), "segments": gear_segments},
                {"rings": pack_rings(level), "segments": gear_segments},
                {"rings": [
                    (1.18, 0.18, 0.18, -0.48, 0.02, 2),
                    (1.28, 0.23, 0.21, -0.50, 0.02, 2),
                    (1.39, 0.20, 0.19, -0.47, 0.02, 2),
                    (1.48, 0.13, 0.14, -0.42, 0.02, 2),
                ], "segments": max(12, gear_segments // 2)},
                {"rings": [
                    (0.78, 0.030, 0.030, -0.16, 0.34, 1),
                    (1.04, 0.032, 0.032, -0.16, 0.34, 1),
                    (1.30, 0.028, 0.028, -0.16, 0.34, 1),
                ], "segments": max(10, gear_segments // 2)},
            ],
            [mats["cloth"], mats["leather"], mats["metal"]],
            target=target,
        )
        tag(gear, level, marker, "coat-armor-pack")

        if level == 1:
            cape = _cape_mesh(
                f"LOD{level}_PROD_cape",
                (0, 1.1, 0),
                [mats["cloth"], mats["leather"]],
                target=target,
                detail=4,
            )
            tag(cape, level, marker, "coat-cape")

        weapon = _profile_mesh(
            f"LOD{level}_PROD_weapon",
            weapon_components(level),
            [mats["metal"], mats["leather"]],
            origin=(0.28, 0.66, -0.24),
            target=target,
        )
        tag(weapon, level, marker, "melee-ranged-weapons")
        lod_parts.extend([body, head, arms, gear, weapon])
        if legs:
            lod_parts.append(legs)
        if level == 1:
            lod_parts.append(cape)
    return lod_parts


def _build_mesh_parts(mats):
    """Create the eight LOD0 meshes that carry the complete Hero silhouette."""
    body_mats = [mats["cloth"], mats["leather"], mats["metal"], mats["metal_light"], mats["snow"], mats["accent"], mats["glow"]]

    def body_override(_ring_index, _segment, center_x, center_y, center_z, current, _following):
        # A single continuous body carries the chest shell and luminous sigil
        # through material regions instead of separate front boxes.
        if 0.92 <= center_y <= 1.34 and center_z > 0.22 and abs(center_x) < 0.40:
            return 2
        if 1.02 <= center_y <= 1.30 and center_z > 0.30 and abs(center_x) < 0.12:
            return 2
        return 0 if current[5] > 2 else current[5]

    body = _loft_mesh(
        "chest.heroBody",
        _r4_body_rings(),
        76,
        body_mats,
        origin=(0.0, 1.04, 0.0),
        override=body_override,
    )

    def head_override(_ring_index, _segment, center_x, center_y, center_z, current, _following):
        # The visor and face sigil are material regions on the hood/head mesh.
        if 1.60 <= center_y <= 1.84:
            if 1.71 <= center_y <= 1.79 and abs(center_x) < 0.13 and abs(center_z) > 0.24:
                return 3
            return 2
        return current[5] if current[5] < 4 else 3

    head = _loft_mesh(
        "head.heroHead",
        _r4_head_rings(),
        64,
        [mats["skin"], mats["snow"], mats["cloth_dark"], mats["accent"]],
        origin=(0.0, 1.78, 0.0),
        override=head_override,
    )

    # R4-B clothing is built as a few rounded loop meshes: a jacket shell,
    # joined shoulder/chest armor, a shaped backpack and a helmet shell. This
    # replaces the old flat profile collection while staying within the
    # 8–16 render-object budget.
    jacket = _multi_loft_mesh(
        "coat.heroJacket",
        [
            {"segments": 48, "rings": _r5_jacket_rings()},
            # Raised collar/fur volume: it is part of the jacket mesh rather
            # than a floating accessory, so the shoulder-to-neck transition
            # remains continuous in close-up and in the LOD reductions.
            {"segments": 28, "rings": [
                (1.47, 0.22, 0.23, 0.00, 0.00, 1),
                (1.52, 0.28, 0.26, 0.00, 0.00, 1),
                (1.58, 0.30, 0.27, 0.00, 0.00, 1),
                (1.63, 0.24, 0.22, 0.00, 0.00, 1),
            ]},
            # Leather placket and belt strip are narrow elongated volumes in
            # the shared coat mesh, avoiding extra render objects.
            {"segments": 12, "rings": [
                (0.90, 0.032, 0.032, -0.075, 0.285, 1),
                (1.06, 0.034, 0.034, -0.075, 0.285, 1),
                (1.22, 0.034, 0.034, -0.075, 0.285, 1),
                (1.43, 0.028, 0.030, -0.075, 0.280, 1),
            ]},
            {"segments": 32, "rings": [
                (0.84, 0.31, 0.255, 0.00, 0.015, 1),
                (0.88, 0.34, 0.27, 0.00, 0.015, 1),
                (0.93, 0.33, 0.26, 0.00, 0.015, 1),
                (0.97, 0.29, 0.24, 0.00, 0.015, 1),
            ]},
        ],
        [mats["cloth"], mats["leather"]],
    )

    def armor_override(_ring_index, segment, _center_x, center_y, center_z, _current, _following):
        # Keep the chest plate/front-facing shoulder caps in metal while the
        # underside remains leather for a readable layered silhouette.
        if center_y > 0.16 and 0.98 <= center_y <= 1.38 and segment % 5 in (0, 1):
            return 1
        if abs(center_z) > 0.18 and 1.22 <= center_y <= 1.46:
            return 1
        return 0

    armor = _multi_loft_mesh(
        "armor.heroPlates",
        [
            {"segments": 32, "override": armor_override, "rings": [
                (1.20, 0.20, 0.20, -0.48, 0.02, 1),
                (1.27, 0.25, 0.23, -0.50, 0.02, 1),
                (1.35, 0.27, 0.24, -0.49, 0.02, 1),
                (1.43, 0.25, 0.22, -0.47, 0.02, 1),
                (1.50, 0.18, 0.17, -0.44, 0.02, 1),
            ]},
            {"segments": 32, "override": armor_override, "rings": [
                (1.24, 0.14, 0.16, 0.43, 0.02, 1),
                (1.30, 0.17, 0.18, 0.43, 0.02, 1),
                (1.36, 0.18, 0.19, 0.42, 0.02, 1),
                (1.42, 0.17, 0.17, 0.40, 0.02, 1),
                (1.48, 0.13, 0.14, 0.37, 0.02, 1),
            ]},
            {"segments": 40, "override": armor_override, "rings": [
                (1.06, 0.25, 0.075, 0.00, -0.27, 1),
                (1.10, 0.29, 0.085, 0.00, -0.28, 1),
                (1.16, 0.33, 0.095, 0.00, -0.29, 1),
                (1.22, 0.34, 0.095, 0.00, -0.29, 1),
                (1.28, 0.31, 0.085, 0.00, -0.27, 1),
                (1.32, 0.25, 0.065, 0.00, -0.24, 1),
            ]},
            {"segments": 24, "override": armor_override, "rings": [
                (1.12, 0.075, 0.12, -0.67, -0.01, 1),
                (1.22, 0.090, 0.14, -0.69, -0.01, 1),
                (1.34, 0.085, 0.13, -0.67, -0.01, 1),
                (1.43, 0.055, 0.10, -0.62, -0.01, 1),
            ]},
        ],
        [mats["cloth"], mats["metal"]],
    )

    pack = _multi_loft_mesh(
        "pack.heroSurvival",
        [
            {"segments": 40, "rings": [
                (0.68, 0.26, 0.12, 0.00, 0.49, 1),
                (0.76, 0.33, 0.15, 0.00, 0.50, 1),
                (0.84, 0.36, 0.16, 0.00, 0.51, 1),
                (0.94, 0.37, 0.17, 0.00, 0.52, 1),
                (1.04, 0.37, 0.17, 0.00, 0.52, 1),
                (1.14, 0.36, 0.16, 0.00, 0.52, 1),
                (1.24, 0.33, 0.15, 0.00, 0.51, 1),
                (1.34, 0.27, 0.12, 0.00, 0.49, 1),
                (1.40, 0.19, 0.09, 0.00, 0.48, 1),
            ]},
            {"segments": 32, "rings": [
                (1.30, 0.22, 0.09, 0.00, 0.62, 0),
                (1.36, 0.25, 0.10, 0.00, 0.62, 0),
                (1.42, 0.20, 0.08, 0.00, 0.61, 0),
                (1.46, 0.13, 0.055, 0.00, 0.58, 0),
            ]},
            # Two integrated load-bearing straps and one offset utility canister
            # give the rear pack a functional silhouette without adding meshes.
            {"segments": 12, "rings": [
                (0.76, 0.035, 0.035, -0.17, 0.34, 0),
                (0.94, 0.038, 0.038, -0.17, 0.34, 0),
                (1.14, 0.038, 0.038, -0.17, 0.34, 0),
                (1.34, 0.030, 0.030, -0.17, 0.34, 0),
            ]},
            {"segments": 20, "rings": [
                (0.80, 0.085, 0.075, 0.18, 0.57, 0),
                (0.88, 0.105, 0.085, 0.18, 0.58, 0),
                (1.08, 0.105, 0.085, 0.18, 0.58, 0),
                (1.16, 0.075, 0.065, 0.18, 0.56, 0),
            ]},
        ],
        [mats["leather"], mats["cloth"]],
    )

    def helmet_override(_ring_index, _segment, _center_x, center_y, center_z, current, _following):
        if center_y >= 1.72 and center_z > 0.18:
            return 1
        return current[5]

    helmet = _multi_loft_mesh(
        "helmet.heroShell",
        [
            {"rings": _r5_helmet_rings(), "segments": 48, "override": helmet_override},
            {"rings": _r5_helmet_brow_rings(), "segments": 28, "override": helmet_override},
            {"rings": _r5_helmet_cheek_rings(-1), "segments": 20, "override": helmet_override},
            {"rings": _r5_helmet_cheek_rings(1), "segments": 20, "override": helmet_override},
            {"rings": _r5_helmet_rear_ridge_rings(), "segments": 18, "override": helmet_override},
        ],
        [mats["cloth"], mats["accent"]],
    )

    # A single head-bound mesh gives the Hero a readable goggle band and two
    # lenses without returning to the old collection of tiny primitives.
    goggles = _profile_mesh(
        "head.goggles",
        [
            ([(-0.27, 1.82), (-0.06, 1.84), (-0.055, 1.69), (-0.27, 1.71)], -0.285, 0.065, 0),
            ([(0.06, 1.84), (0.27, 1.82), (0.27, 1.71), (0.055, 1.69)], -0.285, 0.065, 0),
            ([(-0.085, 1.80), (0.085, 1.80), (0.08, 1.85), (-0.08, 1.85)], -0.292, 0.055, 0),
            ([(-0.30, 1.87), (-0.24, 1.90), (0.24, 1.90), (0.30, 1.87), (0.25, 1.93), (-0.25, 1.93)], -0.012, 0.055, 0),
            ([(-0.052, 1.77), (0.052, 1.77), (0.052, 1.70), (-0.052, 1.70)], -0.30, 0.050, 0),
        ],
        [mats["glow"]],
    )
    # A small authored nose marker keeps HeroController's fail-safe facing
    # calibration working after the mesh consolidation.  It is intentionally
    # part of the head mesh family, not a procedural runtime helper.
    face_marker = _profile_mesh(
        "head.nose",
        [([(-0.012, -0.018), (0.012, -0.018), (0.0, 0.024)], 0.0, 0.014, 0)],
        [mats["glow"]],
        origin=(0.0, 1.73, 0.30),
    )

    arm_mats = [mats["cloth"], mats["leather"], mats["metal_light"], mats["accent"]]
    arm_parts = []
    for label, side in (("L", -1), ("R", 1)):
        arm_parts.append(_loft_mesh(
            f"arm.{label}.heroSleeve",
            _r4_arm_rings(side),
            48,
            arm_mats,
            origin=(side * 0.46, 1.10, 0.0),
        ))

    leg_mats = [mats["leather"], mats["metal"], mats["metal_light"], mats["accent"]]
    leg_parts = []
    for label, side in (("L", -1), ("R", 1)):
        leg_parts.append(_loft_mesh(
            f"leg.{label}.heroBoot",
            _r4_leg_rings(side),
            48,
            leg_mats,
            origin=(side * 0.22, 0.40, 0.0),
        ))

    cape = _cape_mesh("cape.heroCoat", (0.0, 1.10, 0.0), [mats["cloth_dark"], mats["leather"]], detail=5)

    melee = _profile_mesh(
        "weapon.meleeBlade",
        [
            ([(-0.11, -0.18), (0.11, -0.18), (0.15, 0.08), (0.085, 0.48), (0.0, 0.82), (-0.085, 0.48), (-0.15, 0.08)], 0.00, 0.09, 0),
            ([(-0.028, -0.30), (0.028, -0.30), (0.032, -0.055), (-0.032, -0.055)], 0.0, 0.12, 1),
            ([(-0.22, -0.065), (0.22, -0.065), (0.16, 0.025), (-0.16, 0.025)], 0.0, 0.08, 2),
            ([(-0.032, 0.10), (0.032, 0.10), (0.036, 0.60), (0.0, 0.70), (-0.036, 0.60)], 0.02, 0.045, 3),
            ([(-0.040, -0.52), (0.040, -0.52), (0.050, -0.30), (-0.050, -0.30)], 0.0, 0.08, 1),
            ([(-0.065, -0.58), (0.065, -0.58), (0.0, -0.68)], 0.02, 0.07, 3),
        ],
        [mats["metal_light"], mats["leather"], mats["accent"], mats["glow"]],
        origin=(0.62, 0.78, 0.16),
    )

    ranged = _profile_mesh(
        "weapon.rangedCarbine",
        [
            ([(-0.11, 0.07), (0.18, 0.07), (0.21, 0.17), (0.16, 0.29), (-0.10, 0.31), (-0.17, 0.19)], 0.0, 0.24, 1),
            ([(-0.56, 0.17), (-0.16, 0.17), (-0.13, 0.22), (-0.17, 0.27), (-0.56, 0.24)], 0.0, 0.13, 2),
            ([(0.12, 0.10), (0.34, 0.12), (0.40, 0.18), (0.28, 0.25), (0.10, 0.24)], 0.0, 0.18, 1),
            ([(-0.40, 0.22), (-0.15, 0.22), (-0.12, 0.31), (-0.36, 0.32)], 0.0, 0.17, 0),
            ([(-0.01, -0.04), (0.11, -0.04), (0.13, 0.14), (0.01, 0.17)], 0.0, 0.18, 2),
            ([(-0.08, -0.04), (0.04, -0.04), (0.06, 0.11), (-0.06, 0.11)], 0.0, 0.15, 3),
        ],
        [mats["leather"], mats["metal"], mats["metal_light"], mats["glow"]],
        origin=(0.28, 0.66, -0.24),
    )
    return [body, head, face_marker, jacket, armor, pack, helmet, goggles, *arm_parts, *leg_parts, cape, melee, ranged]


def _hero_atlas_materials(mats):
    """Return the deterministic, de-duplicated Hero atlas palette."""
    ordered = [
        mats["cloth"],
        mats["leather"],
        mats["metal"],
        mats["skin"],
        mats["cloth_dark"],
        mats["snow"],
        mats["glow"],
        mats["accent"],
    ]
    result = []
    seen = set()
    for mat in ordered:
        if mat is None or mat.name in seen:
            continue
        result.append(mat)
        seen.add(mat.name)
    return result


def author_hero_atlas(objects, mats):
    """Author one embedded 1024 atlas and place every Hero UV in its cell.

    The previous Hero pass generated one 64x64 image per material.  This
    stage deliberately uses a single, deterministic atlas so the runtime has
    enough texel density for close-up review while keeping the authored
    material set small and inspectable.  Existing projected UVs remain the
    starting point; this function only packs them into material-specific
    regions and does not change mesh geometry.
    """
    texture_size = 1024
    columns = 4
    rows = 2
    margin = 6
    cell_width = texture_size // columns
    cell_height = texture_size // rows
    palette = _hero_atlas_materials(mats)
    if not palette:
        raise RuntimeError("Hero atlas has no materials")

    for image in list(bpy.data.images):
        if image.name.startswith("ART_PAINT_") or image.name == "HERO_ATLAS_1024":
            bpy.data.images.remove(image)

    image = bpy.data.images.new("HERO_ATLAS_1024", width=texture_size, height=texture_size, alpha=True)
    pixels = array("f")
    pixels.extend([0.0] * (texture_size * texture_size * 4))
    # Fill the atlas with low-frequency hand-painted value breakup. Each cell
    # is intentionally broad and readable rather than a noisy placeholder.
    for index, mat in enumerate(palette):
        shader = mat.node_tree.nodes.get("Principled BSDF") if mat.use_nodes else None
        base = tuple(shader.inputs["Base Color"].default_value[:3]) if shader else (0.5, 0.5, 0.5)
        cell_x = index % columns
        cell_y = index // columns
        x0 = cell_x * cell_width
        y0 = cell_y * cell_height
        tag = mat.name.lower()
        for y in range(margin, cell_height - margin):
            for x in range(margin, cell_width - margin):
                # R5-E uses broad, hand-painted value bands instead of a
                # noisy procedural texture.  The same deterministic atlas
                # remains the only Hero image; these low-frequency bands make
                # cloth, leather, steel, and visor accents read as authored
                # surfaces at both gameplay distance and close-up review.
                u = x / max(1, cell_width - 1)
                v = y / max(1, cell_height - 1)
                wave = math.sin((x + index * 19) * 0.047) * 0.018
                wave += math.cos((y + index * 11) * 0.031) * 0.014
                if "metal" in tag:
                    # Fine directional brushing and restrained edge wear keep
                    # gunmetal from reading as a single dark plastic block.
                    wave += math.sin((y * 0.22 + x * 0.018) + index) * 0.026
                    wave += math.sin((x * 0.075 + y * 0.012) + index * 0.7) * 0.014
                    wave += (0.048 if v < 0.16 or v > 0.86 else 0.0)
                    wave -= 0.018 if 0.42 < u < 0.58 and 0.30 < v < 0.70 else 0.0
                elif "leather" in tag:
                    # Long grain, a soft warm value break, and small seam
                    # bands provide a readable worn-leather identity.
                    wave += math.sin((x * 0.16 + y * 0.045) + index) * 0.034
                    wave += math.sin((x * 0.035 + y * 0.19) + index * 0.4) * 0.018
                    wave += 0.042 * math.sin((u * 2.0 + v * 0.7 + index * 0.17) * math.pi)
                    wave += 0.028 if (int(v * 18.0) % 7) == 0 else 0.0
                elif "cloth" in tag:
                    # Low-contrast cross weave and broad fold bands are
                    # intentionally directional rather than random noise.
                    weave_x = math.sin(x * 0.42 + index) * 0.012
                    weave_y = math.sin(y * 0.36 + index * 0.8) * 0.010
                    wave += weave_x + weave_y + weave_x * weave_y * 1.6
                    wave += 0.030 * math.sin((u * 1.5 + v * 0.35 + index * 0.17) * math.pi)
                    wave += 0.026 if v > 0.82 and (int(u * 20.0) % 5) == 0 else 0.0
                elif "glow" in tag or "accent" in tag:
                    # A cool visor/trim gradient: brighter through the centre,
                    # darker at the perimeter, with restrained frost striations.
                    centre = max(0.0, 1.0 - abs(u - 0.5) * 1.8)
                    wave += 0.060 * centre - 0.020 * (1.0 - centre)
                    wave += 0.020 * math.sin((x - y) * 0.09 + index)
                    wave += 0.022 if (int((u + v) * 24.0) % 11) == 0 else 0.0
                edge = min(x, y, cell_width - 1 - x, cell_height - 1 - y)
                value = 0.96 + wave + (0.025 if edge < 10 else 0.0)
                pixel_index = ((y0 + y) * texture_size + (x0 + x)) * 4
                pixels[pixel_index] = max(0.0, min(1.0, base[0] * value))
                pixels[pixel_index + 1] = max(0.0, min(1.0, base[1] * value))
                pixels[pixel_index + 2] = max(0.0, min(1.0, base[2] * value))
                pixels[pixel_index + 3] = 1.0
        region = (cell_x, cell_y, x0 + margin, y0 + margin, cell_width - margin, cell_height - margin)
        mat["heroAtlasRegion"] = ",".join(str(value) for value in region)
        mat["heroAtlasResolution"] = texture_size
    image.pixels = pixels
    image.pack()
    image["heroAtlas"] = True
    image["resolution"] = texture_size

    regions = {mat.name: (index % columns, index // columns) for index, mat in enumerate(palette)}
    for obj in objects:
        if obj.type != "MESH" or not obj.data.polygons:
            continue
        mesh = obj.data
        uv_layer = mesh.uv_layers.active or (mesh.uv_layers[0] if mesh.uv_layers else mesh.uv_layers.new(name="UVMap"))
        for polygon in mesh.polygons:
            slot = mesh.materials[polygon.material_index] if polygon.material_index < len(mesh.materials) else None
            cell = regions.get(slot.name if slot else "", (0, 0))
            cell_x, cell_y = cell
            u_min = (cell_x * cell_width + margin) / texture_size
            v_min = (cell_y * cell_height + margin) / texture_size
            u_span = (cell_width - margin * 2) / texture_size
            v_span = (cell_height - margin * 2) / texture_size
            for loop_index in polygon.loop_indices:
                uv = uv_layer.data[loop_index].uv
                uv.x = u_min + max(0.0, min(1.0, uv.x)) * u_span
                uv.y = v_min + max(0.0, min(1.0, uv.y)) * v_span

    for mat in palette:
        if not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        if shader is None:
            continue
        texcoord = nodes.get("HeroAtlas UV") or nodes.new("ShaderNodeTexCoord")
        texcoord.name = "HeroAtlas UV"
        texture = nodes.get("HeroAtlasTexture") or nodes.new("ShaderNodeTexImage")
        texture.name = "HeroAtlasTexture"
        texture.label = "R3-D 1024px Hero atlas"
        texture.image = image
        texture.interpolation = "Linear"
        for link in list(texture.inputs["Vector"].links):
            links.remove(link)
        links.new(texcoord.outputs["UV"], texture.inputs["Vector"])
        mix = nodes.get("ArtTint Multiply")
        if mix is not None and len(mix.inputs) > 6:
            for link in list(mix.inputs[6].links):
                links.remove(link)
            links.new(texture.outputs["Color"], mix.inputs[6])
        else:
            base_input = shader.inputs.get("Base Color")
            if base_input is not None:
                for link in list(base_input.links):
                    links.remove(link)
                links.new(texture.outputs["Color"], base_input)

    return {"image": image.name, "resolution": texture_size, "materials": len(palette)}


def _hero_vertex_weights(object_name, position):
    """Return smooth local envelopes for the Hero's authored meshes.

    The shared unit library intentionally keeps rigid piece binding. Hero-R3
    uses a separate envelope so the continuous body, sleeves, boots, cape,
    pack, and weapons deform through the existing HeroSkeleton without
    changing any other character builder.
    """
    name = object_name.lower()
    x, y, _z = position

    def pair(first, second, amount):
        amount = max(0.0, min(1.0, amount))
        return [(first, amount), (second, 1.0 - amount)]

    # R4-D production LODs are kept under their marker nodes, but are also
    # skinned so distance switching does not freeze the character in a bind
    # pose. Combined arm/leg meshes choose the side from the authored x sign.
    if name.startswith(("lod1_prod_", "lod2_prod_")):
        if "head" in name:
            return [("head", 1.0)]
        if "weapon" in name:
            return [("hand.R", 1.0)]
        if "arms" in name:
            side = "L" if x < 0 else "R"
            if y >= 1.10:
                return pair(f"upper_arm.{side}", f"lower_arm.{side}", (y - 1.10) / 0.22)
            if y >= 0.78:
                return pair(f"lower_arm.{side}", f"hand.{side}", (y - 0.78) / 0.32)
            return [(f"hand.{side}", 1.0)]
        if "body" in name:
            if y >= 1.18:
                return [("chest", 1.0)]
            if y >= 0.86:
                return pair("chest", "spine", (y - 0.86) / 0.32)
            return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.58) / 0.28)))
        if "legs" in name:
            side = "L" if x < 0 else "R"
            if y >= 0.42:
                return pair(f"thigh.{side}", f"shin.{side}", (y - 0.42) / 0.24)
            if y >= 0.10:
                return pair(f"shin.{side}", f"foot.{side}", (y - 0.10) / 0.32)
            return [(f"foot.{side}", 1.0)]
        if "cape" in name:
            return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.36) / 0.69)))
        if "gear" in name:
            if y >= 1.12:
                return pair("chest", "spine", (y - 1.12) / 0.34)
            return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.58) / 0.54)))
        return [("spine", 1.0)]

    if name.startswith(("head.", "head", "face.")):
        return [("head", 1.0)]
    if name.startswith("weapon.rangedcarbine"):
        # The compact carbine is a single mesh, but its forward handguard is
        # deliberately weighted to the existing left hand bone.  This keeps
        # the production skeleton/socket contract while allowing the ranged
        # pose to read as a genuine two-hand hold instead of a one-arm carry.
        if x < -0.12:
            return [("hand.L", 1.0)]
        if x < 0.18:
            return pair("hand.L", "hand.R", (x + 0.12) / 0.30)
        return [("hand.R", 1.0)]
    if name.startswith("weapon."):
        return [("hand.R", 1.0)]
    if name.startswith("arm.l"):
        if y >= 1.10:
            return pair("upper_arm.L", "lower_arm.L", (y - 1.10) / 0.22)
        if y >= 0.78:
            return pair("lower_arm.L", "hand.L", (y - 0.78) / 0.32)
        return [("hand.L", 1.0)]
    if name.startswith("arm.r"):
        if y >= 1.10:
            return pair("upper_arm.R", "lower_arm.R", (y - 1.10) / 0.22)
        if y >= 0.78:
            return pair("lower_arm.R", "hand.R", (y - 0.78) / 0.32)
        return [("hand.R", 1.0)]
    if name.startswith("leg.l"):
        if y >= 0.42:
            return pair("thigh.L", "shin.L", (y - 0.42) / 0.24)
        if y >= 0.10:
            return pair("shin.L", "foot.L", (y - 0.10) / 0.32)
        return [("foot.L", 1.0)]
    if name.startswith("leg.r"):
        if y >= 0.42:
            return pair("thigh.R", "shin.R", (y - 0.42) / 0.24)
        if y >= 0.10:
            return pair("shin.R", "foot.R", (y - 0.10) / 0.32)
        return [("foot.R", 1.0)]
    if name.startswith("cape."):
        if y >= 1.05:
            return pair("chest", "spine", (y - 1.05) / 0.38)
        return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.36) / 0.69)))
    if name.startswith("coat."):
        if y >= 1.12:
            return pair("chest", "spine", (y - 1.12) / 0.34)
        return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.58) / 0.54)))
    if name.startswith("helmet."):
        return [("head", 1.0)]
    if name.startswith("armor."):
        return pair("chest", "spine", max(0.0, min(1.0, (y - 1.0) / 0.42)))
    if name.startswith("pack."):
        if y >= 1.14:
            return pair("chest", "spine", (y - 1.14) / 0.30)
        return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.72) / 0.42)))
    # The continuous torso gets a three-band envelope. Keeping adjacent
    # weights overlapping is what prevents a hard seam at the waist during a
    # hit or attack pose.
    if name.startswith("chest."):
        if y >= 1.18:
            return [("chest", 1.0)]
        if y >= 0.86:
            return pair("chest", "spine", (y - 0.86) / 0.32)
        return pair("spine", "pelvis", max(0.0, min(1.0, (y - 0.58) / 0.28)))
    return [("spine", 1.0)]


def bind_hero_weighted(parts, skeleton):
    """Bind Hero meshes through Armature modifiers and vertex weights.

    Production LOD meshes retain their explicit LOD1/LOD2 marker parent while
    still pointing their Armature modifier at the shared HeroSkeleton.
    """
    valid_bones = {bone.name for bone in skeleton.data.bones}
    for obj in parts:
        if obj.type != "MESH":
            continue
        world_matrix = obj.matrix_world.copy()
        lod_parent = obj.parent if obj.get("productionLod") else None
        skeleton_inverse = skeleton.matrix_world.inverted()
        # Resolve authored coordinates before changing the parent. This keeps
        # the envelope independent of the Babylon orientation correction on
        # HeroRoot.
        local_positions = [
            skeleton_inverse @ (world_matrix @ vertex.co)
            for vertex in obj.data.vertices
        ]
        groups = {}
        for bone_name in valid_bones:
            groups[bone_name] = obj.vertex_groups.new(name=bone_name)
        for vertex_index, position in enumerate(local_positions):
            weights = [(name, weight) for name, weight in _hero_vertex_weights(obj.name, position) if name in groups and weight > 0.001]
            total = sum(weight for _name, weight in weights) or 1.0
            for bone_name, weight in weights:
                groups[bone_name].add([vertex_index], weight / total, "REPLACE")
        if lod_parent is None:
            obj.parent = skeleton
            obj.parent_type = "OBJECT"
        else:
            obj.parent = lod_parent
            obj.parent_type = "OBJECT"
        obj.matrix_world = world_matrix
        modifier = obj.modifiers.get("HeroWeightedDeform") or obj.modifiers.new("HeroWeightedDeform", "ARMATURE")
        modifier.object = skeleton
        modifier.use_deform_preserve_volume = True
        obj["skinBinding"] = "R3-E-weighted-envelope"


def collapse_hero_material_slots(objects, mats):
    """Keep one primary slot per authored mesh while retaining four materials.

    The previous pass duplicated several semantic aliases on every mesh,
    which inflated glTF primitive count without adding visible structure. R4-B
    assigns one intentional surface family per mesh; vertex colour and the
    shared atlas still provide the controlled value breakup.
    """
    for obj in objects:
        if obj.type != "MESH":
            continue
        name = obj.name.lower()
        if "goggle" in name or name.startswith("head.nose"):
            primary = mats["accent"]
        elif name.startswith(("lod1_prod_head", "lod2_prod_head")):
            # Production heads keep a second accent slot for the integrated
            # visor band.  The band is a material region on the head volume,
            # not a forward-facing tube that can become a snout in profile.
            obj.data.materials.clear()
            obj.data.materials.append(mats["cloth"])
            obj.data.materials.append(mats["accent"])
            for polygon in obj.data.polygons:
                polygon.material_index = 1 if 1.68 <= polygon.center.y <= 1.82 else 0
            continue
        elif "weapon" in name or "armor" in name:
            primary = mats["metal"]
        elif "pack" in name or name.startswith("leg."):
            primary = mats["leather"]
        else:
            primary = mats["cloth"]
        obj.data.materials.clear()
        obj.data.materials.append(primary)
        for polygon in obj.data.polygons:
            polygon.material_index = 0


def build():
    reset_scene()
    mats = {
        # R6-C retains the four established slots while separating surface
        # response: matte navy cloth, warm worn leather, restrained gunmetal,
        # and a cool visor accent that remains readable under furnace light.
        "cloth": material("MAT_hero_cloth", (0.075, 0.16, 0.34), 0.84),
        "leather": material("MAT_hero_leather", (0.19, 0.055, 0.018), 0.72),
        "metal": material("MAT_hero_metal", (0.085, 0.14, 0.21), 0.40, 0.88),
        "accent": material("MAT_hero_accent", (0.018, 0.22, 0.50), 0.42, 0.18),
    }
    # R4-B keeps four primary material slots. These semantic aliases let the
    # existing mesh authoring code retain its regions without exporting a
    # separate slot for every colour role.
    mats["metal_light"] = mats["metal"]
    mats["skin"] = mats["cloth"]
    mats["cloth_dark"] = mats["cloth"]
    mats["snow"] = mats["cloth"]
    mats["glow"] = mats["accent"]
    glow_shader = mats["glow"].node_tree.nodes.get("Principled BSDF")
    if glow_shader:
        emission_color = glow_shader.inputs.get("Emission Color")
        if emission_color:
            emission_color.default_value = (0.018, 0.22, 0.50, 1.0)
        if glow_shader.inputs.get("Emission Strength"):
            glow_shader.inputs["Emission Strength"].default_value = 0.65

    root = orient_for_babylon(empty("HeroRoot", target="EXPORT", display="PLAIN_AXES"))
    # Keep the existing H6 metadata required by the established asset gate;
    # this pass is a topology rebuild, not a new H1-H6 claim.
    root["commercialStage"] = "H6"
    root["commercialIteration"] = 2
    root["heroMeshPass"] = "R4-D-production-lods"
    root["heroMeshContract"] = "15 LOD0 meshes plus production LOD1/LOD2 identity forms from the mid-poly loop base"
    root["heroR4Stage"] = "R4-D"
    root["heroR5Stage"] = "R5-F"
    root["heroR5Scope"] = "locomotion and combat animation polish"
    root["heroR6Stage"] = "R6-D"
    root["heroR6Scope"] = "compact carbine, four-slot surface refinement, and combat pose finalization"
    root["topologyMethod"] = "authored anatomical and garment edge-loop lofts; no subdivision modifier"
    root["lod0TargetTriangles"] = "16000-25000"
    root["lod1TargetTriangles"] = "6000-10000"
    root["lod2TargetTriangles"] = "1500-3500"
    root["lodBuildMethod"] = "production authored loop reductions from R4-B mid-poly volumes"
    root["animationReview"] = "R6-D weighted body envelopes with contact-safe locomotion, two-hand ranged aim, melee impact hold, and recovery follow-through"
    root["feetGrounded"] = True
    root["orientationContract"] = "Babylon Y-up, forward +Z"
    root["animationIteration2"] = "follow-through and recovery keys"
    root["animationIteration3"] = "R5-F locomotion cadence, counterbalance and combat anticipation"
    root["skinningPass"] = "R3-E-weighted-deformation"

    parts = _build_mesh_parts(mats)
    lod_parts = _add_hero_lods(root, mats)
    parent_all(parts, root)
    skeleton = make_skeleton(root)
    skeleton.name = "HeroSkeleton"
    skeleton.data.name = "HeroSkeleton"
    bind_hero_weighted(parts + lod_parts, skeleton)

    socket_positions = {
        "weapon_socket.R": (0.62, 0.78, 0.20),
        "weapon_socket.L": (-0.50, 0.82, 0.16),
        "ranged_socket": (0.38, 1.34, -0.42),
        "back_socket": (0.0, 1.08, -0.48),
    }
    for name, position in socket_positions.items():
        socket = empty(name, position, "RIG")
        socket["socketKind"] = "ranged" if name == "ranged_socket" else "weapon"
        socket["forwardAxis"] = "+Y"
        socket["contractVersion"] = "hero-h4"
        socket.parent = root
    collision_box("COL_Hero", (0.82, 1.9, 0.82), (0, 0.95, 0), root)

    add_armature_clip(skeleton, "Idle", 24, [
        (1, {"pelvis": (0.008, 0.0, 0.0), "chest": (0.012, 0.0, 0.0)}),
        (8, {"pelvis": (-0.012, 0.0, 0.0), "chest": (0.032, 0.0, 0.0), "head": (0.0, 0.018, 0.0)}),
        (14, {"pelvis": (0.006, 0.0, 0.0), "chest": (-0.020, 0.0, 0.0), "head": (0.0, -0.014, 0.0)}),
        (20, {"pelvis": (-0.006, 0.0, 0.0), "chest": (-0.004, 0.0, 0.0)}),
        (24, {})
    ])
    add_armature_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.38, 0, 0), "upper_arm.R": (-0.38, 0, 0), "lower_arm.L": (-0.20, 0, 0), "lower_arm.R": (0.20, 0, 0), "thigh.L": (-0.54, 0, 0), "thigh.R": (0.54, 0, 0), "foot.L": (0.15, 0, 0), "foot.R": (-0.15, 0, 0), "chest": (0.045, 0, 0), "head": (-0.02, 0, 0)}),
        (8, {"upper_arm.L": (-0.38, 0, 0), "upper_arm.R": (0.38, 0, 0), "lower_arm.L": (0.20, 0, 0), "lower_arm.R": (-0.20, 0, 0), "thigh.L": (0.54, 0, 0), "thigh.R": (-0.54, 0, 0), "foot.L": (-0.15, 0, 0), "foot.R": (0.15, 0, 0), "chest": (-0.028, 0, 0), "head": (0.015, 0, 0)}),
        (16, {"upper_arm.L": (0.30, 0, 0), "upper_arm.R": (-0.30, 0, 0), "lower_arm.L": (-0.10, 0, 0), "lower_arm.R": (0.10, 0, 0), "thigh.L": (-0.40, 0, 0), "thigh.R": (0.40, 0, 0), "chest": (0.025, 0, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Run", 18, [
        (1, {"upper_arm.L": (0.70, 0, 0), "upper_arm.R": (-0.70, 0, 0), "lower_arm.L": (-0.30, 0, 0), "lower_arm.R": (0.30, 0, 0), "thigh.L": (-0.82, 0, 0), "thigh.R": (0.82, 0, 0), "chest": (0.14, 0, 0), "head": (-0.06, 0, 0)}),
        (6, {"upper_arm.L": (-0.70, 0, 0), "upper_arm.R": (0.70, 0, 0), "lower_arm.L": (0.30, 0, 0), "lower_arm.R": (-0.30, 0, 0), "thigh.L": (0.82, 0, 0), "thigh.R": (-0.82, 0, 0), "chest": (0.10, 0, 0), "head": (-0.03, 0, 0)}),
        (12, {"upper_arm.L": (0.56, 0, 0), "upper_arm.R": (-0.56, 0, 0), "lower_arm.L": (-0.16, 0, 0), "lower_arm.R": (0.16, 0, 0), "thigh.L": (-0.66, 0, 0), "thigh.R": (0.66, 0, 0), "chest": (0.11, 0, 0), "head": (-0.04, 0, 0)}),
        (18, {}),
    ])
    add_armature_clip(skeleton, "MeleeAttack", 16, [
        # Low-ready: both feet and the torso establish a stable launch point.
        (1, {"upper_arm.R": (-0.70, -0.08, -0.14), "lower_arm.R": (-0.42, 0.18, 0.18), "hand.R": (-0.18, 0.0, 0.0), "upper_arm.L": (-0.12, 0.10, 0.08), "foot.L": (-0.08, 0.0, 0.0), "foot.R": (0.10, 0.0, 0.0), "head": (0.05, 0.02, -0.05), "chest": (0.12, 0.10, -0.08), "pelvis": (0.02, -0.06, 0.0)}),
        # Pull-back: pelvis and chest counter-rotate before the swing.
        (4, {"upper_arm.R": (-1.58, -0.18, -0.22), "lower_arm.R": (-0.88, 0.26, 0.22), "hand.R": (-0.42, 0.0, 0.05), "upper_arm.L": (0.36, 0.20, 0.12), "foot.L": (0.12, 0.0, 0.0), "foot.R": (-0.16, 0.0, 0.0), "head": (0.16, 0.04, -0.08), "chest": (-0.22, -0.20, -0.16), "pelvis": (0.16, 0.14, 0.05)}),
        # Maximum swing: shoulder, chest, pelvis, and support leg share the arc.
        (7, {"upper_arm.R": (1.54, 0.22, 0.28), "lower_arm.R": (0.74, -0.16, -0.18), "hand.R": (0.46, 0.0, -0.06), "upper_arm.L": (-0.34, -0.18, -0.08), "foot.L": (-0.10, 0.0, 0.0), "foot.R": (0.18, 0.0, 0.0), "head": (-0.14, -0.05, 0.06), "chest": (0.34, 0.22, 0.22), "pelvis": (-0.14, -0.12, -0.05)}),
        # Impact hold: two adjacent keys make the hit readable before recovery.
        (9, {"upper_arm.R": (1.54, 0.22, 0.28), "lower_arm.R": (0.74, -0.16, -0.18), "hand.R": (0.46, 0.0, -0.06), "upper_arm.L": (-0.34, -0.18, -0.08), "foot.L": (-0.10, 0.0, 0.0), "foot.R": (0.18, 0.0, 0.0), "head": (-0.14, -0.05, 0.06), "chest": (0.34, 0.22, 0.22), "pelvis": (-0.14, -0.12, -0.05)}),
        (10, {"upper_arm.R": (1.48, 0.20, 0.26), "lower_arm.R": (0.70, -0.14, -0.16), "hand.R": (0.42, 0.0, -0.05), "upper_arm.L": (-0.30, -0.16, -0.07), "foot.L": (-0.08, 0.0, 0.0), "foot.R": (0.16, 0.0, 0.0), "head": (-0.12, -0.04, 0.05), "chest": (0.30, 0.20, 0.19), "pelvis": (-0.12, -0.10, -0.04)}),
        # Recover into a guarded stance.
        (13, {"upper_arm.R": (0.66, 0.06, 0.12), "lower_arm.R": (0.20, -0.04, -0.05), "hand.R": (0.12, 0.0, 0.0), "upper_arm.L": (-0.08, -0.02, 0.0), "foot.L": (0.03, 0.0, 0.0), "foot.R": (-0.03, 0.0, 0.0), "head": (-0.04, 0.0, 0.02), "chest": (0.10, 0.05, 0.06), "pelvis": (-0.03, -0.02, 0.0)}),
        (16, {})
    ])
    add_armature_clip(skeleton, "RangedAttack", 16, [
        # Low-ready: the carbine starts below the chest with both hands engaged.
        (1, {"upper_arm.R": (-0.52, -0.06, -0.10), "upper_arm.L": (-0.70, 0.08, 0.10), "lower_arm.L": (-0.34, 0.0, 0.12), "lower_arm.R": (-0.14, 0.0, 0.03), "hand.L": (0.16, 0.0, 0.02), "hand.R": (-0.10, 0.0, 0.0), "head": (-0.04, 0.0, 0.0), "chest": (-0.02, 0.0, -0.02)}),
        # Raise and seat the stock near the shoulder.
        (4, {"upper_arm.R": (-1.02, -0.10, -0.14), "upper_arm.L": (-1.08, 0.10, 0.12), "lower_arm.L": (-0.50, 0.02, 0.12), "lower_arm.R": (-0.24, 0.02, 0.05), "hand.L": (0.22, 0.0, 0.02), "hand.R": (-0.20, 0.0, 0.0), "head": (-0.10, -0.02, 0.0), "chest": (-0.06, -0.02, -0.04)}),
        # Aim: a compact two-arm triangle and visor line of sight.
        (7, {"upper_arm.R": (-1.42, -0.14, -0.16), "upper_arm.L": (-1.45, 0.13, 0.13), "lower_arm.L": (-0.68, 0.10, 0.10), "lower_arm.R": (-0.38, 0.06, 0.06), "hand.L": (0.26, 0.0, 0.02), "hand.R": (-0.36, 0.0, 0.0), "head": (-0.18, -0.02, 0.0), "chest": (-0.10, -0.04, -0.07), "pelvis": (0.04, 0.02, 0.0)}),
        # Fire key and a small recoil preparation.
        (10, {"upper_arm.R": (-1.26, -0.12, -0.13), "upper_arm.L": (-1.30, 0.11, 0.12), "lower_arm.L": (-0.58, 0.09, 0.09), "lower_arm.R": (-0.30, 0.05, 0.05), "hand.L": (0.23, 0.0, 0.02), "hand.R": (-0.28, 0.0, 0.0), "head": (-0.14, -0.02, 0.0), "chest": (-0.07, -0.03, -0.06), "pelvis": (0.03, 0.02, 0.0)}),
        (11, {"upper_arm.R": (-1.10, -0.10, -0.10), "upper_arm.L": (-1.18, 0.09, 0.09), "lower_arm.L": (-0.52, 0.08, 0.08), "lower_arm.R": (-0.25, 0.04, 0.04), "hand.L": (0.20, 0.0, 0.02), "hand.R": (-0.18, 0.0, 0.0), "head": (-0.09, -0.02, 0.0), "chest": (-0.04, -0.02, -0.03), "pelvis": (0.02, 0.01, 0.0)}),
        # Recover without dropping the left support hand.
        (14, {"upper_arm.R": (-0.72, -0.04, -0.06), "upper_arm.L": (-0.86, 0.06, 0.07), "lower_arm.L": (-0.30, 0.04, 0.05), "lower_arm.R": (-0.14, 0.02, 0.02), "hand.L": (0.12, 0.0, 0.01), "hand.R": (-0.08, 0.0, 0.0), "head": (-0.04, 0.0, 0.0), "chest": (-0.01, 0.0, 0.0)}),
        (16, {})
    ])
    add_armature_clip(skeleton, "Hit", 12, [
        (1, {"chest": (-0.18, 0.0, 0.07), "pelvis": (-0.05, 0.0, 0.0), "head": (0.12, 0.0, 0.05), "upper_arm.L": (0.14, 0.0, 0.09), "upper_arm.R": (-0.10, 0.0, -0.05), "thigh.L": (-0.08, 0.0, 0.0), "thigh.R": (0.05, 0.0, 0.0)}),
        (6, {"chest": (-0.38, 0.0, 0.14), "pelvis": (-0.10, 0.0, 0.0), "head": (0.23, 0.0, 0.09), "upper_arm.L": (0.30, 0.0, 0.16), "upper_arm.R": (-0.20, 0.0, -0.09), "lower_arm.L": (0.14, 0.0, 0.07), "thigh.L": (-0.14, 0.0, 0.0), "thigh.R": (0.09, 0.0, 0.0)}),
        (10, {"chest": (-0.16, 0.0, 0.06), "pelvis": (-0.03, 0.0, 0.0), "head": (0.09, 0.0, 0.03), "upper_arm.L": (0.11, 0.0, 0.05), "upper_arm.R": (-0.07, 0.0, -0.03)}),
        (12, {})
    ])
    add_armature_clip(skeleton, "Death", 20, [
        (1, {"foot.L": (0.04, 0, 0), "foot.R": (-0.04, 0, 0), "pelvis": (0.02, 0, 0)}),
        (6, {"root": (0.35, 0, 0), "pelvis": (0.10, 0, 0), "chest": (0.14, 0, 0), "head": (0.08, 0, 0), "foot.L": (0.08, 0, 0), "foot.R": (-0.08, 0, 0)}),
        (12, {"root": (1.25, 0, 0), "pelvis": (0.28, 0, 0), "chest": (0.44, 0, 0), "head": (0.20, 0, 0), "upper_arm.L": (0.84, 0, 0), "upper_arm.R": (0.84, 0, 0), "thigh.L": (-0.12, 0, 0), "thigh.R": (0.10, 0, 0)}),
        (16, {"root": (1.38, 0, 0), "pelvis": (0.38, 0, 0), "chest": (0.52, 0, 0), "head": (0.27, 0, 0), "upper_arm.L": (1.02, 0, 0), "upper_arm.R": (1.02, 0, 0), "thigh.L": (-0.18, 0, 0), "thigh.R": (0.14, 0, 0)}),
        (20, {"root": (1.45, 0, 0), "pelvis": (0.42, 0, 0), "chest": (0.56, 0, 0), "head": (0.31, 0, 0), "upper_arm.L": (1.14, 0, 0), "upper_arm.R": (1.14, 0, 0), "thigh.L": (-0.20, 0, 0), "thigh.R": (0.16, 0, 0)}),
    ])

    collapse_hero_material_slots(parts + lod_parts, mats)
    # Keep the packed surface/vertex colour contract while applying it only
    # to this Hero asset. No other character or facility is regenerated.
    author_surface_paint(parts + lod_parts, seed=53, textured=False)
    atlas = author_hero_atlas(parts + lod_parts, mats)
    root["heroSurfacePass"] = "R6-C-1024-hero-atlas-surface-refinement"
    root["heroAtlasResolution"] = atlas["resolution"]
    used_material_names = {
        slot.name
        for obj in parts + lod_parts
        if obj.type == "MESH"
        for slot_index, slot in enumerate(obj.data.materials)
        if slot is not None and any(poly.material_index == slot_index for poly in obj.data.polygons)
    }
    root["heroMaterialCount"] = len(used_material_names)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", "hero.glb"))
    # Keep the generated source reviewable: Blender's startup Cube is not a
    # Hero part and must not survive beside the authored root in the .blend.
    for stray in [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name == "Cube" and obj.parent is None
    ]:
        bpy.data.objects.remove(stray, do_unlink=True)
    save_source(source)
    export_glb(output)
    print(f"Hero production mesh pass: LOD0={len(parts)} meshes, LOD1/LOD2 authored production meshes={len(lod_parts)} meshes")


if __name__ == "__main__":
    build()
