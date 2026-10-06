#!/usr/bin/env node
// `pnpm env:check`: verify the env file for APP_ENV (default local).
// APP_ENV=pi validates deploy/pi/.env.pi against deploy/pi/.env.pi.example and the
// Pi compose file. Only key names are printed, never values.
//
//   APP_ENV=pi pnpm env:check                 # validate deploy/pi/.env.pi
//   APP_ENV=pi pnpm env:check --file <path>   # validate another file
//   pnpm env:check --template                 # template covers every compose variable
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PI_DIR = path.join(ROOT, 'deploy', 'pi');
export const PI_TEMPLATE = path.join(PI_DIR, '.env.pi.example');
export const PI_COMPOSE = path.join(PI_DIR, 'docker-compose.pi.yml');
export const PI_ENV_FILE = path.join(PI_DIR, '.env.pi');

const LONG_SECRETS = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'NEXTAUTH_SECRET'];
const PLACEHOLDER = /REPLACE|OWNER\/|example\.com/;
const DIGEST_REF = /^[^@\s]+@sha256:[0-9a-f]{64}$/;
const AGE_RECIPIENT = /^age1[02-9ac-hj-np-z]{58}$/;

/** Parse KEY=VALUE lines (comments, blanks and `export ` prefixes allowed). */
export function parseEnv(text) {
  const env = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.length >= 2 && /^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    env.set(m[1], value);
  }
  return env;
}

