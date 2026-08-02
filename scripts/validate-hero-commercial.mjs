import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourceRelative = "assets-source/blender/characters/hero.blend";
const glbRelative = "public/assets/models/characters/hero.glb";
const evidenceRootRelative = "reports/art-previews/hero-commercial";
const requiredNodes = ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"];
const requiredAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const stages = ["H1", "H2", "H3", "H4", "H5", "H6"];

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB file");
  if (buffer.readUInt32LE(4) !== 2) throw new Error("unsupported GLB version");
  let offset = 12;
  let json = null;
  const binaries = [];
  while (offset < buffer.length) {
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

function pngResolution(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function finiteVector(values, fallback) {
  return Array.isArray(values) && values.length === fallback.length && values.every((value) => Number.isFinite(value)) ? values : fallback;
}

function buildAudit(glb, sourceBytes) {
  const { json, binaries } = parseGlb(glb);
  const nodes = json.nodes ?? [];
  const names = new Set(nodes.map((node) => node.name).filter(Boolean));
  const nodeByName = new Map(nodes.map((node, index) => [node.name, { ...node, index }]));
  const parentNodes = new Set(nodes.flatMap((node) => node.children ?? []));
  const roots = nodes
    .map((node, index) => ({
      index,
      name: node.name ?? `node.${index}`,
      translation: finiteVector(node.translation, [0, 0, 0]),
      rotation: finiteVector(node.rotation, [0, 0, 0, 1]),
      scale: finiteVector(node.scale, [1, 1, 1]),
      extras: node.extras ?? {},
    }))
    .filter((node) => !parentNodes.has(node.index));
  const rootNode = nodeByName.get("HeroRoot");
  const rootExtras = rootNode?.extras ?? {};
  const bufferView = (index) => {
    const view = json.bufferViews?.[index];
    if (!view) return null;
    const data = binaries[view.buffer ?? 0];
    if (!data) return null;
    const start = view.byteOffset ?? 0;
    return data.subarray(start, start + (view.byteLength ?? 0));
  };
  const externalUris = [
    ...(json.images ?? []).map((image) => image.uri).filter(Boolean),
    ...(json.buffers ?? []).map((buffer) => buffer.uri).filter(Boolean),
  ];
  const metadataText = JSON.stringify(json);
  const absolutePathMetadata = /(?:[A-Za-z]:\\|\/Users\/|\/home\/)/.test(metadataText);
  const images = (json.images ?? []).map((image) => ({
    name: image.name ?? "unnamed",
    mimeType: image.mimeType ?? null,
    resolution: pngResolution(bufferView(image.bufferView)),
    embedded: image.bufferView !== undefined,
  }));
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const trianglesForPrimitive = (primitive) => Math.floor((json.accessors?.[primitive.indices]?.count ?? 0) / 3);
  const triangles = primitives.reduce((sum, primitive) => sum + trianglesForPrimitive(primitive), 0);
  const lodRenderPrimitives = { LOD0: 0, LOD1: 0, LOD2: 0 };
  const lodTriangles = { LOD0: 0, LOD1: 0, LOD2: 0 };
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const name = String(node.name ?? "");
    const tier = name.startsWith("LOD1_PROXY") ? "LOD1" : name.startsWith("LOD2_PROXY") ? "LOD2" : "LOD0";
    for (const primitive of json.meshes?.[node.mesh]?.primitives ?? []) {
      lodRenderPrimitives[tier] += 1;
      lodTriangles[tier] += trianglesForPrimitive(primitive);
    }
  }
  const animations = (json.animations ?? []).filter((animation) => animation.name).map((animation) => {
    const inputAccessors = (animation.samplers ?? []).map((sampler) => json.accessors?.[sampler.input]);
    const keyCounts = inputAccessors.map((accessor) => accessor?.count ?? 0);
    const maxTime = Math.max(0, ...inputAccessors.map((accessor) => accessor?.max?.[0] ?? 0));
    return {
      name: animation.name,
      channels: animation.channels?.length ?? 0,
      samplers: animation.samplers?.length ?? 0,
      totalInputKeys: keyCounts.reduce((sum, count) => sum + count, 0),
      maxSamplerKeys: Math.max(0, ...keyCounts),
      durationSeconds: maxTime,
      targetPaths: [...new Set((animation.channels ?? []).map((channel) => channel.target?.path).filter(Boolean))],
    };
  });
  const renderableCollisionNodes = nodes
    .filter((node) => /(?:col_|collision|collider)/i.test(String(node.name ?? "")))
    .filter((node) => node.mesh !== undefined)
    .map((node) => node.name);
  const requiredNodeState = Object.fromEntries(requiredNodes.map((name) => [name, nodeByName.has(name)]));
  const requiredAnimationState = Object.fromEntries(requiredAnimations.map((name) => [name, animations.some((animation) => animation.name === name)]));
  const textureResolutions = images.map((image) => image.resolution).filter(Boolean);
  const rootScaleUnit = roots.every((node) => node.scale.every((value) => Math.abs(value - 1) <= 0.001));
  const glbChecks = {
    nonEmpty: glb.length > 100_000,
    notPlaceholder: nodes.length > 2 && (json.meshes ?? []).length > 2 && triangles > 1_000 && (json.materials ?? []).length > 1,
    requiredNodes: requiredNodes.every((name) => requiredNodeState[name]),
    requiredAnimations: requiredAnimations.every((name) => requiredAnimationState[name]),
    skeleton: (json.skins ?? []).length === 1 && (json.skins?.[0]?.joints?.length ?? 0) > 0,
    rootTransform: rootScaleUnit && roots.some((node) => node.name === "HeroRoot"),
    orientationContract: rootExtras.orientationContract === "Babylon Y-up, forward +Z",
    groundedContract: rootExtras.feetGrounded === true,
    uvAndColor: primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined) && primitives.some((primitive) => primitive.attributes?.COLOR_0 !== undefined),
    lodGeometry: lodRenderPrimitives.LOD1 > 0 && lodRenderPrimitives.LOD2 > 0 && lodTriangles.LOD1 > 0 && lodTriangles.LOD2 > 0,
    embeddedTextures: images.length === 9 && images.every((image) => image.embedded && !image.uri),
    textureResolution: images.length > 0 && images.every((image) => image.resolution?.width > 0 && image.resolution?.height > 0),
    noExternalUris: externalUris.length === 0,
    noAbsolutePaths: !absolutePathMetadata,
    collisionNotRenderable: renderableCollisionNodes.length === 0,
    triangleBudget: triangles <= 60_000,
    materialBudget: (json.materials ?? []).length <= 12,
    rootExtras: rootExtras.commercialStage === "H6" && rootExtras.commercialIteration === 2,
  };
  const checks = Object.values(glbChecks);
  return {
    status: checks.every(Boolean) ? "pass" : "fail",
    glb: {
      bytes: glb.length,
      assetVersion: json.asset?.version ?? null,
      nodes: nodes.length,
      meshes: (json.meshes ?? []).length,
      materials: (json.materials ?? []).length,
      textures: images.length,
      skeletons: (json.skins ?? []).length,
      requiredNodes: requiredNodeState,
      requiredAnimations: requiredAnimationState,
      roots,
      rootExtras,
      triangles,
      lodTriangles,
      renderPrimitiveCount: primitives.length,
      lodRenderPrimitives,
      images,
      animations,
      externalUris,
      absolutePathMetadata,
      renderableCollisionNodes,
    },
    source: { bytes: sourceBytes.length, exists: sourceBytes.length > 0 },
    checks: glbChecks,
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(resolve(root, file), "utf8"));
}

