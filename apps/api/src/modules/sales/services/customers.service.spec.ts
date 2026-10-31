import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-1';

describe('CustomersService.create currency (audit F4)', () => {
  let prisma: MockPrismaClient;
  let outbox: { customerCreated: jest.Mock };
  let service: CustomersService;

  beforeEach(() => {
    prisma = createMockPrisma();
    outbox = { customerCreated: jest.fn().mockResolvedValue(null) };
    service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as unknown as AgingReportsService,
      outbox as never,
    );
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' } as never);
    prisma.customer.create.mockResolvedValue({ id: 'cust-1' } as never);
  });

  const createdData = () => prisma.customer.create.mock.calls[0][0].data as Record<string, unknown>;

  it('gives a customer created without a currency the org base currency, not USD', async () => {
    await service.create(ORG_ID, { name: 'Nile Co' });
    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      select: { baseCurrency: true },
    });
    expect(createdData()).toMatchObject({ currency: 'EGP', organizationId: ORG_ID });
    expect(outbox.customerCreated).toHaveBeenCalledWith(prisma, ORG_ID, { id: 'cust-1' });
  });

  it('keeps an explicit currency and joins the caller transaction', async () => {
    const tx = createMockPrisma();
    tx.customer.create.mockResolvedValue({ id: 'cust-2' } as never);
    await service.create(ORG_ID, { name: 'Gulf Co', currency: 'SAR' }, { tx: tx as never });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect((tx.customer.create.mock.calls[0][0].data as { currency: string }).currency).toBe('SAR');
    expect(tx.organization.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an organization that does not exist', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.create(ORG_ID, { name: 'Nile Co' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});

describe('CustomersService.update outbox (audit F3)', () => {
  it('writes customer.updated in the transaction that changes the customer', async () => {
    const prisma = createMockPrisma();
    const outbox = { customerEvent: jest.fn().mockResolvedValue('evt_1') };
    const service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as unknown as AgingReportsService,
      outbox as never,
    );
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-1' } as never);
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
});
