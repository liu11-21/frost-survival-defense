"""Musketeer-specific combat motion, authored over the shared clip set.

WHY THESE TWO CLIPS ARE AUTHORED AND THE OTHER FIVE ARE NOT

Idle, Walk, Run, Hit and Death describe a body. They retarget onto anyone,
they were measured clean on this character, and rewriting them would be
churn. RangedAttack and MeleeAttack describe a body USING A WEAPON, and the
weapon they were authored for is a sword in the right hand.

Measured on this asset before any of this existed, over each clip's full
range:

    RangedAttack   best barrel-to-facing cosine   -0.013
                   muzzle height                  1.477 -> 1.092 m
                   closest the right hand comes   0.254 m

    The muzzle never points at the target on any frame -- ninety degrees off
    at its best -- it descends instead of coming up to the shoulder, and the
    right hand stays a quarter-metre clear of the firearm throughout. For a
    melee unit that is a cosmetic issue to defer. This is the ranged line, so
    it is the primary combat animation, and it shows a soldier swinging a
    musket sideways while his hands do something else.

    MeleeAttack    right hand travel              0.753 m (left: 0.117)
                   closest the right hand comes   0.451 m

    A right-arm swing with the musket riding along in the left hand. It is a
    punch with a firearm held out of the way, not a butt-stroke -- the butt
    is on the far side of the body from the arm doing the work. A musketeer's
    melee identity is the butt-stroke, so the butt is what has to move.

WHAT IS OVERWRITTEN AND WHAT IS KEPT

Only the arm and head channels. The torso and legs keep the retargeted
motion, so the weight shift, the stance and the recovery timing all survive
and this stays a variation on the shared set rather than a separate
vocabulary. Every pose is reached by IK to a measured world position and then
baked to plain FK rotations, so what ships is ordinary keyframes on the
contract bones with no constraints and no targets left behind.

WHERE THE NUMBERS COME FROM

Nothing here assumes the weapon's shape. The grip, the fore-stock and the
muzzle are measured off the exported mesh in the hand bone's own space, so
retuning the musket's proportions in `musketeer_outfit.py` moves the hands
with it instead of leaving them holding air.
"""
import json

import bpy
from mathutils import Matrix, Vector

# The clip's own frame range is divided by these fractions, so this does not
# care how long the shared clips are or whether they are ever relengthened.
# Phase tuple: (fraction of the clip, muzzle direction, grip position as
# fractions of character height, support-hand distance along the barrel as a
# fraction of height, head tilt in radians).
#
# THE GRIP IS A POSITION, NOT JUST A HEIGHT. The first version held x and y
# fixed in front of the sternum and varied only z, so every change of aim
# pivoted a 1.3 m barrel about a point on the centreline -- and a body was in
# the way. That is where MeleeAttack's 0.103 m through the chest, 0.089 m
# through the right forearm and 0.056 m through the skull came from. Both
# hands move in three dimensions here, and every pose keeps the weapon
# outboard of the torso on the character's own left.
#
# And the whole set then moved FORWARD by 0.04 of height, because the butt
# plate kept ending up inside the left deltoid. Measured: with the grip
# 0.220 m in front of the chest the butt sat at y = -0.028, which is the
# shoulder JOINT's own plane, 0.075 m from its centre and inside a shoulder
# that is 0.05 m thick with the coat on. A shouldered butt belongs in front
# of the shoulder, not level with it.
#
# The grip came IN by 0.04 of height first, on the theory that the butt plate
# needed to be in the shoulder pocket rather than against the deltoid. That
# made it worse -- 0.026 m of contact became 0.095 m -- and the reason is that
# the butt was never the thing in the wrong place. See the pole targets below.
RANGED_PHASES = (
    (0.00, Vector((0.05, -0.90, -0.44)), (0.128, -0.170, 0.604), 0.34, 0.02),
    (0.26, Vector((0.03, -0.96, -0.26)), (0.122, -0.186, 0.694), 0.36, 0.10),
    (0.46, Vector((0.02, -0.992, -0.06)), (0.104, -0.194, 0.744), 0.38, 0.17),
    (0.58, Vector((0.02, -0.992, -0.05)), (0.104, -0.196, 0.746), 0.38, 0.18),
    (0.66, Vector((0.02, -0.936, 0.34)), (0.110, -0.172, 0.760), 0.38, 0.13),
    (0.74, Vector((0.02, -0.976, 0.16)), (0.108, -0.186, 0.748), 0.37, 0.15),
    (0.86, Vector((0.02, -0.992, -0.06)), (0.104, -0.194, 0.742), 0.38, 0.16),
    (1.00, Vector((0.04, -0.93, -0.34)), (0.124, -0.182, 0.644), 0.35, 0.05),
)

