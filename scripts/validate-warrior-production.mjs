import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const assetPath = "public/assets/models/characters/warrior.glb";
const outputPath = resolve(root, "reports/warrior-production-w1/static-validation.json");
const requiredNodes = ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"];
const requiredAnimations = ["Idle", "Walk", "Run", "MeleeAttack", "Hit", "Death"];

// Warrior-W2 §12: triangle/primitive/material/texture/bone checks are hard
// caps only. A model under budget with good silhouette must not fail here —
// only the "don't blow the budget" direction is enforced.
const HARD_CAPS = {
  lod0Triangles: 7500,
  lod1Triangles: 3200,
  lod2Triangles: 1100,
  lod0Primitives: 6,
  lod1Primitives: 4,
  lod2Primitives: 2,
  materials: 3,
  textures: 1,
  glbSizeBytes: 2_500_000,
};
const REQUIRED_BONE_COUNT = 18;

function parseGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) throw new Error("not a GLB v2 file");
  let offset = 12;
  let json;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").replace(/\0+$/, ""));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB JSON chunk missing");
  return { json, bin };
}

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Reads every component of an accessor as plain numbers, normalized to
 * [0,1] for normalized integer types (WEIGHTS_0 is sometimes exported this
 * way instead of as FLOAT). Sparse accessors are not used by this pipeline
 * and are intentionally unsupported here (would silently under-report). */
function readAccessor(json, bin, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor || !bin) return null;
  if (accessor.sparse) throw new Error(`accessor ${accessorIndex} uses sparse storage, which this validator cannot read`);
  const bufferView = json.bufferViews?.[accessor.bufferView];
  if (!bufferView) return null;
  const compSize = COMPONENT_SIZE[accessor.componentType];
  const numComp = COMPONENT_COUNT[accessor.type];
  const stride = bufferView.byteStride || compSize * numComp;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const rows = [];
  for (let i = 0; i < accessor.count; i++) {
    const base = start + i * stride;
    const row = [];
    for (let c = 0; c < numComp; c++) {
      const at = base + c * compSize;
      let value;
      if (accessor.componentType === 5126) value = bin.readFloatLE(at);
      else if (accessor.componentType === 5121) value = bin.readUInt8(at);
      else if (accessor.componentType === 5123) value = bin.readUInt16LE(at);
      else if (accessor.componentType === 5125) value = bin.readUInt32LE(at);
      else if (accessor.componentType === 5120) value = bin.readInt8(at);
      else if (accessor.componentType === 5122) value = bin.readInt16LE(at);
      else throw new Error(`unsupported componentType ${accessor.componentType}`);
      if (accessor.normalized) {
        if (accessor.componentType === 5121) value /= 255;
        else if (accessor.componentType === 5123) value /= 65535;
      }
      row.push(value);
    }
    rows.push(row);
  }
  return rows;
}

function trianglesForPrimitive(json, primitive) {
  const accessor = json.accessors?.[primitive.indices];
  return accessor ? Math.floor((accessor.count ?? 0) / 3) : 0;
}

function lodTierOf(name) {
  return name.startsWith("LOD1_") ? "LOD1" : name.startsWith("LOD2_") ? "LOD2" : "LOD0";
}

function primitiveBounds(json, primitive) {
  const accessor = json.accessors?.[primitive.attributes?.POSITION];
  if (!accessor?.min || !accessor?.max) return null;
  return { min: accessor.min, max: accessor.max };
}

function meshBounds(json, meshIndex) {
  let min = null;
  let max = null;
  for (const primitive of json.meshes?.[meshIndex]?.primitives ?? []) {
    const bounds = primitiveBounds(json, primitive);
    if (!bounds) continue;
    min = min ? min.map((v, i) => Math.min(v, bounds.min[i])) : [...bounds.min];
    max = max ? max.map((v, i) => Math.max(v, bounds.max[i])) : [...bounds.max];
  }
  if (!min || !max) return null;
  const size = max.map((v, i) => v - min[i]);
  return { min, max, size, diagonal: Math.hypot(size[0], size[1], size[2]) };
}

function isIdentityTransform(node) {
  const t = node.translation ?? [0, 0, 0];
  const s = node.scale ?? [1, 1, 1];
  const r = node.rotation ?? [0, 0, 0, 1];
  const eps = 0.001;
  const near = (a, b) => Math.abs(a - b) <= eps;
  return t.every((v) => near(v, 0)) && s.every((v) => near(v, 1)) && r.every((v, i) => near(v, i === 3 ? 1 : 0));
}

