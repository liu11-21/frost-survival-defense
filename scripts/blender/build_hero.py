"""Build the authored Hero as a small set of continuous character meshes.

This pass intentionally keeps the existing gameplay contract (root, skeleton,
sockets and animation clip names) while replacing the previous 184-piece
primitive assembly with a handful of lofted body, clothing and equipment
meshes.  The low-detail tiers are authored silhouette meshes too; they are not
the generic head-and-cylinder proxies used by the shared unit builder.
"""

import math
import os
import sys

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
from build_units import add_armature_clip, bind_unit_pieces, make_skeleton  # noqa: E402


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
        (1.42, 0.34, -0.28),
        (1.18, 0.48, -0.34),
        (0.90, 0.58, -0.38),
        (0.62, 0.54, -0.42),
        (0.36, 0.35, -0.37),
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
                local_z = z + (0.035 if column == 1 else 0.0) * back
                vertices.append((fraction * width - origin[0], y - origin[1], local_z - origin[2] + back * 0.025))
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


def _add_hero_lods(root, mats):
    """Add identity-preserving LOD1/LOD2 authored silhouettes."""
    lod_parts = []
    for level, segments, coverage in ((1, 12, 0.35), (2, 8, 0.12)):
        target = f"LOD{level}"
        marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
        marker.parent = root
        marker["screenCoverage"] = coverage
        marker["generatedFrom"] = "hero-continuous-mesh-pass"
        marker["proxyGeometry"] = True
        body_rings = [
            (0.32, 0.40 if level == 1 else 0.38, 0.34, 0, -0.04, 1),
            (0.62, 0.54 if level == 1 else 0.50, 0.36, 0, 0.0, 0),
            (0.98, 0.56 if level == 1 else 0.52, 0.36, 0, 0.0, 0),
            (1.30, 0.48 if level == 1 else 0.44, 0.31, 0, 0.0, 2),
            (1.48, 0.36 if level == 1 else 0.32, 0.27, 0, 0.0, 0),
        ]
        body = _loft_mesh(f"LOD{level}_PROXY_body", body_rings, segments, [mats["cloth"], mats["leather"], mats["metal"]], target=target)
        body["lodLevel"] = level
        body.parent = marker
        head_rings = [
            (1.48, 0.25, 0.24, 0, 0, 0),
            (1.72, 0.31, 0.28, 0, 0, 0),
            (1.98, 0.31, 0.27, 0, 0, 1),
            (2.14, 0.16, 0.17, 0, 0, 3),
        ]
        def lod_head_override(_ring_index, _segment, _center_x, center_y, _center_z, current, _following):
            # Keep a readable mask/visor band at distance instead of reducing
            # the hero to an unmarked head sphere.
            return 2 if 1.60 <= center_y <= 1.88 else current[5]

        head = _loft_mesh(
            f"LOD{level}_PROXY_head",
            head_rings,
            max(8, segments - 2),
            [mats["skin"], mats["snow"], mats["cloth_dark"], mats["accent"]],
            target=target,
            override=lod_head_override,
        )
        head["lodLevel"] = level
        head.parent = marker
        cape = _cape_mesh(f"LOD{level}_PROXY_cape", (0, 1.1, 0), [mats["cloth_dark"], mats["leather"]], target=target, detail=3 if level == 1 else 2)
        cape["lodLevel"] = level
        cape.parent = marker
        weapon = _profile_mesh(
            f"LOD{level}_PROXY_weapon",
            [([(-0.07, -0.16), (0.07, -0.16), (0.09, 0.10), (0.0, 0.70), (-0.09, 0.10)], 0.02, 0.09, 0)],
            [mats["metal_light"]],
            origin=(0.56, 0.76, 0.16),
            target=target,
        )
        weapon["lodLevel"] = level
        weapon.parent = marker
        lod_parts.extend((body, head, cape, weapon))
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
            return 6
        return current[5]

    body = _loft_mesh(
        "chest.heroBody",
        [
            (0.30, 0.42, 0.34, 0.0, -0.05, 1),
            (0.46, 0.51, 0.38, 0.0, -0.03, 1),
            (0.70, 0.56, 0.38, 0.0, 0.00, 0),
            (0.94, 0.57, 0.38, 0.0, 0.01, 0),
            (1.16, 0.58, 0.36, 0.0, 0.01, 2),
            (1.36, 0.50, 0.33, 0.0, 0.00, 0),
            (1.50, 0.38, 0.28, 0.0, 0.00, 5),
        ],
        20,
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
        return current[5]

    head = _loft_mesh(
        "head.heroHead",
        [
            (1.50, 0.25, 0.24, 0.0, 0.00, 0),
            (1.64, 0.30, 0.28, 0.0, 0.00, 0),
            (1.82, 0.34, 0.30, 0.0, 0.00, 0),
            (1.98, 0.33, 0.29, 0.0, 0.00, 4),
            (2.12, 0.23, 0.22, 0.0, -0.01, 4),
            (2.22, 0.07, 0.08, 0.0, -0.02, 5),
        ],
        20,
        [mats["skin"], mats["snow"], mats["cloth_dark"], mats["glow"], mats["accent"]],
        origin=(0.0, 1.78, 0.0),
        override=head_override,
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
            [
                (1.40, 0.20, 0.20, side * 0.49, 0.00, 0),
                (1.22, 0.19, 0.19, side * 0.53, 0.00, 0),
                (1.00, 0.17, 0.17, side * 0.54, 0.01, 0),
                (0.82, 0.15, 0.15, side * 0.53, 0.02, 2),
                (0.69, 0.13, 0.13, side * 0.52, 0.04, 1),
            ],
            14,
            arm_mats,
            origin=(side * 0.50, 1.10, 0.0),
        ))

    leg_mats = [mats["leather"], mats["metal"], mats["metal_light"], mats["accent"]]
    leg_parts = []
    for label, side in (("L", -1), ("R", 1)):
        leg_parts.append(_loft_mesh(
            f"leg.{label}.heroBoot",
            [
                (0.68, 0.23, 0.24, side * 0.22, 0.00, 0),
                (0.48, 0.22, 0.23, side * 0.22, 0.00, 0),
                (0.26, 0.20, 0.24, side * 0.22, 0.04, 1),
                (0.10, 0.20, 0.30, side * 0.22, 0.10, 2),
                (0.04, 0.20, 0.34, side * 0.22, 0.14, 2),
            ],
            14,
            leg_mats,
            origin=(side * 0.22, 0.42, 0.0),
        ))

    cape = _cape_mesh("cape.heroCoat", (0.0, 1.10, 0.0), [mats["cloth_dark"], mats["leather"]], detail=5)

    melee = _profile_mesh(
        "weapon.meleeBlade",
        [
            ([(-0.10, -0.18), (0.10, -0.18), (0.12, 0.12), (0.0, 0.72), (-0.12, 0.12)], 0.00, 0.09, 0),
            ([(-0.025, -0.26), (0.025, -0.26), (0.025, -0.05), (-0.025, -0.05)], 0.0, 0.12, 1),
            ([(-0.20, -0.05), (0.20, -0.05), (0.15, 0.02), (-0.15, 0.02)], 0.0, 0.08, 2),
            ([(-0.035, -0.42), (0.035, -0.42), (0.035, -0.20), (-0.035, -0.20)], 0.0, 0.08, 1),
            ([(-0.06, 0.66), (0.06, 0.66), (0.0, 0.76)], 0.02, 0.07, 3),
        ],
        [mats["metal_light"], mats["leather"], mats["accent"], mats["glow"]],
        origin=(0.62, 0.78, 0.16),
    )

    ranged = _profile_mesh(
        "weapon.rangedCarbine",
        [
            ([(-0.15, -0.32), (0.15, -0.32), (0.16, 0.04), (0.10, 0.28), (-0.10, 0.28), (-0.16, 0.04)], 0.0, 0.18, 1),
            ([(-0.04, 0.20), (0.04, 0.20), (0.04, 0.98), (-0.04, 0.98)], 0.0, 0.07, 2),
            ([(-0.08, 0.12), (0.08, 0.12), (0.06, 0.30), (-0.06, 0.30)], 0.0, 0.10, 0),
            ([(-0.04, 0.98), (0.04, 0.98), (0.0, 1.10)], 0.0, 0.09, 3),
        ],
        [mats["leather"], mats["metal"], mats["metal_light"], mats["glow"]],
        origin=(0.38, 1.02, -0.20),
    )
    return [body, head, face_marker, *arm_parts, *leg_parts, cape, melee, ranged]


