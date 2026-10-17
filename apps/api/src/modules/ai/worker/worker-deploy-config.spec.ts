/**
 * #142: the intake worker is mandatory once the API only enqueues, so every supported deployment
 * must start it with a liveness check that fits a process without an HTTP listener, the same
 * intake volume and queue as the API, the CPU-only extractor and the packaged OCR assets.
 * These tests read the real compose files and Dockerfile, so a drifting deploy file fails here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

// Typed here so the spec compiles even where @types/js-yaml is not installed.
const yaml = jest.requireActual<{ load: (source: string) => unknown }>('js-yaml');

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..');

interface ComposeService {
  image?: string;
  command?: string[];
  environment?: string[] | Record<string, string | number>;
  volumes?: string[];
  healthcheck?: { test?: string[] };
}

function loadServices(file: string): Record<string, ComposeService> {
  const doc = yaml.load(readFileSync(join(REPO_ROOT, file), 'utf8')) as {
    services: Record<string, ComposeService>;
  };
  return doc.services;
}

function envOf(service: ComposeService, key: string): string | undefined {
  const env = service.environment ?? {};
  if (Array.isArray(env)) {
    const entry = env.find((line) => line.startsWith(`${key}=`));
    return entry?.slice(key.length + 1);
  }
  return env[key] === undefined ? undefined : String(env[key]);
}

const COMPOSE_FILES = [
  { file: 'docker-compose.production.yml', worker: 'intake-worker', storage: '/data/intake' },
  { file: 'deploy/pi/docker-compose.pi.yml', worker: 'worker', storage: '/data/originals' },
];

describe.each(COMPOSE_FILES)('$file intake worker service', ({ file, worker, storage }) => {
  const services = loadServices(file);
  const api = services.api;
  const svc = services[worker];

  it('runs from the API image with the worker entrypoint', () => {
    expect(svc).toBeDefined();
    expect(svc.image).toBe(api.image);
    expect(svc.command).toEqual(['node', 'dist/main.worker.js']);
    expect(api.command).toBeUndefined();
  });

  it('has a non-HTTP liveness check instead of the inherited API probe', () => {
    // main.worker.ts creates an application context only; localhost:6001 never answers.
    const test = svc.healthcheck?.test ?? [];
    expect(test.length).toBeGreaterThan(0);
    expect(test.join(' ')).toContain('/proc/1/cmdline');
    expect(test.join(' ')).not.toMatch(/localhost|127\.0\.0\.1|wget|curl|\/api\/health/);
  });

  it('shares the intake directory and the Redis queue with the API', () => {
    expect(envOf(svc, 'INTAKE_STORAGE_DIR')).toBe(storage);
    expect(envOf(svc, 'INTAKE_STORAGE_DIR')).toBe(envOf(api, 'INTAKE_STORAGE_DIR'));
    expect(svc.volumes).toEqual(api.volumes);
    // Without Redis each process gets a private in-memory queue and the worker never sees API jobs.
    expect(envOf(api, 'REDIS_URL')).toBeDefined();
    expect(envOf(svc, 'REDIS_URL')).toBe(envOf(api, 'REDIS_URL'));
  });

  it('defaults to the CPU-only extractor with packaged OCR assets', () => {
    expect(envOf(svc, 'INTAKE_EXTRACTION_STRATEGY')).toBe('rules');
    expect(envOf(svc, 'EXTRACTION_STRATEGY')).toBe('rules');
    expect(envOf(svc, 'OLLAMA_ENABLED')).toBe('false');
    expect(JSON.stringify(svc)).not.toMatch(/qwen3-vl/);
    // eng/ara.traineddata are copied to /app/apps/api, the Dockerfile's working directory.
    expect(envOf(svc, 'INTAKE_TESSDATA_DIR')).toBe('/app/apps/api');
  });
});

describe('apps/api/Dockerfile intake directory', () => {
  const dockerfile = readFileSync(join(REPO_ROOT, 'apps', 'api', 'Dockerfile'), 'utf8');

  it('pre-creates /data/intake owned by the runtime user before USER switches', () => {
    expect(dockerfile).toMatch(/mkdir -p[^\n]*\/data\/intake/);
    const chownAt = dockerfile.search(/chown[^\n]*\/data\/intake/);
    expect(chownAt).toBeGreaterThanOrEqual(0);
    // A fresh named volume copies owner and mode from the image path it is mounted over.
    expect(chownAt).toBeLessThan(dockerfile.search(/^USER nestjs/m));
  });
});

describe('.github/workflows/deploy.yml', () => {
  it('starts the intake worker next to the api (enqueue-only api needs it)', () => {
    const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
    expect(workflow).toMatch(
      /docker compose -f docker-compose\.production\.yml up -d --no-deps intake-worker/,
    );
  });
});
