/**
 * Bank matching precision (#586, W02 part 5) through the real HTTP API: suggestions offer only
 * documents a confirmation can settle (never a draft or a voided invoice), and two concurrent
 * confirmations of one bank line post exactly one payment. A person always confirms.
 */
import { INestApplication } from '@nestjs/common';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { isoDay } from './helpers/journey.helper';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Bank matching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: TestTenant;
  let a: ApiHelper;
  let bankAccountId = '';
  let customerId = '';

  async function invoice(rate: string, send: boolean): Promise<string> {
    const res = await a.post('/invoices').send({
      customerId,
      date: isoDay(-3),
      dueDate: isoDay(20),
      lines: [{ description: 'Service', quantity: '1', rate, taxRate: '0' }],
    });
    expect(res.status).toBe(201);
    if (send) expect((await a.patch(`/invoices/${res.body.id}/send`)).status).toBe(200);
    return res.body.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenant = await registerTenant(app, 'Matching');
    a = tenant.api;
    expect((await a.post('/accounts/seed-defaults')).status).toBe(201);
    const settings = (await a.get('/organization/account-settings')).body;
    const bank = await a.post('/bank-accounts').send({
      name: 'Matching Bank',
      type: 'BANK',
      linkedAccountId: settings.defaultBankAccountId,
    });
    expect(bank.status).toBe(201);
    bankAccountId = bank.body.id;
    const customer = await a.post('/customers').send({ name: 'Matching Customer' });
    expect(customer.status).toBe(201);
    customerId = customer.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('suggests only the posted invoice and confirms it once under concurrency', async () => {
    const posted = await invoice('500', true);
    const draft = await invoice('500', false);
    const voided = await invoice('500', true);
    expect((await a.patch(`/invoices/${voided}/void`)).status).toBe(200);
    const deposit = await a.post('/bank-transactions').send({
      bankAccountId,
      date: isoDay(0),
      type: 'DEPOSIT',
      amount: '500.00',
      description: 'Customer transfer',
    });
    expect(deposit.status).toBe(201);

    const suggestions = await a.get(`/reconciliation/suggestions/${bankAccountId}`);
    expect(suggestions.status).toBe(200);
    const row = suggestions.body.find(
      (s: { transaction: { id: string } }) => s.transaction.id === deposit.body.id,
    );
    const offered = row.matches.map((m: { entity: { id: string } }) => m.entity.id);
    expect(offered).toEqual([posted]);
    expect(offered).not.toContain(draft);
    expect(row.matches[0].confidence).toBe(90);

    const confirm = () =>
      a.post('/reconciliation/confirm').send({
        transactionId: deposit.body.id,
        entityType: 'invoice',
        entityId: posted,
      });
    const results = await Promise.all([confirm(), confirm()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);

    const payments = await prisma.paymentAllocation.count({
      where: { invoiceId: posted, payment: { organizationId: tenant.organizationId } },
    });
    expect(payments).toBe(1);
    expect((await a.get(`/invoices/${posted}`)).body.status).toBe('PAID');
  });

  // #682: a withdrawal for an expense already paid from the bank links to it and posts nothing.
  it('links one withdrawal to the paid rent expense once, posts nothing, and reopens it on void', async () => {
    const settings = (await a.get('/organization/account-settings')).body;
    const list = await a.get('/accounts').query({ limit: 500 });
    const rentAccount = list.body.data.find((x: { code: string }) => x.code === '6100').id;
    const expense = await a.post('/expenses').send({
      date: isoDay(0),
      accountId: rentAccount,
      amount: '300.00',
      paidThroughAccountId: settings.defaultBankAccountId,
      description: 'November rent',
    });
    expect(expense.status).toBe(201);
    const withdrawal = async (): Promise<string> => {
      const res = await a.post('/bank-transactions').send({
        bankAccountId,
        date: isoDay(0),
        type: 'WITHDRAWAL',
        amount: '300.00',
        description: 'November rent',
      });
      expect(res.status).toBe(201);
      return res.body.id;
    };
    const [first, second] = [await withdrawal(), await withdrawal()];
    const org = { organizationId: tenant.organizationId };
    const journalsBefore = await prisma.journal.count({ where: org });
    const expensesBefore = await prisma.expense.count({ where: org });

    const suggestions = await a.get(`/reconciliation/suggestions/${bankAccountId}`);
    const row = suggestions.body.find(
      (s: { transaction: { id: string } }) => s.transaction.id === first,
    );
    expect(row.matches).toContainEqual(
      expect.objectContaining({
        type: 'expense',
        entity: expect.objectContaining({ id: expense.body.id, total: '300.0000' }),
      }),
    );

    // Two lines race for the same expense: exactly one wins.
    const confirm = (transactionId: string) =>
      a.post('/reconciliation/confirm').send({
        transactionId,
        entityType: 'expense',
        entityId: expense.body.id,
      });
    const results = await Promise.all([confirm(first), confirm(second)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    const linked = await prisma.bankTransaction.findMany({
      where: { ...org, matchedEntityType: 'expense', matchedEntityId: expense.body.id },
      select: { id: true, status: true },
    });
    expect(linked).toHaveLength(1);
    expect(linked[0].status).toBe('MATCHED');
    // Nothing was posted or recorded a second time.
    expect(await prisma.journal.count({ where: org })).toBe(journalsBefore);
    expect(await prisma.expense.count({ where: org })).toBe(expensesBefore);

    // The other line is not offered the expense any more.
    const after = await a.get(`/reconciliation/suggestions/${bankAccountId}`);
    const other = after.body.find(
      (s: { transaction: { id: string } }) =>
        s.transaction.id !== linked[0].id && [first, second].includes(s.transaction.id),
    );
    expect(other.matches.map((m: { type: string }) => m.type)).not.toContain('expense');

    // Voiding the expense reopens the line it was matched to.
    expect((await a.delete(`/expenses/${expense.body.id}`)).status).toBe(200);
    const reopened = await prisma.bankTransaction.findFirst({
      where: { ...org, id: linked[0].id },
    });
    expect(reopened).toMatchObject({
      status: 'PENDING',
      matchedEntityType: null,
      matchedEntityId: null,
    });
  });
});
