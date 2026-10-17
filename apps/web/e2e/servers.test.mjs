import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startServer } from './servers.mjs';

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

async function close(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function freeURL() {
  const server = createServer();
  const url = await listen(server);
  await close(server);
  return url;
}

function serverArgs(url, status = 200) {
  return [
    '--input-type=module',
    '-e',
    `import {createServer} from 'node:http'; createServer((_req,res)=>{res.writeHead(${status});res.end()}).listen(${new URL(url).port},'127.0.0.1');`,
  ];
}

test('owned server becomes ready and teardown releases its port without taskkill', async () => {
  const url = await freeURL();
  const stop = await startServer({ args: serverArgs(url), url, timeoutMs: 5000 });
  try {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    await response.body.cancel();
  } finally {
    await stop();
  }
  await assert.rejects(fetch(url));
  await stop();
});

test('an existing unhealthy listener is refused and preserved', async () => {
  const server = createServer((_req, res) => {
    res.writeHead(503);
    res.end();
  });
  const url = await listen(server);
  try {
    await assert.rejects(startServer({ args: serverArgs(url), url }), /refuses an existing server/);
    const response = await fetch(url);
    assert.equal(response.status, 503);
    await response.body.cancel();
  } finally {
    await close(server);
  }
});

test('a missing readiness route fails and cleans up the owned process', async () => {
  const url = await freeURL();
  await assert.rejects(
    startServer({ args: serverArgs(url, 404), url, timeoutMs: 1000 }),
    /failed readiness/,
  );
  await assert.rejects(fetch(url));
});

test('early startup failure produces only safe metadata', async () => {
  const url = await freeURL();
  await assert.rejects(
    startServer({ args: ['-e', 'process.exit(1)'], url, timeoutMs: 5000 }),
    /failed readiness/,
  );
});
