import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, cylinder, sphere, empty, collision_box, parent_all, move_to, add_simple_animation, save_source, export_glb


def build():
    reset_scene()
    cloth = material("MAT_hero_cloth", (0.18, 0.3, 0.55), 0.9)
    leather = material("MAT_hero_leather", (0.2, 0.08, 0.035), 0.82)
    metal = material("MAT_hero_metal", (0.22, 0.28, 0.36), 0.28, 0.85)
    skin = material("MAT_hero_skin", (0.65, 0.36, 0.22), 0.88)
    snow = material("MAT_hero_snow", (0.78, 0.9, 1.0), 0.7)
    root = empty("HeroRoot", target="EXPORT", display="CUBE")
    parts = [
        box("body", (0.66, 0.85, 0.42), (0, 1.05, 0), cloth),
        sphere("head", 0.3, (0, 1.75, 0), skin),
        box("hood", (0.72, 0.24, 0.56), (0, 1.98, 0), snow),
        box("coatTrim", (0.74, 0.12, 0.46), (0, 1.42, 0), snow),
        box("arm.L", (0.18, 0.7, 0.2), (-0.48, 1.1, 0), cloth),
        box("arm.R", (0.18, 0.7, 0.2), (0.48, 1.1, 0), cloth),
        box("leg.L", (0.22, 0.7, 0.24), (-0.2, 0.42, 0), leather),
        box("leg.R", (0.22, 0.7, 0.24), (0.2, 0.42, 0), leather),
        box("belt", (0.74, 0.12, 0.48), (0, 0.82, 0), leather),
        cylinder("weapon", 0.055, 1.15, (0.62, 0.86, 0.16), metal, "LOD0", 8),
    ]
    parent_all(parts, root)
    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    skeleton = bpy.context.object
    skeleton.name = "HeroSkeleton"
    skeleton.data.name = "HeroSkeleton"
    skeleton.parent = root
    armature = skeleton.data
    armature.edit_bones.remove(armature.edit_bones[0])
    previous = None
    for index, name in enumerate(("root", "pelvis", "spine", "chest", "neck", "head", "upper_arm.L", "upper_arm.R", "lower_arm.L", "lower_arm.R", "hand.L", "hand.R", "thigh.L", "thigh.R", "shin.L", "shin.R", "foot.L", "foot.R")):
        bone = armature.edit_bones.new(name)
        bone.head = (0, 0, index * 0.1)
        bone.tail = (0, 0, index * 0.1 + 0.1)
        if previous and index < 6:
            bone.parent = previous
        previous = bone
    bpy.ops.object.mode_set(mode="OBJECT")
    move_to(skeleton, "RIG")
    for name in ("weapon_socket.R", "weapon_socket.L", "ranged_socket", "back_socket"):
        socket = empty(name, (0, 1.1, 0), "RIG")
        socket.parent = root
    collision_box("COL_Hero", (0.75, 1.85, 0.75), (0, 0.95, 0), root)
    for name, amount in (("Idle", 0.04), ("Walk", 0.16), ("Run", 0.25), ("MeleeAttack", 0.7), ("RangedAttack", 0.45), ("Hit", -0.2), ("Death", -0.8)):
        add_simple_animation(root, name, amount=amount, end=24 if name in ("Idle", "Walk", "Run") else 16)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "characters", "hero.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "characters", "hero.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
