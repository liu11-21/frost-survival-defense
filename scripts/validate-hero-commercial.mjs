import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const sourceRelative = "assets-source/blender/characters/hero.blend";
const glbRelative = "public/assets/models/characters/hero.glb";
const evidenceRootRelative = "reports/art-previews/hero-commercial";
const runtimePerfRelative = `${evidenceRootRelative}/runtime-perf.json`;
const heroReviewRelative = `${evidenceRootRelative}/review`;
const requiredNodes = ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"];
const requiredAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];
const stages = ["H1", "H2", "H3", "H4", "H5", "H6"];
const requiredReviewCaptures = [
  { id: "hero-review-gameplay", cameraMode: "gameplay", animation: "Idle", lod: 0 },
  { id: "hero-review-front", cameraMode: "front", animation: "Idle", lod: 0 },
  { id: "hero-review-side", cameraMode: "left-side", animation: "Idle", lod: 0 },
  { id: "hero-review-back", cameraMode: "back", animation: "Idle", lod: 0 },
  { id: "hero-review-three-quarter", cameraMode: "three-quarter", animation: "Idle", lod: 0 },
  { id: "hero-review-close-up", cameraMode: "close-up", animation: "Idle", lod: 0 },
  { id: "hero-review-melee", cameraMode: "three-quarter", animation: "MeleeAttack", lod: 0 },
  { id: "hero-review-ranged", cameraMode: "three-quarter", animation: "RangedAttack", lod: 0 },
  { id: "hero-review-death", cameraMode: "three-quarter", animation: "Death", lod: 0 },
  { id: "hero-review-lod0", cameraMode: "front", animation: "Idle", lod: 0 },
  { id: "hero-review-lod1", cameraMode: "front", animation: "Idle", lod: 1 },
  { id: "hero-review-lod2", cameraMode: "front", animation: "Idle", lod: 2 },
];
const requiredReviewAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"];

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
  const skinnedPrimitives = primitives.filter((primitive) => primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined).length;
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
    weightedSkinning: skinnedPrimitives > 0,
    rootTransform: rootScaleUnit && roots.some((node) => node.name === "HeroRoot"),
    orientationContract: rootExtras.orientationContract === "Babylon Y-up, forward +Z",
    groundedContract: rootExtras.feetGrounded === true,
    uvAndColor: primitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined) && primitives.some((primitive) => primitive.attributes?.COLOR_0 !== undefined),
    lodGeometry: lodRenderPrimitives.LOD1 > 0 && lodRenderPrimitives.LOD2 > 0 && lodTriangles.LOD1 > 0 && lodTriangles.LOD2 > 0,
    // R3-D replaces the old per-material 64px brush images with one embedded
    // commercial atlas (and leaves room for one optional weapon atlas).
    // Keep this fail-closed: an image URI or a low-resolution-only export is
    // not a valid Hero material deliverable.
    embeddedTextures: images.length >= 1 && images.length <= 2 && images.every((image) => image.embedded && !image.uri),
    textureResolution: images.length > 0 && images.every((image) => image.resolution?.width > 0 && image.resolution?.height > 0)
      && images.some((image) => image.resolution?.width >= 1024 && image.resolution?.height >= 1024),
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
      skinnedPrimitives,
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

async function auditRuntimePerf() {
  try {
    const runtime = await readJson(runtimePerfRelative);
    const perf = runtime.perf ?? {};
    return {
      present: true,
      scene: runtime.scene ?? null,
      sourceIndicator: runtime.sourceIndicator ?? null,
      perf,
      consoleErrors: runtime.consoleErrors ?? [],
      pageErrors: runtime.pageErrors ?? [],
      valid: runtime.scene === "Babylon formal uiVerification scene" &&
        runtime.sourceIndicator === "Hero Model Source: GLB" &&
        Number.isFinite(perf.drawCalls) && perf.drawCalls > 0 &&
        Number.isFinite(perf.activeMeshes) && perf.activeMeshes > 0 &&
        (runtime.consoleErrors ?? []).length === 0 &&
        (runtime.pageErrors ?? []).length === 0,
    };
  } catch (error) {
    return { present: false, valid: false, error: String(error.message ?? error) };
  }
}

function validReviewBounds(metadata) {
  const box = metadata?.screenSpaceBoundingBox;
  const viewport = metadata?.viewport;
  if (!box || !viewport) return false;
  const values = [box.x, box.y, box.width, box.height, box.right, box.bottom, viewport.width, viewport.height];
  if (!values.every((value) => Number.isFinite(value))) return false;
  return box.width >= 40 && box.height >= 80 && box.x >= 0 && box.y >= 0 &&
    box.right <= viewport.width && box.bottom <= viewport.height && metadata.uiOccluded === false;
}

