import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { connectionFromUrl } from '../modules/ai/intake/intake-queue.service';
import { resolveRedisUrl } from './redis-url';

/**
 * #183: the production compose stacks keep Postgres/Redis off the host and
 * make Redis require a password the API actually sends. Docker is not
 * available in unit CI, so the files are rendered with the subset of compose
 * interpolation they use (`$$`, `${VAR}`, nested `${VAR:-default}`,
 * `${VAR:?message}`); scripts/check-compose-security.sh runs the same checks
 * against `docker compose config`.
 */
const ROOT = join(__dirname, '..', '..', '..', '..');
const FILES = ['docker-compose.production.yml', 'deploy/pi/docker-compose.pi.yml'];
const PG_PASS = 'army183pg0123456789abcdef';
const REDIS_PASS = 'army183redis0123456789abcdef';
const PI_REQUIRED = {
  MIZANO_API_IMAGE: 'check/api',
  MIZANO_WEB_IMAGE: 'check/web',
  DATABASE_URL: 'postgresql://check',
  JWT_SECRET: 'check',
  JWT_REFRESH_SECRET: 'check',
  CORS_ORIGIN: 'https://check',
  NEXTAUTH_URL: 'https://check',
  NEXTAUTH_SECRET: 'check',
  CLOUDFLARE_TUNNEL_TOKEN: 'check',
};

function interpolate(text: string, env: Record<string, string>): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('$$', i)) {
      out += '$';
      i++;
    } else if (text.startsWith('${', i)) {
      let depth = 0;
      let end = i;
      for (; end < text.length; end++) {
        if (text[end] === '{') depth++;
        if (text[end] === '}' && --depth === 0) break;
      }
      const inner = text.slice(i + 2, end);
      const [, name, op = '', rest = ''] = /^(\w+)(:-|:\?)?([\s\S]*)$/.exec(inner) ?? [];
      const value = env[name] ?? '';
      if (op === ':-') out += value || interpolate(rest, env);
      else if (op === ':?' && !value) throw new Error(`${name}: ${interpolate(rest, env)}`);
      else out += value;
      i = end;
    } else {
      out += text[i];
    }
  }
  return out;
}

function render(file: string, env: Record<string, string>): string {
  return interpolate(readFileSync(join(ROOT, file), 'utf8'), { ...PI_REQUIRED, ...env });
}

