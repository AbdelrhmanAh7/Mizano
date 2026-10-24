import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { apiURL, webURL, browserEnvironment } from './environment.mjs';

/** Own the actual Node process: Windows taskkill /T may be unavailable in a sandbox. */
export async function startServer({ args, cwd, env, url, timeoutMs = 60_000 }) {
  const address = new URL(url);
  if (address.hostname !== '127.0.0.1') throw new Error('Browser servers must use loopback');
  // A TCP port probe also refuses unhealthy or non-HTTP listeners.
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () => reject(new Error('Browser gate refuses an existing server')));
    probe.listen(Number(address.port), '127.0.0.1', () => probe.close(resolve));
  });
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'ignore', shell: false });
  let exited = false;
  const done = new Promise((resolve) => {
    child.once('exit', () => {
      exited = true;
      resolve();
    });
    child.once('error', () => {
      exited = true;
      resolve();
    });
  });
  const stop = async () => {
    if (exited) return;
    child.kill('SIGTERM');
    let timer;
    const terminated = await Promise.race([
      done.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 5000);
      }),
    ]);
    clearTimeout(timer);
    if (!terminated) {
      child.kill('SIGKILL');
      const killed = await Promise.race([
        done.then(() => true),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), 5000);
        }),
      ]);
      clearTimeout(timer);
      if (!killed) throw new Error('Browser gate could not stop its owned server');
    }
  };
  try {
    const deadline = Date.now() + timeoutMs;
    while (!exited && Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
        const ready = response.status === 200;
        await response.body?.cancel();
        if (ready) return stop;
      } catch {
        /* Keep probing readiness without persisting startup errors or env. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Browser server failed readiness; check local infrastructure');
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Playwright invokes the returned teardown even after a failed assertion. */
export default async function setup() {
  const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url));
  const webRequire = createRequire(new URL('../package.json', import.meta.url));
  const stops = [];
  const cleanup = async () => {
    for (const stop of stops.reverse()) await stop();
  };
  try {
    stops.push(
      await startServer({
        args: [
          apiRequire.resolve('ts-node/dist/bin.js'),
          '--files',
          '--project',
          'test/tsconfig.e2e.json',
          'test/browser-server.ts',
        ],
        cwd: fileURLToPath(new URL('../../api/', import.meta.url)),
        env: browserEnvironment(),
        url: `${apiURL}/health`,
      }),
    );
    stops.push(
      await startServer({
        args: [webRequire.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '5103'],
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: browserEnvironment(),
        url: `${webURL}/en/login`,
      }),
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
