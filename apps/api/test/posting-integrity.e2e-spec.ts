/**
 * Posting integrity on the real database (issue #94): the single ledger command posts a source
 * event at most once under retries and concurrency, a failure mid-post leaves no partial rows,
 * and money travels and is stored as exact decimals.
 *
 * Needs PostgreSQL. `pnpm ci:full` does not run E2E specs (see docs/DEVELOPMENT.md › Testing ›
 * "API E2E against a throwaway PostgreSQL"). Short version, from the repo root:
 *
 *   initdb -D $TMPDIR/mz-pg/data -U mizano --auth=trust -E UTF8 --locale=C
 *   pg_ctl -D $TMPDIR/mz-pg/data -o "-p 55494 -c listen_addresses=127.0.0.1" -w start
 *   createdb -h 127.0.0.1 -p 55494 -U mizano mizano_e2e
 *   export DATABASE_URL=postgresql://mizano@127.0.0.1:55494/mizano_e2e APP_ENV=e2e
 *   (cd apps/api && npx prisma migrate deploy && \
 *     npx jest --config ./test/jest-e2e.json --runInBand test/posting-integrity.e2e-spec.ts)
 *
 * Without REDIS_URL the cache falls back to memory, so Redis is not required. Row locking is
 * only meaningful on PostgreSQL: do not point this spec at SQLite or an in-memory database.
 */
import { ConflictException, INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiHelper } from './helpers/api-client.helper';
import { createTestApp, getPrisma, uniqueSuffix } from './helpers/app.helper';
import { isoDay, midnightIso } from './helpers/journey.helper';
import { seedChart, SeededChart, sumLines } from './helpers/postings.helper';
import { registerTenant, TestTenant } from './helpers/tenant.helper';
import {
  JournalSourceType,
  JournalsService,
} from '../src/modules/accounting/services/journals.service';
import { PrismaService } from '../src/prisma/prisma.service';

const SOURCE = JournalSourceType.RECURRING_JOURNAL;
const INVOICE_SEND = JournalSourceType.INVOICE_SEND;

