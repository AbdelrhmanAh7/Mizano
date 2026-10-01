import {
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

    it('records top-level field names only, never request values', () => {
      const body = {
        description: 'Cement 50kg bags',
        amount: '1500.0000',
        supplierTaxId: '300-123-456',
        password: 'hunter2',
        lines: [{ description: 'secret line', rate: '10.0000' }],
      };
      const summary = buildAuditSummary(body);
      expect(summary).toEqual({
        fields: ['description', 'amount', 'supplierTaxId', 'password', 'lines'],
      });
      const text = JSON.stringify(summary);
      for (const value of ['Cement', '1500', '300-123-456', 'hunter2', 'secret line']) {
        expect(text).not.toContain(value);
      }
    });

    it('caps the number and length of field names', () => {
      const body = Object.fromEntries(
        Array.from({ length: 80 }, (_, i) => [`${'f'.repeat(100)}${i}`, i]),
      );
      const summary = buildAuditSummary(body);
      expect(summary?.fields).toHaveLength(50);
      expect(summary?.fields.every((f) => f.length <= 64)).toBe(true);
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
