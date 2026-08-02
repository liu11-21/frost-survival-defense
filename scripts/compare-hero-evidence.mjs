import fs from "node:fs/promises";
import path from "node:path";

const [stage, beforeFile, afterFile] = process.argv.slice(2);
if (!stage || !beforeFile || !afterFile) throw new Error("Usage: node scripts/compare-hero-evidence.mjs <stage> <before.json> <after.json>");
const repo = process.cwd();
const read = async (file) => JSON.parse(await fs.readFile(path.resolve(repo, file), "utf8"));
const before = await read(beforeFile);
const after = await read(afterFile);
const output = {
  stage,
  before: { stage: before.stage, iteration: before.iteration, metrics: before.metrics },
  after: { stage: after.stage, iteration: after.iteration, metrics: after.metrics },
  deltas: {
    sizeBytes: after.metrics.sizeBytes - before.metrics.sizeBytes,
    nodes: after.metrics.nodes - before.metrics.nodes,
    meshes: after.metrics.meshes - before.metrics.meshes,
    triangles: after.metrics.triangles - before.metrics.triangles,
    lod0Triangles: after.metrics.lodTriangles.LOD0 - before.metrics.lodTriangles.LOD0,
  },
};
const outputPath = path.join(repo, "reports", "art-previews", "hero-commercial", stage, "comparison.json");
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(outputPath);
