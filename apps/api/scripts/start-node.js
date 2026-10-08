#!/usr/bin/env node
const { spawn } = require('child_process');
const { buildNodeArgs } = require('./node-heap');

try {
  const args = buildNodeArgs(process.env, process.argv.slice(2));
  const child = spawn(process.execPath, args, { stdio: 'inherit' });

  const forwardSignal = (signal) => {
    if (!child.killed && child.pid) {
      child.kill(signal);
    }
  };

  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGHUP', () => forwardSignal('SIGHUP'));

  child.on('exit', (code, signal) => {
    // Remove listeners to avoid memory leaks
    process.off('SIGTERM', forwardSignal);
    process.off('SIGINT', forwardSignal);
    process.off('SIGHUP', forwardSignal);
    if (signal) {
      process.exit(128 + signal);
    }
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error(`[mizano] Failed to start node: ${err.message}`);
    process.exit(1);
  });
} catch (err) {
  console.error(`[mizano] Failed to start node: ${err.message}`);
  process.exit(1);
}
