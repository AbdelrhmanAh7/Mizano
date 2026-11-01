#!/usr/bin/env node
// Docker build guard: the API image ships production dependencies only. Fail the build when the
// compiled code requires a package that is no longer installed, instead of at the first request.
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const root = path.resolve(__dirname, '..');
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const requireCall = /\brequire\(\s*["']([^"'./][^"']*)["']\s*\)/g;

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const missing = new Map();
for (const file of jsFiles(path.join(root, 'dist'))) {
  for (const [, specifier] of fs.readFileSync(file, 'utf8').matchAll(requireCall)) {
    if (builtins.has(specifier) || builtins.has(specifier.split('/')[0])) continue;
    const name = packageName(specifier);
    try {
      require.resolve(`${name}/package.json`, { paths: [path.dirname(file)] });
    } catch {
      try {
        require.resolve(specifier, { paths: [path.dirname(file)] });
      } catch {
        missing.set(name, path.relative(root, file));
      }
    }
  }
}

if (missing.size > 0) {
  for (const [name, file] of missing) process.stderr.write(`missing runtime package ${name} (${file})\n`);
  process.exit(1);
}
process.stdout.write('runtime packages: all resolved\n');
