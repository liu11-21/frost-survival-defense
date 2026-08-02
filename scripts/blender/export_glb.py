import argparse
import os
import bpy


def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for obj in bpy.context.scene.objects:
        obj.hide_render = obj.name.startswith("COL_") or obj.name.startswith("CAM_") or obj.name.startswith("LIGHT_")
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    export(os.path.abspath(args.output))


if __name__ == "__main__":
    main()
