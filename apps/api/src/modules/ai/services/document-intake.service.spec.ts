import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJobStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { DocumentIntakeService, ConfirmIntakeInput } from './document-intake.service';
import { OllamaService } from './ollama.service';
import { DocumentClassificationService } from './document-classification.service';
import { EntityExtractionService } from './entity-extraction.service';
import { AiFeedbackService } from './ai-feedback.service';
import { computeDocumentTotals } from '../../../common/utils/document-totals';
import { BillsService } from '../../purchases/services/bills.service';
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
  auditLog: { create: jest.Mock; findFirst: jest.Mock };
  intakeJob: { findFirst: jest.Mock };
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  organization: { findUnique: jest.Mock };
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

  const mock: PrismaMock = {
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
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    intakeJob: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $transaction: jest.fn(async (cb: (tx: PrismaMock) => Promise<unknown>) => cb(mock)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    organization: { findUnique: jest.fn().mockResolvedValue({ baseCurrency: 'EGP' }) },
  };
  return mock;
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

  describe('confirmAndCreate — parity with manual bills, currency and bounds', () => {
    const cases: Array<{
      name: string;
      lines: Array<{ q: string; r: string; tax: string; disc?: string }>;
    }> = [
      { name: '2 x 100 @ 14%', lines: [{ q: '2', r: '100', tax: '14' }] },
      {
        name: 'non-100 values, mixed taxes, 3-decimal quantity and rate',
        lines: [
          { q: '3', r: '33.33', tax: '14' },
          { q: '1.375', r: '19.999', tax: '5' },
          { q: '7', r: '0.35', tax: '0' },
        ],
      },
      {
        name: '18% VAT on a 100 net line (gross 118)',
        lines: [{ q: '1', r: '100', tax: '18' }],
      },
      {
        name: 'half-cent rounding per line',
        lines: [
          { q: '1', r: '0.05', tax: '10' },
          { q: '1', r: '0.15', tax: '10' },
        ],
      },
    ];

    it.each(cases)('scanned bill equals manual bill totals: $name', async ({ lines }) => {
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          lines: lines.map((l) => ({
            description: 'x',
            quantity: l.q,
            rate: l.r,
            taxRatePercent: l.tax,
          })),
        }),
      );
      const scanned = prisma.bill.create.mock.calls[0][0].data;

      // Manual path: BillsService.create builds lines with the same shared calculator.
      const manualPrisma = {
        bill: {
          create: jest.fn().mockResolvedValue({ id: 'm' }),
          findFirst: jest.fn().mockResolvedValue(null),
        },
        vendor: { findFirst: jest.fn().mockResolvedValue({ id: 'vendor-a' }) },
      };
      const manual = new BillsService(manualPrisma as never, {} as never);
      await manual.create(ORG_A, {
        vendorId: 'vendor-a',
        date: '2026-09-01',
        dueDate: '2026-10-01',
        billNumber: 'M-1',
        lines: lines.map((l) => ({ description: 'x', quantity: l.q, rate: l.r, taxRate: l.tax })),
      } as never);
      const manualData = manualPrisma.bill.create.mock.calls[0][0].data;

      expect(scanned.subtotal.toString()).toBe(manualData.subtotal.toString());
      expect(scanned.taxAmount.toString()).toBe(manualData.taxAmount.toString());
      expect(scanned.grandTotal.toString()).toBe(manualData.grandTotal.toString());
      const expected = computeDocumentTotals(
        lines.map((l) => ({ quantity: l.q, rate: l.r, taxRatePercent: l.tax })),
      );
      expect(scanned.grandTotal.toString()).toBe(expected.grandTotal.toString());
    });

    it('invoice discount and tax match the shared calculator (discount before tax)', async () => {
      await service.confirmAndCreate(ORG_A, {
        type: 'INVOICE',
        customerId: 'customer-a',
        date: '2026-09-01',
        dueDate: '2026-10-01',
        lines: [
          {
            description: 'a',
            quantity: '3',
            rate: '33.33',
            taxRatePercent: '14',
            discountPercent: '12.5',
          },
          {
            description: 'b',
            quantity: '1.5',
            rate: '20',
            taxRatePercent: '5',
            discountPercent: '0',
          },
        ],
      });
      const data = prisma.invoice.create.mock.calls[0][0].data;
      const expected = computeDocumentTotals([
        { quantity: '3', rate: '33.33', taxRatePercent: '14', discountPercent: '12.5' },
        { quantity: '1.5', rate: '20', taxRatePercent: '5' },
      ]);
      expect(data.subtotal.toString()).toBe(expected.subtotal.toString());
      expect(data.taxAmount.toString()).toBe(expected.taxAmount.toString());
      expect(data.grandTotal.toString()).toBe(expected.grandTotal.toString());
      expect(data.currencyCode).toBe('EGP');
    });

    it('defaults the currency to the organization base currency', async () => {
      await service.confirmAndCreate(ORG_A, baseBill());
      expect(prisma.bill.create.mock.calls[0][0].data.currencyCode).toBe('EGP');
    });

    it('accepts the base currency in any case', async () => {
      await service.confirmAndCreate(ORG_A, baseBill({ currencyCode: 'egp' }));
      expect(prisma.bill.create.mock.calls[0][0].data.currencyCode).toBe('EGP');
    });

    it('rejects a currency different from the base currency and writes nothing', async () => {
      await expect(
        service.confirmAndCreate(ORG_A, baseBill({ currencyCode: 'USD' })),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bill.create).not.toHaveBeenCalled();
    });

    it('rejects a computed total beyond Decimal(19,4) precision', async () => {
      await expect(
        service.confirmAndCreate(
          ORG_A,
          baseBill({
            lines: [
              {
                description: 'x',
                quantity: '999999999999999',
                rate: '999999999999999',
                taxRatePercent: '0',
              },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bill.create).not.toHaveBeenCalled();
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

    it('writes an INTAKE_DRAFT audit marker when jobId is provided', async () => {
      prisma.intakeJob.findFirst.mockResolvedValue({ createdById: 'creator-1' });
      await service.confirmAndCreate(
        ORG_A,
        baseBill({
          jobId: 'job-1',
          userId: 'user-1',
        }),
      );
      expect(prisma.intakeJob.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', organizationId: ORG_A, deletedAt: null },
        select: { createdById: true },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: ORG_A,
          userId: 'user-1',
          action: 'CREATE',
          entityType: 'INTAKE_DRAFT',
          entityId: 'job-1',
          newValues: { draftType: 'bill', draftId: 'bill-1' },
        },
      });
      // Job row lock acquired before draft creation
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT id FROM "intake_jobs" WHERE id = '),
        ]),
        'job-1',
        ORG_A,
      );
      // Draft and marker are written through the same transaction client.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('attributes the marker to the job creator when no user is given', async () => {
      prisma.intakeJob.findFirst.mockResolvedValue({ createdById: 'creator-1' });
      await service.confirmAndCreate(ORG_A, baseBill({ jobId: 'job-2' }));
      expect(prisma.intakeJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-2', organizationId: ORG_A, deletedAt: null } }),
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: 'creator-1' }) }),
      );
    });

    it('fails the transaction instead of creating a draft when jobId is foreign, even if userId is given', async () => {
      prisma.intakeJob.findFirst.mockResolvedValue(null);
      await expect(
        service.confirmAndCreate(ORG_A, baseBill({ jobId: 'job-foreign', userId: 'user-foreign' })),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.intakeJob.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-foreign', organizationId: ORG_A, deletedAt: null },
        select: { createdById: true },
      });
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('acquires the job row lock before creating a draft invoice with jobId', async () => {
      prisma.intakeJob.findFirst.mockResolvedValue({ createdById: 'creator-inv' });
      await service.confirmAndCreate(ORG_A, {
        type: 'INVOICE',
        customerId: 'customer-a',
        date: '2026-09-01',
        dueDate: '2026-10-01',
        lines: [{ description: 'Consulting', quantity: '1', rate: '200', taxRatePercent: '14' }],
        jobId: 'job-inv-1',
      });
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT id FROM "intake_jobs" WHERE id = '),
        ]),
        'job-inv-1',
        ORG_A,
      );
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: ORG_A,
            entityType: 'INTAKE_DRAFT',
            entityId: 'job-inv-1',
            newValues: { draftType: 'invoice', draftId: 'invoice-1' },
          }),
        }),
      );
    });

    it.each(['BILL', 'INVOICE'] as const)(
      'uses the caller transaction for the %s draft, lock and marker without a nested transaction',
      async (type) => {
        const tx = buildPrisma();
        // Direct service callers need tenant ownership, without an APPROVED lookup filter.
        tx.intakeJob.findFirst.mockResolvedValue({
          createdById: 'creator-1',
          status: IntakeJobStatus.EXTRACTED,
        });
        const result = await service.confirmAndCreate(
          ORG_A,
          baseBill({ type, customerId: 'customer-a', jobId: 'job-tx', userId: 'actor-1' }),
          tx as unknown as Prisma.TransactionClient,
        );
        const create = type === 'BILL' ? tx.bill.create : tx.invoice.create;
        expect(result.id).toBe(type === 'BILL' ? 'bill-1' : 'invoice-1');
        expect(create).toHaveBeenCalledTimes(1);
        const data = create.mock.calls[0][0].data;
        expect(data.currencyCode).toBe('EGP');
        expect(data.subtotal.toFixed(4)).toBe('200.0000');
        expect(data.taxAmount.toFixed(4)).toBe('28.0000');
        expect(data.grandTotal.toFixed(4)).toBe('228.0000');
        expect(data.balanceDue.toFixed(4)).toBe('228.0000');
        expect(data.lines.create[0].taxRate.toFixed(4)).toBe('14.0000');
        expect(data.lines.create[0].amount.toFixed(4)).toBe('200.0000');
        expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
        expect(tx.intakeJob.findFirst).toHaveBeenCalledWith({
          where: { id: 'job-tx', organizationId: ORG_A, deletedAt: null },
          select: { createdById: true },
        });
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
          create.mock.invocationCallOrder[0],
        );
        expect(create.mock.invocationCallOrder[0]).toBeLessThan(
          tx.auditLog.create.mock.invocationCallOrder[0],
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(tx.$transaction).not.toHaveBeenCalled();
        expect(prisma.bill.create).not.toHaveBeenCalled();
        expect(prisma.invoice.create).not.toHaveBeenCalled();
        expect(prisma.auditLog.create).not.toHaveBeenCalled();
        expect(feedback.processFeedback).not.toHaveBeenCalled();
        expect(Logger.prototype.log).not.toHaveBeenCalled();
        await service.recordConfirmation(ORG_A, baseBill({ type }), result);
        expect(Logger.prototype.log).toHaveBeenCalledTimes(1);
        expect(feedback.processFeedback).toHaveBeenCalledTimes(type === 'BILL' ? 1 : 0);
      },
    );

    describe.each(['BILL', 'INVOICE'] as const)('%s marker ownership', (type) => {
      it.each(['foreign', 'missing', 'deleted'] as const)(
        'rejects a %s job with an explicit actor and commits neither draft nor marker',
        async (kind) => {
          const tx = buildPrisma();
          const jobs =
            kind === 'missing'
              ? []
              : [
                  {
                    id: 'unavailable-job',
                    organizationId: kind === 'foreign' ? ORG_B : ORG_A,
                    deletedAt: kind === 'deleted' ? new Date() : null,
                    createdById: 'creator-1',
                  },
                ];
          tx.intakeJob.findFirst.mockImplementation(({ where }) =>
            Promise.resolve(
              jobs.find(
                (job) =>
                  job.id === where.id &&
                  job.organizationId === where.organizationId &&
                  job.deletedAt === where.deletedAt,
              ) ?? null,
            ),
          );
          const committed: unknown[] = [];
          prisma.$transaction.mockImplementation(async (callback) => {
            const result = await callback(tx);
            committed.push(result);
            return result;
          });
          await expect(
            service.confirmAndCreate(
              ORG_A,
              baseBill({
                type,
                customerId: 'customer-a',
                jobId: 'unavailable-job',
                userId: 'actor-1',
              }),
            ),
          ).rejects.toThrow(BadRequestException);
          expect(tx.intakeJob.findFirst).toHaveBeenCalledWith({
            where: { id: 'unavailable-job', organizationId: ORG_A, deletedAt: null },
            select: { createdById: true },
          });
          expect(tx.auditLog.create).not.toHaveBeenCalled();
          expect(committed).toEqual([]);
          expect(prisma.auditLog.create).not.toHaveBeenCalled();
          expect(feedback.processFeedback).not.toHaveBeenCalled();
          expect(Logger.prototype.log).not.toHaveBeenCalled();
        },
      );
    });

    it('fails closed without creating a draft or marker when the row lock fails', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('lock failed'));
      await expect(
        service.confirmAndCreate(ORG_A, baseBill({ jobId: 'job-1', userId: 'actor-1' })),
      ).rejects.toThrow('lock failed');
      expect(prisma.bill.create).not.toHaveBeenCalled();
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('writes no marker for a confirm without an intake job', async () => {
      await service.confirmAndCreate(ORG_A, baseBill());
      expect(prisma.auditLog.create).not.toHaveBeenCalled();
    });
  });
});
