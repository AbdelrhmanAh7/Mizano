import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ProjectsService } from './projects.service';
import { InvoicesService } from '../../sales/services/invoices.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG_ID = 'org-1';

describe('ProjectsService.createInvoiceFromProject (audit F3)', () => {
  let prisma: MockPrismaClient;
  let invoices: { create: jest.Mock };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    invoices = { create: jest.fn().mockResolvedValue({ id: 'inv-1' }) };
    service = new ProjectsService(
      prisma as unknown as PrismaService,
      invoices as unknown as InvoicesService,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'prj-1',
      name: 'Website',
      customerId: 'cust-1',
      hourlyRate: new Decimal('150.5'),
    } as never);
    prisma.timesheetEntry.findMany.mockResolvedValue([
      { id: 't1', hours: new Decimal('1.25'), duration: null },
      { id: 't2', hours: new Decimal('0.1'), duration: null },
    ] as never);
    prisma.timesheetEntry.updateMany.mockResolvedValue({ count: 2 });
  });

  it('bills through the one invoice command, in Decimal, and marks the entries in the same tx', async () => {
    await expect(
      service.createInvoiceFromProject(ORG_ID, 'prj-1', {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      }),
    ).resolves.toEqual({ id: 'inv-1' });

    expect(invoices.create).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        customerId: 'cust-1',
        projectId: 'prj-1',
        lines: [
          { description: 'Consulting services - Website', quantity: '1.3500', rate: '150.5000' },
        ],
      }),
      { tx: prisma },
    );
    expect(prisma.timesheetEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['t1', 't2'] }, organizationId: ORG_ID, isBilled: false },
      data: { isBilled: true, invoiceId: 'inv-1' },
    });
    // No hand-rolled invoice numbering or float totals outside the command.
    expect(prisma.invoice.create).not.toHaveBeenCalled();
  });

  it('bills nothing twice when a concurrent run took some entries', async () => {
    prisma.timesheetEntry.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.createInvoiceFromProject(ORG_ID, 'prj-1', {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
