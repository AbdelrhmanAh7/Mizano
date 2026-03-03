/**
 * Windows-compatible lint-staged replacement.
 * Bypasses broken pnpm WSL symlinks by reading symlink targets via bash
 * (which can follow WSL reparse points) to build a correct NODE_PATH.
 *
 * In pnpm's virtual store layout:
 *   .pnpm/pkg@version/node_modules/
 *     pkg/          <- actual package files
 *     dep-a/        <- symlink to dep-a's store entry
 *     @scope/
 *       dep-b/      <- symlink to scoped dep's store entry
 *
 * So deps live as SIBLINGS of the package, in the same node_modules.
 */
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');

const root = path.resolve(__dirname);
const pnpmStore = path.join(root, 'node_modules', '.pnpm');

/** lstat-based accessible check (existsSync fails for WSL reparse points). */
function accessible(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Use bash's ls to read symlinks in a node_modules directory.
 * Returns array of { name, resolvedPkgPath, nodeModulesDir }
 */
function readSymlinksViaBash(nmDir) {
  const result = [];
  try {
    const out = execSync(`ls -la "${nmDir}" 2>/dev/null | grep "^l"`, {
      shell: 'bash', encoding: 'utf8', cwd: root,
    });
    for (const line of out.split('\n')) {
      const arrowIdx = line.indexOf(' -> ');
      if (arrowIdx === -1) continue;
      const target = line.slice(arrowIdx + 4).trim();
      const beforeArrow = line.slice(0, arrowIdx).trim();
      const name = beforeArrow.split(/\s+/).pop();
      if (!name) continue;
      // Resolve the symlink target relative to nmDir
      const resolvedPkg = path.resolve(nmDir, target);
      // The node_modules dir containing this package
      let nodeModulesDir = path.dirname(resolvedPkg);
      if (path.basename(nodeModulesDir).startsWith('@')) {
        nodeModulesDir = path.dirname(nodeModulesDir);
      }
      result.push({ name, resolvedPkg, nodeModulesDir });
    }
  } catch (_e) { /* bash unavailable or no symlinks */ }
  return result;
}

/**
 * Recursively collect all node_modules dirs needed by starting from a
 * package's deps node_modules directory (the sibling dir in pnpm store).
 */
function collectDepsNM(depsNmDir, result, visited) {
  if (visited.has(depsNmDir)) return;
  visited.add(depsNmDir);

  // Add this node_modules to NODE_PATH
  result.add(depsNmDir);

  // Read symlinks (direct deps) in this node_modules
  const symlinks = readSymlinksViaBash(depsNmDir);
  for (const { resolvedPkg, nodeModulesDir } of symlinks) {
    result.add(nodeModulesDir);
    // Recurse into the dep's own pnpm store node_modules
    collectDepsNM(nodeModulesDir, result, visited);
  }

  // Handle scoped package dirs (@scope/)
  let entries = [];
  try { entries = fs.readdirSync(depsNmDir); } catch (_e) {}
  for (const entry of entries) {
    if (!entry.startsWith('@')) continue;
    const scopedDir = path.join(depsNmDir, entry);
    const scopedSymlinks = readSymlinksViaBash(scopedDir);
    for (const { resolvedPkg, nodeModulesDir } of scopedSymlinks) {
      result.add(nodeModulesDir);
      collectDepsNM(nodeModulesDir, result, visited);
    }
  }
}

// Locate tool binaries
const eslintBin = path.join(
  pnpmStore, 'eslint@8.57.1', 'node_modules', 'eslint', 'bin', 'eslint.js');
const prettierBin = path.join(
  pnpmStore, 'prettier@3.8.1', 'node_modules', 'prettier', 'bin', 'prettier.cjs');

if (!accessible(eslintBin)) { console.error('ESLint not found:', eslintBin); process.exit(1); }
if (!accessible(prettierBin)) { console.error('Prettier not found:', prettierBin); process.exit(1); }

console.log('[lint-staged] Resolving pnpm dependencies via bash...');

const nodePaths = new Set();
const visited = new Set();

// Seed from ESLint + all needed plugins. The symlink traversal resolves correct versions.
// We then filter out packages that conflict (cross-spawn@5 uses lru-cache@4 which breaks).
const seedNMDirs = [
  path.join(pnpmStore, 'eslint@8.57.1', 'node_modules'),
  path.join(pnpmStore, '@eslint+eslintrc@2.1.4', 'node_modules'),
  // TypeScript ESLint plugin v6 (API uses @typescript-eslint/eslint-plugin v6)
  path.join(pnpmStore,
    '@typescript-eslint+eslint-plugin@6.21.0_@typescript-eslint+parser@6.21.0_eslint@8.57.1_typescript@5.9.3',
    'node_modules'),
  path.join(pnpmStore,
    '@typescript-eslint+parser@6.21.0_eslint@8.57.1_typescript@5.9.3',
    'node_modules'),
  // TypeScript ESLint v7 (web)
  path.join(pnpmStore,
    '@typescript-eslint+eslint-plugin@7.18.0_@typescript-eslint+parser@7.18.0_eslint@8.57.1_typescript@5.9.3',
    'node_modules'),
  path.join(pnpmStore,
    '@typescript-eslint+parser@7.18.0_eslint@8.57.1_typescript@5.9.3',
    'node_modules'),
  // Next.js ESLint config (web extends next/core-web-vitals)
  path.join(pnpmStore,
    'eslint-config-next@14.2.35_eslint@8.57.1_typescript@5.9.3',
    'node_modules'),
  // Prettier ESLint plugin (API extends plugin:prettier/recommended)
  path.join(pnpmStore,
    'eslint-plugin-prettier@5.5.5_eslint-config-prettier@9.1.2_eslint@8.57.1_prettier@3.8.1',
    'node_modules'),
  path.join(pnpmStore,
    'eslint-config-prettier@9.1.2_eslint@8.57.1',
    'node_modules'),
];

// Always include these
nodePaths.add(path.join(root, 'node_modules'));
nodePaths.add(path.join(pnpmStore, 'node_modules'));
nodePaths.add(path.join(root, 'apps', 'api', 'node_modules'));
nodePaths.add(path.join(root, 'apps', 'web', 'node_modules'));

for (const nmDir of seedNMDirs) {
  if (accessible(nmDir)) {
    collectDepsNM(nmDir, nodePaths, visited);
  }
}

// Filter out old package versions that conflict with ESLint@8's deps.
// ESLint@8 uses cross-spawn@7; cross-spawn@5 uses lru-cache@4 (API changed in v7).
const EXCLUDE_STORE_PKGS = ['cross-spawn@5.', 'cross-spawn@6.'];
const filteredPaths = [...nodePaths].filter(
  (p) => !EXCLUDE_STORE_PKGS.some((x) => p.includes(x)),
);

console.log(`[lint-staged] Built NODE_PATH with ${filteredPaths.length} entries.`);
const nodePath = filteredPaths.join(path.delimiter);

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8', cwd: root,
  }).trim();
  stagedFiles = output.split('\n').map((f) => f.trim()).filter(Boolean);
} catch (e) {
  console.error('Failed to get staged files:', e.message);
  process.exit(1);
}

