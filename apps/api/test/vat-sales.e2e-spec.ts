import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from './helpers/app.helper';
import { isoDay } from './helpers/journey.helper';
import { seedChart } from './helpers/postings.helper';
import { ApiHelper } from './helpers/api-client.helper';
import { registerTenant } from './helpers/tenant.helper';

describe('VAT dated sales base (e2e)', () => {
  let app: INestApplication;
  const originalStart = isoDay(-45);
  const linkedDay = isoDay(-40);
  const legacyDay = isoDay(-39);
  const originalEnd = isoDay(-30);
  const reversalStart = isoDay(-20);
  const reversalDay = isoDay(-10);

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function sendInvoice(api: ApiHelper, customerId: string, day: string, rate: string) {
    const invoice = await api.post('/invoices').send({
      customerId,
      date: day,
      dueDate: originalEnd,
      lines: [{ description: 'Services', quantity: '1', rate, taxRate: '14' }],
    });
    expect(invoice.status).toBe(201);
    expect((await api.patch(`/invoices/${invoice.body.id}/send`)).status).toBe(200);
    return invoice.body.id as string;
  }

  async function calculate(
    api: ApiHelper,
    period: { startDate: string; endDate: string },
  ): Promise<{ totalSales: string; outputVAT: string }> {
    const created = await api.post('/vat-returns').send(period);
    expect(created.status).toBe(201);
    const calculated = await api.post(`/vat-returns/${created.body.id}/calculate`);
    expect(calculated.status).toBe(201);
    const summary = await api.get('/vat-returns/summary').query(period);
    expect(summary.status).toBe(200);
    expect(summary.body.sales.total).toBe(calculated.body.totalSales);
    return calculated.body;
  }

  it('counts linked and evidenced legacy invoice sends, never a manual journal that mimics the Sales Revenue label', async () => {
    const tenant = await registerTenant(app, 'VatSales');
    const api = tenant.api;
    expect(
      (await api.patch('/organization/settings/general').send({ baseCurrency: 'EGP' })).status,
    ).toBe(200);
    const chart = await seedChart(api);
    const prisma = getPrisma(app);
    const customer = await api.post('/customers').send({ name: 'VAT sales customer' });
    expect(customer.status).toBe(201);

    // One linked invoice send (200 + 28 VAT) and one that is rewritten below to the pre-linking
    // journal shape (100 + 14 VAT), whose manual reversal is dated in a later return period.
    await sendInvoice(api, customer.body.id, linkedDay, '200');
    const legacyInvoiceId = await sendInvoice(api, customer.body.id, legacyDay, '100');
    const legacySend = await prisma.journal.findFirstOrThrow({
      where: {
        organizationId: tenant.organizationId,
        sourceType: 'INVOICE_SEND',
        sourceId: legacyInvoiceId,
      },
    });
    const unlinked = await prisma.journal.updateMany({
      where: { id: legacySend.id, organizationId: tenant.organizationId },
      data: { sourceType: null, sourceId: null },
    });
    expect(unlinked.count).toBe(1);

    // A manual journal reusing the label has no invoice reference or invoice-prefixed revenue
    // line, so it is no invoice send: it must not inflate the sales base, nor may its reversal.
    const manual = await api.post('/journals').send({
      date: linkedDay,
      reference: 'Manual revenue',
      lines: [
        { accountId: chart.bank, debit: '500', credit: '0', description: 'Manual - Bank' },
        {
          accountId: chart.revenue,
          debit: '0',
          credit: '500',
          description: 'Manual - Sales Revenue',
        },
      ],
    });
    expect(manual.status).toBe(201);
    // Nor does an Invoice-prefixed reference alone prove an invoice send.
    const lookalike = await api.post('/journals').send({
      date: legacyDay,
      reference: 'Invoice MANUAL-1',
      lines: [
        { accountId: chart.bank, debit: '70', credit: '0', description: 'Reclass - Bank' },
        {
          accountId: chart.revenue,
          debit: '0',
          credit: '70',
          description: 'Reclass - Sales Revenue',
        },
      ],
    });
    expect(lookalike.status).toBe(201);

    for (const id of [legacySend.id, manual.body.id, lookalike.body.id]) {
      const reversed = await api.post(`/journals/${id}/reverse`).send({ date: reversalDay });
      expect(reversed.status).toBe(201);
    }

    const original = await calculate(api, { startDate: originalStart, endDate: originalEnd });
    expect(original.totalSales).toBe('300.0000');
    expect(original.outputVAT).toBe('42.0000');

    // Only the reversal of the evidenced legacy invoice send lowers the later period.
    const reversed = await calculate(api, { startDate: reversalStart, endDate: reversalDay });
    expect(reversed.totalSales).toBe('-100.0000');
    expect(reversed.outputVAT).toBe('-14.0000');
  });
});
