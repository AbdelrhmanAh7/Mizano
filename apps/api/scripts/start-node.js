#!/usr/bin/env node
const { spawn } = require('child_process');
const os = require('os');
const { buildNodeArgs } = require('./node-heap');

try {
  const args = buildNodeArgs(process.env, process.argv.slice(2));
  const child = spawn(process.execPath, args, { stdio: 'inherit' });

  const forwardSignal = (signal) => {
    if (!child.killed && child.pid) {
      child.kill(signal);
    }
  };

  const handleSigterm = () => forwardSignal('SIGTERM');
  const handleSigint = () => forwardSignal('SIGINT');
  const handleSighup = () => forwardSignal('SIGHUP');

  process.on('SIGTERM', handleSigterm);
  process.on('SIGINT', handleSigint);
  process.on('SIGHUP', handleSighup);

  child.on('exit', (code, signal) => {
    process.off('SIGTERM', handleSigterm);
    process.off('SIGINT', handleSigint);
    process.off('SIGHUP', handleSighup);
    if (signal) {
      const signum = os.constants.signals[signal];
      if (typeof signum === 'number') {
        process.exit(128 + signum);
      }
      process.kill(process.pid, signal);
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
