import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService address mapping', () => {
  const setup = () => {
    const prisma = createMockPrisma();
    const service = new WarehousesService(prisma as unknown as PrismaService);
    return { prisma, service };
  };

  it('stores the DTO address in the street column on create (no unknown `address` field reaches Prisma)', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    prisma.warehouse.create.mockResolvedValue({ id: 'w1', code: 'WH', street: '1 Nile Street' } as never);

    const result = await service.create('org1', {
      code: 'WH',
      name: 'Main',
      address: '1 Nile Street',
    });

    const data = (prisma.warehouse.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ code: 'WH', name: 'Main', street: '1 Nile Street', organizationId: 'org1' });
    expect(data).not.toHaveProperty('address');
    expect(result.address).toBe('1 Nile Street');
  });

  it('creates without an address and does not invent a street', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValue(null);
    prisma.warehouse.create.mockResolvedValue({ id: 'w1', street: null } as never);

    await service.create('org1', { code: 'WH', name: 'Main' });

    const data = (prisma.warehouse.create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(data).not.toHaveProperty('street');
    expect(data).not.toHaveProperty('address');
  });

  it('maps address to street on update', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValue({ id: 'w1' } as never);
    prisma.warehouse.update.mockResolvedValue({ id: 'w1', street: '2 Corniche' } as never);

    const result = await service.update('org1', 'w1', { address: '2 Corniche' });

    expect(prisma.warehouse.update).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { street: '2 Corniche' } });
    expect(result.address).toBe('2 Corniche');
  });

  it('keeps the duplicate-code 409 and the missing-warehouse 404', async () => {
    const { prisma, service } = setup();
    prisma.warehouse.findFirst.mockResolvedValueOnce({ id: 'w0' } as never);
    await expect(service.create('org1', { code: 'WH', name: 'x' })).rejects.toBeInstanceOf(ConflictException);

    prisma.warehouse.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne('org1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