# The butt-stroke, and the second thing the first version had wrong.
#
# It rotated the musket until the muzzle pointed up and BACK, which is the
# picture of a butt-stroke people carry in their heads and is not how one
# works: with a metre of barrel past the hands, swinging the muzzle overhead
# puts it through the wielder. A real butt-stroke drives the butt up and
# FORWARD while the muzzle drops down and back on the outboard side, and the
# weapon never crosses the body at all. Every muzzle direction below has a
# positive x -- out to the character's left -- for exactly that reason.
#
# The SUPPORT HAND also comes back to the grip for the strike, from 0.38 of
# height down to 0.13. Holding the fore-stock through a 120-degree rotation is
# something a right arm cannot do from the right side of the body -- the
# solver drove the forearm straight through the barrel, 0.049 m of it -- and
# a butt thrust with both hands close together is both the achievable pose and
# the one a soldier actually uses when there is no room to swing.
MELEE_PHASES = (
    (0.00, Vector((0.02, -0.992, -0.06)), (0.104, -0.194, 0.744), 0.38, 0.16),
    # A transition key at 0.10 as well, because the contact that survived
    # everything else was not at any pose but BETWEEN two of them: frame 5,
    # 0.048 m, with the butt plate swinging 0.072 m above the grip and through
    # the shoulder on the way from the aim to the load. Keys constrain the
    # path, and two keys 0.20 apart do not constrain enough of it.
    (0.10, Vector((0.08, -0.94, -0.30)), (0.124, -0.210, 0.688), 0.32, 0.06),
    (0.20, Vector((0.14, -0.86, -0.49)), (0.132, -0.196, 0.640), 0.26, -0.06),
    (0.32, Vector((0.36, -0.76, -0.54)), (0.138, -0.186, 0.612), 0.17, -0.10),
    (0.50, Vector((0.68, 0.14, -0.72)), (0.112, -0.222, 0.744), 0.13, 0.18),
    (0.60, Vector((0.72, 0.18, -0.67)), (0.104, -0.240, 0.752), 0.13, 0.20),
    (0.80, Vector((0.38, -0.66, -0.65)), (0.118, -0.196, 0.692), 0.22, 0.10),
    # The recovery key is NOT the same as the opening one even though the
    # pose is: this clip keeps the retargeted torso, and at its last frame
    # the spine has carried the shoulder somewhere the first frame's
    # shoulder was not. Same hand target, different shoulder, 0.0095 m of
    # butt plate in the deltoid. The hand moves; the shoulder is not ours.
    (1.00, Vector((0.02, -0.992, -0.06)), (0.098, -0.216, 0.736), 0.38, 0.16),
)

# The rig arrives here already renamed to the runtime contract -- the retarget
# matches the reference Hero by bone name, so it has to. Both spellings are
# resolved anyway: the MPFB names are what the kit builds against, and a module
# that silently finds neither is how the first run of this returned "no weapon
# on hand_l" and carried on exporting the unaltered shared clips.
ARM_ROLES = (("upper_arm.L", "upperarm_l"), ("lower_arm.L", "lowerarm_l"),
             ("hand.L", "hand_l"), ("upper_arm.R", "upperarm_r"),
             ("lower_arm.R", "lowerarm_r"), ("hand.R", "hand_r"))
HEAD_ROLE = ("head",)

# Radians, about the barrel. See `_aim_matrix`.
CANT = 0.40


def _resolve(armature, candidates):
    for name in candidates:
        if name in armature.data.bones:
            return name
    return None


def _names(armature):
    resolved = [_resolve(armature, pair) for pair in ARM_ROLES]
    if any(name is None for name in resolved):
        missing = [pair[0] for pair, name in zip(ARM_ROLES, resolved)
                   if name is None]
        raise RuntimeError("rig is missing arm bones: %s" % missing)
    return resolved


