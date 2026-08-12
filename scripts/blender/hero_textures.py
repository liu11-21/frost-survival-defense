"""Tiling detail textures for the Hero's garments, generated not painted.

Every Hero surface has been a single flat colour because the GLB carried no
images at all. These give the cloth a weave, the leather a grain and the steel
its wear, at the only cost this pipeline can afford: they are generated from
code, so there is no binary to track, nothing to re-download, and a rebuild
always produces the same bytes.

Each map is a greyscale detail pattern multiplied by its material's colour as
it is written, so the image ships already tinted and baseColorFactor stays
white. The intent was the opposite -- keep the hue in the factor and leave the
texture neutral -- but Blender's glTF exporter would not carry a
`texture * constant` node pattern through: every attempt exported
`baseColorFactor: []`, i.e. white, and the garments came out as bare grey.
The colour is still authored in exactly one place; hero_outfit.py passes it
in rather than the texture inventing it.

Tiled by the cylindrical UVs `hero_outfit.add_cylindrical_uvs` lays down, so
resolution buys detail density rather than covering a whole character.
"""
import math

import bpy

SIZE = 256


def _noise(x, y, seed):
    """Deterministic value noise. `random` would reseed differently per run."""
    n = math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
    return n - math.floor(n)


def _smooth_noise(x, y, seed, cells):
    """Value noise interpolated over a lattice, so it tiles on `cells`."""
    fx, fy = x * cells, y * cells
    x0, y0 = int(fx), int(fy)
    tx, ty = fx - x0, fy - y0
    # Smoothstep, so the lattice does not show as diamonds.
    tx = tx * tx * (3.0 - 2.0 * tx)
    ty = ty * ty * (3.0 - 2.0 * ty)
    a = _noise(x0 % cells, y0 % cells, seed)
    b = _noise((x0 + 1) % cells, y0 % cells, seed)
    c = _noise(x0 % cells, (y0 + 1) % cells, seed)
    d = _noise((x0 + 1) % cells, (y0 + 1) % cells, seed)
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


def _write(name, sampler, tint=(1.0, 1.0, 1.0)):
    """Build a packed, tiling image from a sampler, tinted as it is written.

    The tint is baked in rather than left to baseColorFactor. Blender's glTF
    exporter would not carry a `texture * constant` node pattern through --
    every attempt exported `baseColorFactor: []`, i.e. white, so the garments
    came out as the bare grey detail map with no hue. Multiplying here is the
    one place that reliably survives export, and the colour is still authored
    in exactly one place: the material table in hero_outfit.py, which passes
    it in.
    """
    image = bpy.data.images.get(name)
    if image is not None:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=False)
    pixels = [0.0] * (SIZE * SIZE * 4)
    for py in range(SIZE):
        v = py / SIZE
        row = py * SIZE * 4
        for px in range(SIZE):
            value = sampler(px / SIZE, v)
            index = row + px * 4
            pixels[index] = value * tint[0]
            pixels[index + 1] = value * tint[1]
            pixels[index + 2] = value * tint[2]
            pixels[index + 3] = 1.0
    image.pixels = pixels
    # Packed, or the exporter has no bytes to embed and the GLB ships without
    # the image it references.
    image.pack()
    return image


def weave(tint=(1.0, 1.0, 1.0), name="Hero_weave_detail"):
    """Woven wool: crossing warp and weft, roughened by a slow fibre noise."""
    def sampler(u, v):
        warp = 0.5 + 0.5 * math.sin(u * math.pi * 2.0 * 16.0)
        weft = 0.5 + 0.5 * math.sin(v * math.pi * 2.0 * 16.0)
        # Threads alternate over and under, which is what makes it read as
        # cloth rather than as a grid.
        cross = warp if (int(v * 16.0) % 2 == 0) else weft
        fibre = _smooth_noise(u, v, 3.0, 32)
        return 0.78 + 0.16 * cross + 0.10 * (fibre - 0.5)
    return _write(name, sampler, tint)


def grain(tint=(1.0, 1.0, 1.0), name="Hero_leather_detail"):
    """Leather: large soft cells with a finer pebble on top."""
    def sampler(u, v):
        cells = _smooth_noise(u, v, 11.0, 12)
        pebble = _smooth_noise(u, v, 29.0, 48)
        creases = 1.0 - abs(_smooth_noise(u, v, 7.0, 6) - 0.5) * 2.0
        return 0.74 + 0.18 * cells + 0.10 * pebble + 0.06 * creases
    return _write(name, sampler, tint)


def worn_metal(tint=(1.0, 1.0, 1.0), name="Hero_metal_detail"):
    """Steel: horizontal hammer/brush streaks with occasional deeper scars."""
    def sampler(u, v):
        streak = _smooth_noise(u * 0.15, v, 17.0, 40)
        broad = _smooth_noise(u, v, 5.0, 8)
        scar = 1.0 if _smooth_noise(u, v, 41.0, 64) > 0.93 else 0.0
        return 0.80 + 0.14 * streak + 0.10 * (broad - 0.5) - 0.18 * scar
    return _write(name, sampler, tint)


def attach(material, image, uv_name="UVMap"):
    """Drive a material's base colour from an already-tinted detail map."""
    if material is None or not material.use_nodes:
        return False
    tree = material.node_tree
    bsdf = next((n for n in tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        return False
    # The image already carries the colour (see `_write`), so it drives Base
    # Color directly and baseColorFactor stays white. Multiplying a constant in
    # here is what produced the white-factor exports.
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Smart"
    tex.location = (bsdf.location.x - 420, bsdf.location.y)
    uv_node = tree.nodes.new("ShaderNodeUVMap")
    uv_node.uv_map = uv_name
    uv_node.location = (tex.location.x - 220, tex.location.y)
    tree.links.new(uv_node.outputs["UV"], tex.inputs["Vector"])
    tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return True
