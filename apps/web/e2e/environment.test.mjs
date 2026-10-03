import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserEnvironment, requireBrowserExecutable } from './environment.mjs';
import { fileURLToPath } from 'node:url';

test('missing browser fails before infrastructure work; only local chrome is an alternate', () => {
  const existing = fileURLToPath(import.meta.url);
  requireBrowserExecutable(existing);
  assert.throws(() => requireBrowserExecutable(`${existing}.missing`), /Chromium is missing/);
  requireBrowserExecutable(`${existing}.missing`, 'chrome');
  assert.throws(() => requireBrowserExecutable(existing, 'remote'), /Unsupported/);
});

test('pins isolated database, loopback services and synthetic authentication', () => {
  const env = browserEnvironment({});
  assert.equal(new URL(env.DATABASE_URL).pathname, '/mizano_e2e_cxe2e');
  assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6380');
  assert.equal(env.API_INTERNAL_URL, env.NEXT_PUBLIC_API_URL);
  assert.equal(env.TELEGRAM_BOT_TOKEN, '');
});

test('inherited replica and extraction settings cannot escape the synthetic CPU gate', () => {
  const env = browserEnvironment({
    READ_DATABASE_URL: 'postgresql://user:secret@remote.example:5432/production',
    INTAKE_EXTRACTION_STRATEGY: 'llm',
    PRISMA_LOG_QUERIES: 'true',
  });
  assert.equal(env.READ_DATABASE_URL, env.DATABASE_URL);
  assert.equal(env.INTAKE_EXTRACTION_STRATEGY, 'rules');
  assert.equal(env.PRISMA_LOG_QUERIES, 'false');
});

test('negative controls are explicit and bounded', () => {
  for (const mutation of ['required-route', 'wrong-total']) {
    assert.equal(
      browserEnvironment({ MIZANO_BROWSER_MUTATION: mutation }).MIZANO_BROWSER_MUTATION,
      mutation,
    );
  }
  assert.throws(
    () => browserEnvironment({ MIZANO_BROWSER_MUTATION: 'unknown' }),
    /negative control/,
  );
});

test('malformed database errors never expose credentials', () => {
  assert.throws(
    () => browserEnvironment({ DATABASE_URL: 'private-credential-invalid-url' }),
    (error) => {
      assert.ok(!String(error).includes('private-credential'));
      return true;
    },
  );
});

for (const database of [
  'postgresql://user:secret@127.0.0.1:5435/mizano',
  'postgresql://user:secret@localhost:5435/mizano_e2e_cxe2e',
  'postgresql://user:secret@remote.example:5435/mizano_e2e_cxe2e',
  'postgresql://user:secret@127.0.0.1:5432/mizano_e2e_cxe2e',
  'postgresql://user:secret@127.0.0.1:5435/mizano_e2e_cxe2e?schema=public',
]) {
  test(`rejects unsafe database configuration ${new URL(database).hostname}:${new URL(database).port}${new URL(database).pathname}`, () => {
    assert.throws(() => browserEnvironment({ DATABASE_URL: database }), /isolated local/);
  });
}
