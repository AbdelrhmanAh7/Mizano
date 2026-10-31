import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { LeadsService } from './leads.service';

const ORG_ID = 'org-1';

describe('LeadsService.convertToCustomer (audit F3/F4)', () => {
  it('creates the customer in the base currency with customer.created in its transaction', async () => {
    const prisma = createMockPrisma();
    const outbox = { customerCreated: jest.fn().mockResolvedValue('evt_1') };
    const service = new LeadsService(prisma as unknown as PrismaService, outbox as never);
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      leadName: 'Sara',
      companyName: 'Delta Co',
      email: null,
      phone: null,
      convertedToCustomerId: null,
    } as never);
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' } as never);
    prisma.customer.create.mockResolvedValue({ id: 'cust-1', name: 'Delta Co' } as never);
    prisma.lead.update.mockResolvedValue({} as never);

    await service.convertToCustomer(ORG_ID, 'lead-1');

    expect(prisma.lead.findFirst.mock.calls[0][0]!.where).toMatchObject({
      id: 'lead-1',
      organizationId: ORG_ID,
    });
    expect(prisma.customer.create.mock.calls[0][0].data).toMatchObject({
      name: 'Delta Co',
      currency: 'EGP',
      organizationId: ORG_ID,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(outbox.customerCreated).toHaveBeenCalledWith(prisma, ORG_ID, {
      id: 'cust-1',
      name: 'Delta Co',
    });
  });
});
