import { PrismaService } from '../../../prisma/prisma.service';
import { dec } from '../../../test/helpers/decimal.helpers';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { ReconciliationService } from './reconciliation.service';

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared Prisma mock is untyped */
describe('ReconciliationService.getSuggestions (#586 matching precision)', () => {
  const ORG = 'org-1';
  let prisma: any;
  let service: ReconciliationService;

  const deposit = {
    id: 't1',
    bankAccountId: 'ba1',
    date: new Date('2026-03-05T00:00:00.000Z'),
    type: 'DEPOSIT',
    amount: dec('1000.0001'),
    description: null,
    reference: null,
    payee: null,
    status: 'PENDING',
    organizationId: ORG,
  };
  const invoice = (id: string, balance: string) => ({
    id,
    invoiceNumber: id,
    balanceDue: dec(balance),
    customer: { id: 'c1', name: 'Customer' },
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReconciliationService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    prisma.bankTransaction.findMany.mockResolvedValue([deposit]);
    prisma.bankAccount.findFirst.mockResolvedValue({ currency: 'EGP' });
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });
  });

  it('offers only open, posted documents of the org that can take the whole amount, in a date window', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);

    await service.getSuggestions(ORG, 'ba1');

    const where = prisma.invoice.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: ORG,
      deletedAt: null,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
    });
    // Exact decimal bound: never a draft, void or a balance too small to settle the amount.
    expect(where.balanceDue.gte.toString()).toBe('1000.0001');
    expect(where.date.gte.toISOString()).toBe('2025-03-05T00:00:00.000Z');
    expect(where.date.lte.toISOString()).toBe('2026-03-12T00:00:00.000Z');
    expect(prisma.invoice.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('scores amounts as exact decimals: one ten-thousandth apart is not an exact match', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      invoice('INV-EXACT', '1000.0001'),
      invoice('INV-OFF', '1000.0002'),
      invoice('INV-FAR', '2000'),
    ]);

    const [row] = await service.getSuggestions(ORG, 'ba1');

    expect(row.matches.map((m) => [(m.entity as { id: string }).id, m.confidence])).toEqual([
      ['INV-EXACT', 90],
      ['INV-OFF', 50],
    ]);
  });

  it('fetches amount and reference matches first, so newer documents cannot crowd them out', async () => {
    prisma.bankTransaction.findMany.mockResolvedValue([
      { ...deposit, reference: 'TRF=INV-0007', description: 'Payment (INV-0009).' },
    ]);
    // Each pool is queried on its own, so saturated weaker pools never hide a stronger match:
    // a named invoice behind 200 newer exact amounts, an exact one behind 200 near amounts.
    const exact = Array.from({ length: 200 }, (_, i) => invoice(`INV-E${i}`, '1000.0001'));
    const near = Array.from({ length: 200 }, (_, i) => invoice(`INV-N${i}`, '1000.5'));
    prisma.invoice.findMany
      .mockResolvedValueOnce([invoice('INV-0007', '5000')])
      .mockResolvedValueOnce(exact)
      .mockResolvedValueOnce(near)
      .mockResolvedValueOnce([invoice('INV-NEW', '9000')]);

    const [row] = await service.getSuggestions(ORG, 'ba1');

    const [namedWhere, exactWhere, nearWhere] = prisma.invoice.findMany.mock.calls.map(
      (c: Array<{ where: any }>) => c[0].where,
    );
    expect(namedWhere.invoiceNumber).toEqual({
      in: ['TRF', 'INV-0007', 'Payment', 'INV-0009'],
    });
    expect(exactWhere.balanceDue.toString()).toBe('1000.0001');
    expect(nearWhere.balanceDue.gt.toString()).toBe('1000.0001');
    expect(nearWhere.balanceDue.lte.toString()).toBe('1050.000105');
    expect(row.matches[0]).toMatchObject({ entity: { id: 'INV-0007' }, confidence: 100 });
    expect(row.matches[1]).toMatchObject({ confidence: 90 });
    expect(row.matches).toHaveLength(5);
  });

  it('fetches payee matches in their own pools (exact amount first) when the bank line names one', async () => {
    prisma.bankTransaction.findMany.mockResolvedValue([{ ...deposit, payee: 'customer' }]);
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.invoice.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invoice('INV-PAYEE', '1000.0001')]);

    const [row] = await service.getSuggestions(ORG, 'ba1');

    const wheres = prisma.invoice.findMany.mock.calls.map((c: Array<{ where: any }>) => c[0].where);
    const party = { name: { contains: 'customer', mode: 'insensitive' } };
    expect(wheres[1]).toMatchObject({ organizationId: ORG, customer: party });
    expect(wheres[1].balanceDue.toString()).toBe('1000.0001');
    expect(wheres[2].customer).toEqual(party);
    expect(row.matches).toEqual([
      expect.objectContaining({
        entity: expect.objectContaining({ id: 'INV-PAYEE' }),
        confidence: 100,
      }),
    ]);
  });

  it('matches a withdrawal stored negative against bills by its absolute amount', async () => {
    prisma.bankTransaction.findMany.mockResolvedValue([
      { ...deposit, type: 'WITHDRAWAL', amount: dec('-250.5') },
    ]);
    prisma.bill.findMany.mockResolvedValue([
      { id: 'b1', billNumber: 'B1', balanceDue: dec('250.5'), vendor: { id: 'v', name: 'V' } },
    ]);

    const [row] = await service.getSuggestions(ORG, 'ba1');

    const where = prisma.bill.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'] });
    expect(where.balanceDue.gte.toString()).toBe('250.5');
    expect(row.matches).toEqual([expect.objectContaining({ type: 'bill', confidence: 90 })]);
  });

  it('suggests nothing on a bank account outside the base currency (confirming would be refused)', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ currency: 'USD' });

    const [row] = await service.getSuggestions(ORG, 'ba1');

    expect(row.matches).toEqual([]);
    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
    expect(prisma.bankAccount.findFirst.mock.calls[0][0].where).toEqual({
      id: 'ba1',
      organizationId: ORG,
    });
  });
});
