import { INestApplication } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { isoDay, lineSignature } from './helpers/journey.helper';
import { createAccount, dbLines, seedChart } from './helpers/postings.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { registerTenant } from './helpers/tenant.helper';

describe('VAT historical purchases (e2e)', () => {
  let app: INestApplication;
  const originalStart = isoDay(-45);
  const billDay = isoDay(-40);
  const originalEnd = isoDay(-30);
  const reversalDay = isoDay(-10);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(['linked', 'legacy'])(
    'keeps a later-voided %s bill in its original return and dates the reversal on the last day',
    async (kind) => {
      const tenant = await registerTenant(app, 'VatPurchases');
      const api = tenant.api;
      expect(
        (await api.patch('/organization/settings/general').send({ baseCurrency: 'EGP' })).status,
      ).toBe(200);
      const chart = await seedChart(api);
      const prisma = getPrisma(app);
      const vendor = await api.post('/vendors').send({ name: 'VAT purchase vendor' });
      expect(vendor.status).toBe(201);
      const bill = await api.post('/bills').send({
        vendorId: vendor.body.id,
        date: billDay,
        dueDate: originalEnd,
        currencyCode: 'EGP',
        lines: [
          {
            description: 'Accounts Payable',
            accountId: chart.rent,
            quantity: '1.0000',
            rate: '200.2500',
            taxRate: '14.0000',
          },
        ],
      });
      expect(bill.status).toBe(201);
      expect((await api.post(`/bills/${bill.body.id}/approve`)).status).toBe(201);
      const original = await prisma.journal.findFirstOrThrow({
        where: {
          organizationId: tenant.organizationId,
          sourceType: 'BILL_APPROVAL',
          sourceId: bill.body.id,
        },
        include: { lines: true },
      });
      const originalLines = lineSignature(dbLines(original.lines));
      const newInput = await createAccount(api, '2211', 'Replacement input VAT', 'ASSET');
      expect(
        (
          await api.patch('/organization/account-settings').send({
            defaultVatReceivableAccountId: newInput,
          })
        ).status,
      ).toBe(200);
      // Bills have no HTTP void command yet. Seed its immutable reversal and voided document
      // as historical ledger evidence, without adding a new posting path to this VAT fix.
      await prisma.$transaction(async (tx) => {
        if (kind === 'legacy') {
          // Model the pre-linking journal shape; do not backfill real history.
          const changed = await tx.journal.updateMany({
            where: { id: original.id, organizationId: tenant.organizationId },
            data: { sourceType: null, sourceId: null },
          });
          expect(changed.count).toBe(1);
        }
        await tx.journal.create({
          data: {
            organizationId: tenant.organizationId,
            journalNumber: 'VAT-BILL-VOID',
            date: new Date(`${reversalDay}T10:00:00.000Z`),
            isPosted: true,
            sourceType: kind === 'legacy' ? null : 'BILL_VOID',
            sourceId: bill.body.id,
            reversalOfId: original.id,
            lines: {
              create: original.lines.map((line) => ({
                accountId: line.accountId,
                description: `Reversal: ${line.description ?? ''}`.trim(),
                debit: line.credit,
                credit: line.debit,
              })),
            },
          },
        });
        const voided = await tx.bill.updateMany({
          where: { id: bill.body.id, organizationId: tenant.organizationId },
          data: { status: 'VOID', deletedAt: new Date() },
        });
        expect(voided.count).toBe(1);
      });

      const preserved = await prisma.journal.findFirstOrThrow({
        where: { id: original.id, organizationId: tenant.organizationId },
        include: { lines: true },
      });
      expect(preserved.date).toEqual(original.date);
      expect(lineSignature(dbLines(preserved.lines))).toEqual(originalLines);

      for (const period of [
        { startDate: originalStart, endDate: originalEnd, base: '200.2500', vat: '28.0400' },
        { startDate: isoDay(-20), endDate: reversalDay, base: '-200.2500', vat: '-28.0400' },
      ]) {
        const created = await api
          .post('/vat-returns')
          .send({ startDate: period.startDate, endDate: period.endDate });
        expect(created.status).toBe(201);
        const calculated = await api.post(`/vat-returns/${created.body.id}/calculate`);
        expect(calculated.status).toBe(201);
        expect(calculated.body.totalPurchases).toBe(period.base);
        expect(calculated.body.inputVAT).toBe(period.vat);
        const summary = await api.get('/vat-returns/summary').query({
          startDate: period.startDate,
          endDate: period.endDate,
        });
        expect(summary.status).toBe(200);
        expect(summary.body.purchases.totalPurchases).toBe(period.base);
        // A stale purchase base alone must reject submission and roll back the guarded status
        // transition; VAT amounts stay unchanged. Recalculate before the authorized submission.
        await prisma.vATReturn.updateMany({
          where: { id: created.body.id, organizationId: tenant.organizationId },
          data: { totalPurchases: new Decimal(period.base).add('0.0001') },
        });
        expect((await api.post(`/vat-returns/${created.body.id}/submit`)).status).toBe(409);
        const rejected = await api.get(`/vat-returns/${created.body.id}`);
        expect(rejected.status).toBe(200);
        expect(rejected.body.status).toBe('CALCULATED');
        expect(
          await prisma.journal.count({
            where: {
              organizationId: tenant.organizationId,
              sourceType: 'VAT_RETURN',
              sourceId: created.body.id,
            },
          }),
        ).toBe(0);
        expect((await api.post(`/vat-returns/${created.body.id}/calculate`)).status).toBe(201);
        const submitted = await api.post(`/vat-returns/${created.body.id}/submit`);
        expect(submitted.status).toBe(201);
        expect(submitted.body.totalPurchases).toBe(period.base);
        const fetched = await api.get(`/vat-returns/${created.body.id}`);
        expect(fetched.status).toBe(200);
        expect(fetched.body.totalPurchases).toBe(period.base);
      }
      const list = await api.get('/vat-returns');
      expect(list.status).toBe(200);
      expect(list.body.map((row: { totalPurchases: string }) => row.totalPurchases).sort()).toEqual(
        ['-200.2500', '200.2500'],
      );
    },
  );

  it('nets real expenses and vendor credits, excludes other tenants/drafts, and counts their later API voids', async () => {
    const tenant = await registerTenant(app, 'VatPurchaseEvents');
    const api = tenant.api;
    expect(
      (await api.patch('/organization/settings/general').send({ baseCurrency: 'EGP' })).status,
    ).toBe(200);
    const chart = await seedChart(api);
    const foreign = await registerTenant(app, 'VatPurchaseForeign');
    expect(
      (await foreign.api.patch('/organization/settings/general').send({ baseCurrency: 'EGP' }))
        .status,
    ).toBe(200);
    const foreignChart = await seedChart(foreign.api);

    async function purchase(
      owner: ApiHelper,
      rent: string,
      rate: string,
    ): Promise<{ billId: string; vendorId: string }> {
      const vendor = await owner.post('/vendors').send({ name: 'Purchase events vendor' });
      expect(vendor.status).toBe(201);
      const bill = await owner.post('/bills').send({
        vendorId: vendor.body.id,
        date: billDay,
        dueDate: originalEnd,
        currencyCode: 'EGP',
        lines: [
          {
            description: 'Accounts Payable',
            accountId: rent,
            quantity: '1.0000',
            rate,
            taxRate: '14.0000',
          },
        ],
      });
      expect(bill.status).toBe(201);
      expect((await owner.post(`/bills/${bill.body.id}/approve`)).status).toBe(201);
      return { billId: bill.body.id as string, vendorId: vendor.body.id as string };
    }
    const { billId, vendorId } = await purchase(api, chart.rent, '200.0000');
    await purchase(foreign.api, foreignChart.rent, '999.0000');
    const draft = await api.post('/bills').send({
      vendorId,
      date: billDay,
      dueDate: originalEnd,
      lines: [{ accountId: chart.rent, quantity: '1.0000', rate: '123.0000', taxRate: '14.0000' }],
    });
    expect(draft.status).toBe(201);
    const expense = await api.post('/expenses').send({
      date: isoDay(-37),
      accountId: chart.rent,
      paidThroughAccountId: chart.bank,
      amount: '50.1250',
      taxRate: '14.00',
      description: 'Payment',
    });
    expect(expense.status).toBe(201);
    const credit = await api.post('/vendor-credits').send({
      vendorId,
      billId,
      date: isoDay(-35),
      amount: '114.0000',
      accountId: chart.rent,
    });
    expect(credit.status).toBe(201);
    expect((await api.delete(`/expenses/${expense.body.id}`)).status).toBe(200);
    expect((await api.delete(`/vendor-credits/${credit.body.id}`)).status).toBe(200);

    // Neither an unposted journal nor a soft-deleted journal is ledger activity.
    const prisma = getPrisma(app);
    for (const excluded of ['unposted', 'deleted']) {
      await prisma.journal.create({
        data: {
          organizationId: tenant.organizationId,
          journalNumber: `VAT-EXCLUDED-${excluded}`,
          date: new Date(billDay),
          sourceType: 'BILL_APPROVAL',
          sourceId: `excluded-${excluded}`,
          isPosted: excluded !== 'unposted',
          deletedAt: excluded === 'deleted' ? new Date() : null,
          lines: {
            create: [
              {
                accountId: chart.rent,
                debit: '500.0000',
                credit: '0.0000',
                description: 'Bill excluded - Expense',
              },
              {
                accountId: chart.vatInput,
                debit: '70.0000',
                credit: '0.0000',
                description: 'Bill excluded - VAT Receivable',
              },
              {
                accountId: chart.ap,
                debit: '0.0000',
                credit: '570.0000',
                description: 'Bill excluded - Accounts Payable',
              },
            ],
          },
        },
      });
    }

    for (const period of [
      { startDate: originalStart, endDate: originalEnd, base: '150.1250', vat: '21.0200' },
      { startDate: isoDay(0), endDate: isoDay(0), base: '49.8750', vat: '6.9800' },
    ]) {
      const created = await api
        .post('/vat-returns')
        .send({ startDate: period.startDate, endDate: period.endDate });
      expect(created.status).toBe(201);
      expect((await foreign.api.get(`/vat-returns/${created.body.id}`)).status).toBe(404);
      expect((await foreign.api.post(`/vat-returns/${created.body.id}/calculate`)).status).toBe(
        404,
      );
      expect((await foreign.api.post(`/vat-returns/${created.body.id}/submit`)).status).toBe(404);
      expect(
        (await ApiHelper.anonymous(app).post(`/vat-returns/${created.body.id}/calculate`)).status,
      ).toBe(401);
      const calculated = await api.post(`/vat-returns/${created.body.id}/calculate`);
      expect(calculated.status).toBe(201);
      expect(calculated.body.totalPurchases).toBe(period.base);
      expect(calculated.body.inputVAT).toBe(period.vat);
      expect((await api.post(`/vat-returns/${created.body.id}/submit`)).status).toBe(201);
    }
  });
});