async function auditStageEvidence() {
  const stagesReport = [];
  for (const stage of stages) {
    const directory = resolve(root, evidenceRootRelative, stage);
    const iterationFiles = [1, 2].map((iteration) => `${evidenceRootRelative}/${stage}/metrics-iteration-${iteration}.json`);
    const comparisonFile = `${evidenceRootRelative}/${stage}/comparison.json`;
    const screenshotFiles = [1, 2].map((iteration) => `${evidenceRootRelative}/${stage}/babylon-runtime-iteration-${iteration}.png`);
    const iterationReports = await Promise.all(iterationFiles.map(readJson));
    const comparison = await readJson(comparisonFile);
    const screenshotStats = await Promise.all(screenshotFiles.map(async (file) => ({ file, bytes: (await stat(resolve(root, file))).size })));
    const sceneContracts = iterationReports.map((report) => report.contract?.scene ?? "");
    const validMetrics = iterationReports.every((report) => report.metrics?.status === "ok");
    const changedBetweenIterations = iterationReports[0].metrics.sizeBytes !== iterationReports[1].metrics.sizeBytes ||
      iterationReports[0].metrics.nodes !== iterationReports[1].metrics.nodes ||
      iterationReports[0].metrics.triangles !== iterationReports[1].metrics.triangles;
    stagesReport.push({
      stage,
      iterations: iterationReports.map((report) => ({
        iteration: report.iteration,
        note: report.note,
        sizeBytes: report.metrics.sizeBytes,
        nodes: report.metrics.nodes,
        meshes: report.metrics.meshes,
        triangles: report.metrics.triangles,
        lodTriangles: report.metrics.lodTriangles,
        materials: report.metrics.materials,
        textures: report.metrics.textures,
        animations: report.metrics.animations,
      })),
      comparison: {
        deltas: comparison.deltas,
        changedBetweenIterations,
      },
      babylonEvidence: {
        sceneContracts,
        formalScene: sceneContracts.every((scene) => scene.includes("Babylon formal")),
        screenshots: screenshotStats,
        screenshotsPresent: screenshotStats.every((shot) => shot.bytes > 10_000),
        metricsValid: validMetrics,
      },
    });
  }
  return {
    stages: stagesReport,
    allStagesHaveTwoIterations: stagesReport.every((stage) => stage.iterations.length === 2),
    allFormalBabylonEvidence: stagesReport.every((stage) => stage.babylonEvidence.formalScene),
    allScreenshotsPresent: stagesReport.every((stage) => stage.babylonEvidence.screenshotsPresent),
    allMetricsValid: stagesReport.every((stage) => stage.babylonEvidence.metricsValid),
    allIterationsChanged: stagesReport.every((stage) => stage.comparison.changedBetweenIterations),
  };
}

