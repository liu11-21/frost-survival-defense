import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const specs = [
  { key: "hero", path: "public/assets/models/characters/hero.glb", nodes: ["HeroRoot", "weapon_socket.R", "ranged_socket"], animations: ["Idle", "Walk", "Run", "MeleeAttack", "RangedAttack", "Hit", "Death"] },
  { key: "turret_basic", path: "public/assets/models/buildings/turret_basic.glb", nodes: ["TurretRoot", "yawPivot", "pitchPivot", "barrel", "muzzle", "recoilPart"], animations: ["Idle", "Aim", "Fire", "Recoil", "Reload"] },
  { key: "wall_gate", path: "public/assets/models/buildings/wall_gate.glb", nodes: ["WallGateRoot", "gateRoot", "gateDoorLeft", "gateDoorRight", "gateCollider", "friendlyPassTrigger"], animations: ["GateOpen", "GateClose", "Damaged", "Destroyed"] },
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
  const animations = new Set((json.animations ?? []).map((animation) => animation.name).filter(Boolean));
  const warnings = [];
  const missingNodes = spec.nodes.filter((name) => !names.has(name));
  const missingAnimations = spec.animations.filter((name) => !animations.has(name));
  const externalUris = [];
  for (const image of json.images ?? []) if (image.uri) externalUris.push(image.uri);
  for (const buffer of json.buffers ?? []) if (buffer.uri) externalUris.push(buffer.uri);
  if (externalUris.length) warnings.push(`External URIs found: ${externalUris.join(", ")}`);
  if ((json.cameras ?? []).length) warnings.push("Cameras are present in export.");
  if ((json.lights ?? []).length) warnings.push("Lights are present in export.");
  const collisionNodes = (json.nodes ?? []).filter((node) => {
    const name = String(node.name ?? "").toLowerCase();
    return name.includes("col_") || name.includes("collision") || name.includes("collider");
  });
  if (collisionNodes.some((node) => node.mesh !== undefined)) warnings.push("Collision nodes should not be renderable.");
  const triangles = (json.meshes ?? []).reduce((sum, mesh) => sum + (mesh.primitives ?? []).reduce((inner, primitive) => {
    const accessor = json.accessors?.[primitive.indices];
    return inner + (accessor ? Math.floor((accessor.count ?? 0) / 3) : 0);
  }, 0), 0);
  if (triangles > 60000) warnings.push(`Triangle budget exceeded: ${triangles}`);
  return {
    key: spec.key,
    status: missingNodes.length || missingAnimations.length || externalUris.length ? "invalid" : "ok",
    path: spec.path,
    nodes: (json.nodes ?? []).length,
    meshes: (json.meshes ?? []).length,
    materials: (json.materials ?? []).length,
    animations: [...animations],
    triangles,
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
    results.push({ key: spec.key, status: "blocked", path: spec.path, missingNodes: [], missingAnimations: [], warnings: [error.code === "ENOENT" ? "GLB not generated yet; install Blender and run npm run art:export." : String(error.message)] });
  }
}

const report = { generatedAt: new Date().toISOString(), blenderRequired: true, assets: results };
const output = resolve(root, "reports/art-validation.json");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
process.exit(results.some((result) => result.status === "invalid") ? 1 : 0);
