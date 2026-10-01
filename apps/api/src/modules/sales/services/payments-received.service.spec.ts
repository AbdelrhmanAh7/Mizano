import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentsReceivedService } from './payments-received.service';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { createMockCustomer } from '../../../test/helpers/test-utils';
import { dec } from '../../../test/helpers/decimal.helpers';
import { PaymentModeFilter } from '../dto/payment-received-query.dto';

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    invoiceNumber: 'INV-0001',
    organizationId: 'org-test-001',
    customerId: 'cust-test-001',
    status: 'SENT',
    grandTotal: dec('1000'),
    balanceDue: dec('1000'),
    deletedAt: null,
    ...overrides,
  };
}

describe('PaymentsReceivedService', () => {
  let service: PaymentsReceivedService;
  let prisma: MockPrismaClient;
  let invoicesService: { lockInvoices: jest.Mock; recalculateBalance: jest.Mock };
  let journalsService: { create: jest.Mock; reverse: jest.Mock };

  const ORG_ID = 'org-test-001';

  beforeEach(async () => {
    prisma = createMockPrisma();
    invoicesService = {
      lockInvoices: jest.fn().mockResolvedValue(undefined),
      recalculateBalance: jest.fn().mockResolvedValue(undefined),
    };
    journalsService = {
      create: jest.fn().mockResolvedValue({}),
      reverse: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsReceivedService,
        { provide: PrismaService, useValue: prisma },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: JournalsService, useValue: journalsService },
      ],
    }).compile();

    service = module.get<PaymentsReceivedService>(PaymentsReceivedService);
  });

  describe('create', () => {
    const validDto = {
      customerId: 'cust-test-001',
      date: '2024-07-15',
      amount: '400',
      paymentMode: 'BANK_TRANSFER' as any,
      depositToAccountId: 'bank-acc-001',
      allocations: [{ invoiceId: 'inv-1', amount: '400' }],
    };

    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.account.findFirst.mockResolvedValue({ id: 'bank-acc-001', name: 'Bank' } as any);
      prisma.organization.findUnique.mockResolvedValue({ defaultArAccountId: 'ar-acc-001' } as any);
      prisma.invoice.findMany.mockResolvedValue([invoiceRow()] as any);
      prisma.$queryRaw.mockResolvedValue([{ max: 4 }] as any);
      prisma.paymentReceived.create.mockImplementation((async (args: any) => ({
        id: 'pmt-1',
        ...args.data,
      })) as any);
    });

    it('records the payment, recalculates the invoice and posts Dr bank / Cr AR atomically', async () => {
      await service.create(ORG_ID, validDto);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1']);
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-1');
      const createData = prisma.paymentReceived.create.mock.calls[0][0].data as any;
      expect(createData.paymentNumber).toBe('PMT-005');
      expect(createData.organizationId).toBe(ORG_ID);

      expect(journalsService.create).toHaveBeenCalledTimes(1);
      const [orgId, journalDto, options] = journalsService.create.mock.calls[0];
      expect(orgId).toBe(ORG_ID);
      expect(options).toEqual({ tx: prisma, source: { type: 'PAYMENT_RECEIVED', id: 'pmt-1' } });
      expect(journalDto.date).toBe(new Date('2024-07-15').toISOString());
      expect(journalDto.lines).toEqual([
        expect.objectContaining({ accountId: 'bank-acc-001', debit: '400.0000', credit: '0' }),
        expect.objectContaining({ accountId: 'ar-acc-001', debit: '0', credit: '400.0000' }),
      ]);
    });

    it('stores the payment amount and allocations as Decimal', async () => {
      await service.create(ORG_ID, validDto);

      const createData = prisma.paymentReceived.create.mock.calls[0][0].data as any;
      expect(createData.amount).toBeInstanceOf(Decimal);
      expect(createData.allocations.create[0].amount).toBeInstanceOf(Decimal);
    });

    it('commits payment, balances and journal together; a journal failure rolls all of it back', async () => {
      // Transaction fake with commit/rollback semantics: writes made while the callback runs
      // are only committed when it resolves.
      const committed: string[] = [];
      let pending: string[] = [];
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        pending = [];
        const result = await fn(prisma);
        committed.push(...pending);
        return result;
      });
      prisma.paymentReceived.create.mockImplementation((async (args: any) => {
        pending.push('payment');
        return { id: 'pmt-1', ...args.data };
      }) as any);
      invoicesService.recalculateBalance.mockImplementation(async () => {
        pending.push('invoice.balance');
      });

      journalsService.create.mockRejectedValue(new BadRequestException('This period is locked'));
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('This period is locked');
      expect(committed).toEqual([]);

      journalsService.create.mockResolvedValue({});
      await service.create(ORG_ID, validDto);
      expect(committed).toEqual(['payment', 'invoice.balance']);
    });

    it('rejects an overpayment without writing anything', async () => {
      await expect(
        service.create(ORG_ID, {
          ...validDto,
          amount: '1000.01',
          allocations: [{ invoiceId: 'inv-1', amount: '1000.01' }],
        }),
      ).rejects.toThrow('exceeds the balance due');
      expect(prisma.paymentReceived.create).not.toHaveBeenCalled();
      expect(journalsService.create).not.toHaveBeenCalled();
    });

    it('accepts a payment of exactly the balance due', async () => {
      await service.create(ORG_ID, {
        ...validDto,
        amount: '1000',
        allocations: [{ invoiceId: 'inv-1', amount: '1000' }],
      });
      expect(prisma.paymentReceived.create).toHaveBeenCalledTimes(1);
    });

    it('compares allocations to the payment with exact Decimal arithmetic', async () => {
      await expect(service.create(ORG_ID, { ...validDto, amount: '400.01' })).rejects.toThrow(
        'Allocation must equal payment',
      );

      // 0.1 + 0.2 equals 0.3 exactly in Decimal arithmetic (it does not in floats).
      prisma.invoice.findMany.mockResolvedValue([
        invoiceRow({ id: 'inv-1' }),
        invoiceRow({ id: 'inv-2', invoiceNumber: 'INV-0002' }),
      ] as any);
      await expect(
        service.create(ORG_ID, {
          ...validDto,
          amount: '0.3',
          allocations: [
            { invoiceId: 'inv-1', amount: '0.1' },
            { invoiceId: 'inv-2', amount: '0.2' },
          ],
        }),
      ).resolves.toBeDefined();
    });

    it('rejects non-positive, malformed and over-precise amounts', async () => {
      for (const amount of ['0', '-5', 'abc', '10.00001']) {
        await expect(
          service.create(ORG_ID, {
            ...validDto,
            amount,
            allocations: [{ invoiceId: 'inv-1', amount }],
          }),
        ).rejects.toThrow(BadRequestException);
      }
      expect(prisma.paymentReceived.create).not.toHaveBeenCalled();
    });

    it('rejects the same invoice allocated twice', async () => {
      await expect(
        service.create(ORG_ID, {
          ...validDto,
          amount: '200',
          allocations: [
            { invoiceId: 'inv-1', amount: '100' },
            { invoiceId: 'inv-1', amount: '100' },
          ],
        }),
      ).rejects.toThrow('only be allocated once');
    });

    it('rejects an invalid payment date', async () => {
      await expect(service.create(ORG_ID, { ...validDto, date: 'not-a-date' })).rejects.toThrow(
        'Invalid payment date',
      );
    });

    it('rejects a customer from another organization', async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Customer not found');
      expect(prisma.customer.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });

    it('rejects a deposit account from another organization or an inactive one', async () => {
      prisma.account.findFirst.mockResolvedValue(null);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow(
        'Deposit account not found or inactive',
      );
      expect(prisma.account.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        isActive: true,
        deletedAt: null,
      });
    });

    it('treats an invoice of another organization as not found', async () => {
      prisma.invoice.findMany.mockResolvedValue([]);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Invoice not found');
      expect(prisma.invoice.findMany.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        deletedAt: null,
      });
    });

    it('rejects an invoice that belongs to a different customer', async () => {
      prisma.invoice.findMany.mockResolvedValue([invoiceRow({ customerId: 'other' })] as any);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('different customer');
    });

    it.each(['DRAFT', 'VOID', 'PAID'])('rejects an invoice in status %s', async (status) => {
      prisma.invoice.findMany.mockResolvedValue([invoiceRow({ status })] as any);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('not open for payment');
      expect(prisma.paymentReceived.create).not.toHaveBeenCalled();
    });

    it('rejects payments when no AR account is configured instead of skipping the journal', async () => {
      prisma.organization.findUnique.mockResolvedValue({ defaultArAccountId: null } as any);
      await expect(service.create(ORG_ID, validDto)).rejects.toThrow('Accounts Receivable');
      expect(prisma.paymentReceived.create).not.toHaveBeenCalled();
    });

    it('runs inside a caller transaction when one is given', async () => {
      await service.create(ORG_ID, validDto, { tx: prisma });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(journalsService.create).toHaveBeenCalled();
    });
  });

  describe('recordForInvoice (POST /invoices/:id/record-payment)', () => {
    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.account.findFirst.mockResolvedValue({ id: 'bank-1', name: 'Bank' } as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar',
        defaultBankAccountId: 'bank-default',
        defaultCashAccountId: null,
      } as any);
      prisma.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        customerId: 'cust-test-001',
      } as any);
      prisma.invoice.findMany.mockResolvedValue([invoiceRow()] as any);
      prisma.$queryRaw.mockResolvedValue([{ max: null }] as any);
      prisma.paymentReceived.create.mockImplementation((async (args: any) => ({
        id: 'pmt-1',
        ...args.data,
      })) as any);
    });

    it('delegates to create with the legacy bankAccountId as the deposit account', async () => {
      await service.recordForInvoice(ORG_ID, 'inv-1', {
        amount: '250',
        date: '2024-07-01',
        bankAccountId: 'bank-1',
      });

      const createData = prisma.paymentReceived.create.mock.calls[0][0].data as any;
      expect(createData.paymentNumber).toBe('PMT-001');
      expect(createData.depositToAccountId).toBe('bank-1');
      expect(createData.paymentMode).toBe('BANK_TRANSFER');
      expect(createData.customerId).toBe('cust-test-001');
      expect(createData.allocations.create).toEqual([
        { invoiceId: 'inv-1', amount: expect.any(Decimal) },
      ]);
      expect(journalsService.create).toHaveBeenCalledTimes(1);
    });

    it('defaults to the organization bank account', async () => {
      await service.recordForInvoice(ORG_ID, 'inv-1', { amount: '250', date: '2024-07-01' });
      expect(prisma.paymentReceived.create.mock.calls[0][0].data.depositToAccountId).toBe(
        'bank-default',
      );
    });

    it('rejects an overpayment through the same validation as create', async () => {
      await expect(
        service.recordForInvoice(ORG_ID, 'inv-1', { amount: '1000.01', date: '2024-07-01' }),
      ).rejects.toThrow('exceeds the balance due');
    });

    it('treats another tenant invoice as not found', async () => {
      prisma.invoice.findFirst.mockResolvedValue(null);
      await expect(
        service.recordForInvoice(ORG_ID, 'inv-x', { amount: '1', date: '2024-07-01' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.invoice.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
      });
    });
  });

  describe('payInvoiceInFull / bulkPayInvoices', () => {
    beforeEach(() => {
      prisma.customer.findFirst.mockResolvedValue(createMockCustomer() as any);
      prisma.account.findFirst.mockResolvedValue({ id: 'bank-default', name: 'Bank' } as any);
      prisma.organization.findUnique.mockResolvedValue({
        defaultArAccountId: 'ar',
        defaultBankAccountId: 'bank-default',
        defaultCashAccountId: 'cash',
      } as any);
      prisma.$queryRaw.mockResolvedValue([{ max: 0 }] as any);
      prisma.paymentReceived.create.mockImplementation((async (args: any) => ({
        id: 'pmt-1',
        ...args.data,
      })) as any);
    });

    function stubInvoices(rows: Record<string, ReturnType<typeof invoiceRow>>) {
      prisma.invoice.findFirst.mockImplementation(
        (async (args: any) => rows[args.where.id] ?? null) as any,
      );
      prisma.invoice.findMany.mockImplementation((async (args: any) =>
        args.where.id.in.map((id: string) => rows[id]).filter(Boolean)) as any);
    }

    it('records a real payment for the full balance from the default bank account', async () => {
      stubInvoices({ 'inv-1': invoiceRow({ balanceDue: dec('228') }) });

      await service.payInvoiceInFull(ORG_ID, 'inv-1');

      const createData = prisma.paymentReceived.create.mock.calls[0][0].data as any;
      expect(createData.depositToAccountId).toBe('bank-default');
      expect(createData.amount.toFixed(4)).toBe('228.0000');
      expect(journalsService.create).toHaveBeenCalledTimes(1);
      expect(journalsService.create.mock.calls[0][2].source.type).toBe('PAYMENT_RECEIVED');
    });

    it('falls back to the default cash account, then fails clearly', async () => {
      stubInvoices({ 'inv-1': invoiceRow() });
      prisma.organization.findUnique.mockResolvedValueOnce({
        defaultBankAccountId: null,
        defaultCashAccountId: 'cash',
      } as any);
      await service.payInvoiceInFull(ORG_ID, 'inv-1');
      expect(prisma.paymentReceived.create.mock.calls[0][0].data.depositToAccountId).toBe('cash');

      prisma.organization.findUnique.mockResolvedValueOnce({
        defaultBankAccountId: null,
        defaultCashAccountId: null,
      } as any);
      await expect(service.payInvoiceInFull(ORG_ID, 'inv-1')).rejects.toThrow(
        'Choose a deposit account',
      );
    });

    it('reports per-invoice failures and still pays the others', async () => {
      stubInvoices({
        'inv-1': invoiceRow({ id: 'inv-1' }),
        'inv-2': invoiceRow({ id: 'inv-2', status: 'DRAFT', invoiceNumber: 'INV-0002' }),
        'inv-3': invoiceRow({ id: 'inv-3', status: 'PAID', balanceDue: dec('0') }),
      });

      const result = await service.bulkPayInvoices(ORG_ID, ['inv-1', 'inv-2', 'inv-3', 'foreign']);

      expect(result.processed).toBe(1);
      expect(result.total).toBe(4);
      expect(result.failures?.map((f) => f.id)).toEqual(['inv-2', 'inv-3', 'foreign']);
      expect(result.failures?.[2].reason).toBe('Invoice not found');
      expect(prisma.paymentReceived.create).toHaveBeenCalledTimes(1);
      expect(journalsService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('void', () => {
    it('restores balances, soft-deletes and posts a linked PAYMENT_RECEIVED_VOID reversal', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue({
        id: 'pmt-1',
        allocations: [{ invoiceId: 'inv-1' }, { invoiceId: 'inv-2' }],
      } as any);
      prisma.paymentReceived.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1' } as any);

      const result = await service.void(ORG_ID, 'pmt-1');

      expect(result.message).toBe('Payment voided successfully');
      expect(invoicesService.lockInvoices).toHaveBeenCalledWith(prisma, ['inv-1', 'inv-2']);
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-1');
      expect(invoicesService.recalculateBalance).toHaveBeenCalledWith(prisma, 'inv-2');
      expect(prisma.paymentReceived.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'pmt-1', organizationId: ORG_ID, deletedAt: null },
      });
      expect(prisma.journal.findFirst.mock.calls[0][0]!.where).toMatchObject({
        organizationId: ORG_ID,
        sourceType: 'PAYMENT_RECEIVED',
        sourceId: 'pmt-1',
      });
      expect(journalsService.reverse).toHaveBeenCalledWith(ORG_ID, 'j1', undefined, {
        tx: prisma,
        source: { type: 'PAYMENT_RECEIVED_VOID', id: 'pmt-1' },
      });
    });

    it('treats another tenant payment, or an already voided one, as not found', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);
      await expect(service.void(ORG_ID, 'pmt-x')).rejects.toThrow(NotFoundException);

      prisma.paymentReceived.findFirst.mockResolvedValue({ id: 'pmt-1', allocations: [] } as any);
      prisma.paymentReceived.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.void(ORG_ID, 'pmt-1')).rejects.toThrow(NotFoundException);
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('refuses to void a legacy payment with no linked journal (ledger would not reverse)', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue({
        id: 'pmt-1',
        allocations: [{ invoiceId: 'inv-1' }],
      } as any);
      prisma.paymentReceived.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue(null);

      await expect(service.void(ORG_ID, 'pmt-1')).rejects.toThrow('no linked ledger entry');
      expect(journalsService.reverse).not.toHaveBeenCalled();
    });

    it('bulkDelete voids per record and reports failures', async () => {
      prisma.paymentReceived.findFirst.mockImplementation(((args: any) =>
        Promise.resolve(
          args.where.id === 'pmt-1' ? { id: 'pmt-1', allocations: [] } : null,
        )) as any);
      prisma.paymentReceived.updateMany.mockResolvedValue({ count: 1 });
      prisma.journal.findFirst.mockResolvedValue({ id: 'j1' } as any);

      const result = await service.bulkDelete(ORG_ID, ['pmt-1', 'pmt-1', 'foreign']);

      expect(result).toEqual({
        processed: 1,
        total: 2,
        failures: [{ id: 'foreign', reason: 'Payment not found' }],
      });
      expect(journalsService.reverse).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return payment with customer and allocations', async () => {
      const mockPayment = {
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        organizationId: ORG_ID,
        customer: createMockCustomer(),
        allocations: [],
      };
      prisma.paymentReceived.findFirst.mockResolvedValue(mockPayment as any);

      const result = await service.findOne(ORG_ID, 'pmt-1');
      expect(result.paymentNumber).toBe('PMT-001');
    });

    it('should throw NotFoundException when payment not found', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);

      await expect(service.findOne(ORG_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should filter by organizationId and exclude soft-deleted', async () => {
      prisma.paymentReceived.findFirst.mockResolvedValue(null);

      try {
        await service.findOne(ORG_ID, 'pmt-1');
      } catch {
        // Expected
      }

      const findCall = prisma.paymentReceived.findFirst.mock.calls[0]![0]!;
      expect(findCall.where!.organizationId).toBe(ORG_ID);
      expect(findCall.where!.deletedAt).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated results with default params', async () => {
      const mockPayment = {
        id: 'pmt-1',
        paymentNumber: 'PMT-001',
        amount: dec('1000'),
        customer: { id: 'cust-1', name: 'Acme Corp' },
      };
      prisma.paymentReceived.findMany.mockResolvedValue([mockPayment] as never);
      prisma.paymentReceived.count.mockResolvedValue(1);

      const result = await service.findAll(ORG_ID, {});

      expect(result).toEqual({
        data: [mockPayment],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.where!.organizationId).toBe(ORG_ID);
      expect(findManyArgs.where!.deletedAt).toBeNull();
      expect(findManyArgs.orderBy).toEqual({ date: 'desc' });
      expect(findManyArgs.skip).toBe(0);
      expect(findManyArgs.take).toBe(20);
    });

    it('should filter by customerId when provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { customerId: 'cust-abc' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.customerId).toBe('cust-abc');
      expect(whereArg.organizationId).toBe(ORG_ID);
      expect(whereArg.deletedAt).toBeNull();
    });

    it('should not add customerId to where when not provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.customerId).toBeUndefined();
    });

    it('should filter by paymentMode when provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { paymentMode: PaymentModeFilter.BANK_TRANSFER });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.paymentMode).toBe('BANK_TRANSFER');
    });

    it('should not add paymentMode to where when not provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.paymentMode).toBeUndefined();
    });

    it('should filter by dateFrom only', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateFrom: '2026-01-01' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-01-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toBeUndefined();
    });

    it('should filter by dateTo only', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateTo: '2026-12-31' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-12-31'));
      expect((whereArg.date as Record<string, unknown>).gte).toBeUndefined();
    });

    it('should filter by date range (dateFrom and dateTo)', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { dateFrom: '2026-01-01', dateTo: '2026-06-30' });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeDefined();
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-01-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-06-30'));
    });

    it('should not add date filter when no date params provided', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.date).toBeUndefined();
    });

    it('should respect page and limit parameters', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(50);

      await service.findAll(ORG_ID, { page: 3, limit: 10 });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.skip).toBe(20); // (3-1) * 10
      expect(findManyArgs.take).toBe(10);
    });

    it('should respect sortBy and sortOrder parameters', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, { sortBy: 'amount', sortOrder: 'asc' });

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.orderBy).toEqual({ amount: 'asc' });
    });

    it('should return correct totalPages calculation', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(45);

      const result = await service.findAll(ORG_ID, { limit: 10 });

      expect(result.meta.totalPages).toBe(5); // ceil(45/10)
    });

    it('should combine multiple filters simultaneously', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {
        customerId: 'cust-xyz',
        paymentMode: PaymentModeFilter.CASH,
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
      });

      const whereArg = prisma.paymentReceived.findMany.mock.calls[0]![0]!.where!;
      expect(whereArg.organizationId).toBe(ORG_ID);
      expect(whereArg.customerId).toBe('cust-xyz');
      expect(whereArg.paymentMode).toBe('CASH');
      expect((whereArg.date as Record<string, unknown>).gte).toEqual(new Date('2026-03-01'));
      expect((whereArg.date as Record<string, unknown>).lte).toEqual(new Date('2026-03-31'));
      expect(whereArg.deletedAt).toBeNull();
    });

    it('should include customer relation in query', async () => {
      prisma.paymentReceived.findMany.mockResolvedValue([]);
      prisma.paymentReceived.count.mockResolvedValue(0);

      await service.findAll(ORG_ID, {});

      const findManyArgs = prisma.paymentReceived.findMany.mock.calls[0]![0]!;
      expect(findManyArgs.include).toEqual({
        customer: { select: { id: true, name: true } },
      });
    });
  });
});