/** Lines of one top-level service (two-space indented key under `services:`). */
function service(rendered: string, name: string): string {
  const lines = rendered.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${name}:`);
  expect(start).toBeGreaterThan(-1);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {0,2}\S/.test(l));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

/** Value of one environment entry, in list (`- KEY=value`) or map (`KEY: value`) form. */
function envOf(serviceText: string, key: string): string | undefined {
  const match = new RegExp(`^\\s*(?:- )?${key}(?:=|: )(.*)$`, 'm').exec(serviceText);
  return match?.[1].trim();
}

describe.each(FILES)('%s (#183)', (file) => {
  it('fails to render without POSTGRES_PASSWORD', () => {
    expect(() => render(file, {})).toThrow('POSTGRES_PASSWORD is required');
  });

  it('publishes no Postgres or Redis port', () => {
    const rendered = render(file, { POSTGRES_PASSWORD: PG_PASS });
    for (const name of ['postgres', 'redis']) {
      expect(service(rendered, name)).not.toMatch(/^\s*ports:/m);
    }
    expect(rendered).not.toMatch(/5432:5432|6379:6379/);
    expect(rendered).not.toContain('mizano_secret');
  });

  it('runs Redis with --requirepass falling back to POSTGRES_PASSWORD', () => {
    const redis = service(render(file, { POSTGRES_PASSWORD: PG_PASS }), 'redis');
    expect(redis).toMatch(new RegExp(`--requirepass'?,?\\s*'?${PG_PASS}`));
    expect(redis).toContain(`REDISCLI_AUTH=${PG_PASS}`);
  });

  it('prefers REDIS_PASSWORD and hands the API the same password next to a credential-free REDIS_URL', () => {
    const rendered = render(file, { POSTGRES_PASSWORD: PG_PASS, REDIS_PASSWORD: REDIS_PASS });
    const redis = service(rendered, 'redis');
    expect(redis).toMatch(new RegExp(`--requirepass'?,?\\s*'?${REDIS_PASS}`));
    expect(redis).toContain(`REDISCLI_AUTH=${REDIS_PASS}`);
    expect(redis).not.toContain(PG_PASS);
    const api = service(rendered, 'api');
    expect(envOf(api, 'REDIS_URL')).toBe('redis://redis:6379/0');
    expect(envOf(api, 'REDIS_PASSWORD')).toBe(REDIS_PASS);
  });

  it('keeps REDIS_URL overridable for an external Redis and still sends the password', () => {
    const rendered = render(file, {
      POSTGRES_PASSWORD: PG_PASS,
      REDIS_PASSWORD: REDIS_PASS,
      REDIS_URL: 'redis://cache.internal:6380/2',
    });
    const api = service(rendered, 'api');
    const env = {
      REDIS_URL: envOf(api, 'REDIS_URL'),
      REDIS_PASSWORD: envOf(api, 'REDIS_PASSWORD'),
    };
    expect(env.REDIS_URL).toBe('redis://cache.internal:6380/2');
    const url = resolveRedisUrl({ get: (key) => env[key as keyof typeof env] });
    expect(connectionFromUrl(url as string)).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      password: REDIS_PASS,
    });
  });

  it('preserves existing credentials in an external REDIS_URL', () => {
    const rendered = render(file, {
      POSTGRES_PASSWORD: PG_PASS,
      REDIS_URL: 'redis://:ext_secret@cache.internal:6380/2',
    });
    const api = service(rendered, 'api');
    const env = {
      REDIS_URL: envOf(api, 'REDIS_URL'),
      REDIS_PASSWORD: envOf(api, 'REDIS_PASSWORD'),
    };
    expect(env.REDIS_URL).toBe('redis://:ext_secret@cache.internal:6380/2');
    const url = resolveRedisUrl({ get: (key) => env[key as keyof typeof env] });
    expect(connectionFromUrl(url as string)).toMatchObject({
      host: 'cache.internal',
      port: 6380,
      password: 'ext_secret',
    });
  });

  it('lets the API connect with a fallback POSTGRES_PASSWORD full of URL-special characters', () => {
    const special = 'army183/pg+=@:%?';
    const api = service(render(file, { POSTGRES_PASSWORD: special }), 'api');
    const env = {
      REDIS_URL: envOf(api, 'REDIS_URL'),
      REDIS_PASSWORD: envOf(api, 'REDIS_PASSWORD'),
    };
    const url = resolveRedisUrl({ get: (key) => env[key as keyof typeof env] });
    expect(connectionFromUrl(url as string)).toMatchObject({ host: 'redis', password: special });
  });

  it('passes the Redis password as one argv entry, whatever shell-special characters it holds', () => {
    // Root cause of the earlier string-form `command:`: a space or quote in the
    // fallback password was split into extra redis-server arguments.
    const special = 'army 183"pg$x;&|<>\\#';
    const redis = service(render(file, { POSTGRES_PASSWORD: special }), 'redis');
    const command = /^\s*command:\s*\[([\s\S]*?)\]/m.exec(redis)?.[1];
    expect(command).toBeDefined();
    const argv = [...(command as string).matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(argv[0]).toBe('redis-server');
    expect(argv[argv.indexOf('--requirepass') + 1]).toBe(special);
    expect(argv).toHaveLength(9);
  });

  it('keeps the password out of the Redis healthcheck command', () => {
    const redis = service(render(file, { POSTGRES_PASSWORD: PG_PASS }), 'redis');
    const healthcheck = redis.slice(redis.indexOf('healthcheck:'));
    expect(healthcheck).toMatch(/redis-cli/);
    expect(healthcheck).not.toContain(PG_PASS);
    expect(healthcheck).not.toMatch(/'-a'|"-a"/);
  });
});

describe('#183 evidence matches the workflows', () => {
  const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
  const evidence = read('EVIDENCE.md');
  const section = evidence.slice(evidence.indexOf('# EVIDENCE — #183'));

  it('lists the workflow edits as pending exactly while ci.yml lacks the check step', () => {
    const pending = !read('.github/workflows/ci.yml').includes('check-compose-security.sh');
    expect(section.includes('## Workflow edits: pending')).toBe(pending);
    if (pending) expect(section).not.toMatch(/applied in this PR/i);
  });

  it('claims no CI run of the check script while the CI step is pending', () => {
    const pending = !read('.github/workflows/ci.yml').includes('check-compose-security.sh');
    if (!pending) return;
    expect(section).not.toMatch(/\(CI run\)|CI run of|The CI step runs/i);
    expect(read('docs/ops/pending-workflow-changes.md')).toContain(
      'run: bash scripts/check-compose-security.sh',
    );
    expect(read('docs/DEVELOPMENT.md')).toContain('until the CI step');
  });

  it('describes no derived or hex Redis password', () => {
    expect(section).not.toMatch(/hex|REDIS_PASS_HEX|add-mask/i);
    expect(read('docs/ops/pending-workflow-changes.md')).not.toMatch(/hex|REDIS_PASS_HEX/i);
  });

  it('keeps the unrelated docs it claims to have restored', () => {
    // An auto-commit (78d904b) deleted both files while this section said they were restored.
    for (const doc of ['docs/vision.md', 'docs/backlog-restructure.md']) {
      expect(existsSync(join(ROOT, doc))).toBe(true);
    }
  });
});
