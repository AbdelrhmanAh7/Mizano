import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeService, ConfirmIntakeInput } from './document-intake.service';
import { OllamaService } from './ollama.service';
import { DocumentClassificationService } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { ExtractionStrategyResolver } from '../extraction/extraction-strategy-resolver.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

interface PrismaMock {
  vendor: { findFirst: jest.Mock; findMany: jest.Mock };
  customer: { findFirst: jest.Mock };
  project: { findFirst: jest.Mock };
  item: { findMany: jest.Mock };
  account: { findMany: jest.Mock };
  taxRate: { findMany: jest.Mock };
  bill: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  invoice: { findFirst: jest.Mock; create: jest.Mock };
}

/**
 * Tenant-aware Prisma mock: a record is only found when the query's
 * organizationId matches the record's owner.
 */
function buildPrisma(): PrismaMock {
  const owned = {
    vendor: { 'vendor-a': ORG_A, 'vendor-b': ORG_B },
    customer: { 'customer-a': ORG_A, 'customer-b': ORG_B },
    project: { 'project-a': ORG_A, 'project-b': ORG_B },
    item: { 'item-a': ORG_A, 'item-b': ORG_B },
    account: { 'account-a': ORG_A, 'account-b': ORG_B },
  } as const;
  const taxRates: Record<string, { org: string; rate: string }> = {
    'tax-a-14': { org: ORG_A, rate: '14' },
    'tax-b-14': { org: ORG_B, rate: '14' },
  };

  const findOwned =
    (table: Record<string, string>) =>
    ({ where }: { where: { id: string; organizationId: string } }) =>
      Promise.resolve(table[where.id] === where.organizationId ? { id: where.id } : null);
  const findManyOwned =
    (table: Record<string, string>) =>
    ({ where }: { where: { id: { in: string[] }; organizationId: string } }) =>
      Promise.resolve(
        where.id.in.filter((id) => table[id] === where.organizationId).map((id) => ({ id })),
      );

  return {
    vendor: { findFirst: jest.fn(findOwned(owned.vendor)), findMany: jest.fn() },
    customer: { findFirst: jest.fn(findOwned(owned.customer)) },
    project: { findFirst: jest.fn(findOwned(owned.project)) },
    item: { findMany: jest.fn(findManyOwned(owned.item)) },
    account: { findMany: jest.fn(findManyOwned(owned.account)) },
    taxRate: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] }; organizationId: string } }) =>
        Promise.resolve(
          where.id.in
            .filter((id) => taxRates[id]?.org === where.organizationId)
            .map((id) => ({ id, rate: new Decimal(taxRates[id].rate) })),
        ),
      ),
    },
    bill: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'bill-1' }),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    },
  };
}

function baseBill(overrides: Partial<ConfirmIntakeInput> = {}): ConfirmIntakeInput {
  return {
    type: 'BILL',
    vendorId: 'vendor-a',
    date: '2026-09-01',
    dueDate: '2026-10-01',
    lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRatePercent: '14' }],
    ...overrides,
  };
}

