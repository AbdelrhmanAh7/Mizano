import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { DocumentIntakeResult } from '../services/document-intake.service';
import { cpuReviewResult } from './cpu-structured';
import { IntakeMatchingService } from './intake-matching.service';

const ORG = 'org-a';
const NOW = new Date('2026-10-03T12:00:00.000Z');

function extracted(
  fields: Partial<DocumentIntakeResult['extractedFields']> = {},
  overrides: Partial<DocumentIntakeResult> = {},
): DocumentIntakeResult {
  const base = cpuReviewResult('Cairo Office Supplies Co.\nInvoice No: INV-1\nTotal: 115.00', 0.9);
  return {
    ...base,
    documentType: 'BILL',
    extractionMethod: 'rules',
    ...overrides,
    extractedFields: {
      ...base.extractedFields,
      vendorName: 'Cairo Office Supplies Co.',
      vendorTaxId: '123456789',
      documentNumber: 'INV-1',
      total: 115,
      date: '2026-09-01',
      ...fields,
    },
  };
}

describe('IntakeMatchingService', () => {
  let prisma: {
    vendor: { findMany: jest.Mock };
    bill: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let service: IntakeMatchingService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
    prisma = {
      vendor: { findMany: jest.fn().mockResolvedValue([]) },
      bill: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new IntakeMatchingService(prisma as unknown as PrismaService);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('vendor matching', () => {
    it('matches the extracted name to the organization vendor', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Cairo Office Supplies Co.', displayName: null },
        { id: 'v2', name: 'Totally Different Ltd', displayName: null },
      ]);
      const result = await service.enrich(ORG, extracted());
      expect(result.matchedVendor).toEqual({
        id: 'v1',
        name: 'Cairo Office Supplies Co.',
        similarity: 1,
      });
      expect(result.vendorCandidates.map((c) => c.id)).toEqual(['v1']);
      expect(result.suggestCreateVendor).toBeNull();
    });

    it('scopes the vendor lookup to the organization and ignores deleted vendors', async () => {
      await service.enrich(ORG, extracted());
      expect(prisma.vendor.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.vendor.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        deletedAt: null,
      });
    });

    it('prefers the display name and tolerates punctuation and case differences', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Legal Name LLC', displayName: 'cairo office supplies co' },
      ]);
      const result = await service.enrich(ORG, extracted());
      expect(result.matchedVendor).toMatchObject({ id: 'v1', name: 'cairo office supplies co' });
      expect(result.matchedVendor?.similarity).toBe(1);
    });

    it('matches Arabic names', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'شركة النيل للتوريدات', displayName: null },
      ]);
      const result = await service.enrich(ORG, extracted({ vendorName: 'شركة النيل للتوريدات' }));
      expect(result.matchedVendor?.id).toBe('v1');
    });

    it('keeps a weak similarity as a candidate only and suggests creating the vendor', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Cairo Office Furniture Trading', displayName: null },
      ]);
      const result = await service.enrich(
        ORG,
        extracted({ vendorName: 'Cairo Office Supplies Co.', vendorTaxId: '300123456700003' }),
      );
      expect(result.vendorCandidates).toHaveLength(1);
      expect(result.vendorCandidates[0].similarity).toBeLessThan(0.6);
      expect(result.matchedVendor).toBeNull();
      expect(result.suggestCreateVendor).toEqual({
        name: 'Cairo Office Supplies Co.',
        address: null,
        phone: null,
        email: null,
        taxId: '300123456700003',
      });
      expect(prisma.bill.findFirst).not.toHaveBeenCalled();
    });

    it('does not match, and does not suggest a new vendor, when two vendors tie', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v2', name: 'Cairo Office Supplies Co.', displayName: null },
        { id: 'v1', name: 'CAIRO OFFICE SUPPLIES CO', displayName: null },
      ]);
      const result = await service.enrich(ORG, extracted());
      expect(result.matchedVendor).toBeNull();
      expect(result.vendorCandidates.map((c) => c.id)).toEqual(['v1', 'v2']);
      expect(result.suggestCreateVendor).toBeNull();
      expect(result.duplicateWarning).toBeNull();
      expect(prisma.bill.findFirst).not.toHaveBeenCalled();
    });

    it('still matches the clear best vendor when a weaker one is also a candidate', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Cairo Office Supplies Co.', displayName: null },
        { id: 'v2', name: 'Cairo Office Supplies', displayName: null },
      ]);
      const result = await service.enrich(ORG, extracted());
      expect(result.matchedVendor?.id).toBe('v1');
      expect(result.vendorCandidates.map((c) => c.id)).toEqual(['v1', 'v2']);
    });

    it('returns at most five candidates, best first', async () => {
      prisma.vendor.findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({
          id: `v${i}`,
          name: `Cairo Office Supplies ${'x'.repeat(i + 1)}`,
          displayName: null,
        })),
      );
      const result = await service.enrich(ORG, extracted());
      expect(result.vendorCandidates).toHaveLength(5);
      const scores = result.vendorCandidates.map((c) => c.similarity);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    });

    it.each([null, '', '   ', '###', '!!!'])(
      'makes no database query and no match for the unusable vendor name %j',
      async (vendorName) => {
        const result = await service.enrich(ORG, extracted({ vendorName }));
        expect(prisma.vendor.findMany).not.toHaveBeenCalled();
        expect(result.matchedVendor).toBeNull();
        expect(result.vendorCandidates).toEqual([]);
        expect(result.suggestCreateVendor).toBeNull();
      },
    );

    it('never matches two names that normalize to nothing', async () => {
      prisma.vendor.findMany.mockResolvedValue([{ id: 'v1', name: '***', displayName: null }]);
      const result = await service.enrich(ORG, extracted({ vendorName: 'Cairo Office' }));
      expect(result.vendorCandidates).toEqual([]);
      expect(result.matchedVendor).toBeNull();
    });

    it('compares only the first 200 characters of an extracted name', async () => {
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'a'.repeat(200), displayName: null },
      ]);
      const result = await service.enrich(ORG, extracted({ vendorName: 'a'.repeat(100_000) }));
      expect(result.vendorCandidates[0].similarity).toBe(1);
    });

    it('never matches customers: the rules extract none', async () => {
      const result = await service.enrich(
        ORG,
        extracted(
          {},
          {
            matchedCustomer: { id: 'c1', name: 'forged', similarity: 1 },
            customerCandidates: [{ id: 'c1', name: 'forged', similarity: 1 }],
          },
        ),
      );
      expect(result.matchedCustomer).toBeNull();
      expect(result.customerCandidates).toEqual([]);
    });
  });

  describe('duplicate detection', () => {
    beforeEach(() =>
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Cairo Office Supplies Co.', displayName: null },
      ]),
    );

    it('flags the matched vendor bill with the same number', async () => {
      prisma.bill.findFirst.mockResolvedValue({ id: 'bill-1' });
      const result = await service.enrich(ORG, extracted());
      expect(result.duplicateWarning).toEqual({
        isDuplicate: true,
        existingId: 'bill-1',
        matchType: 'exact_number',
        similarity: 1,
      });
      expect(prisma.bill.findFirst.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        vendorId: 'v1',
        billNumber: 'INV-1',
        deletedAt: null,
      });
      expect(prisma.bill.findMany).not.toHaveBeenCalled();
    });

    it('flags a same-amount bill of the last 30 days when the number differs', async () => {
      prisma.bill.findMany.mockResolvedValue([
        { id: 'bill-far', grandTotal: new Prisma.Decimal('99.0000') },
        { id: 'bill-2', grandTotal: new Prisma.Decimal('115.0049') },
      ]);
      const result = await service.enrich(ORG, extracted());
      expect(result.duplicateWarning).toEqual({
        isDuplicate: true,
        existingId: 'bill-2',
        matchType: 'amount_match',
        similarity: 0.9,
      });
      const where = prisma.bill.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ organizationId: ORG, vendorId: 'v1', deletedAt: null });
      expect(where.createdAt.gte).toEqual(new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000));
    });

    it.each([
      ['115.0099', true],
      ['115.0100', false],
      ['114.9901', true],
      ['114.9900', false],
    ])(
      'compares amounts as exact decimals: bill %s is a duplicate: %s',
      async (grandTotal, dup) => {
        prisma.bill.findMany.mockResolvedValue([
          { id: 'bill-2', grandTotal: new Prisma.Decimal(grandTotal) },
        ]);
        const result = await service.enrich(ORG, extracted());
        expect(result.duplicateWarning?.isDuplicate ?? false).toBe(dup);
      },
    );

    it('finds nothing when neither the number nor the amount repeats', async () => {
      prisma.bill.findMany.mockResolvedValue([
        { id: 'bill-3', grandTotal: new Prisma.Decimal('500') },
      ]);
      expect((await service.enrich(ORG, extracted())).duplicateWarning).toBeNull();
    });

    it('checks only the number when no usable total was extracted', async () => {
      const result = await service.enrich(ORG, extracted({ total: null }));
      expect(result.duplicateWarning).toBeNull();
      expect(prisma.bill.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.bill.findMany).not.toHaveBeenCalled();
    });

    it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
      'ignores the implausible total %s',
      async (total) => {
        await service.enrich(ORG, extracted({ documentNumber: null, total }));
        expect(prisma.bill.findMany).not.toHaveBeenCalled();
      },
    );

    it('runs no duplicate check without a matched vendor', async () => {
      prisma.vendor.findMany.mockResolvedValue([]);
      const result = await service.enrich(ORG, extracted());
      expect(result.duplicateWarning).toBeNull();
      expect(prisma.bill.findFirst).not.toHaveBeenCalled();
      expect(prisma.bill.findMany).not.toHaveBeenCalled();
    });
  });

  it('replaces whatever the child claimed for the database-owned fields', async () => {
    const result = await service.enrich(
      ORG,
      extracted(
        {},
        {
          matchedVendor: { id: 'forged-vendor', name: 'Forged', similarity: 1 },
          vendorCandidates: [{ id: 'forged-vendor', name: 'Forged', similarity: 1 }],
          duplicateWarning: {
            isDuplicate: true,
            existingId: 'forged-bill',
            matchType: 'exact_number',
            similarity: 1,
          },
          suggestCreateVendor: {
            name: 'Forged',
            address: null,
            phone: null,
            email: null,
            taxId: null,
          },
        },
      ),
    );
    expect(result.matchedVendor).toBeNull();
    expect(result.vendorCandidates).toEqual([]);
    expect(result.duplicateWarning).toBeNull();
    expect(result.suggestCreateVendor).toMatchObject({ name: 'Cairo Office Supplies Co.' });
  });

  it('keeps the extracted fields, evidence and text untouched', async () => {
    const input = extracted();
    const result = await service.enrich(ORG, input);
    expect(result.extractedFields).toEqual(input.extractedFields);
    expect(result.rawText).toBe(input.rawText);
    expect(result.documentType).toBe('BILL');
    expect(result.extractionMethod).toBe('rules');
  });

  it('propagates a database failure instead of storing a result without matching', async () => {
    prisma.vendor.findMany.mockRejectedValue(new Error('connection lost'));
    await expect(service.enrich(ORG, extracted())).rejects.toThrow('connection lost');
  });
});
