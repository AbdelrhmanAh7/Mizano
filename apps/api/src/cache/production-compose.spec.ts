import { readFileSync } from 'fs';
import { join } from 'path';
import { connectionFromUrl } from '../modules/ai/intake/intake-queue.service';

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

  it('prefers REDIS_PASSWORD and gives every REDIS_URL the same credentials', () => {
    const rendered = render(file, { POSTGRES_PASSWORD: PG_PASS, REDIS_PASSWORD: REDIS_PASS });
    const redis = service(rendered, 'redis');
    expect(redis).toMatch(new RegExp(`--requirepass'?,?\\s*'?${REDIS_PASS}`));
    expect(redis).toContain(`REDISCLI_AUTH=${REDIS_PASS}`);
    expect(redis).not.toContain(PG_PASS);
    const urls = rendered.match(/redis:\/\/[^\s"']+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(connectionFromUrl(url)).toMatchObject({ host: 'redis', password: REDIS_PASS });
    }
  });

  it('keeps the password out of the Redis healthcheck command', () => {
    const redis = service(render(file, { POSTGRES_PASSWORD: PG_PASS }), 'redis');
    const healthcheck = redis.slice(redis.indexOf('healthcheck:'));
    expect(healthcheck).toMatch(/redis-cli/);
    expect(healthcheck).not.toContain(PG_PASS);
    expect(healthcheck).not.toMatch(/'-a'|"-a"/);
  });
});
