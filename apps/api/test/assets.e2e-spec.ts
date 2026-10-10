/**
 * Depreciation reversal. Posted history is never edited: reversing an executed entry posts a
 * linked reversal journal and leaves the original journal posted, and only the latest executed
 * entry can be reversed so the asset's book value stays equal to the ledger. Real registered
 * users, real JWTs, exact decimal assertions (see helpers/tenant.helper.ts).
 */
import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { isoDay, lineSignature } from './helpers/journey.helper';
import { accountBalance, createAccount, dbLines, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import { PrismaService } from '../src/prisma/prisma.service';

const D = (v: unknown): Prisma.Decimal => new Prisma.Decimal(String(v));

interface ScheduleRow {
  id: string;
  month: number;
  year: number;
  journalId: string | null;
  executedAt: string | null;
}

describe('Depreciation reversal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let a: ApiHelper;
  let b: ApiHelper;
  let assetId = '';
  let expenseId = '';
  let accumulatedId = '';
  let first: ScheduleRow;
  let second: ScheduleRow;

  async function schedule(): Promise<ScheduleRow[]> {
    const res = await a.get(`/assets/${assetId}/schedule`);
    expect(res.status).toBe(200);
    return res.body as ScheduleRow[];
  }

  async function depreciate(row: ScheduleRow): Promise<string> {
    const res = await a
      .post(`/assets/${assetId}/depreciate`)
      .query({ month: row.month, year: row.year });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe('100.0000');
    return res.body.journalId as string;
  }

  const reverse = (row: ScheduleRow) => a.post(`/assets/schedule/${row.id}/reverse`);

  async function balances(): Promise<{ expense: Prisma.Decimal; accumulated: Prisma.Decimal }> {
    return {
      expense: await accountBalance(prisma, tenantA.organizationId, expenseId),
      accumulated: await accountBalance(prisma, tenantA.organizationId, accumulatedId),
    };
  }

  async function assetFigures(): Promise<{ accumulated: Prisma.Decimal; book: Prisma.Decimal }> {
    const asset = await prisma.asset.findFirstOrThrow({
      where: { id: assetId, organizationId: tenantA.organizationId },
    });
    return { accumulated: D(asset.accumulatedDepreciation), book: D(asset.currentBookValue) };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    tenantA = await registerTenant(app, 'AssetsA');
    tenantB = await registerTenant(app, 'AssetsB');
    a = tenantA.api;
    b = tenantB.api;

    const assetAccount = await createAccount(a, '1500', 'Equipment', 'ASSET');
    expenseId = await createAccount(a, '6500', 'Depreciation Expense', 'EXPENSE');
    accumulatedId = await createAccount(a, '1590', 'Accumulated Depreciation', 'ASSET');
    const created = await a.post('/assets').send({
      name: 'Delivery van',
      assetType: 'VEHICLES',
      purchaseDate: isoDay(-90),
      purchasePrice: 1200,
      salvageValue: 0,
      usefulLifeYears: 1,
      assetAccountId: assetAccount,
      depreciationAccountId: expenseId,
      accumulatedDeprAccountId: accumulatedId,
    });
    expect(created.status).toBe(201);
    assetId = created.body.id as string;

    const rows = await schedule();
    expect(rows.length).toBeGreaterThanOrEqual(2);
    [first, second] = rows;
  });

  afterAll(async () => {
    await app.close();
  });

  it('executes two consecutive months', async () => {
    await depreciate(first);
    await depreciate(second);

    expect((await balances()).expense.equals('200')).toBe(true);
    expect((await balances()).accumulated.equals('-200')).toBe(true);
    const figures = await assetFigures();
    expect(figures.accumulated.equals('200')).toBe(true);
    expect(figures.book.equals('1000')).toBe(true);
    const rows = await schedule();
    second = rows[1];
    first = rows[0];
    expect(first.journalId).toEqual(expect.any(String));
    expect(second.journalId).toEqual(expect.any(String));
  });

  it('refuses to reverse an earlier month while a later one stays executed', async () => {
    const res = await reverse(first);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only the latest executed depreciation entry/);
    expect((await balances()).expense.equals('200')).toBe(true);
    const row = (await schedule())[0];
    expect(row.executedAt).not.toBeNull();
    expect(row.journalId).toBe(first.journalId);
  });

  it("is a 404 for another tenant's schedule and changes nothing", async () => {
    const res = await b.post(`/assets/schedule/${second.id}/reverse`);

    expect(res.status).toBe(404);
    expect((await balances()).expense.equals('200')).toBe(true);
    expect((await schedule())[1].executedAt).not.toBeNull();
  });

  it('reverses the latest entry with a linked reversal and keeps the original posted', async () => {
    const res = await reverse(second);
    expect(res.status).toBe(204);

    const original = await prisma.journal.findFirstOrThrow({
      where: { id: second.journalId as string, organizationId: tenantA.organizationId },
      include: { lines: true, reversedBy: { include: { lines: true } } },
    });
    // The original journal is untouched: still posted, and now linked to its reversal.
    expect(original.isPosted).toBe(true);
    expect(original.deletedAt).toBeNull();
    const reversal = original.reversedBy;
    expect(reversal).not.toBeNull();
    expect(reversal?.reversalOfId).toBe(original.id);
    expect(reversal?.isPosted).toBe(true);
    expect(reversal?.organizationId).toBe(tenantA.organizationId);
    // Dated on the reversal day, never before the entry it reverses.
    expect((reversal?.date as Date).getTime()).toBeGreaterThanOrEqual(original.date.getTime());
    // Mirror image of the original, so the pair nets to zero.
    const total = sumLines([...original.lines, ...(reversal?.lines ?? [])]);
    expect(total.debit.equals(total.credit)).toBe(true);
    expect(lineSignature(dbLines(reversal?.lines ?? []))).toEqual(
      lineSignature(
        dbLines(original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }))),
      ),
    );

    // Ledger: only the first month remains. The schedule row and the asset step back with it.
    const now = await balances();
    expect(now.expense.equals('100')).toBe(true);
    expect(now.accumulated.equals('-100')).toBe(true);
    const row = (await schedule())[1];
    expect(row.executedAt).toBeNull();
    expect(row.journalId).toBeNull();
    const figures = await assetFigures();
    expect(figures.accumulated.equals('100')).toBe(true);
    expect(figures.book.equals('1100')).toBe(true);

    // A second reversal of the same entry has nothing left to reverse.
    const again = await reverse(second);
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Depreciation was not executed');
    expect((await balances()).expense.equals('100')).toBe(true);
  });

  it('can run the month again after a reversal and reverse the chain back to the start', async () => {
    const reposted = await depreciate(second);
    expect(reposted).not.toBe(second.journalId);
    expect((await balances()).expense.equals('200')).toBe(true);

    const rows = await schedule();
    expect((await reverse(rows[1])).status).toBe(204);
    expect((await reverse(rows[0])).status).toBe(204);

    const now = await balances();
    expect(now.expense.isZero()).toBe(true);
    expect(now.accumulated.isZero()).toBe(true);
    const figures = await assetFigures();
    expect(figures.accumulated.isZero()).toBe(true);
    expect(figures.book.equals('1200')).toBe(true);
    expect((await schedule()).every((r) => r.executedAt === null && r.journalId === null)).toBe(
      true,
    );

    // Every journal this test ever posted is still there, posted, and the books balance to zero.
    const posted = await prisma.journal.count({
      where: { organizationId: tenantA.organizationId, isPosted: true, deletedAt: null },
    });
    const reversals = await prisma.journal.count({
      where: { organizationId: tenantA.organizationId, reversalOfId: { not: null } },
    });
    expect(posted).toBe(6);
    expect(reversals).toBe(3);
  });
});
