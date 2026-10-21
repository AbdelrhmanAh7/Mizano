#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function globToRegex(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(`^${re}$`);
}

export function loadFeatureMap(featuresPath = join(ROOT, 'ops/verify/features/Mizano.json')) {
  if (!existsSync(featuresPath)) return null;
  return JSON.parse(readFileSync(featuresPath, 'utf8'));
}

export function loadShardsConfig(shardsPath = join(ROOT, 'e2e-army/shards.json')) {
  return JSON.parse(readFileSync(shardsPath, 'utf8'));
}

export function scanFeatureShards(featuresDir = join(ROOT, 'e2e-army/features')) {
  const map = new Map();
  const files = readdirSync(featuresDir).filter((f) => f.endsWith('.e2e.ts'));
  for (const f of files) {
    const content = readFileSync(join(featuresDir, f), 'utf8');
    const matches = content.matchAll(/tags:\s*\[([^\]]+)\]/g);
    for (const m of matches) {
      const tags = m[1].split(',').map((s) => s.trim().replace(/["'`]/g, ''));
      const feat = tags.find((t) => t.startsWith('feat:'))?.slice(5);
      const shard = tags.find((t) => t.startsWith('shard:'))?.slice(6);
      const lvl = tags.find((t) => t.startsWith('lvl:'))?.slice(4) || 'api';
      if (feat && shard) {
        if (!map.has(feat)) map.set(feat, {});
        map.get(feat)[lvl] = shard;
      }
    }
  }
  return map;
}

export function planShards({
  changedFiles = [],
  eventName = process.env.GITHUB_EVENT_NAME || 'push',
  forceAll = process.env.E2E_ARMY_ALL_SHARDS === '1',
  featureMap = loadFeatureMap(),
  shardsConfig = loadShardsConfig(),
  featureShards = scanFeatureShards(),
} = {}) {
  const allShardIds = shardsConfig.shards.map((s) => s.id);

  if (eventName === 'push' || forceAll || !changedFiles.length || !featureMap) {
    return ['pr', ...allShardIds];
  }

  const ignoreRegexes = (featureMap.ignore || []).map(globToRegex);
  const isIgnored = (file) => ignoreRegexes.some((re) => re.test(file));

  const relevantFiles = changedFiles.filter((f) => !isIgnored(f));
  if (!relevantFiles.length) {
    return ['pr', featureMap.smokeShard || 'smoke'];
  }

  const hasUiChanges = relevantFiles.some((f) => f.startsWith('apps/web/'));
  const touchedFeatures = new Set();
  let hasUnmappedFiles = false;

  for (const file of relevantFiles) {
    let matched = false;
    for (const feat of featureMap.features) {
      const paths = (feat.paths || []).map(globToRegex);
      if (paths.some((re) => re.test(file))) {
        touchedFeatures.add(feat.id);
        matched = true;
      }
    }
    if (!matched) {
      hasUnmappedFiles = true;
    }
  }

  const selectedShards = new Set(['pr']);

  for (const featId of touchedFeatures) {
    const shardEntry = featureShards.get(featId);
    if (!shardEntry) continue;
    if (shardEntry.api) selectedShards.add(shardEntry.api);
    if (shardEntry.job) selectedShards.add(shardEntry.job);
    if (hasUiChanges && shardEntry.ui) selectedShards.add(shardEntry.ui);
  }

  if (hasUnmappedFiles || selectedShards.size === 1) {
    selectedShards.add(featureMap.smokeShard || 'smoke');
  }

  const orderedShards = ['pr', ...allShardIds.filter((id) => selectedShards.has(id))];
  return orderedShards;
}

// CLI execution
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!files.length && process.env.CHANGED_FILES) {
    files = process.env.CHANGED_FILES.split(/\s+/).filter(Boolean);
  }
  if (!files.length && process.env.GITHUB_BASE_REF) {
    try {
      const out = execSync(`git diff --name-only origin/${process.env.GITHUB_BASE_REF}...HEAD`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      files = out.split('\n').filter(Boolean);
    } catch {
      // fallback
    }
  }

  const result = planShards({ changedFiles: files });
  process.stdout.write(JSON.stringify(result));
}
