import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsMadeService } from './payments-made.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JournalsService } from '../../accounting/services/journals.service';
import { BillsService } from './bills.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { createMockBill } from '../../../test/helpers/test-utils';
import { dec } from '../../../test/helpers/decimal.helpers';

const mockFindMany = jest.fn();
const mockCount = jest.fn();

const prismaServiceMock = {
  paymentMade: { findMany: mockFindMany, count: mockCount },
};

describe('PaymentsMadeService.findAll', () => {
  let service: PaymentsMadeService;

  beforeEach(async () => {
    mockFindMany.mockReset();
    mockCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsMadeService,
        { provide: PrismaService, useValue: prismaServiceMock },
        { provide: JournalsService, useValue: {} },
        { provide: BillsService, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentsMadeService>(PaymentsMadeService);
  });

  it('filters by vendorId when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { vendorId: 'vend-xyz', limit: 100 });

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBe('vend-xyz');
    expect(whereArg.organizationId).toBe('org-1');
    expect(whereArg.deletedAt).toBeNull();
  });

  it('does not add vendorId to where when not provided', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', {});

    const whereArg = mockFindMany.mock.calls[0][0].where;
    expect(whereArg.vendorId).toBeUndefined();
  });

  it('respects limit parameter', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);

    await service.findAll('org-1', { limit: 100 });

    expect(mockFindMany.mock.calls[0][0].take).toBe(100);
  });

  it('returns paginated response shape', async () => {
    mockFindMany.mockResolvedValue([{ id: 'pm-1' }]);
    mockCount.mockResolvedValue(1);

    const result = await service.findAll('org-1', {});

    expect(result).toEqual({
      data: [{ id: 'pm-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});

describe('PaymentsMadeService (posting)', () => {
  const ORG = 'org-1';
  let service: PaymentsMadeService;
  // Partial fixtures are enough for these flows; loosen the deep-mock typing.
  let prisma: any;
  let bills: { lockBills: jest.Mock; recalculateBalance: jest.Mock };
  let journals: { create: jest.Mock; reverse: jest.Mock };

  const dto = {
    vendorId: 'v1',
    date: '2024-07-01',
    amount: '100.00',
    paymentMode: 'BANK_TRANSFER' as const,
    paidFromAccountId: 'bank-acc',
    allocations: [{ billId: 'b1', amount: '100.00' }],
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    bills = { lockBills: jest.fn(), recalculateBalance: jest.fn() };
    journals = { create: jest.fn().mockResolvedValue({}), reverse: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsMadeService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journals },
        { provide: BillsService, useValue: bills },
      ],
    }).compile();
    service = module.get(PaymentsMadeService);

    prisma.vendor.findFirst.mockResolvedValue({ id: 'v1' });
    prisma.account.findFirst.mockResolvedValue({ id: 'bank-acc' });
    prisma.organization.findUnique.mockResolvedValue({ defaultApAccountId: 'ap' });
    prisma.bill.findMany.mockResolvedValue([
      createMockBill({ id: 'b1', vendorId: 'v1', status: 'OPEN', balanceDue: dec('228') }),
    ]);
    prisma.$queryRaw.mockResolvedValue([{ max: 4 }]);
    prisma.paymentMade.create.mockResolvedValue({ id: 'p1', paymentNumber: 'VPMT-005' });
  });

  it('records a partial payment, recalculates the bill and posts Dr AP / Cr bank atomically', async () => {
    await service.create(ORG, dto);

    expect(bills.lockBills).toHaveBeenCalledWith(prisma, ['b1']);
    expect(bills.recalculateBalance).toHaveBeenCalledWith(prisma, 'b1');
    expect(prisma.paymentMade.create.mock.calls[0][0].data.paymentNumber).toBe('VPMT-005');
    const [, journalDto, options] = journals.create.mock.calls[0];
    expect(options).toEqual({ tx: prisma, source: { type: 'PAYMENT_MADE', id: 'p1' } });
    expect(journalDto.lines).toEqual([
      expect.objectContaining({ accountId: 'ap', debit: '100.0000' }),
      expect.objectContaining({ accountId: 'bank-acc', credit: '100.0000' }),
    ]);
  });

  it('rejects an allocation above the bill balance without writing anything', async () => {
    await expect(
      service.create(ORG, {
        ...dto,
        amount: '300',
        allocations: [{ billId: 'b1', amount: '300' }],
      }),
    ).rejects.toThrow('exceeds the balance due');
    expect(prisma.paymentMade.create).not.toHaveBeenCalled();
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('rejects a bill from another organization or vendor', async () => {
    prisma.bill.findMany.mockResolvedValue([]);
    await expect(service.create(ORG, dto)).rejects.toThrow('Bill not found');

    prisma.bill.findMany.mockResolvedValue([
      createMockBill({ id: 'b1', vendorId: 'other', status: 'OPEN', balanceDue: dec('228') }),
    ]);
    await expect(service.create(ORG, dto)).rejects.toThrow('different vendor');
  });

  it('rejects a paid-from account from another organization', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.create(ORG, dto)).rejects.toThrow('Paid-from account not found');
  });

  it('rejects allocations that do not equal the payment amount (Decimal-exact)', async () => {
    await expect(service.create(ORG, { ...dto, amount: '100.01' })).rejects.toThrow(
      'Allocation must equal payment',
    );
  });

  it('rejects payments when no AP account is configured instead of skipping the journal', async () => {
    prisma.organization.findUnique.mockResolvedValue({ defaultApAccountId: null });
    await expect(service.create(ORG, dto)).rejects.toThrow('Accounts Payable');
    expect(prisma.paymentMade.create).not.toHaveBeenCalled();
  });

  it('void restores balances and posts a linked reversal', async () => {
    prisma.paymentMade.findFirst.mockResolvedValue({ id: 'p1', allocations: [{ billId: 'b1' }] });
    prisma.paymentMade.updateMany.mockResolvedValue({ count: 1 });
    prisma.journal.findFirst.mockResolvedValue({ id: 'j1' });

    await service.void(ORG, 'p1');

    expect(bills.recalculateBalance).toHaveBeenCalledWith(prisma, 'b1');
    expect(journals.reverse).toHaveBeenCalledWith(ORG, 'j1', undefined, {
      tx: prisma,
      source: { type: 'PAYMENT_MADE_VOID', id: 'p1' },
    });
  });
});
