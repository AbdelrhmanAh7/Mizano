// Assertion probe only: this tiny HTTP fixture is NOT the Mizano application.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const source = resolve(process.argv[2] ?? 'e2e-army/446-session-greeting.e2e.ts');
const mode = process.argv[3] ?? 'correct';
const firstName = process.argv[4] ?? 'Amina [QA].*';
if (!['correct', 'wrong', 'generic', 'empty', 'http-error'].includes(mode)) {
  throw new Error('Unknown fixture mode');
}
const email = 'army-446@mizano.test';
const runner = mkdtempSync(join(tmpdir(), 'mizano-446-'));
const army =
  process.env.E2E_ARMY_RUNNER_DIR ?? join(homedir(), 'agents/hub-live/ops/verify/e2e-army');
symlinkSync(join(army, 'node_modules'), join(runner, 'node_modules'));
copyFileSync(source, join(runner, '446.e2e.ts'));
writeFileSync(
  join(runner, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' } }),
);
writeFileSync(
  join(runner, 'e2e.config.ts'),
  `import { web } from '@e2e-dev/web';
export default {
  targets: [{ engine: web(), app: { url: process.env.E2E_ARMY_URL } }],
  tests: ['*.e2e.ts'], workers: 1, retries: 0, timeout: 15000, cache: 'off',
};`,
);
const escape = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url === '/api/auth/session') {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = mode === 'http-error' ? 500 : 200;
    res.end(JSON.stringify({ user: { email, firstName: mode === 'empty' ? '' : firstName } }));
    return;
  }
  if (req.url === '/en/login') {
    res.end(`<html lang="en" dir="ltr"><body>
<form onsubmit="event.preventDefault();location.href='/en/dashboard'">
<label>Email<input type="email"></label><label>Password<input type="password"></label>
<button>Sign In</button></form></body></html>`);
    return;
  }
  const ar = req.url.startsWith('/ar/');
  const prefix = ar ? 'مرحباً بعودتك، ' : 'Welcome back, ';
  const displayed = mode === 'wrong' ? 'Other User' : mode === 'generic' ? '' : firstName;
  res.end(`<html lang="${ar ? 'ar' : 'en'}" dir="${ar ? 'rtl' : 'ltr'}">
<body><h1>${escape(prefix + displayed)}</h1></body></html>`);
});
await new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', done);
});
try {
  const args = [
    join(army, 'node_modules/e2e/dist/cli/bin.js'),
    'run',
    '446.e2e.ts',
    '--workers',
    '1',
    '--reporter',
    'list',
  ];
  if (process.env.E2E_FIXTURE_GREP) args.push('--grep', process.env.E2E_FIXTURE_GREP);
  const child = spawn(process.execPath, args, {
    cwd: runner,
    env: {
      ...process.env,
      E2E_ARMY_URL: `http://127.0.0.1:${server.address().port}`,
      E2E_TELEMETRY_DISABLED: '1',
      DO_NOT_TRACK: '1',
      E2E_USER_EMAIL: email,
      E2E_USER_PASSWORD: 'army-446-fixture-only',
    },
    stdio: 'inherit',
  });
  const code = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('exit', done);
  });
  console.log(
    `FIXTURE ONLY: mode=${mode}; firstName=${firstName}; exit=${code}; artifacts=${runner}`,
  );
  process.exitCode = code ?? 1;
} finally {
  await new Promise((done) => server.close(done));
}
