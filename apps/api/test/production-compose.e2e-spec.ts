/**
 * docker-compose.production.yml must not publish PostgreSQL or Redis, must not fall back to a
 * default database password and must protect Redis with a password (issue #132). It must also
 * start with the variables `.github/workflows/deploy.yml` writes, which include no REDIS_PASSWORD.
 *
 * When Docker is installed the assertions run on `docker compose config` (the resolved model).
 * Otherwise they run on the parsed file, with `${VAR:?...}` treated as required.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

const COMPOSE_FILE = path.resolve(__dirname, '../../../docker-compose.production.yml');
const DEPLOY_WORKFLOW = path.resolve(__dirname, '../../../.github/workflows/deploy.yml');
/** Unset REDIS_PASSWORD falls back to the required POSTGRES_PASSWORD, so Redis always has one. */
const REDIS_SECRET = /^\$\{REDIS_PASSWORD:-\$\{POSTGRES_PASSWORD:\?[^}]*\}\}$/;

const REQUIRED_ENV: Record<string, string> = {
  POSTGRES_PASSWORD: 'pg-e2e-secret',
  REDIS_PASSWORD: 'redis-e2e-secret',
  JWT_SECRET: 'jwt',
  JWT_REFRESH_SECRET: 'jwt-refresh',
  NEXTAUTH_SECRET: 'nextauth',
};

interface ComposeService {
  ports?: unknown[];
  command?: string | string[];
  environment?: string[] | Record<string, string | null>;
  healthcheck?: { test?: string | string[] };
}
interface ComposeModel {
  services: Record<string, ComposeService>;
}

const dockerAvailable = spawnSync('docker', ['compose', 'version']).status === 0;

function dockerConfig(env: Record<string, string>): { status: number | null; stdout: string } {
  const result = spawnSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '--env-file', '/dev/null', 'config', '--format', 'json'],
    { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' },
  );
  return { status: result.status, stdout: result.stdout };
}

function loadModel(): ComposeModel {
  if (dockerAvailable) {
    const { status, stdout } = dockerConfig(REQUIRED_ENV);
    expect(status).toBe(0);
    return JSON.parse(stdout) as ComposeModel;
  }
  return parse(fs.readFileSync(COMPOSE_FILE, 'utf8')) as ComposeModel;
}

function envEntries(service: ComposeService): Record<string, string> {
  const env = service.environment ?? {};
  if (!Array.isArray(env)) {
    return Object.fromEntries(Object.entries(env).map(([k, v]) => [k, v ?? '']));
  }
  return Object.fromEntries(
    env.map((entry) => [entry.slice(0, entry.indexOf('=')), entry.slice(entry.indexOf('=') + 1)]),
  );
}

