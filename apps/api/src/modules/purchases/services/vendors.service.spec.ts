import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('VendorsService.bulkDelete', () => {
  let service: VendorsService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VendorsService(prisma as unknown as PrismaService);
  });

  it('deletes each unique id in order via remove and reports per-record failures', async () => {
    const removeSpy = jest.spyOn(service, 'remove');
    removeSpy
      .mockResolvedValueOnce({ message: 'Vendor deleted' })
      .mockRejectedValueOnce(new BadRequestException('Cannot delete vendor with bills'));

    await expect(service.bulkDelete('org-1', ['v-1', 'v-2', 'v-1'])).resolves.toEqual({
      processed: 1,
      total: 2,
      failures: [{ id: 'v-2', reason: 'Cannot delete vendor with bills' }],
    });

    expect(removeSpy).toHaveBeenCalledTimes(2);
    expect(removeSpy).toHaveBeenNthCalledWith(1, 'org-1', 'v-1');
    expect(removeSpy).toHaveBeenNthCalledWith(2, 'org-1', 'v-2');
    expect(prisma.vendor.updateMany).not.toHaveBeenCalled();
  });

  it('records an already-deleted vendor as a failure instead of throwing', async () => {
    jest.spyOn(service, 'remove').mockRejectedValueOnce(new NotFoundException('Vendor not found'));

    await expect(service.bulkDelete('org-1', ['v-9'])).resolves.toEqual({
      processed: 0,
      total: 1,
      failures: [{ id: 'v-9', reason: 'Vendor not found' }],
    });
  });
});

describe('VendorsService.create currency (#83)', () => {
  let service: VendorsService;
  let prisma: MockPrismaClient;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new VendorsService(prisma as unknown as PrismaService);
    prisma.vendor.create.mockResolvedValue({ id: 'v-1' });
  });

  it('uses the organization base currency when none is sent, never the USD default', async () => {
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' });

    await service.create('org-1', { name: 'Nile Supplies' });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { baseCurrency: true },
    });
    expect(prisma.vendor.create.mock.calls[0][0].data).toMatchObject({
      currency: 'EGP',
      organizationId: 'org-1',
    });
  });

  it('keeps a currency the user chose', async () => {
    await service.create('org-1', { name: 'Gulf Trading', currency: 'SAR' });

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(prisma.vendor.create.mock.calls[0][0].data).toMatchObject({ currency: 'SAR' });
  });
});
