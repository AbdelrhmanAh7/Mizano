import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-1';

describe('CustomersService', () => {
  let prisma: MockPrismaClient;
  let service: CustomersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as unknown as AgingReportsService,
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
  });

  it('keeps an explicitly chosen currency', async () => {
    await service.create(ORG_ID, { name: 'Gulf Co', currency: 'SAR' });
    expect(createdData().currency).toBe('SAR');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
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
});