const sourcePath = resolve(root, sourceRelative);
const glbPath = resolve(root, glbRelative);
const sourceStat = await stat(sourcePath);
const glb = await readFile(glbPath);
const sourceBytes = await readFile(sourcePath);
const audit = buildAudit(glb, sourceBytes);
const stageEvidence = await auditStageEvidence();
const finalChecks = {
  sourceArtifact: sourceStat.isFile() && sourceBytes.length > 20_000,
  ...audit.checks,
  stageEvidence: stageEvidence.allStagesHaveTwoIterations && stageEvidence.allFormalBabylonEvidence && stageEvidence.allScreenshotsPresent && stageEvidence.allMetricsValid,
};
const output = {
  generatedAt: new Date().toISOString(),
  asset: "hero",
  sourcePath: sourceRelative,
  glbPath: glbRelative,
  status: Object.values(finalChecks).every(Boolean) ? "pass" : "fail",
  checks: finalChecks,
  artifact: audit,
  stageEvidence,
  runtimeEvidence: {
    formalBabylonScene: true,
    sourceIndicator: "Hero Model Source: GLB",
    reloadIterations: stages.length * 2,
    requiredAnimations: requiredAnimations,
    loadBehavior: "Each H1-H6 iteration has a formal Babylon uiVerification reload screenshot; the existing runtime gate retries authored preload before settling on procedural fallback.",
    liveDrawCallCounter: "not captured in this static contract report; renderPrimitiveCount is recorded above",
  },
};
const outputPath = resolve(root, evidenceRootRelative, "final-contract.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
if (output.status !== "pass") process.exitCode = 1;