/** Variables the compose file interpolates (`${VAR}`, `${VAR:-x}`, `${VAR:?x}`), not `$${VAR}`. */
export function composeVariables(text) {
  const vars = new Set();
  for (const m of text.matchAll(/(?<!\$)\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) vars.add(m[1]);
  return vars;
}

/** Keys with a value in the template are required; empty template values are optional. */
export function requiredKeys(template) {
  return [...template].filter(([, v]) => v !== '').map(([k]) => k);
}

function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) return null;
    if (value.endsWith('/')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Template must cover every compose variable and must not hold real secrets. */
export function checkTemplate(template, composeText) {
  const errors = [];
  for (const name of composeVariables(composeText)) {
    if (!template.has(name))
      errors.push(`${name}: used by docker-compose.pi.yml, missing in template`);
  }
  for (const name of [...LONG_SECRETS, 'POSTGRES_PASSWORD', 'CLOUDFLARE_TUNNEL_TOKEN']) {
    if (!PLACEHOLDER.test(template.get(name) ?? '')) {
      errors.push(`${name}: template must hold a placeholder, not a value`);
    }
  }
  return errors;
}

/** Validate a filled-in .env.pi. Returns { errors, warnings } naming keys only. */
export function checkPiEnv(env, template) {
  const errors = [];
  const warnings = [];
  const get = (k) => env.get(k) ?? '';

  // A missing or placeholder key gets one error; later format checks skip it.
  const flagged = new Set();
  for (const key of requiredKeys(template)) {
    if (!get(key)) errors.push(`${key}: required`);
    else if (PLACEHOLDER.test(get(key))) errors.push(`${key}: still a template placeholder`);
    else continue;
    flagged.add(key);
  }
  const fail = (message) => {
    if (!flagged.has(message.slice(0, message.indexOf(':')))) errors.push(message);
  };

  for (const key of LONG_SECRETS) {
    if (get(key) && get(key).length < 32) fail(`${key}: shorter than 32 characters`);
  }
  if (get('POSTGRES_PASSWORD') && get('POSTGRES_PASSWORD').length < 16) {
    fail('POSTGRES_PASSWORD: shorter than 16 characters');
  }
  const secrets = LONG_SECRETS.filter((k) => !flagged.has(k)).map(get);
  if (new Set(secrets).size !== secrets.length) {
    fail(`${LONG_SECRETS.join(', ')}: must all be different`);
  }

  for (const key of ['MIZANO_API_IMAGE', 'MIZANO_WEB_IMAGE']) {
    if (get(key) && !DIGEST_REF.test(get(key)))
      fail(`${key}: must be pinned as repo@sha256:<64 hex>`);
  }

  const dataDir = get('MIZANO_DATA_DIR');
  if (dataDir && (!path.posix.isAbsolute(dataDir) || path.posix.normalize(dataDir) === '/')) {
    fail('MIZANO_DATA_DIR: must be an absolute directory on the SSD mount');
  }

  const webOrigin = httpsOrigin(get('NEXTAUTH_URL'));
  if (get('NEXTAUTH_URL') && !webOrigin) {
    fail('NEXTAUTH_URL: must be an https origin without path or trailing slash');
  }
  if (get('CORS_ORIGIN')) {
    if (!httpsOrigin(get('CORS_ORIGIN'))) {
      fail('CORS_ORIGIN: must be one https origin without path or trailing slash');
    } else if (webOrigin && get('CORS_ORIGIN') !== webOrigin) {
      fail('CORS_ORIGIN: must equal the NEXTAUTH_URL origin');
    }
  }

  if (get('DATABASE_URL')) {
    try {
      const db = new URL(get('DATABASE_URL'));
      if (!['postgresql:', 'postgres:'].includes(db.protocol)) {
        fail('DATABASE_URL: must be a postgresql:// URL');
      }
      if (db.hostname !== 'postgres') {
        fail('DATABASE_URL: host must be the compose service "postgres"');
      }
      if (decodeURIComponent(db.username) !== get('POSTGRES_USER')) {
        fail('DATABASE_URL: user differs from POSTGRES_USER');
      }
      if (decodeURIComponent(db.password) !== get('POSTGRES_PASSWORD')) {
        fail(
          'DATABASE_URL: password differs from POSTGRES_PASSWORD (URL-encode special characters)',
        );
      }
      if (db.pathname.slice(1) !== get('POSTGRES_DB')) {
        fail('DATABASE_URL: database differs from POSTGRES_DB');
      }
    } catch {
      fail('DATABASE_URL: not a valid URL');
    }
  }

  if (get('REDIS_URL') && !/^rediss?:\/\/[^\s]+$/.test(get('REDIS_URL'))) {
    fail('REDIS_URL: must be a redis:// URL');
  }
  if (get('OLLAMA_ENABLED') && get('OLLAMA_ENABLED') !== 'false') {
    fail('OLLAMA_ENABLED: must be false (CPU-only demo)');
  }
  if (get('INTAKE_EXTRACTION_STRATEGY') && get('INTAKE_EXTRACTION_STRATEGY') !== 'rules') {
    fail('INTAKE_EXTRACTION_STRATEGY: must be rules (CPU-only demo)');
  }
  if (get('INTAKE_CONCURRENCY') && !/^[1-4]$/.test(get('INTAKE_CONCURRENCY'))) {
    fail('INTAKE_CONCURRENCY: must be 1-4');
  } else if (Number(get('INTAKE_CONCURRENCY')) > 1) {
    warnings.push('INTAKE_CONCURRENCY: above 1 may exceed the worker memory budget on the Pi');
  }

  if (get('BACKUP_AGE_RECIPIENT') && !AGE_RECIPIENT.test(get('BACKUP_AGE_RECIPIENT'))) {
    fail('BACKUP_AGE_RECIPIENT: must be an age public key (age1...)');
  }
  if (get('BACKUP_RETENTION_DAYS') && !/^[1-9][0-9]*$/.test(get('BACKUP_RETENTION_DAYS'))) {
    fail('BACKUP_RETENTION_DAYS: must be a positive integer');
  }
  if (Boolean(get('TELEGRAM_BOT_TOKEN')) !== Boolean(get('TELEGRAM_ALERT_CHAT_ID'))) {
    warnings.push('TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID: set both to receive alerts');
  }
  return { errors, warnings };
}

const shown = (file) => {
  const rel = path.relative(ROOT, file);
  return rel.startsWith('..') ? file : rel;
};

function report(errors, warnings) {
  for (const w of warnings) console.warn(`  warning  ${w}`);
  for (const e of errors) console.error(`  error    ${e}`);
  return errors.length === 0;
}

function checkPi(file) {
  const template = parseEnv(readFileSync(PI_TEMPLATE, 'utf8'));
  const templateErrors = checkTemplate(template, readFileSync(PI_COMPOSE, 'utf8'));
  if (!existsSync(file)) {
    console.error(`Missing: ${shown(file)} (copy deploy/pi/.env.pi.example)`);
    report(templateErrors, []);
    return false;
  }
  console.log(`Using: ${shown(file)}`);
  const warnings = [];
  if (process.platform !== 'win32' && (statSync(file).mode & 0o077) !== 0) {
    warnings.push('file mode: readable by group/others; run chmod 600');
  }
  const result = checkPiEnv(parseEnv(readFileSync(file, 'utf8')), template);
  const ok = report([...templateErrors, ...result.errors], [...warnings, ...result.warnings]);
  if (ok) console.log('OK: all required Pi variables are set');
  return ok;
}

export function main(argv = process.argv.slice(2), appEnv = process.env.APP_ENV || 'local') {
  if (argv.includes('--template')) {
    const errors = checkTemplate(
      parseEnv(readFileSync(PI_TEMPLATE, 'utf8')),
      readFileSync(PI_COMPOSE, 'utf8'),
    );
    const ok = report(errors, []);
    if (ok) console.log('OK: deploy/pi/.env.pi.example covers docker-compose.pi.yml');
    return ok ? 0 : 1;
  }
  if (appEnv === 'pi') {
    const i = argv.indexOf('--file');
    const file = i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : PI_ENV_FILE;
    return checkPi(file) ? 0 : 1;
  }
  const file = `.env.${appEnv}`;
  if (existsSync(path.join(ROOT, file))) {
    console.log(`Using: ${file}`);
    return 0;
  }
  console.error(`Missing: ${file}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main();
}