/**
 * Warrior-W2 §7 weapon contract: the axe must either (a) have no skin at all
 * and sit under `weapon_socket`, or (b) be skinned 100% to a single bone that
 * resolves to `hand.R`. Splitting weight across `hand.L`/`hand.R` (the
 * classic "averaged between both hands" mistake) is explicitly forbidden.
 */
function checkWeaponRig(json, bin, nodes, axeNode) {
  const boneNameByNodeIndex = new Map(nodes.map((node, index) => [index, String(node.name ?? "")]));
  if (axeNode.skin === undefined) {
    // Unskinned: acceptable only if rigidly parented under weapon_socket.
    const socketIndex = nodes.findIndex((n) => n.name === "weapon_socket");
    if (socketIndex === -1) return { ok: false, reason: "axe is unskinned but weapon_socket node is missing" };
    const socketChildren = new Set(nodes[socketIndex].children ?? []);
    const axeIndex = nodes.indexOf(axeNode);
    if (!socketChildren.has(axeIndex)) return { ok: false, reason: "axe is unskinned but not parented under weapon_socket" };
    return { ok: true, mode: "rigid-socket" };
  }
  const skin = json.skins?.[axeNode.skin];
  if (!skin) return { ok: false, reason: "axe references a missing skin" };
  const mesh = json.meshes?.[axeNode.mesh];
  for (const primitive of mesh?.primitives ?? []) {
    const joints = readAccessor(json, bin, primitive.attributes?.JOINTS_0);
    const weights = readAccessor(json, bin, primitive.attributes?.WEIGHTS_0);
    if (!joints || !weights) return { ok: false, reason: "axe primitive is missing JOINTS_0/WEIGHTS_0" };
    for (let v = 0; v < joints.length; v++) {
      const boneWeights = new Map();
      for (let c = 0; c < joints[v].length; c++) {
        const w = weights[v][c];
        if (w <= 0.001) continue;
        const jointIndex = joints[v][c];
        const nodeIndex = skin.joints?.[jointIndex];
        const name = boneNameByNodeIndex.get(nodeIndex) ?? `joint#${jointIndex}`;
        boneWeights.set(name, (boneWeights.get(name) ?? 0) + w);
      }
      const dominant = [...boneWeights.entries()].sort((a, b) => b[1] - a[1])[0];
      if (!dominant) return { ok: false, reason: "axe vertex has no meaningful skin weight" };
      if (boneWeights.size > 1) {
        const names = [...boneWeights.keys()].sort().join("+");
        if (boneWeights.has("hand.L") && boneWeights.has("hand.R")) {
          return { ok: false, reason: `axe vertex is split-weighted across both hands (${names}), which is explicitly forbidden` };
        }
      }
      if (dominant[0] !== "hand.R" || dominant[1] < 0.999) {
        return { ok: false, reason: `axe must be 100% weighted to hand.R when skinned; found dominant bone "${dominant[0]}" at weight ${dominant[1].toFixed(3)}` };
      }
    }
  }
  return { ok: true, mode: "rigid-hand.R" };
}

