import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { WarehousesService } from './warehouses.service';

const ORG = 'org-1';

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [WarehousesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WarehousesService);
  });

  it('stores the address in the street column (the table has no address column) and reads it back as address', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);
    prisma.warehouse.create.mockResolvedValue({ id: 'w1', street: '1 Nile Street' } as never);

    const created = await service.create(ORG, {
      code: 'WH-1',
      name: 'Main',
      address: '1 Nile Street',
      city: 'Cairo',
    });

    const data = prisma.warehouse.create.mock.calls[0]![0].data;
    expect(data).toEqual({
      code: 'WH-1',
      name: 'Main',
      city: 'Cairo',
      street: '1 Nile Street',
      organizationId: ORG,
    });
    expect(created).toMatchObject({ id: 'w1', address: '1 Nile Street' });
  });

  it('maps address on update only when it is sent', async () => {
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'w1', street: null } as never);
    prisma.warehouse.update.mockResolvedValue({ id: 'w1', street: null } as never);

    await service.update(ORG, 'w1', { name: 'Renamed' });
    expect(prisma.warehouse.update.mock.calls[0]![0].data).toEqual({ name: 'Renamed' });

    await service.update(ORG, 'w1', { address: '2 Nile Street' });
    expect(prisma.warehouse.update.mock.calls[1]![0].data).toEqual({ street: '2 Nile Street' });
  });

  it('lists warehouses with the address field', async () => {
    prisma.warehouse.findMany.mockResolvedValue([{ id: 'w1', street: 'S' }] as never);
    prisma.warehouse.count.mockResolvedValue(1);

    const result = await service.findAll(ORG, { page: 1, limit: 20 });

    expect(result.data[0]).toMatchObject({ id: 'w1', address: 'S' });
  });

  it('does not delete a warehouse twice (soft-deleted warehouses are 404)', async () => {
    prisma.warehouse.findFirst.mockResolvedValue(null);

    await expect(service.remove(ORG, 'w1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.warehouse.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'w1', organizationId: ORG, deletedAt: null } }),
    );
    expect(prisma.warehouse.update).not.toHaveBeenCalled();
  });
});
