import json
import os
import sys
import bpy


def main():
    export_names = {obj.name for obj in bpy.context.scene.objects if not obj.hide_render and not obj.name.startswith("COL_")}
    collisions_visible = [obj.name for obj in bpy.context.scene.objects if obj.name.startswith("COL_") and not obj.hide_render]
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and not obj.name.startswith("COL_")]
    report = {
        "status": "ok" if meshes and not collisions_visible else "invalid",
        "meshCount": len(meshes),
        "materialCount": len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
        "animationActions": [action.name for action in bpy.data.actions],
        "collisionVisible": collisions_visible,
        "exportObjects": sorted(export_names),
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
