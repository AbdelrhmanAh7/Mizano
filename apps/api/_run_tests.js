/**
 * Temporary test runner that bypasses broken pnpm WSL symlinks.
 * Directly uses absolute .pnpm store paths.
 */
const path = require('path');
const { execSync } = require('child_process');
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

const jestBin = path.join(
  pnpmStore,
  'jest@29.7.0_@types+node@20.19.31_ts-node@10.9.2',
  'node_modules',
  'jest',
  'bin',
  'jest.js',
);

// Use the config file that has absolute ts-jest path
const configFile = path.join(__dirname, '_jest.config.js');

const args = process.argv.slice(2);
const fullArgs = [`--config="${configFile}"`, ...args].join(' ');

console.log(`Using jest from: ${jestBin}`);

try {
  execSync(`node "${jestBin}" ${fullArgs}`, {
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
