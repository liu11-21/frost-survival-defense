"""Build the authored Warrior production template without touching other units.

This script intentionally owns only warrior.blend/warrior.glb.  The mesh is
assembled into two weighted skinned meshes per LOD (body and axe), rather than
exporting the old library's dozens of rigid primitive objects.  The low-poly
profile helpers below are used to author continuous, faceted surfaces with a
small number of material slots and an embedded atlas.
"""
import math
import os
import sys
from array import array

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.append(HERE)
from common import collision_box, empty, export_glb, material, orient_for_babylon, reset_scene, save_source, collection  # noqa: E402


MATS = {
    "cloth": (0.105, 0.17, 0.19),
    "leather": (0.30, 0.16, 0.075),
    "iron": (0.105, 0.125, 0.145),
}
MATERIALS = {}
SCALE = 1.0


class MeshBuilder:
    def __init__(self, level):
        self.level = level
        self.vertices = []
        self.faces = []
        self.materials = []
        self.weights = []

    def vertex(self, co, weights):
        self.vertices.append(tuple(float(v) for v in co))
        self.weights.append(dict(weights))
        return len(self.vertices) - 1

    def face(self, indices, mat):
        if len(indices) >= 3:
            self.faces.append(tuple(indices))
            self.materials.append(mat)

    def lathe(self, center, profile, segments, mat, weight_fn, rotate_z=0.0):
        """Faceted vertical profile with controlled loop spacing."""
        rings = []
        ca, sa = math.cos(rotate_z), math.sin(rotate_z)
        for py, rx, rz in profile:
            ring = []
            for i in range(segments):
                angle = math.tau * i / segments
                lx = rx * math.cos(angle)
                lz = rz * math.sin(angle)
                # rotate the local vertical profile around Z for angled limbs
                ly = py
                tx = lx * ca - ly * sa
                ty = lx * sa + ly * ca
                ring.append(self.vertex((center[0] + tx, center[1] + ty, center[2] + lz), weight_fn(center[1] + ty)))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for i in range(segments):
                j = (i + 1) % segments
                self.face((a[i], a[j], b[j], b[i]), mat)
        # caps keep distant LODs watertight and add no separate objects
        bottom = self.vertex((center[0], center[1] + profile[0][0], center[2]), weight_fn(center[1] + profile[0][0]))
        top = self.vertex((center[0], center[1] + profile[-1][0], center[2]), weight_fn(center[1] + profile[-1][0]))
        for i in range(segments):
            j = (i + 1) % segments
            self.face((bottom, rings[0][j], rings[0][i]), mat)
            self.face((top, rings[-1][i], rings[-1][j]), mat)

    def box(self, center, dimensions, mat, weights, rotate_z=0.0, bevel=0.0):
        """A chamfered box; bevel is a silhouette chamfer, not subdivision."""
        w, h, d = (v * 0.5 for v in dimensions)
        # Eight core corners.  A modest bevel adds a real edge break while
        # remaining a single merged mesh component.
        b = min(bevel, w * 0.55, h * 0.35, d * 0.55)
        xs = (-w + b, w - b)
        ys = (-h + b, h - b)
        zs = (-d + b, d - b)
        ca, sa = math.cos(rotate_z), math.sin(rotate_z)
        def transform(p):
            x, y, z = p
            return (center[0] + x * ca - y * sa, center[1] + x * sa + y * ca, center[2] + z)
        # Main chamfered prism.  For zero bevel this remains a normal box.
        corners = [self.vertex(transform((x, y, z)), weights) for y in ys for z in zs for x in xs]
        # index order: y0 z0 x0/x1, y0 z1 x0/x1, y1 z0..., y1 z1...
        faces = [
            (0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
            (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3),
        ]
        for f in faces:
            self.face(tuple(corners[i] for i in f), mat)

    def polygon_prism(self, points, z_center, thickness, mat, weights):
        """Extrude an X/Y silhouette so the ice axe reads in a front view."""
        front = [self.vertex((x, y, z_center + thickness * 0.5), weights) for x, y in points]
        back = [self.vertex((x, y, z_center - thickness * 0.5), weights) for x, y in points]
        n = len(points)
        self.face(tuple(front), mat)
        self.face(tuple(reversed(back)), mat)
        for i in range(n):
            j = (i + 1) % n
            self.face((front[i], back[i], back[j], front[j]), mat)


def weights_for(bone, secondary=None, blend=0.18):
    if not secondary:
        return {bone: 1.0}
    return {bone: 1.0 - blend, secondary: blend}


def torso_weights(y):
    if y < 1.02:
        return weights_for("pelvis", "spine", 0.35)
    if y < 1.38:
        return weights_for("spine", "chest", 0.45)
    return weights_for("chest", "neck", 0.16)


def arm_weights(side, y):
    upper = f"upper_arm.{side}"
    lower = f"lower_arm.{side}"
    hand = f"hand.{side}"
    if y > 1.22:
        return weights_for(upper, lower, 0.22)
    if y > 0.92:
        return weights_for(lower, hand, 0.25)
    return {hand: 1.0}


def leg_weights(side, y):
    thigh = f"thigh.{side}"
    shin = f"shin.{side}"
    foot = f"foot.{side}"
    if y > 0.82:
        return weights_for(thigh, shin, 0.25)
    if y > 0.28:
        return weights_for(shin, foot, 0.20)
    return {foot: 1.0}


def add_body_geometry(level):
    b = MeshBuilder(level)
    if level == 0:
        seg = 32
        profile_scale = 1.0
    elif level == 1:
        seg = 16
        profile_scale = 0.96
    else:
        seg = 8
        profile_scale = 0.91

    # Continuous faceted torso: broad chest, tucked waist, slightly flared hem.
    torso_profile = [
        (-0.54, 0.37, 0.25), (-0.47, 0.43, 0.29), (-0.30, 0.48, 0.32),
        (-0.05, 0.46, 0.30), (0.20, 0.43, 0.28), (0.42, 0.48, 0.30),
        (0.55, 0.43, 0.28),
    ]
    b.lathe((0, 1.27, 0), [(y * profile_scale, rx * profile_scale, rz * profile_scale) for y, rx, rz in torso_profile], seg, 0, torso_weights)

    if level <= 1:
        # Neck and low fur collar create a readable winter layer without a
        # separate ring object.
        b.lathe((0, 1.83, 0), [(-0.10, 0.29, 0.23), (-0.03, 0.35, 0.27), (0.06, 0.31, 0.24)], seg, 0, lambda y: weights_for("chest", "neck", 0.5))
        b.lathe((0, 0.86, 0), [(-0.06, 0.44, 0.29), (0.0, 0.47, 0.31), (0.07, 0.43, 0.29)], seg, 1, lambda y: weights_for("pelvis", "spine", 0.3))

    # Head is intentionally a low, directional wedge profile rather than a sphere.
    head_profile = [(-0.22, 0.23, 0.22), (-0.15, 0.31, 0.28), (-0.02, 0.34, 0.30), (0.14, 0.30, 0.27), (0.22, 0.24, 0.22)]
    b.lathe((0, 2.18, 0.02), [(y * profile_scale, rx * profile_scale, rz * profile_scale) for y, rx, rz in head_profile], seg, 0, lambda y: weights_for("head", "neck", 0.15))
    # Brow/ear planes and small single shoulder armor preserve identity at LOD0.
    if level == 0:
        b.box((0, 2.16, 0.255), (0.42, 0.08, 0.06), 2, weights_for("head", "neck", 0.12), bevel=0.025)
        b.box((-0.42, 1.62, 0.0), (0.26, 0.16, 0.40), 2, weights_for("upper_arm.L", "chest", 0.28), rotate_z=-0.10, bevel=0.04)
        b.box((0.31, 1.02, -0.28), (0.23, 0.30, 0.12), 1, weights_for("spine", "pelvis", 0.45), rotate_z=0.10, bevel=0.03)
    else:
        b.box((-0.40, 1.61, 0.0), (0.24, 0.15, 0.34), 2, weights_for("upper_arm.L", "chest", 0.28), rotate_z=-0.10, bevel=0.03)

    # Arms have separate upper/lower loop bands inside the same body mesh.
    for side, x, sign in (("L", -0.52, -1), ("R", 0.52, 1)):
        angle = 0.10 * sign
        b.lathe((x, 1.40, 0), [(-0.32, 0.145, 0.145), (-0.22, 0.18, 0.17), (0.00, 0.17, 0.16), (0.25, 0.13, 0.13), (0.34, 0.115, 0.115)], max(8, seg // 2), 0, lambda y, side=side: arm_weights(side, y), rotate_z=angle)
        b.lathe((x + sign * 0.02, 0.92, 0.03), [(-0.25, 0.12, 0.13), (-0.12, 0.15, 0.15), (0.12, 0.12, 0.13), (0.25, 0.10, 0.11)], max(8, seg // 2), 0, lambda y, side=side: arm_weights(side, y), rotate_z=angle)
        b.lathe((x + sign * 0.02, 0.66, 0.08), [(-0.09, 0.11, 0.12), (0.02, 0.14, 0.13), (0.11, 0.10, 0.11)], max(8, seg // 2), 1, lambda y, side=side: arm_weights(side, y))

    # Hips, knees and boots have visible profile changes instead of cylinder legs.
    for side, x in (("L", -0.20), ("R", 0.20)):
        b.lathe((x, 0.92, 0), [(-0.38, 0.20, 0.19), (-0.22, 0.23, 0.21), (0.02, 0.20, 0.19), (0.28, 0.15, 0.16), (0.38, 0.14, 0.14)], max(8, seg // 2), 0, lambda y, side=side: leg_weights(side, y))
        b.lathe((x, 0.39, 0.01), [(-0.31, 0.14, 0.15), (-0.19, 0.17, 0.16), (0.06, 0.14, 0.14), (0.26, 0.10, 0.11), (0.32, 0.095, 0.10)], max(8, seg // 2), 0, lambda y, side=side: leg_weights(side, y))
        b.box((x, 0.10, 0.115), (0.25, 0.20, 0.46), 2, weights_for(f"foot.{side}", f"shin.{side}", 0.12), rotate_z=0.02 if side == "R" else -0.02, bevel=0.04)

    # A single amber friend-strip is embedded as cloth material in the body mesh.
    if level == 0:
        b.box((0.0, 1.48, 0.323), (0.18, 0.17, 0.025), 1, weights_for("chest", "spine", 0.35), rotate_z=-0.16, bevel=0.01)
    return b


def add_axe_geometry(level):
    b = MeshBuilder(level)
    seg = 16 if level == 0 else 8
    handle_weights = {"hand.L": 0.5, "hand.R": 0.5}
    # Shaft with a slight diagonal low-ready angle; hand weights keep it in the grip.
    b.lathe((0.24, 1.22, 0.30), [(-0.62, 0.055, 0.055), (-0.52, 0.075, 0.075), (0.42, 0.065, 0.065), (0.58, 0.045, 0.045)], seg, 1, lambda y: handle_weights, rotate_z=-0.13)
    # Broad ice-axe blade, front silhouette is asymmetric and unmistakable.
    points = [(0.18, 1.62), (0.52, 1.80), (0.84, 1.72), (0.76, 1.53), (0.47, 1.50), (0.26, 1.48)]
    b.polygon_prism(points, 0.30, 0.15, 2, handle_weights)
    if level == 0:
        b.box((0.23, 1.08, 0.30), (0.13, 0.22, 0.13), 1, handle_weights, rotate_z=-0.13, bevel=0.02)
    return b


def create_armature(root_obj):
    armature_data = bpy.data.armatures.new("UnitSkeleton")
    armature_obj = bpy.data.objects.new("UnitSkeleton", armature_data)
    collection("RIG").objects.link(armature_obj)
    armature_obj.parent = root_obj
    armature_obj.show_in_front = True
    armature_obj.hide_render = True
    bpy.context.view_layer.objects.active = armature_obj
    armature_obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    armature_data.edit_bones.remove(armature_data.edit_bones[0])
    specs = [
        ("root", (0, 0, 0), (0, 0.22, 0), None),
        ("pelvis", (0, 0.78, 0), (0, 1.03, 0), "root"),
        ("spine", (0, 1.03, 0), (0, 1.40, 0), "pelvis"),
        ("chest", (0, 1.40, 0), (0, 1.78, 0), "spine"),
        ("neck", (0, 1.78, 0), (0, 1.98, 0), "chest"),
        ("head", (0, 1.98, 0), (0, 2.36, 0), "neck"),
    ]
    for side, x in (("L", -1), ("R", 1)):
        specs += [
            (f"upper_arm.{side}", (x * 0.40, 1.60, 0), (x * 0.58, 1.32, 0), "chest"),
            (f"lower_arm.{side}", (x * 0.58, 1.32, 0), (x * 0.56, 0.92, 0.03), f"upper_arm.{side}"),
            (f"hand.{side}", (x * 0.56, 0.92, 0.03), (x * 0.48, 0.72, 0.12), f"lower_arm.{side}"),
            (f"thigh.{side}", (x * 0.20, 0.82, 0), (x * 0.22, 0.48, 0), "pelvis"),
            (f"shin.{side}", (x * 0.22, 0.48, 0), (x * 0.20, 0.20, 0.02), f"thigh.{side}"),
            (f"foot.{side}", (x * 0.20, 0.20, 0.02), (x * 0.20, 0.04, 0.25), f"shin.{side}"),
        ]
    bones = {}
    for name, head, tail, parent in specs:
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent:
            bone.parent = bones[parent]
            bone.use_connect = False
        bones[name] = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    armature_obj["boneContract"] = "18 weighted bones"
    armature_obj["forwardAxis"] = "+Z"
    return armature_obj


def create_mesh(builder, name, parent, armature_obj, allowed_materials, lod):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(builder.vertices, [], builder.faces)
    mesh.validate(verbose=False)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    for mat_name in allowed_materials:
        mesh.materials.append(MATERIALS[mat_name])
    # Remap source material ids (cloth=0, leather=1, iron=2) to this object's slots.
    remap = {0: allowed_materials.index("cloth") if "cloth" in allowed_materials else 0,
             1: allowed_materials.index("leather") if "leather" in allowed_materials else 0,
             2: allowed_materials.index("iron") if "iron" in allowed_materials else 0}
    for index, polygon in enumerate(mesh.polygons):
        polygon.material_index = remap.get(builder.materials[index], 0)
    uv = mesh.uv_layers.new(name="UVMap")
    colors = mesh.color_attributes.new(name="ArtTint", type="BYTE_COLOR", domain="CORNER")
    palette = [MATS[mat] for mat in ("cloth", "leather", "iron")]
    for polygon in mesh.polygons:
        source_mat = builder.materials[polygon.index]
        region = max(0, min(2, source_mat))
        color = (*palette[region], 1.0)
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index].co
            uv.data[loop_index].uv = ((vertex.x * 0.16 + 0.5) * 0.30 + 0.02 + region * 0.33, (vertex.y * 0.22 + 0.5) * 0.88 + 0.06)
            colors.data[loop_index].color = color
    for bone_name in ("root", "pelvis", "spine", "chest", "neck", "head", "upper_arm.L", "lower_arm.L", "hand.L", "upper_arm.R", "lower_arm.R", "hand.R", "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R"):
        mesh.vertex_groups.new(name=bone_name)
    for vertex_index, weight_map in enumerate(builder.weights):
        for bone_name, weight in weight_map.items():
            mesh.vertex_groups[bone_name].add([vertex_index], max(0.0, min(1.0, weight)), "REPLACE")
    modifier = mesh.modifiers.new("Warrior weighted skin", "ARMATURE")
    modifier.object = armature_obj
    mesh.parent = parent
    mesh["lodLevel"] = lod
    mesh["authoredRole"] = "warrior_body" if "body" in name else "warrior_axe"
    mesh["weightedSkinning"] = True
    mesh["componentIdentity"] = "winter militia coat, fur collar, single shoulder, boots, ice axe"
    collection(f"LOD{lod}").objects.link(mesh)
    return mesh


def make_atlas():
    image = bpy.data.images.get("WARRIOR_ATLAS_1024")
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new("WARRIOR_ATLAS_1024", width=1024, height=1024, alpha=True)
    pixels = array("f", [0.0]) * (1024 * 1024 * 4)
    base = [MATS["cloth"], MATS["leather"], MATS["iron"]]
    for y in range(1024):
        for x in range(1024):
            region = min(2, x // 342)
            wave = 1.0 + 0.035 * math.sin(x * 0.047 + y * 0.013) + 0.02 * math.cos(y * 0.071)
            if region == 1:
                wave += 0.025 * math.sin(y * 0.22)
            if region == 2:
                wave += 0.018 * math.sin(x * 0.31)
            idx = (y * 1024 + x) * 4
            pixels[idx] = max(0.0, min(1.0, base[region][0] * wave))
            pixels[idx + 1] = max(0.0, min(1.0, base[region][1] * wave))
            pixels[idx + 2] = max(0.0, min(1.0, base[region][2] * wave))
            pixels[idx + 3] = 1.0
    image.pixels = pixels
    image.pack()
    for mat in MATERIALS.values():
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        shader = nodes.get("Principled BSDF")
        tex = nodes.get("Warrior atlas") or nodes.new("ShaderNodeTexImage")
        tex.name = "Warrior atlas"
        tex.image = image
        tex.interpolation = "Linear"
        base_input = shader.inputs.get("Base Color")
        if base_input:
            for link in list(base_input.links):
                links.remove(link)
            links.new(tex.outputs["Color"], base_input)


def add_clip(armature_obj, name, frame_end, poses):
    if not armature_obj.animation_data:
        armature_obj.animation_data_create()
    armature_obj.animation_data.action = None
    # Pose is reset before every keyed frame; unmentioned bones remain at rest.
    for frame, pose in poses:
        bpy.context.scene.frame_set(frame)
        for bone in armature_obj.pose.bones:
            bone.rotation_mode = "XYZ"
            bone.rotation_euler = (0.0, 0.0, 0.0)
            bone.location = (0.0, 0.0, 0.0)
        for bone_name, values in pose.items():
            bone = armature_obj.pose.bones.get(bone_name)
            if not bone:
                continue
            if "r" in values:
                bone.rotation_euler = values["r"]
                bone.keyframe_insert(data_path="rotation_euler", frame=frame)
            if "l" in values:
                bone.location = values["l"]
                bone.keyframe_insert(data_path="location", frame=frame)
    action = armature_obj.animation_data.action
    if action is None:
        raise RuntimeError(f"No animation action created for {name}")
    action.name = name
    track = armature_obj.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.frame_end = frame_end
    armature_obj.animation_data.action = None
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(bpy.context.scene.frame_end, frame_end)


def add_animations(armature_obj):
    add_clip(armature_obj, "Idle", 30, [
        (1, {"chest": {"r": (0.0, 0.0, 0.0)}}),
        (15, {"chest": {"r": (-0.025, 0.0, 0.015)}, "neck": {"r": (0.02, 0.0, 0.0)}}),
        (30, {"chest": {"r": (0.0, 0.0, 0.0)}}),
    ])
    add_clip(armature_obj, "Walk", 24, [
        (1, {"thigh.L": {"r": (0.42, 0.0, 0.0)}, "thigh.R": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.28, 0.0, 0.0)}, "upper_arm.R": {"r": (0.28, 0.0, 0.0)}, "pelvis": {"l": (0.0, 0.02, 0.0)}}),
        (7, {"thigh.L": {"r": (-0.38, 0.0, 0.0)}, "thigh.R": {"r": (0.38, 0.0, 0.0)}, "upper_arm.L": {"r": (0.24, 0.0, 0.0)}, "upper_arm.R": {"r": (-0.24, 0.0, 0.0)}, "pelvis": {"l": (0.0, 0.0, 0.0)}}),
        (13, {"thigh.L": {"r": (0.42, 0.0, 0.0)}, "thigh.R": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.28, 0.0, 0.0)}, "upper_arm.R": {"r": (0.28, 0.0, 0.0)}, "pelvis": {"l": (0.0, 0.02, 0.0)}}),
        (19, {"thigh.L": {"r": (-0.38, 0.0, 0.0)}, "thigh.R": {"r": (0.38, 0.0, 0.0)}, "upper_arm.L": {"r": (0.24, 0.0, 0.0)}, "upper_arm.R": {"r": (-0.24, 0.0, 0.0)}, "pelvis": {"l": (0.0, 0.0, 0.0)}}),
        (24, {"thigh.L": {"r": (0.42, 0.0, 0.0)}, "thigh.R": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.28, 0.0, 0.0)}, "upper_arm.R": {"r": (0.28, 0.0, 0.0)}, "pelvis": {"l": (0.0, 0.02, 0.0)}}),
    ])
    add_clip(armature_obj, "Run", 18, [
        (1, {"pelvis": {"r": (0.10, 0.0, 0.0), "l": (0.0, 0.04, 0.0)}, "thigh.L": {"r": (0.68, 0.0, 0.0)}, "thigh.R": {"r": (-0.68, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.R": {"r": (0.42, 0.0, 0.0)}}),
        (5, {"pelvis": {"r": (0.10, 0.0, 0.0), "l": (0.0, 0.0, 0.0)}, "thigh.L": {"r": (-0.62, 0.0, 0.0)}, "thigh.R": {"r": (0.62, 0.0, 0.0)}, "upper_arm.L": {"r": (0.38, 0.0, 0.0)}, "upper_arm.R": {"r": (-0.38, 0.0, 0.0)}}),
        (9, {"pelvis": {"r": (0.10, 0.0, 0.0), "l": (0.0, 0.04, 0.0)}, "thigh.L": {"r": (0.68, 0.0, 0.0)}, "thigh.R": {"r": (-0.68, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.R": {"r": (0.42, 0.0, 0.0)}}),
        (13, {"pelvis": {"r": (0.10, 0.0, 0.0), "l": (0.0, 0.0, 0.0)}, "thigh.L": {"r": (-0.62, 0.0, 0.0)}, "thigh.R": {"r": (0.62, 0.0, 0.0)}, "upper_arm.L": {"r": (0.38, 0.0, 0.0)}, "upper_arm.R": {"r": (-0.38, 0.0, 0.0)}}),
        (18, {"pelvis": {"r": (0.10, 0.0, 0.0), "l": (0.0, 0.04, 0.0)}, "thigh.L": {"r": (0.68, 0.0, 0.0)}, "thigh.R": {"r": (-0.68, 0.0, 0.0)}, "upper_arm.L": {"r": (-0.42, 0.0, 0.0)}, "upper_arm.R": {"r": (0.42, 0.0, 0.0)}}),
    ])
    add_clip(armature_obj, "MeleeAttack", 30, [
        (1, {"pelvis": {"r": (0.0, 0.0, 0.0)}, "chest": {"r": (0.0, 0.0, 0.0)}}),
        (8, {"pelvis": {"r": (0.0, -0.26, 0.0)}, "chest": {"r": (0.0, 0.48, 0.0)}, "upper_arm.L": {"r": (-0.55, 0.0, -0.18)}, "upper_arm.R": {"r": (-0.70, 0.0, 0.22)}, "lower_arm.L": {"r": (-0.42, 0.0, 0.0)}, "lower_arm.R": {"r": (-0.34, 0.0, 0.0)}, "thigh.L": {"r": (-0.22, 0.0, 0.0)}, "thigh.R": {"r": (0.18, 0.0, 0.0)}}),
        (15, {"pelvis": {"r": (0.0, 0.32, 0.0), "l": (0.0, -0.03, 0.0)}, "chest": {"r": (0.0, -0.75, 0.0)}, "upper_arm.L": {"r": (1.05, 0.0, -0.28)}, "upper_arm.R": {"r": (1.15, 0.0, 0.32)}, "lower_arm.L": {"r": (0.32, 0.0, 0.0)}, "lower_arm.R": {"r": (0.26, 0.0, 0.0)}, "thigh.L": {"r": (0.25, 0.0, 0.0)}, "thigh.R": {"r": (-0.30, 0.0, 0.0)}}),
        (19, {"pelvis": {"r": (0.0, 0.32, 0.0), "l": (0.0, -0.03, 0.0)}, "chest": {"r": (0.0, -0.70, 0.0)}, "upper_arm.L": {"r": (1.05, 0.0, -0.28)}, "upper_arm.R": {"r": (1.15, 0.0, 0.32)}, "lower_arm.L": {"r": (0.32, 0.0, 0.0)}, "lower_arm.R": {"r": (0.26, 0.0, 0.0)}}),
        (30, {"pelvis": {"r": (0.0, 0.0, 0.0)}, "chest": {"r": (0.0, 0.0, 0.0)}, "upper_arm.L": {"r": (0.12, 0.0, 0.0)}, "upper_arm.R": {"r": (0.12, 0.0, 0.0)}}),
    ])
    add_clip(armature_obj, "Hit", 14, [
        (1, {"chest": {"r": (0.0, 0.0, 0.0)}}),
        (5, {"chest": {"r": (0.12, -0.22, 0.0)}, "head": {"r": (0.10, 0.0, 0.0)}, "pelvis": {"r": (0.0, -0.16, 0.0)}}),
        (14, {"chest": {"r": (0.0, 0.0, 0.0)}, "head": {"r": (0.0, 0.0, 0.0)}}),
    ])
    add_clip(armature_obj, "Death", 30, [
        (1, {"pelvis": {"r": (0.0, 0.0, 0.0)}}),
        (10, {"pelvis": {"r": (0.0, -0.34, 0.0), "l": (0.0, -0.12, 0.0)}, "thigh.L": {"r": (0.55, 0.0, 0.0)}, "thigh.R": {"r": (-0.30, 0.0, 0.0)}, "chest": {"r": (0.85, 0.0, 0.18)}, "head": {"r": (0.35, 0.0, 0.0)}}),
        (22, {"pelvis": {"r": (1.28, 0.0, 0.0), "l": (0.0, -0.55, 0.0)}, "thigh.L": {"r": (0.82, 0.0, 0.0)}, "thigh.R": {"r": (-0.48, 0.0, 0.0)}, "chest": {"r": (1.38, 0.0, 0.28)}, "head": {"r": (0.60, 0.0, 0.0)}, "upper_arm.L": {"r": (0.75, 0.0, -0.25)}, "upper_arm.R": {"r": (0.52, 0.0, 0.22)}}),
        (30, {"pelvis": {"r": (1.35, 0.0, 0.28), "l": (0.0, -0.62, 0.0)}, "chest": {"r": (1.42, 0.0, 0.30)}, "head": {"r": (0.64, 0.0, 0.0)}}),
    ])


def create_materials():
    MATERIALS["cloth"] = material("Warrior_Cloth", MATS["cloth"], 0.88, 0.02)
    MATERIALS["leather"] = material("Warrior_Leather", MATS["leather"], 0.66, 0.04)
    MATERIALS["iron"] = material("Warrior_Iron", MATS["iron"], 0.54, 0.68)
    make_atlas()


def main():
    reset_scene()
    create_materials()
    root_obj = orient_for_babylon(empty("UnitRoot", (0, 0, 0), "EXPORT", "PLAIN_AXES"))
    root_obj["assetRole"] = "warrior"
    root_obj["forwardAxis"] = "+Z"
    root_obj["upAxis"] = "+Y"
    root_obj["scaleContract"] = 1.0
    root_obj["productionTemplate"] = "Warrior-W1"
    armature_obj = create_armature(root_obj)
    for level in (0, 1, 2):
        body = create_mesh(add_body_geometry(level), f"LOD{level}_PROD_body", root_obj, armature_obj, ["cloth", "leather", "iron"] if level == 0 else (["cloth", "iron"] if level == 1 else ["cloth"]), level)
        axe = create_mesh(add_axe_geometry(level), f"LOD{level}_PROD_axe", root_obj, armature_obj, ["leather", "iron"] if level < 2 else ["iron"], level)
        body["lodIdentity"] = "coat/head/shoulder/fur/boots"
        axe["lodIdentity"] = "double-hand ice axe"
        if level > 0:
            marker = empty(f"LOD{level}", (0, 0, 0), "EXPORT", "PLAIN_AXES")
            marker.parent = root_obj
            marker["lodLevel"] = level
            marker["identityPreserved"] = True
            body.parent = marker
            axe.parent = marker
        else:
            body.parent = root_obj
            axe.parent = root_obj
    socket = empty("weapon_socket", (0.34, 1.12, 0.33), "EXPORT", "PLAIN_AXES")
    socket.parent = root_obj
    socket["socketRole"] = "two-hand ice axe grip"
    anchor = empty("attackAnchor", (0.0, 1.10, 0.48), "EXPORT", "PLAIN_AXES")
    anchor.parent = root_obj
    anchor["socketRole"] = "melee attack origin"
    collision_box("COL_Unit", (0.82, 2.34, 0.70), (0, 1.16, 0), root_obj)
    add_animations(armature_obj)
    scene = bpy.context.scene
    scene.frame_set(1)
    source_path = os.path.join(ROOT, "assets-source", "blender", "characters", "warrior.blend")
    glb_path = os.path.join(ROOT, "public", "assets", "models", "characters", "warrior.glb")
    save_source(source_path)
    export_glb(glb_path)
    print(f"Warrior production asset written: {glb_path}")


if __name__ == "__main__":
    main()
