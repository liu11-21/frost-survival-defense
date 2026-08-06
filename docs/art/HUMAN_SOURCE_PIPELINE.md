# Human source pipeline — assessment, spec, and what is blocked

Written 2026-08-06 against `art/warrior-production-w1`.

## The finding that produced this document

Every human in this project is modelled from swept superellipses, boxes and
prisms. That language is genuinely good at coats, armour plate, belts and
boots — hard surfaces with flat planes and hard edges. It is bad at faces,
hands and bare anatomy, and four consecutive review rounds returned the same
verdict: the nose is a prism, the eyes are rectangles, the brow is a plank.

Those are not tuning failures. They are what the toolkit produces. Two of the
last three face iterations made the Hero **worse** than the version they
replaced, and both were only caught by looking at a render. Continuing to
tune parameters in `build_hero.py` is not a path to a believable face.

## 1. Source assessment

### What this machine actually has

Probed, not assumed:

| | |
|---|---|
| Blender | 5.2.0 LTS, `%LOCALAPPDATA%\Programs\Blender Foundation\Blender 5.2` |
| Total add-ons | 13 — a stock install |
| `io_scene_fbx` | present, **enabled** |
| `io_scene_gltf2` | present, **enabled** |
| `rigify` | present, disabled (can be enabled) |
| MakeHuman / MHX2 bridge | **not installed** |
| MB-Lab | **not installed** |
| Character Creator / Reallusion | **not installed** |
| Human base assets anywhere on disk | **none** — zero `.fbx`, no human `.blend` that is not one of ours |

So: Blender here **can import** a mature human base, and there **is no mature
human base to import**. That is the blocking fact for this stage.

### Candidate sources, ranked for this project

Licence terms below are the starting point for a decision, **not a legal
conclusion** — each must be read against its current text before anything
ships, because several of these have changed terms between versions.

| Source | Format | Why it ranks here | What to verify first |
|---|---|---|---|
| **Blender Studio human base meshes** | `.blend` | Published CC0 by Blender Studio; clean quad topology built for deformation; no add-on, no bridge, no runtime dependency. Bodies and heads only — clothing and armour would still be authored here, which suits us, because armour is the thing the existing toolkit is already good at. | That the specific bundle downloaded is the CC0 one |
| **MakeHuman** | FBX / DAE / MHX2 | Purpose-built human generator with a real face topology and a full skeleton including fingers. Long-standing position is that the *output* is CC0 even though the application is AGPL. Parametric, so a whole roster can share proportions. | The CC0 grant in the exact build's licence file; whether the FBX export or the MHX2 bridge gives better weights |
| **Character Creator (Reallusion)** | FBX | The highest quality of the four and the most game-ready — LODs, hair, cloth, a proper game-export path. | Commercial licence, paid; check the game-export tier covers a shipped title |
| **Daz Genesis** | FBX | Very high mesh quality, huge asset ecosystem. | Interactive/game licence is **separate and paid**; the default EULA does *not* cover shipping in a game |

**Recommendation: Blender Studio CC0 base first, MakeHuman second.** The CC0
base has the fewest licence questions and the fewest moving parts, and this
project already does all its clothing and armour in Blender — so a bare,
well-topologised body and head is exactly the part we cannot make and all we
actually need.

### Why nothing was downloaded

Acquiring any of these means downloading files from an external source, and
picking one commits the project to a licence. Both are your call, not mine, so
this stage stops at the specification and the pipeline. Say which source you
want and I will wire the profile and run a real candidate through.

## 2. The adapter — `scripts/blender/human_source_adapter.py`

Built and **tested end to end**, so it is not untested scaffolding waiting on
an asset that may never arrive.

```
node scripts/run-blender.mjs scripts/blender/human_source_adapter.py \
  --input <file.fbx|file.glb> --profile makehuman-fbx \
  --name hero_human_candidate --height 1.86
```

Stages: import → clean → bone map → normalise → materials → LOD → export →
report.

- **Nothing about a vendor is in the code.** Node names, bone names, source
  up-axis, forward-axis and unit scale all come from
  `scripts/blender/human_source_profiles.json`. Adding a source is a data
  change. Three profiles ship: `generic-gltf`, `makehuman-fbx`, `mixamo-fbx`.
- **Cleaning** drops cameras, lights, speakers and anything matching the
  profile's `drop_nodes` (IK controllers, helper empties) before measurement,
  so later stages measure the character and not a control cage around it.
