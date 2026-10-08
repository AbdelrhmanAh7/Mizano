/**
 * docker-compose.production.yml must not publish PostgreSQL or Redis, must not fall back to a
 * default database password and must protect Redis with a password (issue #132).
 *
 * When Docker is installed the assertions run on `docker compose config` (the resolved model).
 * Otherwise they run on the parsed file, with `${VAR:?...}` treated as required.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

const COMPOSE_FILE = path.resolve(__dirname, '../../../docker-compose.production.yml');

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
    const redisUrl = envEntries(api).REDIS_URL;
    if (dockerAvailable) {
      expect(command).toContain(`--requirepass ${REQUIRED_ENV.REDIS_PASSWORD}`);
      expect(redisUrl).toBe(`redis://:${REQUIRED_ENV.REDIS_PASSWORD}@redis:6379`);
      const { REDIS_PASSWORD: _omitted, ...withoutPassword } = REQUIRED_ENV;
      expect(dockerConfig(withoutPassword).status).not.toBe(0);
    } else {
      expect(command).toMatch(/--requirepass \$\{REDIS_PASSWORD:\?[^}]*\}/);
      expect(redisUrl).toMatch(/^redis:\/\/:\$\{REDIS_PASSWORD:\?[^}]*\}@redis:6379$/);
    }
    expect(envEntries(redis).REDISCLI_AUTH).toBeTruthy();
    expect(asText(redis.healthcheck?.test)).toMatch(/redis-cli ping/);
  });
});
