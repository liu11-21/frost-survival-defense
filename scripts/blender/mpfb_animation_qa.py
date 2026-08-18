"""Play the retargeted clips and check the poses are physically sensible.

"7 actions were created" is not "the animation is correct". An action can
exist, carry the right frame range, and still hold the arms behind the back
for its whole duration -- this project has shipped exactly that before, with
every structural check green.

This loads the *exported* GLB rather than in-memory state, so it tests the
artifact a runtime would actually receive, and samples each clip at 0, 25, 50,
75 and 100 percent.

    node scripts/run-blender.mjs scripts/blender/mpfb_animation_qa.py -- \
        --input .runtime/mpfb/mpfb2_dryrun.glb

Writes .runtime/mpfb/animation-qa.json.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, ".runtime", "mpfb")
CLIPS = ("Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death")
PHASES = (0.0, 0.25, 0.5, 0.75, 1.0)


def finite(vector):
    return all(math.isfinite(v) for v in vector)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    while argv and argv[0] == "--":
        argv = argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=os.path.join(OUT, "mpfb2_dryrun.glb"))
    args = parser.parse_args(argv)
    if not os.path.isfile(args.input):
        raise SystemExit("input not found: %s" % args.input)

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.input))
    armature = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise SystemExit("no armature in %s" % args.input)
    if armature.animation_data is None:
        armature.animation_data_create()

    scene = bpy.context.scene
    report = {"input": os.path.abspath(args.input), "clips": {}, "problems": []}

    def head(name):
        bone = armature.pose.bones.get(name)
        return (armature.matrix_world @ bone.head).copy() if bone else None

    def local_forward(point, origin, facing):
        """Distance in front of the character, along its own facing."""
        return (point - origin).dot(facing)

    for clip_name in CLIPS:
        action = next((a for a in bpy.data.actions
                       if a.name == clip_name or a.name.endswith(":" + clip_name)), None)
        if action is None:
            report["clips"][clip_name] = {"exists": False}
            report["problems"].append("%s: action missing" % clip_name)
            continue
        armature.animation_data.action = action
        start, end = action.frame_range
        span = max(1.0, end - start)
        record = {"exists": True, "frameRange": [round(start, 2), round(end, 2)],
                  "frameCount": int(round(span)) + 1, "samples": []}

        previous = None
        identity_count = 0
        for phase in PHASES:
            scene.frame_set(int(round(start + span * phase)))
            bpy.context.view_layer.update()

            pelvis = head("pelvis")
            chest = head("chest")
            hip_l, hip_r = head("thigh.L"), head("thigh.R")
            facing = None
            if hip_l and hip_r and pelvis and chest:
                up = (chest - pelvis)
                across = (hip_r - hip_l)
                if up.length > 1e-6 and across.length > 1e-6:
                    # THIS CROSS PRODUCT WAS THE WRONG WAY ROUND, and had been
                    # since it was written. Measured on the shipped rig:
                    #
                    #   across x up            = (0.000, +0.975, +0.222)
                    #   attackAnchor - pelvis  = y -0.550
                    #
                    # The attack anchor is in front of the character by
                    # definition -- `validate_warrior_semantics.py` asserts it
                    # and every shipped asset passes that assertion -- so
                    # forward is -Y and this vector pointed at the character's
                    # back. `reachesForward` has therefore been measuring how
                    # far the right hand reaches BEHIND the pelvis.
                    #
                    # It went unnoticed because a sword swing travels far in
                    # both directions, so a wind-up satisfied a test meant for
                    # a strike. It surfaced on the first character whose right
                    # hand stays in front for the whole clip: a support hand on
                    # a fore-stock, 0.26 m forward at its nearest, reported as
                    # -0.26 and failed.
                    #
                    # Fixing the direction changes no asset. It does change
                    # what the report says about one: see the note in the PR.
                    facing = up.normalized().cross(across.normalized())

            joints = {}
            for name in ("root", "pelvis", "chest", "head", "hand.L", "hand.R",
                         "foot.L", "foot.R", "shin.R", "upper_arm.R"):
                point = head(name)
                if point is not None:
                    joints[name] = point

            nonfinite = [n for n, p in joints.items() if not finite(p)]
            sample = {
                "phase": phase,
                "nonFinite": nonfinite,
                "rootY": round(joints["root"].y, 4) if "root" in joints else None,
                "pelvisY": round(joints["pelvis"].y, 4) if "pelvis" in joints else None,
            }
            if facing and "hand.R" in joints and "pelvis" in joints:
                sample["handRForward"] = round(local_forward(joints["hand.R"], joints["pelvis"], facing), 4)
            if facing and "hand.L" in joints and "pelvis" in joints:
                sample["handLForward"] = round(local_forward(joints["hand.L"], joints["pelvis"], facing), 4)
            # Feet should stay near the body, not fly off.
            if "pelvis" in joints:
                for foot in ("foot.L", "foot.R"):
                    if foot in joints:
                        sample[foot + "Dist"] = round((joints[foot] - joints["pelvis"]).length, 4)
            if previous is not None:
                jump = max(((joints[n] - previous[n]).length
                            for n in joints if n in previous), default=0.0)
                sample["maxJointJumpFromPreviousSample"] = round(jump, 4)
            previous = joints

            pose = armature.pose.bones
            if all(abs(pose[b].rotation_quaternion.angle) < 1e-4
                   for b in ("upper_arm.R", "thigh.R") if b in pose):
                identity_count += 1
            record["samples"].append(sample)

        record["allIdentity"] = identity_count == len(PHASES)
        forwards_r = [s.get("handRForward") for s in record["samples"] if s.get("handRForward") is not None]
        record["handRForwardMax"] = round(max(forwards_r), 4) if forwards_r else None
        record["handRForwardMin"] = round(min(forwards_r), 4) if forwards_r else None
        jumps = [s.get("maxJointJumpFromPreviousSample") for s in record["samples"]
                 if s.get("maxJointJumpFromPreviousSample") is not None]
        record["largestJump"] = round(max(jumps), 4) if jumps else None

        checks = {
            "allFinite": not any(s["nonFinite"] for s in record["samples"]),
            "notAllIdentity": not record["allIdentity"],
            "noHugeJump": (record["largestJump"] or 0.0) < 1.5,
            "feetNearBody": all(
                (s.get("foot.LDist") or 0) < 1.6 and (s.get("foot.RDist") or 0) < 1.6
                for s in record["samples"]),
        }
        # The two clips whose whole point is reaching forward. This project has
        # shipped a RangedAttack authored entirely behind the back before.
        if clip_name in ("MeleeAttack", "RangedAttack"):
            checks["reachesForward"] = (record["handRForwardMax"] or -1.0) > 0.10
        record["checks"] = checks
        record["passed"] = all(checks.values())
        if not record["passed"]:
            report["problems"].append(
                "%s: %s" % (clip_name, ", ".join(k for k, v in checks.items() if not v)))
        report["clips"][clip_name] = record

    report["clipsPresent"] = sum(1 for c in report["clips"].values() if c.get("exists"))
    report["clipsPassed"] = sum(1 for c in report["clips"].values() if c.get("passed"))
    report["ok"] = report["clipsPassed"] == len(CLIPS)

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "animation-qa.json"), "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print("MPFB_ANIM_QA %s" % json.dumps({
        "present": report["clipsPresent"], "passed": report["clipsPassed"],
        "of": len(CLIPS), "problems": report["problems"][:6]}))


if __name__ == "__main__":
    main()