- **Normalising** converts to Babylon Y-up / forward +Z, applies unit scale,
  scales to a target height, and puts the feet on `y = 0`. Getting this wrong
  is not subtle — the character lies on its back or stands 100× too large —
  but a triangle-counting validator reports it as fine, which is why it is a
  pipeline stage rather than a manual step.
- **Bone mapping** renames source bones onto our names, first match wins.
  An unmatched *required* bone is a hard failure with a non-zero exit, because
  a rig with no pelvis still exports, still passes a triangle budget, and
  animates as garbage.
- **LODs** are decimations of the source surface, not re-authored geometry.
  The entire point of a mature base is that its topology beats anything this
  pipeline could produce, so the coarse tiers should be that same surface.
- **The report** (`.runtime/human-adapter/<name>.report.json`) records input,
  profile, output SHA-256 and byte size, scale factor, removed nodes, the full
  bone mapping, missing and unmapped bones, materials, textures, per-LOD
  triangles and animation names.
- **It refuses to write `hero.glb` or `warrior.glb`.** The working Hero is the
  fallback; a candidate has to earn its way in through human review, not by
  being written to the same path.

### Verified run

`warrior.glb` was pushed through as a stand-in external input — a real GLB with
a real skeleton, arriving as if from outside:

```
HUMAN_ADAPTER_OK .runtime/human-adapter/adapter_smoketest.glb
LOD0 10482 / LOD1 4713 / LOD2 1884
18/18 required bones mapped, 0 unmapped, 0 missing
3 materials (budget 4), within budget
2.00 m source normalised to 1.86 m, factor 0.93
animations preserved: Death, Hit, Idle, MeleeAttack, Run, Walk
sha256 362c4a425ba55c3a…, 2 378 780 bytes
```

**This is a pipeline rehearsal, not a Hero candidate.** It is the Warrior's
own geometry going in a circle, it is written to `.runtime/`, and it is not
wired into the game. It proves the chain runs; it proves nothing about art.

## 3. Skeleton strategy — the 18-bone rig is not enough

`BONE_ORDER` is: root, pelvis, spine, chest, neck, head, upper_arm/lower_arm/
hand ×2, thigh/shin/foot ×2.

Against the stated quality target, four gaps matter:

| Missing | Consequence |
|---|---|
| **clavicle.L/R** | The shoulder cannot rotate independently of the upper arm. On a bare-skinned mature mesh the deltoid collapses on any raised-arm pose. Our current models hide this behind a rigid pauldron; a real base has nothing to hide it. |
| **finger bones** | "Hands can believably grip a weapon" is unreachable. Today the axe is rigidly parented 100% to `hand.R` and the fingers are a modelled block. A mature base ships separated fingers that will simply pass through the haft. |
| **forearm twist** | Wrist rotation gives the candy-wrapper collapse. Invisible on a sleeve, obvious on a bare forearm. |
| **toe.L/R** | No foot roll; the foot stays a plank through the whole walk cycle. |

**Proposed migration, append-only.** Keep all 18 names and indices exactly as
they are and add ten bones at the end:

```
clavicle.L, clavicle.R, thumb.L, thumb.R, fingers.L, fingers.R,
toe.L, toe.R, forearm_twist.L, forearm_twist.R      → 28 total
```

Append-only is what makes this safe: existing `JOINTS_0` indices keep their
meaning, every shipped clip stays valid, and `CharacterFactory` keys off bone
*names*, so nothing it looks up moves. New bones simply have no keyframes in
the old clips and rest at bind pose.

Scope of change: `BONE_ORDER` in three build scripts; `REQUIRED_BONE_COUNT`
in `validate-warrior-production.mjs` becomes a minimum rather than an equality;
`optional_bones` in the adapter profiles is already written for exactly these
ten names. Runtime needs no change until a clip actually keys them.

**Not done in this stage,** because it should land with the base that needs it
rather than speculatively.

## 4. What is blocked, and on what

A Hero candidate meeting the stated bar — real brow, eye sockets, nostrils,
mouth, cheekbones, chin, fingers that close on a grip — **cannot be produced
here without a human base**, and producing one out of more primitives is the
thing this stage exists to stop.

Unblocking it needs one decision from you: which source. Once that is named:

1. You place the file anywhere on disk and tell me the path.
2. `--profile` is picked or a new profile block is added (data, not code).
3. The adapter runs; its report says whether the rig maps.
4. The candidate ships as `hero_human_candidate.glb`, alongside the untouched
   `hero.glb`.
5. The same-camera, same-lighting comparison sheet is captured for both.
6. It replaces the Hero only if it wins that comparison on your review.

