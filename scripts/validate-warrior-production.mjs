import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const assetPath = "public/assets/models/characters/warrior.glb";
const outputPath = resolve(root, "reports/warrior-production-w1/static-validation.json");
const requiredNodes = ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"];
const requiredAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "Hit", "Death"];

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw new Error("not a GLB v2 file");
  let offset = 12;
  let json;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\0+$/, ""));
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB JSON chunk missing");
  return json;
}

function trianglesForPrimitive(json, primitive) {
  const accessor = json.accessors?.[primitive.indices];
  return accessor ? Math.floor((accessor.count ?? 0) / 3) : 0;
}

function runValidation(json, sizeBytes) {
  const nodes = json.nodes ?? [];
  const names = new Set(nodes.map((node) => node.name).filter(Boolean));
  const missingNodes = requiredNodes.filter((name) => !names.has(name));
  const animations = new Set((json.animations ?? []).map((animation) => animation.name).filter(Boolean));
  const missingAnimations = requiredAnimations.filter((name) => !animations.has(name));
  const lodTriangles = { LOD0: 0, LOD1: 0, LOD2: 0 };
  const lodMeshNames = { LOD0: [], LOD1: [], LOD2: [] };
  const primitivesByLod = { LOD0: 0, LOD1: 0, LOD2: 0 };
  let totalTriangles = 0;
  let hasSkinAttributes = false;
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const name = String(node.name ?? "");
    const tier = name.startsWith("LOD1_") ? "LOD1" : name.startsWith("LOD2_") ? "LOD2" : "LOD0";
    lodMeshNames[tier].push(name);
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      const triangles = trianglesForPrimitive(json, primitive);
      totalTriangles += triangles;
      lodTriangles[tier] += triangles;
      primitivesByLod[tier] += 1;
      hasSkinAttributes ||= primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined;
    }
  }
  const externalUris = [];
  for (const image of json.images ?? []) if (image.uri) externalUris.push(image.uri);
  for (const buffer of json.buffers ?? []) if (buffer.uri) externalUris.push(buffer.uri);
  const jsonText = JSON.stringify(json);
  const rootNode = nodes.find((node) => node.name === "UnitRoot");
  const rootScale = rootNode?.scale ?? [1, 1, 1];
  const rootScaleUnit = rootScale.every((value) => Math.abs(value - 1) <= 0.001);
  const collisionMeshes = nodes.filter((node) => /(^|_)(col|collision|collider)/i.test(String(node.name ?? "")) && node.mesh !== undefined);
  const skinJoints = (json.skins ?? [])[0]?.joints?.length ?? 0;
  const budget = {
    lod0Triangles: lodTriangles.LOD0 >= 6000 && lodTriangles.LOD0 <= 9000,
    lod1Triangles: lodTriangles.LOD1 >= 2000 && lodTriangles.LOD1 <= 3500,
    lod2Triangles: lodTriangles.LOD2 >= 500 && lodTriangles.LOD2 <= 1200,
    lod0Primitives: primitivesByLod.LOD0 <= 8,
    lod1Primitives: primitivesByLod.LOD1 <= 5,
    lod2Primitives: primitivesByLod.LOD2 <= 3,
    materials: (json.materials ?? []).length >= 1 && (json.materials ?? []).length <= 3,
    textures: (json.images ?? []).length <= 1,
    glbSize: sizeBytes < 2_500_000,
    bones: skinJoints >= 12 && skinJoints <= 18,
    weightedSkinning: hasSkinAttributes,
  };
  const identity = {
    lod0: lodMeshNames.LOD0.some((name) => name.includes("body")) && lodMeshNames.LOD0.some((name) => name.includes("axe")),
    lod1: lodMeshNames.LOD1.some((name) => name.includes("body")) && lodMeshNames.LOD1.some((name) => name.includes("axe")),
    lod2: lodMeshNames.LOD2.some((name) => name.includes("body")) && lodMeshNames.LOD2.some((name) => name.includes("axe")),
  };
  const errors = [
    ...missingNodes.map((name) => `missing node: ${name}`),
    ...missingAnimations.map((name) => `missing animation: ${name}`),
    externalUris.length ? `external URIs: ${externalUris.join(", ")}` : null,
    /([A-Za-z]:\\|\/Users\/|\/home\/)/.test(jsonText) ? "absolute path metadata" : null,
    collisionMeshes.length ? "renderable collision mesh" : null,
    !rootScaleUnit ? "UnitRoot scale is not 1" : null,
    ...Object.entries(budget).filter(([, pass]) => !pass).map(([key]) => `budget failed: ${key}`),
    ...Object.entries(identity).filter(([, pass]) => !pass).map(([key]) => `LOD identity failed: ${key}`),
  ].filter(Boolean);
  return {
    status: errors.length === 0 ? "passed" : "failed",
    assetPath,
    sizeBytes,
    nodes: nodes.length,
    meshes: (json.meshes ?? []).length,
    materials: (json.materials ?? []).length,
    textures: (json.images ?? []).length,
    bones: skinJoints,
    animations: [...animations],
    animationChannels: Object.fromEntries((json.animations ?? []).map((animation) => [animation.name, animation.channels?.length ?? 0])),
    triangles: totalTriangles,
    lodTriangles,
    primitivesByLod,
    lodMeshNames,
    surface: { hasSkinAttributes, externalUris: externalUris.length, rootScaleUnit, collisionMeshes: collisionMeshes.map((node) => node.name) },
    budget,
    identity,
    errors,
  };
}

let result;
try {
  const file = await readFile(resolve(root, assetPath));
  result = runValidation(parseGlb(file), file.length);
} catch (error) {
  result = { status: "blocked", assetPath, errors: [String(error.message ?? error)] };
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
