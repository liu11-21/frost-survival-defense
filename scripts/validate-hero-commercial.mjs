import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourceRelative = "assets-source/blender/characters/hero.blend";
const glbRelative = "public/assets/models/characters/hero.glb";
const reviewRelative = "reports/art-previews/hero-commercial/review";
const reportRelative = "reports/hero-r6-production/static-validation.json";
const requiredNodes = ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"];
const requiredAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const requiredCaptures = [
  ["hero-review-gameplay", "gameplay", "Idle", 0],
  ["hero-review-front", "front", "Idle", 0],
  ["hero-review-side", "left-side", "Idle", 0],
  ["hero-review-back", "back", "Idle", 0],
  ["hero-review-three-quarter", "three-quarter", "Idle", 0],
  ["hero-review-close-up", "close-up", "Idle", 0],
  ["hero-review-melee", "three-quarter", "MeleeAttack", 0],
  ["hero-review-ranged", "three-quarter", "RangedAttack", 0],
  ["hero-review-death", "three-quarter", "Death", 0],
  ["hero-review-lod0", "front", "Idle", 0],
  ["hero-review-lod1", "front", "Idle", 1],
  ["hero-review-lod2", "front", "Idle", 2],
];

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB file");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("unsupported GLB version");
  let offset = 12;
  let json = null;
  const binaries = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\0+$/, ""));
    if (type === 0x004e4942) binaries.push(chunk);
    offset += 8 + length;
  }
  if (!json) throw new Error("missing JSON chunk");
  return { json, binaries };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function pngResolution(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function auditGlb(glb) {
  const { json, binaries } = parseGlb(glb);
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
  const names = new Set(nodes.map((node) => node.name).filter(Boolean));
  const accessorTriangles = (primitive) => Math.floor((json.accessors?.[primitive.indices]?.count ?? 0) / 3);
  const primitiveTriangles = (node) => (meshes[node.mesh]?.primitives ?? []).reduce((sum, primitive) => sum + accessorTriangles(primitive), 0);
  const lodFor = (name) => name.startsWith("LOD1_PROXY") || name.startsWith("LOD1_PROD") ? "LOD1" : name.startsWith("LOD2_PROXY") || name.startsWith("LOD2_PROD") ? "LOD2" : "LOD0";
  const lodTriangles = { LOD0: 0, LOD1: 0, LOD2: 0 };
  const lodRenderPrimitives = { LOD0: 0, LOD1: 0, LOD2: 0 };
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const tier = lodFor(String(node.name ?? ""));
    lodTriangles[tier] += primitiveTriangles(node);
    lodRenderPrimitives[tier] += (meshes[node.mesh]?.primitives ?? []).length;
  }
  const animations = (json.animations ?? []).filter((animation) => animation.name).map((animation) => animation.name);
  const images = (json.images ?? []).map((image) => {
    const view = json.bufferViews?.[image.bufferView];
    const binary = binaries[view?.buffer ?? 0];
    const data = view && binary ? binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + (view.byteLength ?? 0)) : Buffer.alloc(0);
    return { name: image.name ?? "unnamed", embedded: image.bufferView !== undefined, uri: image.uri ?? null, mimeType: image.mimeType ?? null, resolution: pngResolution(data) };
  });
  const externalUris = [
    ...(json.images ?? []).map((image) => image.uri).filter(Boolean),
    ...(json.buffers ?? []).map((buffer) => buffer.uri).filter(Boolean),
  ];
  const nodeByName = new Map(nodes.map((node, index) => [node.name, { ...node, index }]));
  const parentNodes = new Set(nodes.flatMap((node) => node.children ?? []));
  const roots = nodes.map((node, index) => ({ ...node, index })).filter((node) => !parentNodes.has(node.index));
  const rootNode = nodeByName.get("HeroRoot");
  const rootExtras = rootNode?.extras ?? {};
  const collisionNodes = nodes.filter((node) => /(?:col_|collision|collider)/i.test(String(node.name ?? "")) && node.mesh !== undefined);
  const skinnedPrimitives = primitives.filter((primitive) => primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined).length;
  const triangles = primitives.reduce((sum, primitive) => sum + accessorTriangles(primitive), 0);
  const lodNames = nodes.filter((node) => node.mesh !== undefined).map((node) => String(node.name ?? ""));
  const lodIdentity = (level, parts) => parts.every((part) => lodNames.some((name) => (name.startsWith(`LOD${level}_PROD`) || name.startsWith(`LOD${level}_PROXY`)) && name.includes(`_${part}`)));
  const bufferUris = JSON.stringify(json);
  const checks = {
    nonEmpty: glb.length > 100_000,
    notPlaceholder: nodes.length > 10 && meshes.length > 2 && triangles > 1_000,
    requiredNodes: requiredNodes.every((name) => names.has(name)),
    requiredAnimations: requiredAnimations.every((name) => animations.includes(name)),
    skeleton: (json.skins ?? []).length === 1 && (json.skins?.[0]?.joints?.length ?? 0) === 18,
    weightedSkinning: skinnedPrimitives > 0,
    rootTransform: roots.some((node) => node.name === "HeroRoot") && roots.every((node) => (node.scale ?? [1, 1, 1]).every((value) => Math.abs(value - 1) <= 0.001)),
    orientationContract: rootExtras.orientationContract === "Babylon Y-up, forward +Z",
    groundedContract: rootExtras.feetGrounded === true,
    uvAndColor: primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined) && primitives.some((primitive) => primitive.attributes?.COLOR_0 !== undefined),
    lodGeometry: lodTriangles.LOD1 > 0 && lodTriangles.LOD2 > 0,
    lodIdentity: lodIdentity(1, ["body", "head", "arms", "legs", "gear", "weapon"]) && lodIdentity(2, ["body", "head", "arms", "gear", "weapon"]),
    embeddedAtlas: images.length === 1 && images.every((image) => image.embedded && !image.uri),
    atlasResolution: images.length === 1 && images[0].resolution?.width >= 1024 && images[0].resolution?.height >= 1024,
    noExternalUris: externalUris.length === 0,
    noAbsolutePaths: !/(?:[A-Za-z]:\\|\/Users\/|\/home\/)/.test(bufferUris),
    collisionNotRenderable: collisionNodes.length === 0,
    materialBudget: (json.materials ?? []).length <= 4,
    primitiveBudget: lodRenderPrimitives.LOD0 <= 15 && lodRenderPrimitives.LOD1 <= 8 && lodRenderPrimitives.LOD2 <= 6,
    triangleBudget: lodTriangles.LOD0 >= 18_000 && lodTriangles.LOD0 <= 20_500 && lodTriangles.LOD1 >= 6_500 && lodTriangles.LOD1 <= 8_000 && lodTriangles.LOD2 >= 2_000 && lodTriangles.LOD2 <= 3_000,
    rootExtras: rootExtras.commercialStage === "H6" && rootExtras.commercialIteration === 2,
  };
  return {
    bytes: glb.length,
    assetVersion: json.asset?.version ?? null,
    nodes: nodes.length,
    meshes: meshes.length,
    materials: (json.materials ?? []).length,
    textures: images.length,
    skeletons: (json.skins ?? []).length,
    skeletonJoints: json.skins?.[0]?.joints?.length ?? 0,
    animations,
    triangles,
    lodTriangles,
    lodRenderPrimitives,
    images,
    checks,
  };
}