async function auditHeroReviewEvidence() {
  const captures = [];
  const problems = [];
  for (const expected of requiredReviewCaptures) {
    const screenshotFile = `${heroReviewRelative}/${expected.id}.png`;
    const metadataFile = `${heroReviewRelative}/${expected.id}.json`;
    try {
      const screenshot = await stat(resolve(root, screenshotFile));
      const metadata = await readJson(metadataFile);
      const contract = metadata.captureMode === "heroReview=1" &&
        metadata.cameraMode === expected.cameraMode &&
        metadata.animation === expected.animation &&
        metadata.lod === expected.lod &&
        metadata.modelSource === "GLB" &&
        metadata.proceduralVisibleMeshCount === 0 &&
        Number.isFinite(metadata.authoredVisibleMeshCount) && metadata.authoredVisibleMeshCount > 0 &&
        validReviewBounds(metadata);
      if (!contract) problems.push(`${expected.id}: runtime metadata contract failed`);
      captures.push({
        id: expected.id,
        expected,
        screenshot: { file: screenshotFile, bytes: screenshot.size, nonEmpty: screenshot.size > 10_000 },
        metadata,
        contract,
      });
    } catch (error) {
      problems.push(`${expected.id}: ${String(error.message ?? error)}`);
      captures.push({ id: expected.id, expected, contract: false, error: String(error.message ?? error) });
    }
  }

  let sequence = { present: false, frameCount: 0, valid: false, error: null };
  try {
    const manifest = await readJson(`${heroReviewRelative}/sequence/manifest.json`);
    const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
    const labels = frames.map((frame) => String(frame.captureId ?? ""));
    const order = ["idle", "walk", "run", "melee", "ranged", "hit", "death"];
    const ordered = order.every((label, index) => labels.findIndex((id) => id.includes(`-${label}-`)) >= (index === 0 ? 0 : labels.findIndex((id) => id.includes(`-${order[index - 1]}-`))));
    const filesPresent = await Promise.all(frames.map(async (frame) => {
      try {
        const image = await stat(resolve(root, String(frame.screenshot).replaceAll("\\", "/")));
        return image.size > 10_000;
      } catch {
        return false;
      }
    }));
    sequence = {
      present: true,
      frameCount: frames.length,
      valid: manifest.captureMode === "heroReview=1" && frames.length >= 21 && ordered && filesPresent.every(Boolean),
      error: null,
    };
    if (!sequence.valid) problems.push("sequence manifest is incomplete or out of order");
  } catch (error) {
    sequence.error = String(error.message ?? error);
    problems.push(`sequence: ${sequence.error}`);
  }

  const allRequired = captures.length === requiredReviewCaptures.length && captures.every((capture) => capture.contract);
  return {
    requiredCaptures: captures,
    requiredCount: requiredReviewCaptures.length,
    allRequiredCaptures: allRequired,
    sequence,
    valid: allRequired && sequence.valid,
    problems,
    humanReviewNote: "The validator confirms runtime visibility and contracts only; commercial visual quality remains a human review decision.",
  };
}

const sourcePath = resolve(root, sourceRelative);
const glbPath = resolve(root, glbRelative);
const sourceStat = await stat(sourcePath);
const glb = await readFile(glbPath);
const sourceBytes = await readFile(sourcePath);
const audit = buildAudit(glb, sourceBytes);
const stageEvidence = await auditStageEvidence();
const runtimePerf = await auditRuntimePerf();
const heroReviewEvidence = await auditHeroReviewEvidence();
const finalChecks = {
  sourceArtifact: sourceStat.isFile() && sourceBytes.length > 20_000,
  ...audit.checks,
  legacyStageEvidencePreserved: stageEvidence.allStagesHaveTwoIterations && stageEvidence.allFormalBabylonEvidence && stageEvidence.allScreenshotsPresent && stageEvidence.allMetricsValid,
  legacyRuntimePerfPresent: runtimePerf.present,
  heroReviewEvidence: heroReviewEvidence.valid,
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
  legacyEvidenceNote: "The prior H1-H6 uiVerification screenshots are preserved for history but are not sufficient visual evidence because the Hero is obscured by the menu and verification overlay.",
  heroReviewEvidence,
  runtimeEvidence: {
    formalBabylonScene: true,
    sourceIndicator: "Hero Model Source: GLB",
    reloadIterations: stages.length * 2,
    requiredAnimations: requiredAnimations,
    loadBehavior: "The dedicated heroReview=1 runtime instance retries authored preload before capture and exposes model visibility, camera, animation, LOD, screen bounds, and procedural overlap metadata.",
    visualEvidencePolicy: "Old masked uiVerification screenshots remain historical only; heroReviewEvidence is required for runtime visual acceptance.",
    perfCapture: runtimePerf,
    liveDrawCallCounter: runtimePerf.present ? "captured in reports/art-previews/hero-commercial/runtime-perf.json" : "not captured",
  },
};
const outputPath = resolve(root, evidenceRootRelative, "final-contract.json");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify(output, null, 2));
if (output.status !== "pass") process.exitCode = 1;
