import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const docsDir = path.join(root, 'docs', 'ai-sync');
const reportsDir = path.join(root, 'reports');
const excluded = new Set(['.git', 'node_modules', 'dist', '.vite', 'coverage', '.cache', 'cache', 'temp', 'tmp', 'blender-cache', '__pycache__', 'screenshots', 'recordings', 'playtest-shots']);

const rel = (file) => path.relative(root, file).replaceAll(path.sep, '/');
const excludedPath = (file) => rel(file).split('/').some((part) => excluded.has(part));
function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (excludedPath(file)) continue;
    if (entry.isDirectory()) walk(file, result);
    else result.push(file);
  }
  return result;
}
function git(args) {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
  catch { return null; }
}
function localHead() {
  const headFile = path.join(root, '.git', 'HEAD');
  try {
    const head = fs.readFileSync(headFile, 'utf8').trim();
    if (!head.startsWith('ref: ')) return { branch: 'detached', commit: head };
    const ref = head.slice(5);
    const refFile = path.join(root, '.git', ...ref.split('/'));
    const commit = fs.existsSync(refFile) ? fs.readFileSync(refFile, 'utf8').trim() : '';
    return { branch: ref.split('/').at(-1) || 'unknown', commit };
  } catch { return { branch: 'unknown', commit: '' }; }
}
function localRemote() {
  try {
    const config = fs.readFileSync(path.join(root, '.git', 'config'), 'utf8');
    const match = config.match(/\[remote "origin"\][\s\S]*?url\s*=\s*(.+)/);
    return match ? 'origin\t' + match[1].trim() : null;
  } catch { return null; }
}
function json(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }
function write(file, value) {
  ensure(path.dirname(file));
  fs.writeFileSync(file, value.endsWith('\n') ? value : value + '\n', 'utf8');
}
function writeIfMissing(file, value) { if (!fs.existsSync(file)) write(file, value); }
function md(lines) { return lines.join('\n'); }