function runValidation(json, bin, sizeBytes) {
  const nodes = json.nodes ?? [];
  const names = new Set(nodes.map((node) => node.name).filter(Boolean));
  const missingNodes = requiredNodes.filter((name) => !names.has(name));
  const animations = json.animations ?? [];
  const animationNames = new Set(animations.map((animation) => animation.name).filter(Boolean));
  const missingAnimations = requiredAnimations.filter((name) => !animationNames.has(name));

  const lodTriangles = { LOD0: 0, LOD1: 0, LOD2: 0 };
  const lodMeshNames = { LOD0: [], LOD1: [], LOD2: [] };
  const primitivesByLod = { LOD0: 0, LOD1: 0, LOD2: 0 };
  const renderableNodesByLod = { LOD0: [], LOD1: [], LOD2: [] };
  let totalTriangles = 0;
  // §12.1/12.2: every renderable primitive must carry JOINTS_0+WEIGHTS_0 --
  // not just "at least one primitive somewhere".
  const primitivesMissingSkin = [];
  for (const node of nodes) {
    if (node.mesh === undefined) continue;
    const name = String(node.name ?? "");
    const tier = lodTierOf(name);
    lodMeshNames[tier].push(name);
    renderableNodesByLod[tier].push(node);
    const mesh = json.meshes?.[node.mesh];
    (mesh?.primitives ?? []).forEach((primitive, primitiveIndex) => {
      const triangles = trianglesForPrimitive(json, primitive);
      totalTriangles += triangles;
      lodTriangles[tier] += triangles;
      primitivesByLod[tier] += 1;
      const hasSkin = primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined;
      if (!hasSkin) primitivesMissingSkin.push(`${name}[primitive ${primitiveIndex}]`);
    });
  }
  const everyRenderablePrimitiveSkinned = primitivesMissingSkin.length === 0;

  // §12.3/12.4/12.5: per-LOD body+axe presence, non-zero axe bounds, sane
  // axe/body bounds ratio.
  const lodGeometry = {};
  for (const tier of ["LOD0", "LOD1", "LOD2"]) {
    const bodyNode = renderableNodesByLod[tier].find((node) => String(node.name).includes("body"));
    const axeNode = renderableNodesByLod[tier].find((node) => String(node.name).includes("axe"));
    const bodyBounds = bodyNode ? meshBounds(json, bodyNode.mesh) : null;
    const axeBounds = axeNode ? meshBounds(json, axeNode.mesh) : null;
    const axeNonZero = !!axeBounds && axeBounds.size.every((v) => v > 0.001);
    const ratio = bodyBounds && axeBounds && bodyBounds.diagonal > 0 ? axeBounds.diagonal / bodyBounds.diagonal : null;
    lodGeometry[tier] = {
      hasBody: !!bodyNode,
      hasAxe: !!axeNode,
      bodyBounds,
      axeBounds,
      axeNonZero,
      axeBodyRatio: ratio,
      // Heuristic envelope: the axe should be a meaningful fraction of body
      // size but never as large as (or larger than) the whole body.
      axeBodyRatioSane: ratio !== null && ratio > 0.03 && ratio < 1,
    };
  }

  // §12.6: LOD1/LOD2 root group nodes must not introduce their own
  // position/scale drift relative to LOD0's direct placement under UnitRoot.
  const lodRootConsistency = {};
  for (const tier of ["LOD1", "LOD2"]) {
    const groupNode = nodes.find((node) => node.name === tier);
    lodRootConsistency[tier] = groupNode ? isIdentityTransform(groupNode) : false;
  }

  // §12.7/12.8: required animation channels non-empty, output accessors not
  // all-identical (a flat/static "animation" is not real animation evidence).
  // A real clip commonly carries some legitimately-constant channels (e.g. a
  // scale track on an unanimated bone) alongside the channels that actually
  // move, so the bar is "at least one channel varies", not "every channel
  // varies" -- matching the doc's "must not be entirely identical" wording.
  const animationChannelHealth = {};
  for (const name of requiredAnimations) {
    const animation = animations.find((a) => a.name === name);
    if (!animation) {
      animationChannelHealth[name] = { present: false, channelCount: 0, varyingChannelCount: 0, anyChannelVaries: false };
      continue;
    }
    let varyingChannelCount = 0;
    for (const channel of animation.channels ?? []) {
      const sampler = animation.samplers?.[channel.sampler];
      const rows = sampler ? readAccessor(json, bin, sampler.output) : null;
      if (!rows || rows.length < 2) continue;
      let varies = false;
      for (let i = 1; i < rows.length && !varies; i++) {
        for (let c = 0; c < rows[i].length; c++) {
          if (Math.abs(rows[i][c] - rows[0][c]) > 1e-4) { varies = true; break; }
        }
      }
      if (varies) varyingChannelCount++;
    }
    animationChannelHealth[name] = {
      present: true,
      channelCount: animation.channels?.length ?? 0,
      varyingChannelCount,
      anyChannelVaries: varyingChannelCount > 0,
    };
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

  // §7/weapon contract: check every LOD's axe rig, not just LOD0.
  const weaponRig = {};
  for (const tier of ["LOD0", "LOD1", "LOD2"]) {
    const axeNode = renderableNodesByLod[tier].find((node) => String(node.name).includes("axe"));
    weaponRig[tier] = axeNode ? checkWeaponRig(json, bin, nodes, axeNode) : { ok: false, reason: "no axe node found for this LOD" };
  }

  const hardCaps = {
    lod0Triangles: lodTriangles.LOD0 <= HARD_CAPS.lod0Triangles,
    lod1Triangles: lodTriangles.LOD1 <= HARD_CAPS.lod1Triangles,
    lod2Triangles: lodTriangles.LOD2 <= HARD_CAPS.lod2Triangles,
    lod0Primitives: primitivesByLod.LOD0 <= HARD_CAPS.lod0Primitives,
    lod1Primitives: primitivesByLod.LOD1 <= HARD_CAPS.lod1Primitives,
    lod2Primitives: primitivesByLod.LOD2 <= HARD_CAPS.lod2Primitives,
    materials: (json.materials ?? []).length >= 1 && (json.materials ?? []).length <= HARD_CAPS.materials,
    textures: (json.images ?? []).length <= HARD_CAPS.textures,
    glbSize: sizeBytes < HARD_CAPS.glbSizeBytes,
    bones: skinJoints === REQUIRED_BONE_COUNT,
    weightedSkinning: everyRenderablePrimitiveSkinned,
  };
  const identity = {
    lod0: lodGeometry.LOD0.hasBody && lodGeometry.LOD0.hasAxe,
    lod1: lodGeometry.LOD1.hasBody && lodGeometry.LOD1.hasAxe,
    lod2: lodGeometry.LOD2.hasBody && lodGeometry.LOD2.hasAxe,
  };

  const errors = [
    ...missingNodes.map((name) => `missing node: ${name}`),
    ...missingAnimations.map((name) => `missing animation: ${name}`),
    externalUris.length ? `external URIs: ${externalUris.join(", ")}` : null,
    /([A-Za-z]:\\|\/Users\/|\/home\/)/.test(jsonText) ? "absolute path metadata" : null,
    collisionMeshes.length ? "renderable collision mesh" : null,
    !rootScaleUnit ? "UnitRoot scale is not 1" : null,
    !everyRenderablePrimitiveSkinned ? `primitives missing JOINTS_0/WEIGHTS_0: ${primitivesMissingSkin.join(", ")}` : null,
    ...Object.entries(hardCaps).filter(([, pass]) => !pass).map(([key]) => `hard cap exceeded: ${key}`),
    ...Object.entries(identity).filter(([, pass]) => !pass).map(([key]) => `LOD identity failed: ${key}`),
    ...Object.entries(lodGeometry).filter(([, g]) => !g.axeNonZero).map(([tier]) => `${tier} axe bounds are zero/degenerate`),
    ...Object.entries(lodGeometry).filter(([, g]) => g.hasBody && g.hasAxe && !g.axeBodyRatioSane).map(([tier]) => `${tier} axe/body bounds ratio out of range (${lodGeometry[tier].axeBodyRatio})`),
    ...Object.entries(lodRootConsistency).filter(([, ok]) => !ok).map(([tier]) => `${tier} root group node has position/scale drift`),
    ...Object.entries(animationChannelHealth).filter(([, health]) => !health.present).map(([name]) => `animation channels missing entirely: ${name}`),
    ...Object.entries(animationChannelHealth).filter(([, health]) => health.present && health.channelCount === 0).map(([name]) => `animation has zero channels: ${name}`),
    ...Object.entries(animationChannelHealth).filter(([, health]) => health.present && health.channelCount > 0 && !health.anyChannelVaries).map(([name]) => `animation output accessors are all identical (static/fake animation): ${name}`),
    ...Object.entries(weaponRig).filter(([, rig]) => !rig.ok).map(([tier]) => `${tier} weapon rig contract violated: ${weaponRig[tier].reason}`),
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
    animations: [...animationNames],
    animationChannels: Object.fromEntries(animations.map((animation) => [animation.name, animation.channels?.length ?? 0])),
    animationChannelHealth,
    triangles: totalTriangles,
    lodTriangles,
    primitivesByLod,
    lodMeshNames,
    lodGeometry,
    lodRootConsistency,
    weaponRig,
    surface: { hasSkinAttributes: everyRenderablePrimitiveSkinned, primitivesMissingSkin, externalUris: externalUris.length, rootScaleUnit, collisionMeshes: collisionMeshes.map((node) => node.name) },
    hardCaps,
    identity,
    errors,
  };
}

let result;
try {
  const file = await readFile(resolve(root, assetPath));
  const { json, bin } = parseGlb(file);
  result = runValidation(json, bin, file.length);
} catch (error) {
  result = { status: "blocked", assetPath, errors: [String(error.message ?? error)] };
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === "passed" ? 0 : 1);