async function auditReviewEvidence() {
  const captures = [];
  for (const [id, cameraMode, animation, lod] of requiredCaptures) {
    const screenshotPath = resolve(root, `${reviewRelative}/${id}.png`);
    const metadataPath = resolve(root, `${reviewRelative}/${id}.json`);
    try {
      const [screenshot, metadata] = await Promise.all([stat(screenshotPath), readFile(metadataPath, "utf8").then(JSON.parse)]);
      const box = metadata.screenSpaceBoundingBox;
      const viewport = metadata.viewport;
      const boundsValid = box && viewport && [box.x, box.y, box.width, box.height, box.right, box.bottom, viewport.width, viewport.height].every(Number.isFinite) && box.width >= 40 && box.height >= 80 && box.x >= 0 && box.y >= 0 && box.right <= viewport.width && box.bottom <= viewport.height;
      const valid = screenshot.size > 10_000 && metadata.captureMode === "heroReview=1" && metadata.cameraMode === cameraMode && metadata.animation === animation && metadata.lod === lod && metadata.modelSource === "GLB" && metadata.proceduralVisibleMeshCount === 0 && metadata.authoredVisibleMeshCount > 0 && metadata.uiOccluded === false && boundsValid;
      captures.push({ id, screenshotBytes: screenshot.size, metadata, valid });
    } catch (error) {
      captures.push({ id, valid: false, error: String(error.message ?? error) });
    }
  }
  return { requiredCount: requiredCaptures.length, captures, valid: captures.length === requiredCaptures.length && captures.every((capture) => capture.valid) };
}

const sourcePath = resolve(root, sourceRelative);
const glbPath = resolve(root, glbRelative);
let output;
try {
  const [sourceBytes, glbBytes] = await Promise.all([readFile(sourcePath), readFile(glbPath)]);
  const glbAudit = auditGlb(glbBytes);
  const evidence = await auditReviewEvidence();
  const sourceIsPointer = sourceBytes.subarray(0, 64).toString("utf8").includes("git-lfs.github.com/spec/v1");
  const checks = {
    sourceArtifact: sourceBytes.length > 100_000 && !sourceIsPointer,
    ...glbAudit.checks,
    runtimeReviewEvidence: evidence.valid,
  };
  output = {
    generatedAt: new Date().toISOString(),
    asset: "hero",
    sourcePath: sourceRelative,
    glbPath: glbRelative,
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
    source: { bytes: sourceBytes.length, sha256: sha256(sourceBytes), lfsPointer: sourceIsPointer },
    glb: { sha256: sha256(glbBytes), ...glbAudit },
    checks,
    runtimeReviewEvidence: evidence,
    humanReviewNote: "This validator proves asset/runtime contracts and visibility only. Commercial art quality remains a human decision.",
  };
} catch (error) {
  output = { generatedAt: new Date().toISOString(), asset: "hero", status: "blocked", checks: { sourceArtifact: false }, error: String(error.message ?? error) };
}

const outputPath = resolve(root, reportRelative);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
if (output.status !== "pass") process.exitCode = 1;