def build():
    reset_scene()
    mats = {
        "cloth": material("MAT_hero_cloth", (0.16, 0.28, 0.52), 0.84),
        "leather": material("MAT_hero_leather", (0.24, 0.09, 0.038), 0.70),
        "metal": material("MAT_hero_metal", (0.20, 0.27, 0.36), 0.22, 0.93),
        "metal_light": material("MAT_hero_metal_light", (0.52, 0.68, 0.84), 0.14, 0.96),
        "skin": material("MAT_hero_skin", (0.68, 0.38, 0.24), 0.80),
        "cloth_dark": material("MAT_hero_cloth_dark", (0.06, 0.12, 0.26), 0.88),
        "snow": material("MAT_hero_snow", (0.82, 0.93, 1.0), 0.58),
        "glow": material("MAT_hero_glow", (0.26, 0.74, 1.0), 0.18, 0.0, (0.16, 0.58, 1.0)),
        "accent": material("MAT_hero_accent", (0.40, 0.74, 1.0), 0.28, 0.62),
    }
    glow_shader = mats["glow"].node_tree.nodes.get("Principled BSDF")
    if glow_shader and glow_shader.inputs.get("Emission Strength"):
        glow_shader.inputs["Emission Strength"].default_value = 2.6

    root = orient_for_babylon(empty("HeroRoot", target="EXPORT", display="PLAIN_AXES"))
    # Keep the existing H6 metadata required by the established asset gate;
    # this pass is a topology rebuild, not a new H1-H6 claim.
    root["commercialStage"] = "H6"
    root["commercialIteration"] = 2
    root["heroMeshPass"] = "continuous-authored-mesh"
    root["heroMeshContract"] = "9 LOD0 meshes; identity-preserving LOD1/LOD2"
    root["animationReview"] = "existing contact-safe walk/run cycles, staged attacks, stable hit/death poses"
    root["feetGrounded"] = True
    root["orientationContract"] = "Babylon Y-up, forward +Z"
    root["animationIteration2"] = "follow-through and recovery keys"

    parts = _build_mesh_parts(mats)
    lod_parts = _add_hero_lods(root, mats)
    parent_all(parts, root)
    skeleton = make_skeleton(root)
    skeleton.name = "HeroSkeleton"
    skeleton.data.name = "HeroSkeleton"
    bind_unit_pieces(parts, skeleton)

    socket_positions = {
        "weapon_socket.R": (0.62, 0.78, 0.20),
        "weapon_socket.L": (-0.50, 0.82, 0.16),
        "ranged_socket": (0.38, 1.34, -0.20),
        "back_socket": (0.0, 1.08, -0.48),
    }
    for name, position in socket_positions.items():
        socket = empty(name, position, "RIG")
        socket["socketKind"] = "ranged" if name == "ranged_socket" else "weapon"
        socket["forwardAxis"] = "+Y"
        socket["contractVersion"] = "hero-h4"
        socket.parent = root
    collision_box("COL_Hero", (0.82, 1.9, 0.82), (0, 0.95, 0), root)

    add_armature_clip(skeleton, "Idle", 24, [(1, {}), (12, {"chest": (0.025, 0, 0), "head": (0, 0.025, 0)}), (18, {"chest": (-0.018, 0, 0), "head": (0, -0.018, 0)}), (24, {})])
    add_armature_clip(skeleton, "Walk", 24, [
        (1, {"upper_arm.L": (0.35, 0, 0), "upper_arm.R": (-0.35, 0, 0), "lower_arm.L": (-0.18, 0, 0), "lower_arm.R": (0.18, 0, 0), "thigh.L": (-0.5, 0, 0), "thigh.R": (0.5, 0, 0), "foot.L": (0.12, 0, 0), "foot.R": (-0.12, 0, 0)}),
        (8, {"upper_arm.L": (-0.35, 0, 0), "upper_arm.R": (0.35, 0, 0), "lower_arm.L": (0.18, 0, 0), "lower_arm.R": (-0.18, 0, 0), "thigh.L": (0.5, 0, 0), "thigh.R": (-0.5, 0, 0), "foot.L": (-0.12, 0, 0), "foot.R": (0.12, 0, 0)}),
        (16, {"upper_arm.L": (0.28, 0, 0), "upper_arm.R": (-0.28, 0, 0), "thigh.L": (-0.35, 0, 0), "thigh.R": (0.35, 0, 0)}),
        (24, {}),
    ])
    add_armature_clip(skeleton, "Run", 18, [
        (1, {"upper_arm.L": (0.65, 0, 0), "upper_arm.R": (-0.65, 0, 0), "lower_arm.L": (-0.28, 0, 0), "lower_arm.R": (0.28, 0, 0), "thigh.L": (-0.75, 0, 0), "thigh.R": (0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (6, {"upper_arm.L": (-0.65, 0, 0), "upper_arm.R": (0.65, 0, 0), "lower_arm.L": (0.28, 0, 0), "lower_arm.R": (-0.28, 0, 0), "thigh.L": (0.75, 0, 0), "thigh.R": (-0.75, 0, 0), "chest": (0.1, 0, 0)}),
        (12, {"upper_arm.L": (0.52, 0, 0), "upper_arm.R": (-0.52, 0, 0), "thigh.L": (-0.62, 0, 0), "thigh.R": (0.62, 0, 0), "chest": (0.08, 0, 0)}),
        (18, {}),
    ])
    add_armature_clip(skeleton, "MeleeAttack", 16, [(1, {"upper_arm.R": (-1.0, 0, 0), "lower_arm.R": (-0.6, 0, 0)}), (5, {"upper_arm.R": (-1.7, 0, 0), "lower_arm.R": (-0.8, 0, 0), "chest": (-0.08, 0, 0)}), (9, {"upper_arm.R": (1.4, 0, 0), "lower_arm.R": (0.5, 0, 0), "chest": (0.2, 0, 0)}), (12, {"upper_arm.R": (0.72, 0, 0), "lower_arm.R": (0.18, 0, 0), "chest": (0.08, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "RangedAttack", 16, [(1, {"upper_arm.R": (-0.8, 0, 0), "upper_arm.L": (-0.5, 0, 0)}), (7, {"upper_arm.R": (-1.7, 0, 0), "upper_arm.L": (-1.1, 0, 0), "lower_arm.L": (-0.35, 0, 0), "head": (-0.15, 0, 0)}), (11, {"upper_arm.R": (-1.25, 0, 0), "upper_arm.L": (-0.85, 0, 0), "head": (-0.08, 0, 0)}), (14, {"upper_arm.R": (-0.92, 0, 0), "upper_arm.L": (-0.62, 0, 0), "lower_arm.L": (-0.12, 0, 0), "head": (-0.04, 0, 0)}), (16, {})])
    add_armature_clip(skeleton, "Hit", 12, [(1, {"chest": (-0.2, 0, 0), "head": (0.12, 0, 0), "upper_arm.L": (0.15, 0, 0)}), (6, {"chest": (-0.32, 0, 0), "head": (0.18, 0, 0), "upper_arm.L": (0.24, 0, 0)}), (10, {"chest": (-0.14, 0, 0), "head": (0.08, 0, 0)}), (12, {})])
    add_armature_clip(skeleton, "Death", 20, [
        (1, {"foot.L": (0.04, 0, 0), "foot.R": (-0.04, 0, 0)}),
        (6, {"root": (0.35, 0, 0), "chest": (0.12, 0, 0), "head": (0.06, 0, 0), "foot.L": (0.08, 0, 0), "foot.R": (-0.08, 0, 0)}),
        (12, {"root": (1.25, 0, 0), "chest": (0.4, 0, 0), "head": (0.18, 0, 0), "upper_arm.L": (0.8, 0, 0), "upper_arm.R": (0.8, 0, 0)}),
        (16, {"root": (1.38, 0, 0), "chest": (0.46, 0, 0), "head": (0.24, 0, 0), "upper_arm.L": (0.98, 0, 0), "upper_arm.R": (0.98, 0, 0)}),
        (20, {"root": (1.45, 0, 0), "chest": (0.5, 0, 0), "head": (0.28, 0, 0), "upper_arm.L": (1.1, 0, 0), "upper_arm.R": (1.1, 0, 0)}),
    ])

    # Keep the packed surface/vertex colour contract while applying it only
    # to this Hero asset.  No other character or facility is regenerated.
    author_surface_paint(parts + lod_parts, seed=53, textured=True)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", "hero.glb"))
    save_source(source)
    export_glb(output)
    print(f"Hero continuous mesh pass: LOD0={len(parts)} meshes, LOD1/LOD2 authored silhouette proxies={len(lod_parts)} meshes")


if __name__ == "__main__":
    build()
