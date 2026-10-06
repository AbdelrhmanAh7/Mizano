// Run: node --test scripts/check-env.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  PI_COMPOSE,
  PI_TEMPLATE,
  checkPiEnv,
  checkTemplate,
  composeVariables,
  parseEnv,
  requiredKeys,
} from './check-env.mjs';

const template = parseEnv(readFileSync(PI_TEMPLATE, 'utf8'));
const compose = readFileSync(PI_COMPOSE, 'utf8');
const digest = 'a'.repeat(64);
const pgPassword = 'p@ss/word:with#chars-1234567890';

function validEnv(overrides = {}) {
  const env = new Map(template);
  const values = {
    MIZANO_API_IMAGE: `ghcr.io/acme/mizano-api@sha256:${digest}`,
    MIZANO_WEB_IMAGE: `ghcr.io/acme/mizano-web@sha256:${digest}`,
    POSTGRES_PASSWORD: pgPassword,
    DATABASE_URL: `postgresql://mizano:${encodeURIComponent(pgPassword)}@postgres:5432/mizano_db`,
    JWT_SECRET: 'j'.repeat(48),
    JWT_REFRESH_SECRET: 'r'.repeat(48),
    NEXTAUTH_SECRET: 'n'.repeat(48),
    NEXTAUTH_URL: 'https://app.mizano.test',
    CORS_ORIGIN: 'https://app.mizano.test',
    PUBLIC_API_URL: 'https://api.mizano.test/api',
    CLOUDFLARE_TUNNEL_TOKEN: 'tunnel-token-value',
    INTAKE_TESSDATA_DIR: '/app/tessdata',
    BACKUP_AGE_RECIPIENT: `age1${'q'.repeat(58)}`,
    ...overrides,
  };
  for (const [k, v] of Object.entries(values)) env.set(k, v);
  return env;
}

test('the shipped template covers every compose variable and holds no secrets', () => {
  assert.deepEqual(checkTemplate(template, compose), []);
});

test('compose variable scan skips $$ container-side escapes', () => {
  const vars = composeVariables('a: ${FOO:?x}\nb: ${BAR:-1}\nc: "$${POSTGRES_USER}"\nd: ${BAZ}');
  assert.deepEqual([...vars].sort(), ['BAR', 'BAZ', 'FOO']);
});

test('a template missing a compose variable is reported', () => {
  const t = new Map(template);
  t.delete('CLOUDFLARE_TUNNEL_TOKEN');
  const errors = checkTemplate(t, compose);
  assert.ok(errors.some((e) => e.startsWith('CLOUDFLARE_TUNNEL_TOKEN: used by')));
});

test('a template with a real-looking secret is reported', () => {
  const t = new Map(template);
  t.set('JWT_SECRET', 'x'.repeat(48));
  assert.ok(checkTemplate(t, compose).some((e) => e.startsWith('JWT_SECRET:')));
});

test('empty template values are optional, the rest required', () => {
  const required = requiredKeys(template);
  assert.ok(required.includes('DATABASE_URL'));
  assert.ok(required.includes('CLOUDFLARE_TUNNEL_TOKEN'));
  assert.ok(!required.includes('TELEGRAM_BOT_TOKEN'));
  assert.ok(!required.includes('INTAKE_TESSDATA_DIR'));
});

test('a fully filled env passes', () => {
  assert.deepEqual(checkPiEnv(validEnv(), template), { errors: [], warnings: [] });
});

test('the unfilled template itself fails on placeholders', () => {
  const { errors } = checkPiEnv(new Map(template), template);
  for (const key of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'MIZANO_API_IMAGE', 'NEXTAUTH_URL']) {
    assert.ok(errors.includes(`${key}: still a template placeholder`), key);
    // One error per placeholder key, no follow-on format errors.
    assert.equal(errors.filter((e) => e.startsWith(`${key}:`)).length, 1, key);
  }
});

test('missing required keys are named', () => {
  const env = validEnv();
  env.delete('REDIS_URL');
  env.set('NEXTAUTH_SECRET', '');
  const { errors } = checkPiEnv(env, template);
  assert.ok(errors.includes('REDIS_URL: required'));
  assert.ok(errors.includes('NEXTAUTH_SECRET: required'));
});

