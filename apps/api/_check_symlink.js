const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const symlinkPath = path.join(
  root,
  'node_modules',
  '.pnpm',
  'source-map-support@0.5.13',
  'node_modules',
  'source-map',
);

console.log('Checking path:', symlinkPath);
try {
  const stat = fs.lstatSync(symlinkPath);
  console.log('lstat:', { isSymlink: stat.isSymbolicLink(), isDir: stat.isDirectory() });
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(symlinkPath);
    console.log('link target:', target);
    try {
      const resolved = fs.realpathSync(symlinkPath);
      console.log('realpath:', resolved);
      const pkgJson = require(path.join(resolved, 'package.json'));
      console.log('package name:', pkgJson.name, pkgJson.version);
    } catch (e) {
      console.error('realpath/require error:', e.message);
    }
  }
} catch (e) {
  console.error('lstat error:', e.message);
}
