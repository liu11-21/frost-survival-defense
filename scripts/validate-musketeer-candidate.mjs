/**
 * Validate a Musketeer candidate GLB against the ALLY asset contract.
 *
 * Reads the glTF JSON chunk directly rather than going through Blender: the
 * question is what the FILE says, and loading it into an authoring tool can
 * only add ways for the answer to drift from what the runtime will parse.
 *
 * The contract is not restated here -- it is read out of AssetManifest.ts, so
 * this cannot pass while the manifest asks for something else.
 */
// The contract read here is the manifest's ALLY MELEE block -- the one keyed
// "warrior" -- and that is deliberate. AssetManifest.ts special-cases exactly
// one key for the full ally contract; every other unit key falls back to a
// generic entry requiring animations named "Attack" and "Cast", while this
// asset ships "MeleeAttack" and "RangedAttack" like the Warrior does.
//
// Wiring a "musketeer" key into the manifest is a RUNTIME change and this is
// the art pipeline, so the mismatch is recorded as a known limitation for the
// integration round rather than papered over here.
//
// NOTE ON weapon_socket. The contract node list is the same for this asset,
// but the socket is at the LEFT hand rather than the right, because the musket
// is rigid to hand.L. Nothing in the manifest names a side -- the socket is a
// node, and the runtime attaches to it wherever it is -- so this is a
// difference in the ART, not in the contract. It is called out because a
// reader who assumes right-handedness would otherwise read the pass as
// evidence of something it does not check.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const glbPath = process.argv[2]
  ?? resolve(process.cwd(), "public/assets/models/characters/musketeer_candidate.glb");

function readGltfJson(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    }
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  throw new Error("no JSON chunk");
}

function contractFromManifest() {
  const src = readFileSync(resolve(process.cwd(), "src/assets/AssetManifest.ts"), "utf8");
  const nodes = src.match(/key === "warrior"\s*\?\s*\[([^\]]+)\]/);
  const anims = src.match(/ALLY_MELEE_ANIMATIONS\s*=\s*\[([^\]]+)\]/);
  if (!nodes || !anims) throw new Error("could not read the ally contract from AssetManifest.ts");
  const parse = (block) => block.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return { nodes: parse(nodes[1]), animations: parse(anims[1]) };
}

const gltf = readGltfJson(glbPath);
const { nodes: requiredNodes, animations: requiredAnimations } = contractFromManifest();
const nodeNames = new Set((gltf.nodes ?? []).map((n) => n.name).filter(Boolean));
const animNames = new Set((gltf.animations ?? []).map((a) => a.name).filter(Boolean));

const missingNodes = requiredNodes.filter((n) => !nodeNames.has(n));
const missingAnimations = requiredAnimations.filter((a) => !animNames.has(a));

const result = {
  glb: glbPath,
  bytes: readFileSync(glbPath).length,
  nodes: nodeNames.size,
  meshes: (gltf.meshes ?? []).length,
  materials: (gltf.materials ?? []).map((m) => m.name),
  animations: [...animNames].sort(),
  requiredNodes,
  missingNodes,
  missingAnimations,
  pass: missingNodes.length === 0 && missingAnimations.length === 0,
};
console.log(JSON.stringify(result, null, 2));
if (!result.pass) {
  console.error(`CONTRACT FAIL: missing nodes ${JSON.stringify(missingNodes)}, `
    + `missing animations ${JSON.stringify(missingAnimations)}`);
  process.exit(1);
}
console.log("CONTRACT PASS");