def _channels(action):
    """Every (channelbag, fcurve) in an action, on either Action API.

    Blender 5 moved animation data into layers, strips and slots, and
    `Action.fcurves` -- which every example of this in the wild still uses --
    is simply gone. Reading through the new structure is the only way to find
    the curves this needs to delete, and deleting the wrong ones (or none)
    would leave the retargeted arm motion fighting the authored keys.
    """
    pairs = []
    layers = getattr(action, "layers", None)
    if layers:
        for layer in layers:
            for strip in layer.strips:
                for bag in getattr(strip, "channelbags", []):
                    for curve in list(bag.fcurves):
                        pairs.append((bag, curve))
        return pairs
    for curve in list(action.fcurves):
        pairs.append((action, curve))
    return pairs


def _weapon_in_hand(armature, meshes, hand_name):
    """Measure the musket in the grip bone's own space.

    Returned in ARMATURE space relative to the hand's REST matrix, because
    that is the frame a rigid skin weight actually uses: a vertex bound to a
    bone lands at `pose.matrix @ bone.matrix_local.inverted() @ rest_point`.
    Everything downstream is derived from these three numbers, so changing the
    musket's proportions moves the hands rather than stranding them.
    """
    weapon = None
    for obj in meshes:
        name = (obj.data.name or "") + obj.name
        if "Sword" in name or "Axe" in name:
            weapon = obj
            break
    bone = armature.data.bones.get(hand_name)
    if weapon is None or bone is None:
        return None
    inverse = armature.matrix_world.inverted()
    grip = bone.head_local.copy()
    points = [inverse @ (weapon.matrix_world @ v.co) for v in weapon.data.vertices]
    muzzle = max(points, key=lambda p: (p - grip).length)
    axis = (muzzle - grip)
    length = axis.length
    axis = axis.normalized() if length > 1e-6 else Vector((0.0, 0.0, 1.0))
    butt = min(points, key=lambda p: (p - grip).dot(axis))
    return {"grip": grip, "axis": axis, "muzzleLength": length,
            "buttLength": (butt - grip).dot(axis), "bone": bone}


def _aim_matrix(rest_axis, target_dir):
    """Rotation taking the weapon's rest axis onto `target_dir`, roll settled.

    Two rotations, not one: the shortest arc onto the target leaves the roll
    free, and a free roll makes the lock plate and the trigger guard wander to
    the underside or the sky between keyframes. The second rotation puts the
    weapon's own "up" as near world up as the first rotation allows, which is
    how a rifle is actually held and which keeps the hardware where the eye
    expects it.
    """
    target = target_dir.normalized()
    swing = rest_axis.rotation_difference(target).to_matrix()
    up = Vector((0.0, 0.0, 1.0))
    # The component of world up perpendicular to the barrel is where the
    # weapon's top should end up.
    want = (up - target * up.dot(target))
    if want.length < 1e-5:
        return swing
    want.normalize()
    have = (swing @ Vector((0.0, 0.0, 1.0)))
    have = (have - target * have.dot(target))
    if have.length < 1e-5:
        return swing
    have.normalize()
    upright = have.rotation_difference(want).to_matrix() @ swing
    # A small CANT, and it is load-bearing rather than decoration. With the
    # weapon held perfectly upright the toe of the butt plate -- the outermost
    # ring of the stock, 0.058 m off the bore line -- rubs the left deltoid by
    # a few millimetres in the aim poses, and no amount of moving the grip
    # fixes it because the grip is where the hand is. Rolling the musket
    # fourteen degrees swings that toe 0.014 m clear, which is twice what is
    # needed, and a slight cant is how a long arm is actually held.
    return Matrix.Rotation(CANT, 3, target) @ upright