test('weak, reused and unpinned values fail', () => {
  const same = 's'.repeat(40);
  const { errors } = checkPiEnv(
    validEnv({
      JWT_SECRET: same,
      JWT_REFRESH_SECRET: same,
      NEXTAUTH_SECRET: 'short',
      MIZANO_WEB_IMAGE: 'ghcr.io/acme/mizano-web:latest',
    }),
    template,
  );
  assert.ok(errors.includes('NEXTAUTH_SECRET: shorter than 32 characters'));
  assert.ok(errors.some((e) => e.endsWith('must all be different')));
  assert.ok(errors.some((e) => e.startsWith('MIZANO_WEB_IMAGE: must be pinned')));
});

test('origins must be https, single and consistent', () => {
  const { errors } = checkPiEnv(
    validEnv({ NEXTAUTH_URL: 'http://app.mizano.test', CORS_ORIGIN: 'https://other.test/' }),
    template,
  );
  assert.ok(errors.some((e) => e.startsWith('NEXTAUTH_URL:')));
  assert.ok(errors.some((e) => e.startsWith('CORS_ORIGIN:')));

  const mismatch = checkPiEnv(validEnv({ CORS_ORIGIN: 'https://other.test' }), template);
  assert.ok(mismatch.errors.includes('CORS_ORIGIN: must equal the NEXTAUTH_URL origin'));
});

test('DATABASE_URL must match the postgres credentials (URL-encoded)', () => {
  const raw = checkPiEnv(
    validEnv({ DATABASE_URL: `postgresql://mizano:wrong-password@postgres:5432/other_db` }),
    template,
  );
  assert.ok(raw.errors.some((e) => e.startsWith('DATABASE_URL: password differs')));
  assert.ok(raw.errors.includes('DATABASE_URL: database differs from POSTGRES_DB'));

  const host = checkPiEnv(
    validEnv({
      DATABASE_URL: `postgresql://mizano:${encodeURIComponent(pgPassword)}@localhost:5432/mizano_db`,
    }),
    template,
  );
  assert.ok(host.errors.some((e) => e.startsWith('DATABASE_URL: host')));
});

test('demo guardrails: CPU-only extraction, SSD path, age key', () => {
  const { errors, warnings } = checkPiEnv(
    validEnv({
      OLLAMA_ENABLED: 'true',
      INTAKE_EXTRACTION_STRATEGY: 'llm',
      INTAKE_CONCURRENCY: '9',
      MIZANO_DATA_DIR: 'data',
      BACKUP_AGE_RECIPIENT: 'ssh-ed25519 AAAA',
      TELEGRAM_BOT_TOKEN: 'only-token',
      INTAKE_TESSDATA_DIR: '',
    }),
    template,
  );
  assert.ok(errors.includes('OLLAMA_ENABLED: must be false (CPU-only demo)'));
  assert.ok(errors.includes('INTAKE_EXTRACTION_STRATEGY: must be rules (CPU-only demo)'));
  assert.ok(errors.includes('INTAKE_CONCURRENCY: must be 1-4'));
  assert.ok(errors.some((e) => e.startsWith('MIZANO_DATA_DIR:')));
  assert.ok(errors.some((e) => e.startsWith('BACKUP_AGE_RECIPIENT:')));
  assert.ok(warnings.some((w) => w.startsWith('TELEGRAM_BOT_TOKEN/')));

});

test('messages never contain values', () => {
  const secret = 'TOPSECRET-should-never-print-0123456789';
  const { errors, warnings } = checkPiEnv(
    validEnv({ JWT_SECRET: secret, JWT_REFRESH_SECRET: secret, DATABASE_URL: secret }),
    template,
  );
  for (const line of [...errors, ...warnings]) assert.ok(!line.includes('TOPSECRET'), line);
});

test('parseEnv handles comments, quotes and export', () => {
  const env = parseEnv('# c\nexport A="1 2"\nB=\'x\'\nC=\n  D = bad\nE=a=b\n');
  assert.equal(env.get('A'), '1 2');
  assert.equal(env.get('B'), 'x');
  assert.equal(env.get('C'), '');
  assert.equal(env.has('D'), false);
  assert.equal(env.get('E'), 'a=b');
});
