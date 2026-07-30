import type { Mesh } from "@babylonjs/core";
import { WALL_SEGMENT_DEPTH } from "../data/BuildSlotDefinitions";
import { box, cyl, type Ctx } from "./BuildingMeshFactory";

/** Evenly spaced merlons along one half-segment, so the crest reads as one wall. */
export function crenelRow(c: Ctx, segWidth: number, centreX: number, dir: 1 | -1): Mesh[] {
  const count = Math.max(3, Math.round(segWidth / 2.2));
  const step = segWidth / count;
  const out: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const x = centreX - segWidth * 0.5 + step * (i + 0.5);
    // A small deterministic height jitter (never random — the same segment
    // must look identical on every rebuild) so the crest reads as weathered
    // stonework rather than a perfectly uniform extrusion.
    const jitter = i % 3 === 0 ? 0.12 : i % 3 === 1 ? -0.06 : 0;
    out.push(box(c, `wl.cren${dir}_${i}`, step * 0.55, 0.55 + jitter, WALL_SEGMENT_DEPTH * 0.8, x, 2.7 + jitter * 0.5, 0, "stone"));
  }
  return out;
}

/** One torch sconce a third of the way in from the outer (non-gate) end. */
export function torch(c: Ctx, segWidth: number, centreX: number, dir: 1 | -1): Mesh[] {
  const x = centreX + dir * segWidth * 0.32;
  return [
    box(c, `wl.bracket${dir}`, 0.1, 0.1, 0.3, x, 1.75, -WALL_SEGMENT_DEPTH * 0.5, "dark"),
    cyl(c, `wl.torch${dir}`, 0.28, 0.1, 0.14, x, 1.95, -WALL_SEGMENT_DEPTH * 0.5, "beam", 5),
    box(c, `wl.flame${dir}`, 0.14, 0.18, 0.14, x, 2.14, -WALL_SEGMENT_DEPTH * 0.5, "glow"),
  ];
}