def _bake(armature, action, phases, weapon, height, arms):
    """Pose by IK to measured positions, then bake to FK and drop the rig aids.

    Two passes on purpose. Reaching a hand to a point in space is a position
    problem and IK is the honest tool for it; but an IK constraint is not
    something a GLB can carry, and a chain left solving at runtime is not a
    clip. So the first pass records where the solver put every arm bone, and
    the second replays those world matrices as plain rotations on a rig with
    no constraints left on it.
    """
    scene = bpy.context.scene
    armature.animation_data.action = action
    start, end = action.frame_range
    upper_l, lower_l, hand_l_name, upper_r, lower_r, hand_r_name = arms
    hand_l = armature.pose.bones[hand_l_name]
    hand_r = armature.pose.bones[hand_r_name]
    rest_hand = weapon["bone"].matrix_local
    # Measured, not assumed: two bone lengths, and 0.93 of them so the elbow
    # keeps a bend instead of locking straight at full extension.
    bones = armature.data.bones
    reach = 0.93 * ((bones[lower_r].head_local - bones[upper_r].head_local).length
                    + (bones[hand_r_name].head_local
                       - bones[lower_r].head_local).length)

    # AND THE ELBOWS NEED A POLE. Two-bone IK to a wrist position leaves the
    # elbow free to rotate anywhere on a circle, and the solver picked up and
    # outboard -- straight through the butt plate resting on that shoulder.
    # Every contact in the first authored pass was the weapon against the arm
    # holding it, which is not a weapon in the wrong place, it is a chicken
    # wing. The pole sits below and outboard of each hand, so the elbow drops
    # where a shooter's elbow actually goes.
    targets = {}
    for side, bone_name, out in (("l", lower_l, 1.0), ("r", lower_r, -1.0)):
        empty = bpy.data.objects.new("ik_%s" % side, None)
        bpy.context.collection.objects.link(empty)
        pole = bpy.data.objects.new("pole_%s" % side, None)
        bpy.context.collection.objects.link(pole)
        constraint = armature.pose.bones[bone_name].constraints.new("IK")
        constraint.target = empty
        constraint.pole_target = pole
        constraint.pole_angle = 0.0
        constraint.chain_count = 2
        targets[side] = (empty, constraint, pole, out)

    recorded = []
    for fraction, aim, grip_at_fractions, support, tilt in phases:
        frame = int(round(start + (end - start) * fraction))
        scene.frame_set(frame)

        rotation = _aim_matrix(weapon["axis"], aim)
        # Where the grip goes: on the character's own left, in front of the
        # chest, at the authored height. The butt then falls where the
        # geometry puts it, which is the shoulder pocket, because the butt is
        # measured off the mesh rather than placed by hand.
        grip_at = Vector([height * c for c in grip_at_fractions])
        armature_matrix = (Matrix.Translation(grip_at - rotation @ weapon["grip"])
                           @ rotation.to_4x4())

        # The left wrist is the grip. The right hand goes on the fore-stock,
        # a measured distance along the posed barrel -- so it is holding the
        # weapon by construction and cannot drift off it.
        posed_grip = armature_matrix @ weapon["grip"]
        posed_axis = rotation @ weapon["axis"]
        posed_grip_world = armature.matrix_world @ posed_grip
        posed_axis_world = (armature.matrix_world.to_3x3() @ posed_axis).normalized()
        # UNDER the barrel, not on its axis. The IK target is the WRIST, and a
        # glove runs forward from the wrist for most of its length -- so a
        # wrist on the bore line puts the palm alongside the wood rather than
        # around it. It looked joined while the musket was level and came
        # visibly apart on the recoil frame, the hand hanging in the air below
        # a barrel that had kicked up past it. Dropping the wrist by 0.03 of
        # height lets the hand's own length close on the fore-stock at every
        # angle the clip passes through.
        down = Vector((0.0, 0.0, -1.0))
        under = down - posed_axis * down.dot(posed_axis)
        under = under.normalized() if under.length > 1e-6 else down
        # AND IT HAS TO BE SOMEWHERE THE ARM CAN GET TO. An IK chain asked for
        # a point beyond its own length does not fail -- it straightens out,
        # points at the target and stops short, which draws a hand hanging in
        # the air near a weapon it is supposedly holding. On the recoil frame
        # the requested fore-stock position was 1.04 m from the right shoulder
        # against an arm 0.62 m long, and that is exactly what it looked like.
        #
        # So the support point slides BACK along the barrel until it is inside
        # the arm's reach. Solving the sphere-line intersection rather than
        # picking a smaller constant keeps the hand as far forward as the pose
        # allows, which is where a support hand belongs, and it re-solves for
        # every frame instead of being tuned for one.
        shoulder = armature.matrix_world @ armature.pose.bones[upper_r].head
        want = height * support
        offset = posed_grip_world - shoulder
        along_dot = offset.dot(posed_axis_world)
        disc = along_dot * along_dot - offset.length_squared + reach * reach
        if disc > 0.0:
            want = min(want, -along_dot + disc ** 0.5)
        else:
            want = min(want, -along_dot)
        want = max(want, height * 0.10)
        support_at = (posed_grip + posed_axis * want + under * (height * 0.030))
        for side, at in (("l", posed_grip), ("r", support_at)):
            empty, _constraint, pole, out = targets[side]
            empty.location = armature.matrix_world @ at
            # Asymmetric on purpose. The support arm's elbow goes down and
            # OUT, which is how a fore-stock is held; the trigger arm's goes
            # down and slightly BACK, tucked in. Giving both the outboard pull
            # lifted the left upper arm into the butt plate resting on that
            # shoulder -- the last contact left in either clip, and not a
            # weapon-placement problem at all.
            sideways = 0.12 if side == "l" else 0.34
            pole.location = armature.matrix_world @ (
                at + Vector((out * height * sideways, height * 0.20,
                             -height * 0.46)))
        bpy.context.view_layer.update()

        # The hand's own rotation carries the weapon, so it is set from the
        # aim and not left to the solver.
        hand_l.matrix = armature.matrix_world @ armature_matrix @ rest_hand
        # The right hand wraps the fore-stock: same roll as the barrel.
        hand_r.matrix = (armature.matrix_world @ armature_matrix
                         @ armature.data.bones[hand_r_name].matrix_local)
        bpy.context.view_layer.update()

        pose = {name: armature.pose.bones[name].matrix.copy() for name in arms}
        head = armature.pose.bones.get("head")
        head_matrix = None
        if head is not None:
            head_matrix = head.matrix.copy() @ Matrix.Rotation(tilt, 4, "X")
        recorded.append((frame, pose, head_matrix))

    for name in (lower_l, lower_r):
        bone = armature.pose.bones[name]
        for constraint in list(bone.constraints):
            bone.constraints.remove(constraint)
    for empty, _constraint, pole, _out in targets.values():
        bpy.data.objects.remove(empty, do_unlink=True)
        bpy.data.objects.remove(pole, do_unlink=True)

    # Clear only the channels being replaced. Everything else in the action --
    # pelvis, spine, legs -- is the retargeted motion and stays.
    replaced = set(arms) | set(HEAD_ROLE)
    for bag, curve in _channels(action):
        for name in replaced:
            if ('pose.bones["%s"]' % name) in curve.data_path:
                bag.fcurves.remove(curve)
                break

    for frame, pose, head_matrix in recorded:
        scene.frame_set(frame)
        # Parent before child: setting a pose matrix is resolved against the
        # parent's CURRENT world matrix, so a child written first is undone.
        for name in arms:
            bone = armature.pose.bones[name]
            bone.rotation_mode = "QUATERNION"
            bone.matrix = pose[name]
            bpy.context.view_layer.update()
        head = armature.pose.bones.get("head")
        if head is not None and head_matrix is not None:
            head.rotation_mode = "QUATERNION"
            head.matrix = head_matrix
            bpy.context.view_layer.update()
        for name in tuple(arms) + HEAD_ROLE:
            bone = armature.pose.bones.get(name)
            if bone is not None:
                bone.keyframe_insert("rotation_quaternion", frame=frame)
    return [frame for frame, _p, _h in recorded]


def author(armature, height, meshes):
    """Replace RangedAttack and MeleeAttack with musket motion."""
    arms = _names(armature)
    weapon = _weapon_in_hand(armature, meshes, arms[2])
    if weapon is None:
        raise RuntimeError(
            "no carried mesh found to author against; the clips would have "
            "shipped as the unaltered shared set and the failure would have "
            "been invisible in the GLB")
    if armature.animation_data is None:
        armature.animation_data_create()

    report = {"weapon": {
        "muzzleMetresFromGrip": round(weapon["muzzleLength"], 4),
        "buttMetresFromGrip": round(weapon["buttLength"], 4)}, "clips": {}}
    for name, phases in (("RangedAttack", RANGED_PHASES),
                         ("MeleeAttack", MELEE_PHASES)):
        action = bpy.data.actions.get(name)
        if action is None:
            continue
        frames = _bake(armature, action, phases, weapon, height, arms)
        report["clips"][name] = {"keyframes": frames}
    armature.animation_data.action = None
    for bone in armature.pose.bones:
        bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    return report
