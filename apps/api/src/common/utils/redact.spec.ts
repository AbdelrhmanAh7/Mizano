import { Decimal } from '@prisma/client/runtime/library';
import {
  REDACTED,
  describeError,
  isSensitiveKey,
  redactSensitive,
  redactText,
  redactUrl,
  sanitizeStack,
  truncateText,
} from './redact';

describe('redact utils', () => {
  describe('isSensitiveKey', () => {
    it.each([
      'authorization',
      'Authorization',
      'proxy-authorization',
      'cookie',
      'Set-Cookie',
      'password',
      'smtpPassword',
      'currentPassword',
      'secret',
      'clientSecret',
      'OLLAMA_WEBHOOK_SECRET',
      'token',
      'accessToken',
      'refresh_token',
      'botToken',
      'TELEGRAM_BOT_TOKEN',
      'apiKey',
      'x-api-key',
      'privateKey',
      'credentials',
      'pwd',
      'otp',
    ])('treats %s as sensitive', (key) => {
      expect(isSensitiveKey(key)).toBe(true);
    });

    it.each(['id', 'organizationId', 'vendorName', 'total', 'status', 'path', 'method'])(
      'does not treat %s as sensitive',
      (key) => {
        expect(isSensitiveKey(key)).toBe(false);
      },
    );
  });

  describe('redactSensitive', () => {
    it('redacts credential keys at any depth, including inside arrays', () => {
      const input = {
        headers: {
          Authorization: 'Bearer abc.def.ghi',
          cookie: 'session=xyz',
          'content-type': 'application/json',
        },
        body: {
          user: { email: 'a@b.c', password: 'hunter22' },
          integrations: [
            { name: 'telegram', botToken: '123456789:AAAbbbCCCdddEEEfffGGGhhhIIIjjjKKKlll' },
          ],
          deep: { a: { b: { c: { clientSecret: 's3cr3t' } } } },
        },
        smtpPassword: 'p@ss',
        id: 'inv_1',
      };

      const out = redactSensitive(input);

      expect(out.headers.Authorization).toBe(REDACTED);
      expect(out.headers.cookie).toBe(REDACTED);
      expect(out.headers['content-type']).toBe('application/json');
      expect(out.body.user.password).toBe(REDACTED);
      expect(out.body.user.email).toBe('a@b.c');
      expect(out.body.integrations[0].botToken).toBe(REDACTED);
      expect(out.body.integrations[0].name).toBe('telegram');
      expect(out.body.deep.a.b.c.clientSecret).toBe(REDACTED);
      expect(out.smtpPassword).toBe(REDACTED);
      expect(out.id).toBe('inv_1');

      const serialised = JSON.stringify(out);
      expect(serialised).not.toContain('hunter22');
      expect(serialised).not.toContain('abc.def.ghi');
      expect(serialised).not.toContain('AAAbbbCCC');
      expect(serialised).not.toContain('s3cr3t');
    });

    it('does not mutate the input', () => {
      const input = { password: 'secret-value', nested: { token: 't' } };
      redactSensitive(input);
      expect(input.password).toBe('secret-value');
      expect(input.nested.token).toBe('t');
    });

    it('truncates long strings by default', () => {
      const longText = 'INVOICE LINE '.repeat(1000);
      const out = redactSensitive({ rawText: longText });
      expect(out.rawText.length).toBeLessThan(2100);
      expect(out.rawText).toContain('[truncated');
    });

    it('keeps strings intact when maxStringLength is Infinity and redactStrings is false', () => {
      const note = 'x'.repeat(5000);
      const out = redactSensitive({ note }, { maxStringLength: Infinity, redactStrings: false });
      expect(out.note).toBe(note);
    });

    it('preserves Decimal and Date instances', () => {
      const amount = new Decimal('1234.5600');
      const date = new Date('2026-01-01T00:00:00Z');
      const out = redactSensitive({ amount, date });
      expect(out.amount).toBe(amount);
      expect(out.date).toBe(date);
    });

    it('replaces buffers and handles circular references', () => {
      const circular: Record<string, unknown> = { file: Buffer.from('raw invoice bytes') };
      circular.self = circular;
      const out = redactSensitive(circular);
      expect(out.file).toBe('[Buffer 17 bytes]');
      expect(out.self).toBe('[Circular]');
    });

    it('caps depth', () => {
      const deep = { a: { b: { c: { d: 'x' } } } };
      const out = redactSensitive(deep, { maxDepth: 2 });
      expect(out.a.b).toBe('[Truncated]');
    });
  });

  describe('redactText', () => {
    it('masks bearer tokens, JWTs, bot tokens and URL passwords', () => {
      const jwt =
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJvcmciOiJvcmctMSJ9.c2lnbmF0dXJlLXZhbHVl';
      const text = [
        `Authorization: Bearer ${jwt}`,
        `token ${jwt}`,
        'https://api.telegram.org/bot123456789:AAAbbbCCCdddEEEfffGGGhhhIIIjjjKKKlll/sendMessage',
        'postgresql://mizano:SuperSecretPw@db:5432/mizano',
      ].join('\n');

      const out = redactText(text, 10_000);

      expect(out).not.toContain(jwt);
      expect(out).not.toContain('AAAbbbCCC');
      expect(out).not.toContain('SuperSecretPw');
      expect(out).toContain('postgresql://mizano:[REDACTED]@db:5432/mizano');
    });

    it('masks credential key/value pairs in query strings and JSON', () => {
      const out = redactText(
        '/api/auth/verify?token=abc123&page=2 {"password":"hunter22","name":"ok"} smtpPassword=p@ss',
        10_000,
      );
      expect(out).toContain('token=[REDACTED]');
      expect(out).toContain('page=2');
      expect(out).not.toContain('abc123');
      expect(out).not.toContain('hunter22');
      expect(out).not.toContain('p@ss');
      expect(out).toContain('"name":"ok"');
    });

    it('masks every cookie in a cookie header', () => {
      const out = redactText('cookie: session=abc; csrf=def', 10_000);
      expect(out).not.toContain('abc');
      expect(out).not.toContain('def');
    });

    it('truncates long text', () => {
      const out = redactText('a'.repeat(1000), 100);
      expect(out.startsWith('a'.repeat(100))).toBe(true);
      expect(out).toContain('[truncated 900 chars]');
    });

    it('leaves ordinary text alone', () => {
      expect(redactText('Invoice inv_1 not found')).toBe('Invoice inv_1 not found');
    });
  });

  describe('truncateText', () => {
    it('returns short text unchanged', () => {
      expect(truncateText('abc', 10)).toBe('abc');
    });
  });

  describe('redactUrl', () => {
    it('keeps the path and masks sensitive query values', () => {
      expect(redactUrl('/api/stream?access_token=abc&jobId=intake_1')).toBe(
        '/api/stream?access_token=[REDACTED]&jobId=intake_1',
      );
      expect(redactUrl(undefined)).toBeUndefined();
    });
  });

  describe('describeError', () => {
    it('never includes axios request config or headers', () => {
      const axiosLike = Object.assign(new Error('Request failed with status code 500'), {
        name: 'AxiosError',
        code: 'ERR_BAD_RESPONSE',
        isAxiosError: true,
        config: {
          headers: { Authorization: 'token PADDLE-SECRET-TOKEN' },
          data: '{"file":"base64-invoice"}',
        },
        response: { status: 500, data: { text: 'OCR TEXT' } },
      });

      const out = describeError(axiosLike);

      expect(out).toBe(
        'AxiosError(ERR_BAD_RESPONSE) status=500: Request failed with status code 500',
      );
      expect(out).not.toContain('PADDLE-SECRET-TOKEN');
      expect(out).not.toContain('base64-invoice');
      expect(out).not.toContain('OCR TEXT');
    });

    it('drops Prisma and JSON.parse messages, which embed caller data', () => {
      const prismaError = Object.assign(
        new Error('Invalid `prisma.bill.create()` invocation:\n{ data: { vendorName: "ACME" } }'),
        { name: 'PrismaClientValidationError' },
      );
      expect(describeError(prismaError)).toBe('PrismaClientValidationError');

      const knownError = Object.assign(new Error('Unique constraint failed'), {
        name: 'PrismaClientKnownRequestError',
        code: 'P2002',
      });
      expect(describeError(knownError)).toBe('PrismaClientKnownRequestError(P2002)');

      let syntaxError: unknown;
      try {
        JSON.parse('{"vendorName": "ACME TRADING", total: 1150');
      } catch (error) {
        syntaxError = error;
      }
      expect(describeError(syntaxError)).toBe('SyntaxError');
    });

    it('uses only the first line of other messages, redacted and truncated', () => {
      const error = new Error(`Failed with Bearer abcdefghijkl\nsecond line with invoice text`);
      const out = describeError(error);
      expect(out).toBe(`Error: Failed with Bearer ${REDACTED}`);
      expect(describeError(new Error('x'.repeat(500))).length).toBeLessThan(260);
    });

    it('can omit the message entirely', () => {
      expect(describeError(new TypeError('vendor ACME'), { includeMessage: false })).toBe(
        'TypeError',
      );
    });

    it('describes non-Error values without echoing them', () => {
      expect(describeError('raw OCR text')).toBe('Non-Error thrown (string)');
      expect(describeError(undefined)).toBe('Unknown error');
    });
  });

  describe('sanitizeStack', () => {
    it('keeps frames but drops multi-line messages', () => {
      const error = Object.assign(
        new Error('Invalid invocation:\n{ data: { taxId: "300000000000003" } }'),
        { name: 'PrismaClientValidationError' },
      );
      const stack = sanitizeStack(error) as string;
      expect(stack.split('\n')[0]).toBe('PrismaClientValidationError');
      expect(stack).toContain('    at ');
      expect(stack).not.toContain('300000000000003');
    });

    it('returns undefined for non-errors', () => {
      expect(sanitizeStack('nope')).toBeUndefined();
    });
  });
});