## 5. `scripts/verify-dist-assets.mjs`

Separate from the above and useful immediately. The preview server and every
Playwright run read `dist/`; the Blender pipeline writes `public/`. Rebuilding
a `.glb` without `npm run build` therefore verifies the *previous* asset,
silently, with everything green. That cost a full review cycle: two rounds of
fixes were judged against renders of the build before them.

The script hashes both trees and exits non-zero when they disagree. Currently:
**42/42 model assets match.**

---

# Stage 2 — adapter hardening, and the MakeHuman decision

## Source decision: MakeHuman official core, via MPFB2

Chosen 2026-08-06. **MPFB2** (MakeHuman Plugin For Blender 2, by the MakeHuman
Community) rather than the MakeHuman desktop application, because the desktop
app is GUI-only — it has no supported headless path for authoring and
exporting a character, so it cannot be driven from this project's Blender
pipeline. MPFB2 carries the same official core base mesh, skins and rig and
runs *inside* Blender, where the adapter already lives, and it is scriptable.

Licence boundary agreed for this project:

- Official core base mesh, official core skin, official core rig **only**.
- **No third-party contributed assets** unless the licence, author and source
  are recorded separately and confirmed first.
- The application's own licence is **not** the asset licence. Evidence that
  the official core assets/output are CC0 must be retained.
- To be recorded in this repo once installed: MPFB2 version, download URL,
  SHA-256 of the LICENSE file(s), and the exact export settings used.

### Status: not yet installed

`v2.0.17` (published 2026-07-22) is the current release per the GitHub API,
but that release carries **no attached assets**, and
`static.makehumancommunity.org/mpfb/releases.html` links release-note pages
rather than a download. The canonical zip URL was not established from those
two sources, and guessing a download URL for something that will be installed
into Blender and shipped against is not acceptable.

**This is the only thing blocking a Hero candidate.** Everything downstream of
it is built and verified.

## Adapter hardening — done and verified

All seven requested fixes are in `human_source_adapter.py` and the new
`human_rig.py`:

| | Fix |
|---|---|
| 1 | Mixamo no longer maps `root` and `pelvis` both to `Hips`; a missing root is synthesised. Any source bone claimed by two *required* targets is a hard failure. |
| 2 | All gating happens **before** `save_source`, `export_glb` or the report. Nothing plausible-looking is left on disk to be picked up later. |
| 3 | Material budget is enforced — merge or hard fail, never a note in a report. Base Color / Normal / Roughness / Metallic / Alpha recorded per material with the image behind each. Eyes, corneas, lashes, brows and hair are never merge candidates. |
| 4 | Real retargeting: rest-pose analysis, alignment against the shipped Hero's actual rest pose, per-bone basis deltas, keyframe conjugation `q' = d q d⁻¹`, and FK pose tests driving shoulder, wrist, hip, knee and foot. |
| 5 | Post-normalisation verification: feet on `y=0`, height on target, Y-up, centred, facing +Z, one coordinate system. Orientation is **measured off the skeleton**, not read from a profile flag. |
| 6 | Post-decimation verification: every vertex still weighted, every LOD0 bone still present, no tier drifting from LOD0's bounds. |
| 7 | Finger chains preserved whole; exported glTF skin checked directly for joint order and inverse bind matrices. |

### Verified run (`warrior.glb` as a stand-in external input)

```
placement   feet 0.0, height 1.86, faces +Z, Y-up          PASS
lodChecks   all three tiers weighted and aligned            PASS
poseTests   shoulder / wrist / hip / knee                   PASS
            footRoll — correctly "did not run", no toe bone
joints      order matches the legacy 18, IBMs present       PASS
retarget    6 clips, 108 bone channels, max delta 20.3 deg
materials   3, within budget
```

Three further bugs were found by *running* it rather than reading it: a stale
`StructRNA` dereference in `clean()`, reparenting that walked only meshes and
armatures and so rotated an empty hierarchy while every measurement reported
the unrotated model, and Blender 5.x dropping both `Action.groups` and
`Action.fcurves` for slotted actions.

## The 28-bone question, answered rather than assumed

`verify_joint_order` reads the **exported glTF skin**, not the Blender scene,
because "append-only is safe" is a claim about the file. On the verified run
the skin's joint array matches the legacy eighteen in order and carries
inverse bind matrices. That is the check that has to keep passing when the ten
extra bones are appended — if Blender's exporter ever reorders, every
`JOINTS_0` index in every previously shipped asset changes meaning.
