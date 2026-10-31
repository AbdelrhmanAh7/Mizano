/**
 * Temporary test runner that bypasses broken pnpm WSL symlinks.
 * Directly uses absolute .pnpm store paths.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

const root = path.resolve(__dirname, '..', '..');
const pnpmStore = path.join(root, 'node_modules', '.pnpm');

// Collect every node_modules folder in the .pnpm store so all transitive deps resolve
const allNodeModules = new Set();
allNodeModules.add(path.join(__dirname, 'node_modules'));

try {
  for (const entry of fs.readdirSync(pnpmStore)) {
    const nmPath = path.join(pnpmStore, entry, 'node_modules');
    if (fs.existsSync(nmPath)) {
      allNodeModules.add(nmPath);
    }
  }
} catch (e) {
  console.error('Failed to scan pnpm store:', e.message);
}

const jestBin = path.join(root, 'node_modules', 'jest', 'bin', 'jest.js');

// Use the config file that has absolute ts-jest path
const configFile = path.join(__dirname, '_jest.config.js');

// Arguments go to jest as an argv array, never through a shell, so a --testPathPattern with a
// regex alternation (a|b) or other shell metacharacters reaches jest unchanged (audit C9).
const args = [jestBin, `--config=${configFile}`, ...process.argv.slice(2)];

console.log(`Using jest from: ${jestBin}`);

try {
  execFileSync(process.execPath, args, {
    stdio: 'inherit',
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_PATH: [...allNodeModules].join(path.delimiter),
    },
  });
} catch (e) {
  process.exit(e.status || 1);
}