describe('Posting integrity (e2e, real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let journals: JournalsService;
  let tenant: TestTenant;
  let a: ApiHelper;
  let chart: SeededChart;
  let customerId = '';
  const day = isoDay(-1);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = getPrisma(app);
    journals = app.get(JournalsService);
    tenant = await registerTenant(app, 'Posting');
    a = tenant.api;
    chart = await seedChart(a);
    const customer = await a.post('/customers').send({ name: 'Cairo Retail', currency: 'EGP' });
    expect(customer.status).toBe(201);
    customerId = customer.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const entry = (amount: string) => ({
    date: midnightIso(day),
    lines: [
      { accountId: chart.bank, debit: amount },
      { accountId: chart.revenue, credit: amount },
    ],
  });

  const journalsFor = (sourceType: string, sourceId: string) =>
    prisma.journal.findMany({
      where: { organizationId: tenant.organizationId, sourceType, sourceId },
      include: { lines: true },
    });

  /** Journal and line rows of the tenant: a rolled-back post must leave both unchanged. */
  const rowCounts = () => {
    const where = { organizationId: tenant.organizationId };
    return Promise.all([
      prisma.journal.count({ where }),
      prisma.journalLine.count({ where: { journal: where } }),
    ]);
  };

  function expectBalanced(lines: Array<{ debit: unknown; credit: unknown }>, total: string) {
    const { debit, credit } = sumLines(lines);
    expect([debit.toFixed(4), credit.toFixed(4)]).toEqual([total, total]);
  }

  describe('the single ledger command', () => {
    it('@issue-94 AC3: posts a retried source event once and rejects the replay with a conflict', async () => {
      const source = { type: SOURCE, id: `retry-${uniqueSuffix()}` };
      const first = await journals.create(tenant.organizationId, entry('250.50'), { source });
      await expect(
        journals.create(tenant.organizationId, entry('250.50'), { source }),
      ).rejects.toThrow(ConflictException);

      const posted = await journalsFor(SOURCE, source.id);
      expect(posted.map((j) => j.id)).toEqual([first.id]);
      expectBalanced(posted[0].lines, '250.5000');
    });

    it('@issue-94 AC4: posts exactly one balanced journal when one event is posted 8 times at once', async () => {
      const source = { type: SOURCE, id: `race-${uniqueSuffix()}` };
      const [journalsBefore, linesBefore] = await rowCounts();
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          journals.create(tenant.organizationId, entry('99.99'), { source }),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results) {
        if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(ConflictException);
      }
      const posted = await journalsFor(SOURCE, source.id);
      expect(posted).toHaveLength(1);
      expect(posted[0].lines).toHaveLength(2);
      expectBalanced(posted[0].lines, '99.9900');
      expect(await rowCounts()).toEqual([journalsBefore + 1, linesBefore + 2]);
    });

    it('@issue-94 AC5: rolls back the header and every line when the post fails after the insert', async () => {
      const source = { type: SOURCE, id: `fail-${uniqueSuffix()}` };
      const before = await rowCounts();
      await expect(
        prisma.$transaction(async (tx) => {
          await journals.create(tenant.organizationId, entry('10.00'), { tx, source });
          throw new Error('injected failure after the journal insert');
        }),
      ).rejects.toThrow('injected failure');
      expect(await rowCounts()).toEqual(before);

      // Nothing half-written blocks the retry, which posts exactly once.
      await journals.create(tenant.organizationId, entry('10.00'), { source });
      expect(await journalsFor(SOURCE, source.id)).toHaveLength(1);
    });
  });

  describe('money transport and storage', () => {
    it.each(['1234.10', '999999999999999.9999'])(
      '@issue-94 AC2: round-trips %s as an exact decimal string',
      async (amount) => {
        const created = await a.post('/journals').send(entry(amount));
        expect(created.status).toBe(201);
        expect(created.body.totalDebit).toBe(new Prisma.Decimal(amount).toFixed(4));

        const read = await a.get(`/journals/${created.body.id}`);
        expect(read.status).toBe(200);
        const debitLine = read.body.lines.find((l: { debit: unknown }) => l.debit !== '0');
        expect(typeof debitLine.debit).toBe('string');
        expect(new Prisma.Decimal(debitLine.debit).equals(amount)).toBe(true);
        const stored = await prisma.journalLine.findUniqueOrThrow({ where: { id: debitLine.id } });
        expect(stored.debit.equals(amount)).toBe(true);
      },
    );

    it('@issue-94 AC2: rejects amounts storage would round instead of storing an unbalanced journal', async () => {
      const before = await rowCounts();
      const res = await a.post('/journals').send({
        date: midnightIso(day),
        lines: [
          { accountId: chart.bank, debit: '0.00005' },
          { accountId: chart.bank, debit: '0.00005' },
          { accountId: chart.revenue, credit: '0.0001' },
        ],
      });
      expect(res.status).toBe(400);
      expect(await rowCounts()).toEqual(before);
    });
  });

  describe('document posting (invoice send)', () => {
    async function draftInvoice(): Promise<string> {
      const res = await a.post('/invoices').send({
        customerId,
        date: day,
        dueDate: isoDay(29),
        lines: [{ description: 'Consulting', quantity: '1', rate: '99.99', taxRate: '14' }],
      });
      expect(res.status).toBe(201);
      return res.body.id;
    }

    it('@issue-94 AC3: sends the same invoice twice and keeps the first journal as the only one', async () => {
      const id = await draftInvoice();
      expect((await a.patch(`/invoices/${id}/send`)).status).toBe(200);
      const first = await journalsFor(INVOICE_SEND, id);
      expect(first).toHaveLength(1);

      const again = await a.patch(`/invoices/${id}/send`);
      expect([400, 409]).toContain(again.status);
      const posted = await journalsFor(INVOICE_SEND, id);
      expect(posted.map((j) => j.id)).toEqual([first[0].id]);
      expect(posted[0].lines).toHaveLength(first[0].lines.length);
      expectBalanced(posted[0].lines, '113.9900');
    });

    it('@issue-94 AC4: sends one invoice 5 times at once and posts exactly one journal', async () => {
      const id = await draftInvoice();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => a.patch(`/invoices/${id}/send`)),
      );
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      for (const s of statuses.filter((x) => x !== 200)) expect([400, 409]).toContain(s);

      const posted = await journalsFor(INVOICE_SEND, id);
      expect(posted).toHaveLength(1);
      expectBalanced(posted[0].lines, '113.9900'); // 99.99 + 14% VAT (13.9986 -> 14.00)
    });

    it('@issue-94 AC5: keeps the invoice a draft with no journal when posting fails mid-send', async () => {
      const id = await draftInvoice();
      const before = await rowCounts();
      const realCreate = journals.create.bind(journals);
      const spy = jest.spyOn(journals, 'create').mockImplementationOnce(async (...args) => {
        await realCreate(...args);
        throw new Error('injected failure after the journal insert');
      });
      try {
        expect((await a.patch(`/invoices/${id}/send`)).status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(await rowCounts()).toEqual(before);
      expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');

      expect((await a.patch(`/invoices/${id}/send`)).status).toBe(200);
      expect(await journalsFor(INVOICE_SEND, id)).toHaveLength(1);
    });

    it('@issue-94 AC3: rejects a repeated send once the period is locked, still with one journal', async () => {
      const id = await draftInvoice();
      expect((await a.patch(`/invoices/${id}/send`)).status).toBe(200);
      const lock = await a.patch('/organization/lock-date').send({ lockDate: midnightIso(day) });
      expect(lock.status).toBe(200);
      try {
        expect([400, 409]).toContain((await a.patch(`/invoices/${id}/send`)).status);
      } finally {
        await a.patch('/organization/lock-date').send({ lockDate: null });
      }
      expect(await journalsFor(INVOICE_SEND, id)).toHaveLength(1);
    });
  });

  it('@issue-94 AC2: leaves the tenant ledger balanced as stored', async () => {
    const { _sum } = await prisma.journalLine.aggregate({
      where: { journal: { organizationId: tenant.organizationId } },
      _sum: { debit: true, credit: true },
    });
    expect(_sum.debit?.toFixed(4)).toBe(_sum.credit?.toFixed(4));
  });
});
