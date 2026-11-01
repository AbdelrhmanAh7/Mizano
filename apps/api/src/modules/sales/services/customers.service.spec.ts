import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CustomersService } from './customers.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-1';

describe('CustomersService', () => {
  let prisma: MockPrismaClient;
  let outbox: { customerCreated: jest.Mock; customerEvent: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    outbox = {
      customerCreated: jest.fn().mockResolvedValue(null),
      customerEvent: jest.fn().mockResolvedValue('evt_1'),
    };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as unknown as AgingReportsService,
      outbox as never,
    );
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' } as never);
    prisma.customer.create.mockResolvedValue({ id: 'cust-1' } as never);
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' } as never);
    prisma.customer.update.mockResolvedValue({ id: 'cust-1' } as never);
  });

  const createdData = () => prisma.customer.create.mock.calls[0][0].data as Record<string, unknown>;

  it('defaults a new customer to the organization base currency, not USD (audit B5/F4)', async () => {
    await service.create(ORG_ID, { name: 'Nile Co' });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      select: { baseCurrency: true },
    });
    expect(createdData()).toMatchObject({
      name: 'Nile Co',
      currency: 'EGP',
      organizationId: ORG_ID,
    });
    expect(outbox.customerCreated).toHaveBeenCalledWith(prisma, ORG_ID, { id: 'cust-1' });
  });

  it("refuses another organization's price list on create and update", async () => {
    prisma.priceList.findFirst.mockResolvedValue(null as never);
    await expect(
      service.create(ORG_ID, { name: 'Nile Co', priceListId: 'foreign-pl' }),
    ).rejects.toThrow('Price list not found');
    await expect(service.update(ORG_ID, 'cust-1', { priceListId: 'foreign-pl' })).rejects.toThrow(
      'Price list not found',
    );
    expect(prisma.priceList.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-pl', organizationId: ORG_ID },
      select: { id: true },
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('keeps an explicitly chosen currency', async () => {
    await service.create(ORG_ID, { name: 'Gulf Co', currency: 'SAR' });
    expect(createdData().currency).toBe('SAR');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });

  it('joins the caller transaction when one is passed (audit F1)', async () => {
    const tx = createMockPrisma();
    tx.customer.create.mockResolvedValue({ id: 'cust-2' } as never);
    await service.create(ORG_ID, { name: 'Gulf Co', currency: 'SAR' }, { tx: tx as never });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((tx.customer.create.mock.calls[0][0].data as { currency: string }).currency).toBe('SAR');
    expect(tx.organization.findUnique).not.toHaveBeenCalled();
    expect(outbox.customerCreated).toHaveBeenCalledWith(tx, ORG_ID, { id: 'cust-2' });
  });

  it('stores addresses in their columns and never passes the address objects to Prisma', async () => {
    await service.create(ORG_ID, {
      name: 'Nile Co',
      billingAddress: { street: '1 Tahrir St', city: 'Cairo', country: 'EG' },
      shippingAddress: { city: 'Giza' },
    });
    const data = createdData();
    expect(data).not.toHaveProperty('billingAddress');
    expect(data).not.toHaveProperty('shippingAddress');
    expect(data).toMatchObject({
      billingStreet: '1 Tahrir St',
      billingCity: 'Cairo',
      billingCountry: 'EG',
      shippingCity: 'Giza',
    });

    await service.update(ORG_ID, 'cust-1', { billingAddress: { city: 'Alexandria' } });
    const updated = prisma.customer.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(updated).not.toHaveProperty('billingAddress');
    expect(updated.billingCity).toBe('Alexandria');
  });

  it('searches the display name the document pickers show, in the org only (audit B11)', async () => {
    prisma.customer.findMany.mockResolvedValue([] as never);
    prisma.customer.count.mockResolvedValue(0 as never);
    await service.findAll(ORG_ID, { search: 'النيل', page: 2, limit: 20 });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: ORG_ID,
          OR: expect.arrayContaining([{ displayName: { contains: 'النيل', mode: 'insensitive' } }]),
        }),
        skip: 20,
        take: 20,
      }),
    );
  });

  it('refuses an organization that does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.create(ORG_ID, { name: 'Nile Co' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('writes customer.updated in the transaction that changes the customer (audit F3)', async () => {
    prisma.customer.update.mockResolvedValue({ id: 'cust-1', name: 'Nile Co 2' } as never);

    await service.update(ORG_ID, 'cust-1', { name: 'Nile Co 2' });
    expect(prisma.customer.findFirst.mock.calls[0][0]!.where).toMatchObject({
      id: 'cust-1',
      organizationId: ORG_ID,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(outbox.customerEvent).toHaveBeenCalledWith(prisma, ORG_ID, 'customer.updated', {
      id: 'cust-1',
      name: 'Nile Co 2',
    });

    // Another tenant's customer: 404 and no event.
    outbox.customerEvent.mockClear();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(service.update(ORG_ID, 'foreign', { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    expect(outbox.customerEvent).not.toHaveBeenCalled();
  });

  // Golden scenario (test-cases C03): INV-0001 paid, INV-0002 570.00 less credit note 114.00.
  it("gives the cursor list each customer's outstanding balance (#668)", async () => {
    prisma.customer.findMany.mockResolvedValue([
      { id: 'cust-nile', name: 'Nile Dental Clinic' },
      { id: 'cust-delta', name: 'Delta Trading' },
    ] as never);
    prisma.customer.count.mockResolvedValue(2 as never);
    prisma.invoice.groupBy.mockResolvedValue([
      { customerId: 'cust-nile', _sum: { balanceDue: new Prisma.Decimal('456') } },
    ] as never);

    const page = await service.findAllCursor(ORG_ID, {});

    expect(page.data.map((c) => [c.name, c.outstandingBalance])).toEqual([
      ['Nile Dental Clinic', '456.0000'],
      ['Delta Trading', '0.0000'],
    ]);
    expect(prisma.invoice.groupBy.mock.calls[0][0]).toMatchObject({
      where: {
        organizationId: ORG_ID,
        customerId: { in: ['cust-nile', 'cust-delta'] },
        deletedAt: null,
      },
    });
  });

  it('sorts the list by name when asked for a column the customer has not (#668)', async () => {
    prisma.customer.findMany.mockResolvedValue([] as never);

    await service.findAllCursor(ORG_ID, { sortBy: 'outstandingBalance', sortOrder: 'desc' });

    const { orderBy } = prisma.customer.findMany.mock.calls[0][0] as { orderBy: unknown };
    expect(JSON.stringify(orderBy)).toContain('"name":"desc"');
    expect(JSON.stringify(orderBy)).not.toContain('outstandingBalance');
  });
});