if (stagedFiles.length === 0) {
  console.log('No staged files to lint.');
  process.exit(0);
}

const apiTsFiles = stagedFiles
  .filter((f) => f.startsWith('apps/api/') && f.endsWith('.ts'))
  .map((f) => path.join(root, f));

const webTsFiles = stagedFiles
  .filter((f) => f.startsWith('apps/web/') && (f.endsWith('.ts') || f.endsWith('.tsx')))
  .map((f) => path.join(root, f));

const pkgTsFiles = stagedFiles
  .filter((f) => f.startsWith('packages/') && f.endsWith('.ts'))
  .map((f) => path.join(root, f));

const jsonMdFiles = stagedFiles
  .filter((f) => f.endsWith('.json') || f.endsWith('.md'))
  .map((f) => path.join(root, f));

const env = { ...process.env, NODE_PATH: nodePath };

function runTool(label, bin, args, cwd) {
  console.log(`[lint-staged] ${label}...`);
  const result = spawnSync('node', [bin, ...args], {
    stdio: 'inherit', env, cwd: cwd || root,
  });
  if (result.error) { console.error(`Failed to run ${label}:`, result.error.message); return false; }
  return result.status === 0;
}

let hasErrors = false;

if (apiTsFiles.length > 0) {
  console.log(`\nLinting ${apiTsFiles.length} API TypeScript file(s)...`);
  const ok = runTool('eslint --fix (api)', eslintBin,
    ['--fix', '--cache', '--no-error-on-unmatched-pattern', ...apiTsFiles],
    path.join(root, 'apps', 'api'));
  if (!ok) hasErrors = true;
  runTool('prettier --write (api ts)', prettierBin, ['--write', ...apiTsFiles], root);
}

if (webTsFiles.length > 0) {
  console.log(`\nLinting ${webTsFiles.length} Web TypeScript file(s)...`);
  const ok = runTool('eslint --fix (web)', eslintBin,
    ['--fix', '--cache', '--no-error-on-unmatched-pattern', ...webTsFiles],
    path.join(root, 'apps', 'web'));
  if (!ok) hasErrors = true;
  runTool('prettier --write (web ts)', prettierBin, ['--write', ...webTsFiles], root);
}

if (pkgTsFiles.length > 0) {
  console.log(`\nFormatting ${pkgTsFiles.length} package TypeScript file(s)...`);
  runTool('prettier --write (packages)', prettierBin, ['--write', ...pkgTsFiles], root);
}

if (jsonMdFiles.length > 0) {
  console.log(`\nFormatting ${jsonMdFiles.length} JSON/MD file(s)...`);
  runTool('prettier --write (json/md)', prettierBin, ['--write', ...jsonMdFiles], root);
}

// Re-stage modified files
const allFiles = [...apiTsFiles, ...webTsFiles, ...pkgTsFiles, ...jsonMdFiles];
if (allFiles.length > 0) {
  try {
    for (let i = 0; i < allFiles.length; i += 50) {
      const batch = allFiles.slice(i, i + 50);
      execSync(`git add ${batch.map((f) => `"${f}"`).join(' ')}`, { cwd: root, stdio: 'pipe' });
    }
  } catch (_e) { /* non-fatal */ }
}

if (!hasErrors) {
  console.log('\n[lint-staged] All checks passed.');
  process.exit(0);
} else {
  console.error('\n[lint-staged] ESLint found errors. Please fix them manually.');
  process.exit(1);
}
