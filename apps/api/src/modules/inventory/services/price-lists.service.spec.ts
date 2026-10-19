import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PriceListType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { PriceListsService } from './price-lists.service';

const ORG = 'org-1';

describe('PriceListsService', () => {
  let service: PriceListsService;
  let prisma: MockPrismaClient;

  beforeEach(async () => {
    prisma = createMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [PriceListsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PriceListsService);
  });

  const dto = {
    name: 'VIP',
    type: PriceListType.PERCENTAGE,
    adjustment: '-10',
    items: [{ itemId: 'item-1', customPrice: '90' }],
  };

  it('creates the list with Decimal values once every item belongs to the organization', async () => {
    prisma.item.count.mockResolvedValue(1);
    prisma.priceList.create.mockResolvedValue({ id: 'pl-1' } as never);

    await service.create(ORG, dto);

    expect(prisma.item.count).toHaveBeenCalledWith({
      where: { id: { in: ['item-1'] }, organizationId: ORG, deletedAt: null },
    });
    const data = prisma.priceList.create.mock.calls[0]![0].data;
    expect(data.organizationId).toBe(ORG);
    expect(data.adjustment).toEqual(new Decimal('-10'));
    expect(data.type).toBe(PriceListType.PERCENTAGE);
  });

  it("rejects another organization's item in the body with 400 and writes nothing", async () => {
    prisma.item.count.mockResolvedValue(0);

    await expect(service.create(ORG, dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.priceList.create).not.toHaveBeenCalled();
  });

  it('rejects the same item priced twice with 400', async () => {
    await expect(
      service.create(ORG, { ...dto, items: [dto.items[0]!, dto.items[0]!] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.priceList.create).not.toHaveBeenCalled();
  });

  it('updates only the whitelisted fields, with a Decimal adjustment', async () => {
    prisma.priceList.findFirst.mockResolvedValue({ id: 'pl-1' } as never);
    prisma.priceList.update.mockResolvedValue({ id: 'pl-1' } as never);

    await service.update(ORG, 'pl-1', { name: 'v2', adjustment: '12.5', isActive: false });

    expect(prisma.priceList.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pl-1', organizationId: ORG } }),
    );
    expect(prisma.priceList.update).toHaveBeenCalledWith({
      where: { id: 'pl-1' },
      data: {
        name: 'v2',
        description: undefined,
        type: undefined,
        adjustment: new Decimal('12.5'),
        isActive: false,
      },
    });
  });

  it('lists all price lists for the organization regardless of active status', async () => {
    prisma.priceList.findMany.mockResolvedValue([
      { id: 'pl-1', isActive: true },
      { id: 'pl-2', isActive: false },
    ] as never);

    const result = await service.findAll(ORG);

    expect(prisma.priceList.findMany).toHaveBeenCalledWith({
      where: { organizationId: ORG },
      orderBy: { name: 'asc' },
    });
    expect(result).toHaveLength(2);
  });

  it("returns 404 for another organization's list", async () => {
    prisma.priceList.findFirst.mockResolvedValue(null);

    await expect(service.update(ORG, 'pl-x', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove(ORG, 'pl-x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.priceList.delete).not.toHaveBeenCalled();
  });
});
