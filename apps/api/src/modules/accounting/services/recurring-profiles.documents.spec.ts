import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { BillsService } from '../../purchases/services/bills.service';
import { ExpensesService } from '../../purchases/services/expenses.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { JournalsService } from './journals.service';
import { RecurringProfilesService } from './recurring-profiles.service';

const ORG = 'org-1';
const OCCURRENCE = new Date('2026-03-01T00:00:00.000Z');

/* eslint-disable @typescript-eslint/no-explicit-any */
function profile(type: string, templateData: Record<string, unknown>): any {
  return {
    id: 'prof-1',
    name: 'Monthly thing',
    type: type.toUpperCase(),
    entityType: type,
    frequency: 'MONTHLY',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    nextRunDate: OCCURRENCE,
    isActive: true,
    autoPost: true,
    templateData,
    organizationId: ORG,
    deletedAt: null,
  };
}

describe('RecurringProfilesService (invoice, bill and expense profiles)', () => {
  let service: RecurringProfilesService;
  let prisma: any;
  let invoices: { create: jest.Mock };
  let bills: { create: jest.Mock };
  let expenses: { create: jest.Mock };

  const run = (p: any, key?: string): Promise<any> =>
    (service as any).executeRecurringProfile(p, key);

  beforeEach(() => {
    prisma = createMockPrisma();
    invoices = { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
    bills = { create: jest.fn().mockResolvedValue({ id: 'bill-1' }) };
    expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const services = new Map<unknown, unknown>([
      [InvoicesService, invoices],
      [BillsService, bills],
      [ExpensesService, expenses],
    ]);
    const moduleRef = { get: (token: unknown) => services.get(token) } as unknown as ModuleRef;
    service = new RecurringProfilesService(
      prisma as unknown as PrismaService,
      {} as JournalsService,
      moduleRef,
    );
    prisma.recurringProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.invoice.findFirst.mockResolvedValue(null);
    prisma.bill.findFirst.mockResolvedValue(null);
    prisma.expense.findFirst.mockResolvedValue(null);
    prisma.customer.findFirst.mockResolvedValue({ id: 'c1', paymentTerms: 15 });
    prisma.vendor.findFirst.mockResolvedValue({ id: 'v1', paymentTerms: 45 });
  });

  const invoiceProfile = (): any =>
    profile('invoice', {
      customerId: 'c1',
      notes: 'Hosting',
      shippingAmount: 0.1,
      lines: [{ description: 'Hosting', quantity: 2, rate: 0.1, taxRate: 14, discount: 0 }],
    });

  it('creates the invoice through InvoicesService as a decimal-string DRAFT dated on the occurrence', async () => {
    const result = await run(invoiceProfile());

    expect(result).toEqual({
      success: true,
      createdEntityType: 'INVOICE',
      createdEntityId: 'inv-1',
    });
    const [org, dto, options] = invoices.create.mock.calls[0];
    expect(org).toBe(ORG);
    expect(options).toEqual({ tx: prisma });
    expect(dto.date).toBe(OCCURRENCE.toISOString());
    expect(dto.dueDate).toBe(new Date('2026-03-16T00:00:00.000Z').toISOString());
    expect(dto.shippingAmount).toBe('0.1');
    expect(dto.lines[0]).toMatchObject({ quantity: '2', rate: '0.1', taxRate: '14' });
    expect(dto.notes).toContain('[recurring prof-1:2026-03-01]');
    expect(prisma.invoice.create).not.toHaveBeenCalled(); // no direct prisma writes
  });

  it('advances nextRunDate, counts the run and records the execution in the same transaction', async () => {
    await run(invoiceProfile());

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const guard = prisma.recurringProfile.updateMany.mock.calls[0][0];
    expect(guard.where).toEqual({
      id: 'prof-1',
      organizationId: ORG,
      deletedAt: null,
      nextRunDate: OCCURRENCE,
    });
    expect(guard.data.nextRunDate).toEqual(new Date('2026-04-01T00:00:00.000Z'));
    expect(prisma.recurringExecution.create.mock.calls[0][0].data).toMatchObject({
      status: 'success',
      createdEntityId: 'inv-1',
      organizationId: ORG,
    });
  });

  it('a duplicate cron pass loses the guarded advance and creates nothing', async () => {
    prisma.recurringProfile.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await run(invoiceProfile());

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/already executed/);
    expect(invoices.create).not.toHaveBeenCalled();
    // An already-executed run is not recorded as a failure of the schedule.
    expect(prisma.recurringExecution.create).not.toHaveBeenCalled();
  });

  it('replays the document an earlier run of the same occurrence already created', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ id: 'inv-existing' });

    const result = await run(invoiceProfile());

    expect(result.createdEntityId).toBe('inv-existing');
    expect(prisma.invoice.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG,
      notes: { contains: '[recurring prof-1:2026-03-01]' },
    });
    expect(invoices.create).not.toHaveBeenCalled();
    expect(prisma.recurringProfile.updateMany).not.toHaveBeenCalled();
  });

  it('a manual run is keyed by the caller key and never advances the schedule', async () => {
    await run(invoiceProfile(), 'key-1');

    expect(prisma.recurringProfile.updateMany.mock.calls[0][0].data).not.toHaveProperty(
      'nextRunDate',
    );
    expect(invoices.create.mock.calls[0][1].notes).toContain('[recurring prof-1:manual:key-1]');
  });

  it('creates the bill through BillsService as a DRAFT with decimal strings and a marker reference', async () => {
    const p = profile('bill', {
      vendorId: 'v1',
      lines: [{ description: 'Cloud', quantity: 3, rate: 0.1, taxRate: 5, accountId: 'exp-acc' }],
    });
    const result = await run(p);

    expect(result.createdEntityId).toBe('bill-1');
    const [, dto, options] = bills.create.mock.calls[0];
    expect(options).toEqual({ tx: prisma });
    expect(dto.dueDate).toBe(new Date('2026-04-15T00:00:00.000Z').toISOString());
    expect(dto.lines[0]).toMatchObject({ quantity: '3', rate: '0.1', taxRate: '5' });
    expect(dto.reference).toContain('[recurring prof-1:2026-03-01]');
    expect(prisma.bill.create).not.toHaveBeenCalled();
  });

  it('creates the expense through ExpensesService (which posts) with a decimal-string amount', async () => {
    const p = profile('expense', {
      accountId: 'exp-acc',
      paidThroughAccountId: 'bank-acc',
      amount: 1500.5,
      taxRate: 14,
      description: 'Rent',
    });
    const result = await run(p);

    expect(result.createdEntityId).toBe('exp-1');
    const [org, dto, options] = expenses.create.mock.calls[0];
    expect(org).toBe(ORG);
    expect(options).toEqual({ tx: prisma });
    expect(dto).toMatchObject({
      date: OCCURRENCE.toISOString(),
      amount: '1500.5',
      taxRate: '14',
      accountId: 'exp-acc',
      paidThroughAccountId: 'bank-acc',
    });
    expect(prisma.expense.create).not.toHaveBeenCalled();
  });

  it('converts a legacy template VAT amount into a percentage without float math', async () => {
    await run(
      profile('expense', {
        accountId: 'exp-acc',
        paidThroughAccountId: 'bank-acc',
        amount: '200',
        taxAmount: '28',
      }),
    );
    expect(expenses.create.mock.calls[0][1].taxRate).toBe('14');
  });

  it('records a failed execution and keeps the schedule when the domain command rejects', async () => {
    expenses.create.mockRejectedValue(
      new Error('Expense account must be an active expense account'),
    );

    const result = await run(
      profile('expense', { accountId: 'x', paidThroughAccountId: 'y', amount: '10' }),
    );

    expect(result).toMatchObject({
      success: false,
      error: 'Expense account must be an active expense account',
    });
    expect(prisma.recurringExecution.create.mock.calls[0][0].data).toMatchObject({
      status: 'failed',
      createdEntityId: '',
    });
  });

  it('rejects a customer of another organization (tenant-scoped lookup)', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    const result = await run(invoiceProfile());
    expect(result.success).toBe(false);
    expect(prisma.customer.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'c1',
      organizationId: ORG,
    });
    expect(invoices.create).not.toHaveBeenCalled();
  });
});