const files = walk(root);
const pkg = json(path.join(root, 'package.json'), { scripts: {} });
const validation = json(path.join(reportsDir, 'art-validation.json'), { assets: [] });
const validationAssets = Array.isArray(validation.assets) ? validation.assets : [];
const byPath = new Map(validationAssets.map((asset) => [asset.path, asset]));
const glbs = files.filter((file) => rel(file).startsWith('public/assets/models/') && file.endsWith('.glb'));
const blends = files.filter((file) => rel(file).startsWith('assets-source/blender/') && file.endsWith('.blend'));
const sourceFiles = files.filter((file) => /^(src|scripts)\//.test(rel(file)));
const glbInventory = glbs.map((file) => {
  const pathName = rel(file);
  const evidence = byPath.get(pathName) || {};
  return {
    path: pathName,
    bytes: fs.statSync(file).size,
    category: pathName.includes('/characters/') ? 'character' : pathName.includes('/buildings/') ? 'building' : 'environment',
    status: evidence.status || 'unvalidated',
    nodes: evidence.nodes ?? null,
    meshes: evidence.meshes ?? null,
    materials: evidence.materials ?? null,
    skeletons: evidence.skeletons ?? null,
    triangles: evidence.triangles ?? null,
    animations: evidence.animations || [],
  };
});
const blendInventory = blends.map((file) => ({ path: rel(file), bytes: fs.statSync(file).size }));
const head = localHead();
const branch = git(['branch', '--show-current']) || head.branch;
const commit = git(['log', '-1', '--format=%H']) || head.commit;
const recent = git(['log', '-8', '--format=%h %s']) || 'Git log unavailable in this managed Node session (spawnSync EPERM).';
const remote = git(['remote', '-v']) || localRemote();
const status = git(['status', '--short']);
const statusKnown = status !== null;
const diffStat = git(['diff', '--stat']) || 'Git diff unavailable in this managed Node session (spawnSync EPERM).';
const okCount = validationAssets.filter((asset) => asset.status === 'ok').length;

const featureInventory = {
  generatedAt: new Date().toISOString(),
  sourceOfTruth: ['src/', 'package.json', 'reports/art-validation.json'],
  features: [
    ['modes', 'Stage and Endless modes', 'src/modes/'],
    ['furnace', 'Furnace progression and self-repair', 'src/heat/'],
    ['combat', 'Hero, ally, enemy and facility combat', 'src/combat/'],
    ['ai', 'Targeting, navigation, watchdog and repair AI', 'src/ai/'],
    ['construction', 'Build, demolish and rebuild flow', 'src/buildings/'],
    ['economy', 'Wood, stone, gold and production facilities', 'src/economy/'],
    ['skills', 'Hero skills and combat feedback', 'src/hero/'],
    ['authored-assets', 'Blender GLB pipeline with procedural fallback', 'scripts/blender/'],
    ['qa', 'TypeScript, build, playtest and model validation tooling', 'tools/'],
  ].map(([id, name, file]) => ({ id, name, status: 'implemented', files: [file] })),
};
const assetInventory = {
  generatedAt: new Date().toISOString(),
  glbSummary: {
    total: glbInventory.length,
    characters: glbInventory.filter((item) => item.category === 'character').length,
    buildings: glbInventory.filter((item) => item.category === 'building').length,
    environment: glbInventory.filter((item) => item.category === 'environment').length,
    validatedOk: okCount,
  },
  glbs: glbInventory,
  blenderSources: { total: blendInventory.length, files: blendInventory },
  fallback: 'Babylon keeps the procedural renderer available when an authored GLB is missing or fails its asset contract.',
  qualityBoundary: 'Static validation proves the GLB contract; it does not constitute final commercial-art sign-off.',
};

ensure(docsDir);
write(path.join(docsDir, 'FEATURE_INVENTORY.json'), JSON.stringify(featureInventory, null, 2));
write(path.join(docsDir, 'ASSET_INVENTORY.json'), JSON.stringify(assetInventory, null, 2));
write(path.join(docsDir, 'PROJECT_OVERVIEW.md'), md([
  '# Frostbound Furnace', '',
  'Frostbound Furnace is a Vite + TypeScript + Babylon.js tower-defence / survival game. The player protects a central furnace, gathers wood and stone, builds facilities, recruits squads, and survives staged or endless waves.', '',
  '## Current repository snapshot', '',
  '- Branch: ' + branch,
  '- Commit: ' + (commit || 'uncommitted'),
  '- Authored GLBs: ' + glbInventory.length + ' (' + assetInventory.glbSummary.characters + ' characters, ' + assetInventory.glbSummary.buildings + ' buildings, ' + assetInventory.glbSummary.environment + ' environment props)',
  '- Blender source files: ' + blendInventory.length,
  '- Static asset validation: ' + okCount + '/' + validationAssets.length + ' currently ok',
  '- Runtime fallback: procedural Babylon meshes remain available when an authored asset cannot be loaded.', '',
  'See ARCHITECTURE.md, ASSET_INVENTORY.json, and CURRENT_STATUS.md for details.',
]));
write(path.join(docsDir, 'ARCHITECTURE.md'), md([
  '# Architecture', '', '## Runtime layers', '',
  '1. src/game/ owns game flow, input, modes and system orchestration.',
  '2. src/combat/, src/ai/, src/enemies/ and src/hero/ own combat state, targeting, navigation and skills.',
  '3. src/buildings/, src/construction/, src/economy/ and src/heat/ own the furnace, facilities and resources.',
  '4. src/assets/ validates and loads GLB assets; src/character/ and src/buildings/BuildingMeshFactory.ts provide procedural fallback visuals.',
  '5. src/ui/ and src/styles.css render HUD, menus, codex and diagnostics.', '',
  '## Asset flow', '',
  'Blender Python builders in scripts/blender/ write source blends under assets-source/blender/ and GLBs under public/assets/models/. The asset registry checks paths, nodes, animation names and bounds before instantiation. A failed authored asset never removes the playable fallback path.', '',
  '## Verification', '',
  '- npm run typecheck runs TypeScript without emitting files.',
  '- npm run build runs typecheck and Vite production bundling.',
  '- npm run art:validate writes reports/art-validation.json.',
  '- npm run ai:sync refreshes this directory and the lightweight reports.',
]));
write(path.join(docsDir, 'SYSTEM_MAP.md'), md([
  '# System map', '', 'Game -> GameSystems -> combat / AI / buildings / economy / heat / UI', '',
  '- Input: src/game/GameInput.ts, src/player/PlayerInput.ts, src/input/PointerRouter.ts',
  '- World: src/scene/SceneFactory.ts, src/scene/ArenaBuilder.ts, src/camera/GameCamera.ts',
  '- Combat: CombatDirector -> units, squads, projectiles, facilities and damageable targets',
  '- AI: state machines + threat tracking + target validation + navigation + watchdog',
  '- Assets: manifest -> registry -> Babylon loader -> authored GLB or procedural fallback',
  '- UI: HUD -> menus / codex / panels / diagnostics',
  '- Persistence: local leaderboard and run settings under src/modes/ and src/game/',
]));
write(path.join(docsDir, 'CURRENT_STATUS.md'), md([
  '# Current status', '', 'Generated at ' + new Date().toISOString() + '.', '',
  '- Working tree at generation: ' + (statusKnown ? (status ? 'has local changes' : 'clean') : 'unavailable; verify with git status'),
  '- Latest commit: ' + (commit || 'none'),
  '- Branch: ' + branch,
  '- Remote configuration: ' + (remote ? 'present' : 'not configured'),
  '- Authored model evidence: ' + okCount + '/' + validationAssets.length + ' assets pass the static validator.',
  '- TypeScript/build evidence must be refreshed after source changes; this file records repository state, not a substitute for those commands.',
  '- Commercial-art sign-off remains separate from structural GLB validation; see reports/art-quality-audit.md.',
]));
write(path.join(docsDir, 'KNOWN_ISSUES.md'), md([
  '# Known issues and boundaries', '',
  '- The authored library is stylized procedural low-poly work and still needs human commercial-art direction for topology, PBR maps and bespoke acting.',
  '- The runtime intentionally keeps procedural visual fallback; static validation does not prove every authored instance is visible in every gameplay state.',
  '- The Vite bundle currently emits an existing large-chunk advisory.',
  '- Blender source files are tracked for reproducibility; future edits to the listed source-media extensions use Git LFS. Existing local history is not rewritten during repository setup.',
  '- Never commit .env, credentials, browser cookies, local captures or generated dist/.',
]));
write(path.join(docsDir, 'RECENT_CHANGES.md'), md(['# Recent changes', '', recent || 'No commits recorded.', '', '## Working-tree diff at sync time', '', diffStat || 'No unstaged diff.']));
writeIfMissing(path.join(docsDir, 'DECISIONS.md'), md([
  '# Decisions', '',
  '- Keep Babylon procedural visuals as a fail-safe while authored GLBs are validated independently.',
  '- Preserve existing Git history; repository setup must not rewrite or force-push it.',
  '- Keep the GitHub repository private and never store secrets in source control.',
  '- Use Git LFS for future changes to editable source-media extensions without forcing a history rewrite during initial synchronization.',
]));
write(path.join(docsDir, 'GITHUB_SYNC_WORKFLOW.md'), md([
  '# GitHub sync workflow', '',
  'This repository is intended to remain private. After a major change:', '',
  'npm run ai:sync', 'git status', 'git add <related files>', 'git commit -m "<clear conventional message>"', 'git push', '',
  'Before pushing, verify that .env, node_modules/, dist/, local captures and caches are ignored. Never force-push main by default. Do not paste GitHub tokens into chat or source files.', '',
  'Commit prefixes: feat:, fix:, refactor:, art:, perf:, docs:, test:, chore:',
]));

ensure(reportsDir);
write(path.join(reportsDir, 'project-tree.txt'), files.filter((file) => !rel(file).startsWith('reports/')).sort().map(rel).join('\n'));
write(path.join(reportsDir, 'recent-diff.patch'), git(['diff', 'HEAD~1', 'HEAD', '--']) || 'Git diff unavailable in this managed Node session (spawnSync EPERM).');
write(path.join(reportsDir, 'ai-sync-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), branch, commit, remoteConfigured: Boolean(remote), glbs: glbInventory.length, blendSources: blendInventory.length, validationOk: okCount, validationTotal: validationAssets.length, sourceFiles: sourceFiles.length, workingTreeClean: statusKnown ? !status : null, gitStatusAvailable: statusKnown }, null, 2));
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), branch, commit, glbs: glbInventory.length, blendSources: blendInventory.length, validation: okCount + '/' + validationAssets.length, sourceFiles: sourceFiles.length, workingTreeClean: statusKnown ? !status : null, gitStatusAvailable: statusKnown }, null, 2));
