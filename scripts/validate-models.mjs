import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const UNIT_KEYS = [
  "warrior", "shield", "archer", "medic", "flagbearer", "mage", "assault", "engineer", "musketeer", "frostmage",
  "grunt", "slinger", "bruiser", "marksman", "juggernaut", "bombardier", "boss", "breacher", "icearmor", "commander", "bomber",
  "flyingMelee", "flyingEliteArcher", "flyingBomber", "flyingColossus",
];
const ECONOMY_KEYS = ["mine", "gold_mine", "lumberyard", "warehouse", "recruit_hall", "auto_collector", "auto_rebuilder"];
const ATTACK_KEYS = ["crossbow_tower", "frost_tower", "sniper_tower", "mortar"];
const specs = [
  { key: "hero", path: "public/assets/models/characters/hero.glb", nodes: ["HeroRoot", "HeroSkeleton", "weapon_socket.R", "ranged_socket", "LOD1", "LOD2"], animations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"], skeletons: 1 },
  { key: "turret_basic", path: "public/assets/models/buildings/turret_basic.glb", nodes: ["TurretRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"], animations: ["Idle", "Aim", "Fire", "Recoil", "Reload"] },
  { key: "wall_gate", path: "public/assets/models/buildings/wall_gate.glb", nodes: ["WallGateRoot", "gateRoot", "gateDoorLeft", "gateDoorRight", "gateCollider", "friendlyPassTrigger", "LOD1", "LOD2"], animations: ["GateOpen", "GateClose", "Damaged", "Destroyed"] },
  ...UNIT_KEYS.map((key) => ({
    key,
    path: `public/assets/models/characters/${key}.glb`,
    nodes: ["UnitRoot", "UnitSkeleton", "weapon_socket", "attackAnchor", "LOD1", "LOD2"],
    animations: ["Idle", "Walk", "Attack", "Cast", "Hit", "Death"],
    skeletons: 1,
  })),
  ...ECONOMY_KEYS.map((key) => ({
    key,
    path: `public/assets/models/buildings/${key}.glb`,
    nodes: ["BuildingRoot", "productionCore", "workPart", "LOD1", "LOD2"],
    animations: ["Idle", "Operate", "Damaged", "Destroyed"],
  })),
  ...ATTACK_KEYS.map((key) => ({
    key,
    path: `public/assets/models/buildings/${key}.glb`,
    nodes: ["BuildingRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart", "LOD1", "LOD2"],
    animations: ["Idle", "Aim", "Fire", "Recoil", "Damaged", "Destroyed"],
  })),
  {
    key: "furnace",
    path: "public/assets/models/buildings/furnace.glb",
    nodes: ["FurnaceRoot", "heatCore", "furnaceCrown", "emitter", "LOD1", "LOD2"],
    animations: ["Idle", "Operate", "Damaged", "Destroyed"],
  },
  {
    key: "resource_tree",
    path: "public/assets/models/environment/resource_tree.glb",
    nodes: ["ResourceTreeRoot", "resource_trunk", "resource_canopy0", "resource_canopy1", "resource_canopy2", "resource_snow0", "resource_snow1", "resource_snow2", "resource_stump", "LOD1", "LOD2"],
    animations: [],
  },
  {
    key: "resource_rock",
    path: "public/assets/models/environment/resource_rock.glb",
    nodes: ["ResourceRockRoot", "resource_rock_base", "resource_rock_face", "resource_rock_snow", "resource_ore0", "resource_ore1", "resource_ore2", "resource_rubble", "LOD1", "LOD2"],
    animations: [],
  },
];

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

function validate(spec, glb) {
  const { json } = parseGlb(glb);
  const names = new Set((json.nodes ?? []).map((node) => node.name).filter(Boolean));
  const lodProxyNodes = (json.nodes ?? []).filter((node) => {
    const name = String(node.name ?? "");
    return (name.startsWith("LOD1_PROXY") || name.startsWith("LOD2_PROXY")) && node.mesh !== undefined;
  });
  const lodProxies = {
    LOD1: lodProxyNodes.filter((node) => String(node.name).startsWith("LOD1_PROXY")).length,
    LOD2: lodProxyNodes.filter((node) => String(node.name).startsWith("LOD2_PROXY")).length,
  };
  const animationRecords = (json.animations ?? []).filter((animation) => animation.name);
  const animations = new Set(animationRecords.map((animation) => animation.name));
  const warnings = [];
  const missingNodes = spec.nodes.filter((name) => !names.has(name));
  const missingAnimations = spec.animations.filter((name) => !animations.has(name));
  const skeletonCount = (json.skins ?? []).length;
  const externalUris = [];
  for (const image of json.images ?? []) if (image.uri) externalUris.push(image.uri);
  for (const buffer of json.buffers ?? []) if (buffer.uri) externalUris.push(buffer.uri);
  const triangles = (json.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives ?? []).reduce((inner, primitive) => {
    const accessor = json.accessors?.[primitive.indices];
    return inner + (accessor ? Math.floor((accessor.count ?? 0) / 3) : 0);
  }, 0), 0);
  const renderPrimitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const hasUv0 = renderPrimitives.some((primitive) => primitive.attributes?.TEXCOORD_0 !== undefined);
  const hasColor0 = renderPrimitives.some((primitive) => primitive.attributes?.COLOR_0 !== undefined);
  if (externalUris.length) warnings.push(`External URIs found: ${externalUris.join(", ")}`);
  if ((json.cameras ?? []).length) warnings.push("Cameras are present in export.");
  if ((json.lights ?? []).length) warnings.push("Lights are present in export.");
  if (skeletonCount < (spec.skeletons ?? 0)) warnings.push(`Skeleton requirement not met: ${skeletonCount}`);
  if (animationRecords.some((animation) => !(animation.channels?.length))) warnings.push("Animation clip has no channels.");
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(JSON.stringify(json))) warnings.push("Absolute filesystem path found in GLB metadata.");
  if ((json.meshes ?? []).length < 2 || triangles < 24) warnings.push("Asset is too small to be a finished authored model.");
  if (!hasUv0) warnings.push("Authored UV channel TEXCOORD_0 is missing.");
  if (!hasColor0) warnings.push("Authored surface paint COLOR_0 is missing.");
  if (lodProxies.LOD1 < 1 || lodProxies.LOD2 < 1) warnings.push("LOD1/LOD2 proxy geometry is missing.");
  const collisionNodes = (json.nodes ?? []).filter((node) => {
    const name = String(node.name ?? "").toLowerCase();
    return name.includes("col_") || name.includes("collision") || name.includes("collider");
  });
  if (collisionNodes.some((node) => node.mesh !== undefined)) warnings.push("Collision nodes should not be renderable.");
  const parentNodes = new Set((json.nodes ?? []).flatMap((node) => node.children ?? []));
  const rootTransforms = (json.nodes ?? []).map((node, index) => ({
    index,
    name: node.name ?? `node.${index}`,
    translation: node.translation ?? [0, 0, 0],
    scale: node.scale ?? [1, 1, 1],
  })).filter((node) => !parentNodes.has(node.index));
  if (rootTransforms.some((node) => node.scale.some((value) => Math.abs(value - 1) > 0.001))) warnings.push("Root transform has non-unit scale.");
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessor = json.accessors?.[primitive.attributes?.POSITION];
    if (!accessor?.min || !accessor?.max) continue;
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], accessor.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], accessor.max[axis]);
    }
  }
  if (triangles > 60000) warnings.push(`Triangle budget exceeded: ${triangles}`);
  return {
    key: spec.key,
    status: missingNodes.length || missingAnimations.length || externalUris.length || skeletonCount < (spec.skeletons ?? 0) || lodProxies.LOD1 < 1 || lodProxies.LOD2 < 1 || !hasUv0 || !hasColor0 || warnings.some((warning) => warning.includes("Absolute filesystem") || warning.includes("too small")) ? "invalid" : "ok",
    path: spec.path,
    nodes: (json.nodes ?? []).length,
    meshes: (json.meshes ?? []).length,
    materials: (json.materials ?? []).length,
    skeletons: skeletonCount,
    rootTransforms,
    bounds: bounds.min[0] === Infinity ? null : bounds,
    animations: [...animations],
    animationChannels: Object.fromEntries(animationRecords.map((animation) => [animation.name, animation.channels?.length ?? 0])),
    triangles,
    surfaceAttributes: { TEXCOORD_0: hasUv0, COLOR_0: hasColor0 },
    lodProxies,
    missingNodes,
    missingAnimations,
    warnings,
  };
}

const results = [];
for (const spec of specs) {
  const path = resolve(root, spec.path);
  try {
    await stat(path);
    results.push(validate(spec, await readFile(path)));
  } catch (error) {
    results.push({ key: spec.key, status: "blocked", path: spec.path, missingNodes: [], missingAnimations: [], skeletons: 0, warnings: [error.code === "ENOENT" ? "GLB not generated yet; install Blender and run npm run art:export." : String(error.message)] });
  }
}

const report = { generatedAt: new Date().toISOString(), blenderRequired: true, assets: results };
const output = resolve(root, "reports/art-validation.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(results.some((result) => result.status === "invalid") ? 1 : 0);
