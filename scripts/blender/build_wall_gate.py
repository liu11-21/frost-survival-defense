import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, cylinder, empty, collision_box, parent_all, add_simple_animation, save_source, export_glb


def build():
    reset_scene()
    stone = material("MAT_wall_stone", (0.34, 0.38, 0.45), 0.95)
    wood = material("MAT_wall_wood", (0.3, 0.13, 0.05), 0.9)
    snow = material("MAT_wall_snow", (0.78, 0.9, 1.0), 0.68)
    fire = material("MAT_wall_fire", (1.0, 0.26, 0.04), 0.4, 0.0, (1.0, 0.08, 0.01))
    root = empty("WallGateRoot", target="EXPORT", display="CUBE")
    left = box("wallLeft", (4.8, 2.6, 1.5), (-4.2, 1.3, 0), stone)
    right = box("wallRight", (4.8, 2.6, 1.5), (4.2, 1.3, 0), stone)
    lintel = box("gateLintel", (3.6, 0.55, 1.55), (0, 2.45, 0), stone)
    doors = []
    gate_root = empty("gateRoot", (0, 0, 0), "EXPORT", "CUBE")
    gate_root.parent = root
    for name, x in (("gateDoorLeft", -1.25), ("gateDoorRight", 1.25)):
        door = box(name, (1.2, 2.1, 0.25), (x, 1.1, -0.82), wood)
        doors.append(door)
    parts = [left, right, lintel] + doors
    parent_all(parts, root)
    for x in (-5.0, 5.0):
        cylinder("torch", 0.12, 0.7, (x, 2.25, -0.85), fire, "LOD0", 8).parent = root
    collision_box("gateCollider", (4.2, 2.4, 1.6), (0, 1.2, 0), root)
    empty("friendlyPassTrigger", (0, 0, -1.5), "EXPORT").parent = root
    empty("damageAnchor", (0, 1.6, 0), "EXPORT").parent = root
    empty("fxAnchor", (0, 2.2, 0), "EXPORT").parent = root
    for name, amount in (("GateOpen", 0.8), ("GateClose", -0.8), ("Damaged", 0.18), ("Destroyed", -0.55)):
        add_simple_animation(gate_root, name, amount=amount, end=20)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "buildings", "wall_gate.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "buildings", "wall_gate.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
