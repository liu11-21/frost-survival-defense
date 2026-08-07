"""Does the clip ask the arm to be longer than it is?

Skinning cannot move a vertex further than the bones move it. If the mesh
between the shoulder and the hand stretches into a metre-long tube, then
either the weights are wrong or the SKELETON is being posed with the hand
further from the shoulder than the arm can reach -- and the second one is not
a weighting problem at all, it is the pose.

Rest length is the sum of the bone segments. Posed length is the straight-line
distance between the shoulder and the hand at that frame. A ratio above 1.0
means the clip is asking for reach the arm does not have, and every bit of
that excess has to come out of the skin.

    node scripts/run-blender.mjs scripts/blender/hero_reach_probe.py \\
        --input public/assets/models/characters/hero_male.glb
"""
import argparse
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

CHAINS = {
    "right": ("upper_arm.R", "lower_arm.R", "hand.R"),
    "left": ("upper_arm.L", "lower_arm.L", "hand.L"),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--clip", default="MeleeAttack")
    args = parser.parse_args(argv)

    path = os.path.abspath(os.path.join(ROOT, args.input))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    print("REACH_INPUT abs=%s" % path)

    armature = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    action = next((a for a in bpy.data.actions if args.clip in a.name), None)
    if action is None:
        raise SystemExit("no %s action" % args.clip)
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature.animation_data.action = action
    if hasattr(armature.animation_data, "action_slot") and action.slots:
        armature.animation_data.action_slot = action.slots[0]

    for label, (shoulder, elbow, hand) in CHAINS.items():
        bones = armature.data.bones
        if any(name not in bones for name in (shoulder, elbow, hand)):
            continue
        rest = ((bones[elbow].head_local - bones[shoulder].head_local).length
                + (bones[hand].head_local - bones[elbow].head_local).length)
        start, end = action.frame_range
        worst = (0.0, None)
        for frame in range(int(start), int(end) + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            posed = (armature.pose.bones[hand].head
                     - armature.pose.bones[shoulder].head).length
            if posed / max(rest, 1e-9) > worst[0]:
                worst = (posed / rest, frame, posed)
        print("REACH %-6s restChain=%.4f m  worstRatio=%.3f at frame %s "
              "(shoulder-to-hand %.4f m)"
              % (label, rest, worst[0], worst[1], worst[2]))


if __name__ == "__main__":
    main()
