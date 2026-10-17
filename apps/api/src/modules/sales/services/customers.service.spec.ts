import { CustomersService } from './customers.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AgingReportsService } from '../../reports/services/aging-reports.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-test-001';

describe('CustomersService address mapping (#215)', () => {
  let service: CustomersService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CustomersService(
      prisma as unknown as PrismaService,
      {} as unknown as AgingReportsService,
    );
  });

  it('create stores nested addresses as columns and keeps notes, without passing the nested objects to Prisma', async () => {
    prisma.customer.create.mockResolvedValue({ id: 'c-1' } as never);

    await service.create(ORG_ID, {
      name: 'Nile Traders',
      notes: 'Prefers e-mail',
      billingAddress: { street: '1 Nile St', city: 'Cairo', postalCode: '11511', country: 'EG' },
      shippingAddress: { street: '9 Port Rd', city: 'Alexandria' },
    });

    const { data } = prisma.customer.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('billingAddress');
    expect(data).not.toHaveProperty('shippingAddress');
    expect(data).toMatchObject({
      organizationId: ORG_ID,
      name: 'Nile Traders',
      notes: 'Prefers e-mail',
      billingStreet: '1 Nile St',
      billingCity: 'Cairo',
      billingPostalCode: '11511',
      billingCountry: 'EG',
      shippingStreet: '9 Port Rd',
      shippingCity: 'Alexandria',
    });
  });

  it('update maps nested addresses to columns, scoped to the organization', async () => {
    prisma.customer.findFirst.mockResolvedValue({ id: 'c-1', organizationId: ORG_ID } as never);
    prisma.customer.update.mockResolvedValue({ id: 'c-1' } as never);

    await service.update(ORG_ID, 'c-1', {
      billingAddress: { street: '2 Tahrir Sq', city: 'Cairo' },
      notes: null as unknown as string,
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'c-1', organizationId: ORG_ID, deletedAt: null },
    });
    const { data } = prisma.customer.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).not.toHaveProperty('billingAddress');
    expect(data).not.toHaveProperty('shippingAddress');
    expect(data).toMatchObject({ billingStreet: '2 Tahrir Sq', billingCity: 'Cairo', notes: null });
    expect(data.shippingStreet).toBeUndefined();
  });
});
