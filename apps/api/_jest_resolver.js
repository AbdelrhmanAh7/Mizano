/**
 * Custom jest resolver that bypasses broken WSL-created pnpm symlinks.
 * Handles package.json `exports` field for subpath resolution.
 */
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..', '..');
const pnpmStore = path.join(root, 'node_modules', '.pnpm');
const dirCache = new Map();

// Returns all accessible package dirs for a given package name
function findAllPkgDirs(pkgName) {
  const cacheKey = '__all__' + pkgName;
  if (dirCache.has(cacheKey)) return dirCache.get(cacheKey);
  try {
    const prefix = pkgName.startsWith('@')
      ? pkgName.replace('/', '+') + '@'
      : pkgName + '@';
    const entries = fs.readdirSync(pnpmStore);
    const matches = entries.filter((e) => e.startsWith(prefix));
    const dirs = [];
    for (const m of matches) {
      const d = path.join(pnpmStore, m, 'node_modules', pkgName);
      try { fs.readdirSync(d); dirs.push(d); } catch {}
    }
    dirCache.set(cacheKey, dirs);
    return dirs;
  } catch { dirCache.set('__all__' + pkgName, []); return []; }
}

function findPkgDir(pkgName) {
  if (dirCache.has(pkgName)) return dirCache.get(pkgName);
  const dirs = findAllPkgDirs(pkgName);
  const result = dirs[0] || null;
  dirCache.set(pkgName, result);
  return result;
}

function tryExts(base) {
  for (const ext of ['.js', '.cjs', '.json', '/index.js', '/index.cjs', '/index.json']) {
    try { const s = fs.statSync(base + ext); if (s.isFile()) return base + ext; } catch {}
  }
  return null;
}

function resolveExportsField(pkg, subpath, pkgDir) {
  if (!pkg.exports) return null;
  // subpath is like 'operators' → look for './operators'
  const key = subpath ? './' + subpath : '.';
  const exp = pkg.exports[key];
  if (!exp) return null;

  // exp can be a string or an object with conditions
  let resolved = null;
  if (typeof exp === 'string') {
    resolved = exp;
  } else if (typeof exp === 'object') {
    // Prefer: require > node > default (CommonJS context)
    resolved = exp.require || exp.node || exp.default || exp.main;
    if (typeof resolved === 'object') {
      resolved = resolved.require || resolved.node || resolved.default;
    }
  }
  if (!resolved || typeof resolved !== 'string') return null;
  const full = path.join(pkgDir, resolved);
  try { const s = fs.statSync(full); if (s.isFile()) return full; } catch {}
  return tryExts(full);
}

function resolveFile(pkgDir, subpath) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));

    // Try exports field first (for subpaths like 'operators')
    if (subpath || pkg.exports) {
      const fromExports = resolveExportsField(pkg, subpath, pkgDir);
      if (fromExports) return fromExports;
    }

    if (subpath) {
      const full = path.join(pkgDir, subpath);
      try { const s = fs.statSync(full); if (s.isFile()) return full; } catch {}
      return tryExts(full) || tryExts(path.join(full, 'index'));
    }

    // No subpath — use package.json main
    const main = pkg.main || 'index';
    const mainPath = path.join(pkgDir, main);
    try { const s = fs.statSync(mainPath); if (s.isFile()) return mainPath; } catch {}
    return tryExts(mainPath) || tryExts(path.join(pkgDir, 'index'));
  } catch {
    if (subpath) {
      const full = path.join(pkgDir, subpath);
      return tryExts(full) || tryExts(path.join(full, 'index'));
    }
    return tryExts(path.join(pkgDir, 'index'));
  }
}

module.exports = (request, options) => {
  try {
    return options.defaultResolver(request, options);
  } catch (originalError) {
    try {
      let pkgName, subpath;
      if (request.startsWith('@')) {
        const parts = request.split('/');
        pkgName = parts[0] + '/' + parts[1];
        subpath = parts.slice(2).join('/') || '';
      } else if (request.startsWith('.') || path.isAbsolute(request)) {
        throw originalError;
      } else {
        const parts = request.split('/');
        pkgName = parts[0];
        subpath = parts.slice(1).join('/') || '';
      }

      // Try all versions of the package until one resolves the file
      const pkgDirs = findAllPkgDirs(pkgName);
      if (pkgDirs.length === 0) throw originalError;

      let resolved = null;
      for (const pkgDir of pkgDirs) {
        resolved = resolveFile(pkgDir, subpath);
        if (resolved) break;
      }
      if (!resolved) throw originalError;

      return resolved;
    } catch {
      throw originalError;
    }
  }
};
