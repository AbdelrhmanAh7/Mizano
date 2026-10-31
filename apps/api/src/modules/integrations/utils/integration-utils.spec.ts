import { createHmac } from 'crypto';
import { generateApiKey, hashApiKey, looksLikeApiKey } from './api-key';
import {
  flowlineSignature,
  signedFlowlineHeaders,
  verifyFlowlineSignature,
} from './flowline-signature';
import { openSecret, sealSecret, secretHint } from '../../../common/utils/secret-box';
import {
  assertPublicWebhookUrl,
  isPrivateAddress,
  parseWebhookUrl,
  publicOnlyLookup,
} from './url-safety';

describe('FlowLine signature', () => {
  const secret = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef';
  const body = '{"id":"evt_1","type":"invoice.paid","data":{"x":"عربي"}}';

  it('is t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<event id>.<body>">, as FlowLine computes it', () => {
    const t = 1_761_652_800;
    const expected = createHmac('sha256', secret).update(`${t}.evt_1.${body}`).digest('hex');
    expect(flowlineSignature(secret, 'evt_1', body, t)).toBe(`t=${t},v1=${expected}`);
  });

  it('matches FlowLine WebCrypto verification byte for byte (UTF-8 bodies included)', async () => {
    const now = new Date();
    const headers = signedFlowlineHeaders(secret, 'evt_1', body, now);
    const parts = Object.fromEntries(
      headers['x-flowline-signature'].split(',').map((p) => p.split('=') as [string, string]),
    );
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${parts.t}.${headers['x-flowline-event-id']}.${body}`),
    );
    const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(parts.v1).toBe(hex);
    expect(headers['content-type']).toBe('application/json');
  });

  it('verifies, and rejects a changed body, event id, secret or stale timestamp', () => {
    const now = new Date();
    const header = signedFlowlineHeaders(secret, 'evt_1', body, now)['x-flowline-signature'];
    expect(verifyFlowlineSignature(secret, 'evt_1', body, header, now)).toBe(true);
    expect(verifyFlowlineSignature(secret, 'evt_2', body, header, now)).toBe(false);
    expect(verifyFlowlineSignature(secret, 'evt_1', `${body} `, header, now)).toBe(false);
    expect(verifyFlowlineSignature(`${secret}x`, 'evt_1', body, header, now)).toBe(false);
    const later = new Date(now.getTime() + 301_000);
    expect(verifyFlowlineSignature(secret, 'evt_1', body, header, later)).toBe(false);
  });
});

describe('secret box', () => {
  const env = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'unit-test-integrations-key-0123456789';
  });
  afterAll(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = env;
  });

  it('round-trips and never contains the plaintext', () => {
    const sealed = sealSecret('whsec_secret_value', 'org1:ep1');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('whsec_secret_value');
    expect(openSecret(sealed, 'org1:ep1')).toBe('whsec_secret_value');
  });

  it('refuses a ciphertext moved to another organization or endpoint', () => {
    const sealed = sealSecret('whsec_secret_value', 'org1:ep1');
    expect(() => openSecret(sealed, 'org2:ep1')).toThrow();
    expect(() => openSecret(sealed, 'org1:ep2')).toThrow();
  });

  it('fails closed without a configured key (no default)', () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect(() => sealSecret('x', 'a')).toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
    process.env.INTEGRATIONS_ENCRYPTION_KEY = 'short';
    expect(() => sealSecret('x', 'a')).toThrow(/INTEGRATIONS_ENCRYPTION_KEY/);
  });

  it('hints without revealing', () => {
    expect(secretHint('whsec_abcdefgh1234')).toBe('whs…1234');
    expect(secretHint('short')).toBe('••••');
  });
});

describe('api keys', () => {
  it('are 256-bit random, prefixed, and stored as sha256', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(looksLikeApiKey(a.key)).toBe(true);
    expect(a.prefix).toBe(a.key.slice(0, 12));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeApiKey('mzk_short')).toBe(false);
    expect(looksLikeApiKey(`Bearer ${a.key}`)).toBe(false);
  });
});

describe('webhook URL safety', () => {
  const env = process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS;
  afterEach(() => {
    process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS = env;
  });

  it('classifies private ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fd00::1',
      '::ffff:10.0.0.1',
      'fe80::1',
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip)).toBe(false);
    }
  });

  it('requires https and a public host by default', async () => {
    delete process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS;
    expect(() => parseWebhookUrl('http://flowline.app/x')).toThrow(/https/);
    expect(() => parseWebhookUrl('https://localhost/x')).toThrow(/public/);
    expect(() => parseWebhookUrl('https://10.0.0.5/x')).toThrow(/public/);
    expect(() => parseWebhookUrl('https://user:pw@flowline.app/x')).toThrow(/credentials/);
    expect(() => parseWebhookUrl('not a url')).toThrow();
    await expect(
      assertPublicWebhookUrl('https://evil.test/x', async () => [{ address: '192.168.0.10' }]),
    ).rejects.toThrow(/public address/);
    await expect(
      assertPublicWebhookUrl('https://flowline.app/x', async () => [{ address: '93.184.216.34' }]),
    ).resolves.toBeInstanceOf(URL);
  });

  it('allows local http only when explicitly enabled (tests/dev)', () => {
    process.env.INTEGRATIONS_ALLOW_PRIVATE_WEBHOOKS = 'true';
    expect(parseWebhookUrl('http://127.0.0.1:8080/x').hostname).toBe('127.0.0.1');
  });
});

describe('publicOnlyLookup (connection-time check against DNS rebinding)', () => {
  const resolver = (answer: { address: string; family: number }[]) =>
    ((_host: string, _opts: unknown, cb: (e: null, a: unknown) => void) =>
      cb(null, answer)) as never;
  const run = (answer: { address: string; family: number }[]) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
      publicOnlyLookup(resolver(answer))('hook.example', {}, (err, address) =>
        resolve({ err, address }),
      ),
    );

  it('connects to a public answer', async () => {
    expect(await run([{ address: '93.184.216.34', family: 4 }])).toEqual({
      err: null,
      address: '93.184.216.34',
    });
  });

  it('refuses when the name now resolves to a private address', async () => {
    const { err } = await run([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    expect(err?.code).toBe('EPRIVATEADDRESS');
  });
});
