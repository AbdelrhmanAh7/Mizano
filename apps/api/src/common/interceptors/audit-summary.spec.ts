import { REDACTED } from '../utils/redact';
import {
  AUDIT_SUMMARY_MAX_CHARS,
  buildAuditSummary,
  resolveEntityId,
  resolveEntityType,
  truncateUserAgent,
} from './audit-summary';

describe('audit summary', () => {
  describe('buildAuditSummary', () => {
    it('returns null when there is no body and no status', () => {
      expect(buildAuditSummary(undefined)).toBeNull();
      expect(buildAuditSummary({})).toBeNull();
      expect(buildAuditSummary('text')).toBeNull();
    });

    it('lists top-level field names and keeps harmless scalar values', () => {
      const summary = buildAuditSummary({ name: 'Acme', creditLimit: '1500.0000', active: true });
      expect(summary?.fields).toEqual(['name', 'creditLimit', 'active']);
      expect(summary?.values).toEqual({ name: 'Acme', creditLimit: '1500.0000', active: true });
    });

    it('strips credential fields recursively', () => {
      const summary = buildAuditSummary({
        email: 'a@b.test',
        password: 'hunter2',
        currentPassword: 'old-pass-value',
        profile: {
          apiKey: 'k-123',
          refreshToken: 'r-456',
          nested: [{ token: 't-789', authorization: 'Bearer abc.def.ghi', note: 'ok' }],
          clientSecret: 's-000',
        },
      });
      const serialized = JSON.stringify(summary);
      for (const leaked of [
        'hunter2',
        'old-pass-value',
        'k-123',
        'r-456',
        't-789',
        'abc.def.ghi',
      ]) {
        expect(serialized).not.toContain(leaked);
      }
      const values = summary?.values as Record<string, unknown>;
      expect(values.password).toBe(REDACTED);
      expect((values.profile as Record<string, unknown>).apiKey).toBe(REDACTED);
      expect(serialized).toContain('"note":"ok"');
    });

    it('masks credential-looking text inside free-form strings', () => {
      const summary = buildAuditSummary({
        notes: 'call me, Authorization: Bearer abcdefghijkl and password=hunter2',
      });
      const serialized = JSON.stringify(summary);
      expect(serialized).not.toContain('abcdefghijkl');
      expect(serialized).not.toContain('hunter2');
    });

    it('truncates long strings', () => {
      const summary = buildAuditSummary({ description: 'x'.repeat(5000) });
      const description = (summary?.values as Record<string, string>).description;
      expect(description.length).toBeLessThan(300);
      expect(description).toContain('truncated');
    });

    it('drops values (keeping field names) when the summary exceeds the size cap', () => {
      const body: Record<string, unknown> = {};
      for (let i = 0; i < 40; i++) body[`field${i}`] = 'y'.repeat(190);
      const summary = buildAuditSummary(body);
      expect(summary?.truncated).toBe(true);
      expect(summary?.values).toBeUndefined();
      expect(summary?.fields).toHaveLength(40);
      expect(JSON.stringify(summary).length).toBeLessThan(AUDIT_SUMMARY_MAX_CHARS);
    });

    it('limits depth and array length', () => {
      const summary = buildAuditSummary({
        lines: Array.from({ length: 500 }, (_, i) => ({ i })),
        deep: { a: { b: { c: { d: 1 } } } },
      });
      const values = summary?.values as { lines: unknown[]; deep: unknown };
      expect(values.lines.length).toBeLessThanOrEqual(21);
      expect(JSON.stringify(values.deep)).toContain('[Truncated]');
    });

    it('records a short lifecycle status from the response but never the response itself', () => {
      const response = {
        id: 'inv-1',
        status: 'POSTED',
        customer: { taxId: '123-456-789' },
        total: 99,
      };
      const summary = buildAuditSummary({ note: 'x' }, response);
      expect(summary?.status).toBe('POSTED');
      expect(JSON.stringify(summary)).not.toContain('123-456-789');
    });

    it('reads status from a wrapped { data } response', () => {
      expect(buildAuditSummary(undefined, { data: { status: 'APPROVED' } })).toEqual({
        fields: [],
        status: 'APPROVED',
      });
    });
  });

  describe('resolveEntityId', () => {
    it('prefers the response id, then wrapped id, then route id', () => {
      expect(resolveEntityId({ id: 'a' }, 'route')).toBe('a');
      expect(resolveEntityId({ data: { id: 'b' } }, 'route')).toBe('b');
      expect(resolveEntityId({}, 'route')).toBe('route');
      expect(resolveEntityId(undefined, undefined)).toBe('unknown');
    });

    it('rejects non-scalar ids and caps length', () => {
      expect(resolveEntityId({ id: { secret: 'x' } }, undefined)).toBe('unknown');
      expect(resolveEntityId({ id: 'z'.repeat(500) }, undefined)).toHaveLength(100);
    });
  });

  describe('resolveEntityType', () => {
    it('maps /api/<resource>/... to the resource', () => {
      expect(resolveEntityType('/api/customers/123')).toBe('customers');
      expect(resolveEntityType('/api/Invoices?x=1')).toBe('invoices');
    });

    it('excludes logger/internal endpoints and unusable paths', () => {
      expect(resolveEntityType('/api/logger/capture')).toBeNull();
      expect(resolveEntityType('/api/internal/tunnel-update')).toBeNull();
      expect(resolveEntityType('/api/')).toBeNull();
      expect(resolveEntityType(undefined)).toBeNull();
      expect(resolveEntityType('/api/we ird')).toBeNull();
    });
  });

  it('truncates user agents', () => {
    expect(truncateUserAgent('a'.repeat(1000))).toHaveLength(255);
    expect(truncateUserAgent(undefined)).toBeUndefined();
  });
});
