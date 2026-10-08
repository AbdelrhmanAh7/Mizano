#!/usr/bin/env node
const { spawnSync } = require('child_process');
const { buildNodeArgs } = require('./node-heap');

try {
  const args = buildNodeArgs(process.env, process.argv.slice(2));
  const res = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (res.error) {
    throw res.error;
  }
  process.exit(res.status ?? (res.signal ? 1 : 0));
} catch (err) {
  console.error(`[mizano] Failed to start node: ${err.message}`);
  process.exit(1);
}