/** Variable names the deploy workflow's "Write .env on server" step writes to the server's .env. */
function deployEnvKeys(): string[] {
  const workflow = parse(fs.readFileSync(DEPLOY_WORKFLOW, 'utf8')) as {
    jobs: Record<string, { steps?: Array<{ name?: string; with?: { script?: string } }> }>;
  };
  const step = Object.values(workflow.jobs)
    .flatMap((job) => job.steps ?? [])
    .find((s) => s.name === 'Write .env on server');
  const script = step?.with?.script ?? '';
  return [...script.matchAll(/(?:echo "|printf ')([A-Z_]+)=/g)].map((m) => m[1]);
}

function asText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(' ') : (value ?? '');
}

describe('@e2e @flow:production-compose @issue-132 production compose secrets', () => {
  const model = loadModel();
  const { postgres, redis, api } = model.services;

  it('@issue-132 AC1: does not publish PostgreSQL (5432) or Redis (6379) on the host', () => {
    expect(postgres.ports ?? []).toEqual([]);
    expect(redis.ports ?? []).toEqual([]);
    const published = JSON.stringify(Object.values(model.services).map((s) => s.ports ?? []));
    expect(published).not.toMatch(/5432|6379/);
  });

  it('@issue-132 AC1: requires POSTGRES_PASSWORD instead of defaulting to mizano_secret', () => {
    const raw = fs.readFileSync(COMPOSE_FILE, 'utf8');
    expect(raw).not.toMatch(/mizano_secret/);
    if (dockerAvailable) {
      const { POSTGRES_PASSWORD: _omitted, ...withoutPassword } = REQUIRED_ENV;
      expect(dockerConfig(withoutPassword).status).not.toBe(0);
      expect(envEntries(postgres).POSTGRES_PASSWORD).toBe(REQUIRED_ENV.POSTGRES_PASSWORD);
    } else {
      expect(envEntries(postgres).POSTGRES_PASSWORD).toMatch(/^\$\{POSTGRES_PASSWORD:\?[^}]*\}$/);
    }
  });

  it('@issue-132 AC1: Redis requires a password and the API and health check use it', () => {
    const command = asText(redis.command);
    const apiEnv = envEntries(api);
    if (dockerAvailable) {
      expect(command).toContain(`--requirepass ${REQUIRED_ENV.REDIS_PASSWORD}`);
      expect(apiEnv.REDIS_PASSWORD).toBe(REQUIRED_ENV.REDIS_PASSWORD);
      expect(envEntries(redis).REDISCLI_AUTH).toBe(REQUIRED_ENV.REDIS_PASSWORD);
    } else {
      // List form: compose passes the password as one argument, whatever characters it holds.
      expect(Array.isArray(redis.command)).toBe(true);
      const args = redis.command as string[];
      expect(args[args.indexOf('--requirepass') + 1]).toMatch(REDIS_SECRET);
      expect(apiEnv.REDIS_PASSWORD).toMatch(REDIS_SECRET);
      expect(envEntries(redis).REDISCLI_AUTH).toMatch(REDIS_SECRET);
    }
    // The password travels on its own; the API adds it to the URL, percent-encoded.
    expect(apiEnv.REDIS_URL).toBe('redis://redis:6379');
    expect(asText(redis.healthcheck?.test)).toMatch(/redis-cli ping/);
  });

  it('@issue-132 AC1: starts with the variables the deploy workflow writes (it sets no REDIS_PASSWORD)', () => {
    const written = deployEnvKeys();
    expect(written).toContain('POSTGRES_PASSWORD');
    expect(written).not.toContain('REDIS_PASSWORD');
    const required = [...fs.readFileSync(COMPOSE_FILE, 'utf8').matchAll(/\$\{([A-Z_]+):\?/g)].map(
      (m) => m[1],
    );
    expect(required).toContain('POSTGRES_PASSWORD');
    for (const name of required) expect(written).toContain(name);

    if (dockerAvailable) {
      const deployEnv = Object.fromEntries(written.map((k) => [k, `deploy-${k.toLowerCase()}`]));
      const { status, stdout } = dockerConfig(deployEnv);
      expect(status).toBe(0);
      const deployed = JSON.parse(stdout) as ComposeModel;
      const password = deployEnv.POSTGRES_PASSWORD;
      expect(asText(deployed.services.redis.command)).toContain(`--requirepass ${password}`);
      expect(envEntries(deployed.services.api).REDIS_PASSWORD).toBe(password);
    }
  });

  it('@issue-132 AC2: passes TRUST_PROXY_HOPS to the API, one proxy hop by default', () => {
    const hops = envEntries(api).TRUST_PROXY_HOPS;
    if (dockerAvailable) {
      expect(hops).toBe('1');
      const { status, stdout } = dockerConfig({ ...REQUIRED_ENV, TRUST_PROXY_HOPS: '2' });
      expect(status).toBe(0);
      expect(envEntries((JSON.parse(stdout) as ComposeModel).services.api).TRUST_PROXY_HOPS).toBe(
        '2',
      );
    } else {
      expect(hops).toBe('${TRUST_PROXY_HOPS:-1}');
    }
  });
});