describe('DocumentIntakeService', () => {
  let prisma: PrismaMock;
  let feedback: { processFeedback: jest.Mock };
  let service: DocumentIntakeService;

  beforeEach(() => {
    prisma = buildPrisma();
    feedback = { processFeedback: jest.fn().mockResolvedValue(undefined) };
    service = new DocumentIntakeService(
      prisma as unknown as PrismaService,
      {} as OllamaService,
      { resolve: jest.fn().mockResolvedValue(null) } as unknown as ExtractionStrategyResolver,
      {} as DocumentClassificationService,
      {} as EntityExtractionService,
      feedback as unknown as AiFeedbackService,
      {} as ConfigService,
    );
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('confirmAndCreate — tax arithmetic', () => {
    it('2 x 100 at 14% => net 200, tax 28, gross 228 (bill)', async () => {
      const result = await service.confirmAndCreate(ORG_A, baseBill());

      expect(result).toEqual({ type: 'bill', id: 'bill-1', number: 'BILL-001' });
      const data = prisma.bill.create.mock.calls[0][0].data;
      expect(data.organizationId).toBe(ORG_A);
      expect(data.subtotal.toString()).toBe('200');
      expect(data.taxAmount.toString()).toBe('28');
      expect(data.grandTotal.toString()).toBe('228');
      expect(data.balanceDue.toString()).toBe('228');
      const line = data.lines.create[0];
      expect(line.taxRate.toString()).toBe('14');
      expect(line.amount.toString()).toBe('200');
      expect(line.quantity.toString()).toBe('2');
      expect(line.rate.toString()).toBe('100');
    });

    it('2 x 100 at 14% => tax 28, gross 228 (invoice)', async () => {
      const result = await service.confirmAndCreate(ORG_A, {
        ...baseBill(),
        type: 'INVOICE',
        vendorId: undefined,
        customerId: 'customer-a',
      });

      expect(result.type).toBe('invoice');
      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.subtotal.toString()).toBe('200');
      expect(data.taxAmount.toString()).toBe('28');
      expect(data.grandTotal.toString()).toBe('228');
      expect(data.lines.create[0].taxRate.toString()).toBe('14');
      expect(data.lines.create[0].amount.toString()).toBe('200');
    });

    it('rounds tax per line with decimal strings (no float drift)', async () => {
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          lines: [
            { description: 'a', quantity: '3', rate: '0.1', taxRatePercent: '14' },
            { description: 'b', quantity: '1', rate: '33.33', taxRatePercent: '5' },
          ],
        }),
      );
      const data = prisma.bill.create.mock.calls[0][0].data;
      // 0.30 + 33.33 = 33.63; tax 0.04 + 1.67 = 1.71
      expect(data.subtotal.toString()).toBe('33.63');
      expect(data.taxAmount.toString()).toBe('1.71');
      expect(data.grandTotal.toString()).toBe('35.34');
    });

    it('applies invoice line discount percent before tax', async () => {
      await service.confirmAndCreate(ORG_A, {
        ...baseBill(),
        type: 'INVOICE',
        customerId: 'customer-a',
        vendorId: undefined,
        lines: [
          {
            description: 'CPU',
            quantity: '2',
            rate: '100',
            taxRatePercent: '14',
            discountPercent: '10',
          },
        ],
      });
      const data = prisma.invoice.create.mock.calls[0][0].data;
      expect(data.subtotal.toString()).toBe('180');
      expect(data.taxAmount.toString()).toBe('25.2');
      expect(data.lines.create[0].discount.toString()).toBe('10');
    });

    it('uses the tax rate record percentage when taxRateId is given', async () => {
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRateId: 'tax-a-14' }],
        }),
      );
      const line = prisma.bill.create.mock.calls[0][0].data.lines.create[0];
      expect(line.taxRate.toString()).toBe('14');
      expect(line.taxRateId).toBe('tax-a-14');
    });

    it('rejects an unresolved tax rate instead of defaulting to 0', async () => {
      await expect(
        service.confirmAndCreate(
          ORG_A,
          baseBill({ lines: [{ description: 'CPU', quantity: '2', rate: '100' }] }),
        ),
      ).rejects.toThrow(/tax rate is unresolved/);
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('accepts an explicit 0% tax', async () => {
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          lines: [{ description: 'CPU', quantity: '2', rate: '100', taxRatePercent: '0' }],
        }),
      );
      const data = prisma.bill.create.mock.calls[0][0].data;
      expect(data.taxAmount.toString()).toBe('0');
      expect(data.grandTotal.toString()).toBe('200');
    });

    it('rejects a taxRatePercent that contradicts the selected tax rate', async () => {
      await expect(
        service.confirmAndCreate(
          ORG_A,
          baseBill({
            lines: [
              {
                description: 'CPU',
                quantity: '2',
                rate: '100',
                taxRatePercent: '5',
                taxRateId: 'tax-a-14',
              },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('rejects line discounts on bills', async () => {
      await expect(
        service.confirmAndCreate(
          ORG_A,
          baseBill({
            lines: [
              {
                description: 'CPU',
                quantity: '2',
                rate: '100',
                taxRatePercent: '14',
                discountPercent: '10',
              },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmAndCreate — tenant ownership of referenced ids', () => {
    const cases: Array<[string, Partial<ConfirmIntakeInput>]> = [
      ['vendorId', { vendorId: 'vendor-b' }],
      ['projectId', { projectId: 'project-b' }],
      [
        'itemId',
        {
          lines: [
            {
              description: 'x',
              quantity: '1',
              rate: '1',
              taxRatePercent: '0',
              itemId: 'item-b',
            },
          ],
        },
      ],
      [
        'accountId',
        {
          lines: [
            {
              description: 'x',
              quantity: '1',
              rate: '1',
              taxRatePercent: '0',
              accountId: 'account-b',
            },
          ],
        },
      ],
      [
        'taxRateId',
        {
          lines: [{ description: 'x', quantity: '1', rate: '1', taxRateId: 'tax-b-14' }],
        },
      ],
    ];

    it.each(cases)('rejects a foreign %s with 400 and writes nothing', async (field, patch) => {
      const promise = service.confirmAndCreate(ORG_A, baseBill(patch));
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise).rejects.toThrow(field);
      expect(prisma.bill.create).not.toHaveBeenCalled();
      expect(feedback.processFeedback).not.toHaveBeenCalled();
    });

    it('rejects a foreign customerId on invoices with 400 and writes nothing', async () => {
      const promise = service.confirmAndCreate(ORG_A, {
        ...baseBill(),
        type: 'INVOICE',
        vendorId: undefined,
        customerId: 'customer-b',
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('accepts ids owned by the organization and scopes every lookup to it', async () => {
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          projectId: 'project-a',
          lines: [
            {
              description: 'x',
              quantity: '1',
              rate: '1',
              itemId: 'item-a',
              accountId: 'account-a',
              taxRateId: 'tax-a-14',
            },
          ],
        }),
      );
      expect(prisma.bill.create).toHaveBeenCalledTimes(1);
      for (const mock of [
        prisma.vendor.findFirst,
        prisma.project.findFirst,
        prisma.item.findMany,
        prisma.account.findMany,
        prisma.taxRate.findMany,
      ]) {
        expect(mock.mock.calls[0][0].where.organizationId).toBe(ORG_A);
      }
    });

    it('does not log invoice content when creating the draft', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log');
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          notes: 'SECRET-NOTE',
          lines: [{ description: 'SECRET-DESC', quantity: '2', rate: '100', taxRatePercent: '14' }],
        }),
      );
      const logged = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).not.toContain('SECRET');
    });
  });
});
