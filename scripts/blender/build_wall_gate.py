import os
import sys
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(HERE)
from common import reset_scene, material, box, prism, cylinder, empty, collision_box, parent_all, orient_for_babylon, add_lod_markers, add_simple_animation, author_surface_paint, save_source, export_glb, torus, sphere, cone


def build():
    reset_scene()
    stone = material("MAT_wall_stone", (0.34, 0.38, 0.45), 0.95)
    stone_light = material("MAT_wall_stone_light", (0.52, 0.58, 0.68), 0.88)
    wood = material("MAT_wall_wood", (0.3, 0.13, 0.05), 0.9)
    snow = material("MAT_wall_snow", (0.78, 0.9, 1.0), 0.68)
    fire = material("MAT_wall_fire", (1.0, 0.26, 0.04), 0.4, 0.0, (1.0, 0.08, 0.01))
    metal = material("MAT_wall_metal", (0.16, 0.2, 0.27), 0.3, 0.9)
    root = orient_for_babylon(empty("WallGateRoot", target="EXPORT", display="CUBE"))
    add_lod_markers(root, "wall")
    left = box("wallLeft", (4.8, 2.6, 1.5), (-4.2, 1.3, 0), stone, bevel=0.08)
    right = box("wallRight", (4.8, 2.6, 1.5), (4.2, 1.3, 0), stone, bevel=0.08)
    lintel = box("gateLintel", (3.6, 0.55, 1.55), (0, 2.45, 0), stone, bevel=0.08)
    snowCap = box("gateSnowCap", (4.05, 0.18, 1.72), (0, 2.8, 0), snow, bevel=0.045)
    leftTrim = box("wallTrimLeft", (4.9, 0.12, 1.62), (-4.2, 2.55, 0), snow, bevel=0.035)
    rightTrim = box("wallTrimRight", (4.9, 0.12, 1.62), (4.2, 2.55, 0), snow, bevel=0.035)
    doors = []
    gate_root = empty("gateRoot", (0, 0, 0), "EXPORT", "CUBE")
    gate_root.parent = root
    door_pivots = []
    for name, x, direction in (("gateDoorLeft", -1.25, 1), ("gateDoorRight", 1.25, -1)):
        pivot = empty(f"{name}Pivot", (x, 0, -0.82), "EXPORT", "CUBE")
        pivot.parent = gate_root
        door = box(name, (1.2, 2.1, 0.25), (x, 1.1, -0.82), wood, bevel=0.05)
        door.parent = pivot
        door.location.x = 0
        door.location.y = 1.1
        door.location.z = 0
        door_pivots.append((pivot, direction))
        doors.append(door)
    parts = [left, right, lintel, snowCap, leftTrim, rightTrim]
    for side in (-1, 1):
        parts += [
            prism(f"wallButtress.{side}", [(-0.48, 0.2), (0.48, 0.2), (0.38, 2.55), (-0.38, 2.35)], 0.34, (side * 4.2, 0, 0.72), metal, "LOD0", 0.035),
            prism(f"wallSnowShoulder.{side}", [(-0.62, 2.45), (0.62, 2.45), (0.48, 2.62), (-0.48, 2.62)], 0.92, (side * 4.2, 0, 0), snow, "LOD0", 0.03),
        ]
        for index, y in enumerate((0.55, 1.2, 1.85)):
            parts += [
                box(f"wallCourse.{side}.{index}", (1.5, 0.16, 0.12), (side * 4.2, y, -0.78), stone_light, "LOD0", 0.025),
                sphere(f"wallCourseBolt.{side}.{index}", 0.045, (side * 4.2, y, -0.92), metal),
            ]
    author_surface_paint(parts, seed=41)
    parent_all(parts, root)
    # Armour bands, bolts and a readable gate crest give the wall a built
    # structure instead of a pair of plain rectangles.
    parts += [
        torus("gateCrest", 0.42, 0.07, (0, 1.95, -0.98), metal, "LOD0"),
        sphere("gateCrestCore", 0.14, (0, 1.95, -1.02), fire),
        cone("gateKeystone", 0.22, 0.08, 0.4, (0, 2.45, -0.88), stone, "LOD0", 6),
        box("gateCrestBand", (1.15, 0.08, 0.08), (0, 1.95, -1.01), stone_light, "LOD0", 0.018),
        prism("gateCrestInset", [(-0.24, 2.10), (0.24, 2.10), (0.0, 1.72)], 0.045, (0, 0, -1.08), fire, "LOD0", 0.008),
        box("gateChainGuide", (0.10, 0.90, 0.08), (0, 1.24, -1.05), metal, "LOD0", 0.012),
    ]
    for side in (-1, 1):
        for i, y in enumerate((0.58, 1.45, 2.25)):
            parts.append(sphere(f"wallBolt.{side}.{i}", 0.07, (side * 4.2, y, -0.82), metal))
        parts += [
            box(f"doorBand.{side}.lower", (0.92, 0.12, 0.08), (side * 1.25, 0.72, -0.98), metal, "LOD0", 0.02),
            box(f"doorBand.{side}.upper", (0.92, 0.12, 0.08), (side * 1.25, 1.52, -0.98), metal, "LOD0", 0.02),
            sphere(f"doorHinge.{side}", 0.09, (side * 1.78, 1.24, -0.98), stone_light),
            *(box(f"doorPlank.{side}.{i}", (0.06, 1.78, 0.08), (side * (0.88 + i * 0.24), 1.10, -1.01), wood, "LOD0", 0.012) for i in range(3)),
        ]
    author_surface_paint(parts, seed=43, textured=True)
    parent_all(parts, root)
    for x in (-5.0, 5.0):
        cylinder("torch", 0.12, 0.7, (x, 2.25, -0.85), fire, "LOD0", 8).parent = root
    # Export the logical collider as a non-rendering anchor. Babylon keeps its
    # deterministic gameplay collision; the GLB contract only needs a stable
    # node and must not ship a visible collision mesh.
    empty("gateCollider", (0, 1.2, 0), "COLLISION").parent = root
    empty("friendlyPassTrigger", (0, 0, -1.5), "EXPORT").parent = root
    empty("damageAnchor", (0, 1.6, 0), "EXPORT").parent = root
    empty("fxAnchor", (0, 2.2, 0), "EXPORT").parent = root
    for name, amount in (("Damaged", 0.18), ("Destroyed", -0.55)):
        add_simple_animation(gate_root, name, amount=amount, end=20)
    for pivot, direction in door_pivots:
        add_simple_animation(pivot, "GateOpen", property_path="rotation_euler", index=1, amount=direction * 0.62, end=20)
        add_simple_animation(pivot, "GateClose", property_path="rotation_euler", index=1, amount=direction * -0.62, end=20)
    source = os.path.abspath(os.path.join(HERE, "..", "..", "assets-source", "blender", "buildings", "wall_gate.blend"))
    output = os.path.abspath(os.path.join(HERE, "..", "..", "public", "assets", "models", "buildings", "wall_gate.glb"))
    save_source(source)
    export_glb(output)


if __name__ == "__main__":
    build()
