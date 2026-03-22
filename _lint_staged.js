/**
 * Windows-compatible lint-staged replacement.
 * Works with pnpm hoisted node_modules (node-linker=hoisted).
 * All packages are at root node_modules/ so no symlink resolution needed.
 */
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const root = path.resolve(__dirname);
const eslintBin = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const prettierBin = path.join(root, 'node_modules', 'prettier', 'bin', 'prettier.cjs');

try {
  require('fs').accessSync(eslintBin);
} catch (_e) {
  console.error('ESLint not found:', eslintBin);
  process.exit(1);
}
try {
  require('fs').accessSync(prettierBin);
} catch (_e) {
  console.error('Prettier not found:', prettierBin);
  process.exit(1);
}

// Get staged files
let stagedFiles = [];
try {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    encoding: 'utf8',
    cwd: root,
  }).trim();
  stagedFiles = output
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
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

const jsonMdCssFiles = stagedFiles
  .filter((f) => f.endsWith('.json') || f.endsWith('.md') || f.endsWith('.css'))
  .map((f) => path.join(root, f));

function runTool(label, bin, args, cwd) {
  console.log(`[lint-staged] ${label}...`);
  const result = spawnSync('node', [bin, ...args], {
    stdio: 'inherit',
    cwd: cwd || root,
  });
  if (result.error) {
    console.error(`Failed to run ${label}:`, result.error.message);
    return false;
  }
  return result.status === 0;
}

let hasErrors = false;

if (apiTsFiles.length > 0) {
  console.log(`\nLinting ${apiTsFiles.length} API TypeScript file(s)...`);
  const ok = runTool(
    'eslint --fix (api)',
    eslintBin,
    ['--fix', '--cache', '--no-error-on-unmatched-pattern', ...apiTsFiles],
    path.join(root, 'apps', 'api'),
  );
  if (!ok) hasErrors = true;
  runTool('prettier --write (api ts)', prettierBin, ['--write', ...apiTsFiles], root);
}

if (webTsFiles.length > 0) {
  console.log(`\nLinting ${webTsFiles.length} Web TypeScript file(s)...`);
  const ok = runTool(
    'eslint --fix (web)',
    eslintBin,
    ['--fix', '--cache', '--no-error-on-unmatched-pattern', ...webTsFiles],
    path.join(root, 'apps', 'web'),
  );
  if (!ok) hasErrors = true;
  runTool('prettier --write (web ts)', prettierBin, ['--write', ...webTsFiles], root);
}

if (pkgTsFiles.length > 0) {
  console.log(`\nLinting ${pkgTsFiles.length} package TypeScript file(s)...`);
  const ok = runTool(
    'eslint --fix (packages)',
    eslintBin,
    ['--fix', '--cache', '--no-error-on-unmatched-pattern', ...pkgTsFiles],
    root,
  );
  if (!ok) hasErrors = true;
  runTool('prettier --write (packages)', prettierBin, ['--write', ...pkgTsFiles], root);
}

if (jsonMdCssFiles.length > 0) {
  console.log(`\nFormatting ${jsonMdCssFiles.length} JSON/MD/CSS file(s)...`);
  runTool('prettier --write (json/md/css)', prettierBin, ['--write', ...jsonMdCssFiles], root);
}

// Re-stage modified files
const allFiles = [...apiTsFiles, ...webTsFiles, ...pkgTsFiles, ...jsonMdCssFiles];
if (allFiles.length > 0) {
  try {
    for (let i = 0; i < allFiles.length; i += 50) {
      const batch = allFiles.slice(i, i + 50);
      execSync(`git add ${batch.map((f) => `"${f}"`).join(' ')}`, { cwd: root, stdio: 'pipe' });
    }
  } catch (_e) {
    /* non-fatal */
  }
}

if (!hasErrors) {
  console.log('\n[lint-staged] All checks passed.');
  process.exit(0);
} else {
  console.error('\n[lint-staged] ESLint found errors. Please fix them manually.');
  process.exit(1);
}
