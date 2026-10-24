import { BadRequestException } from '@nestjs/common';
import { TaxRatesService } from './tax-rates.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

describe('TaxRatesService: numeric input', () => {
  const ORG = 'org-1';
  let prisma: MockPrismaClient;
  let service: TaxRatesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new TaxRatesService(prisma as unknown as PrismaService);
    prisma.taxRate.findFirst.mockResolvedValue(null as never);
  });

  it('create rejects a non-numeric rate with 400 and writes nothing', async () => {
    await expect(service.create(ORG, { name: 'Bad', rate: 'abc' } as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.taxRate.create).not.toHaveBeenCalled();
  });

  it('create stores a valid rate as a Decimal', async () => {
    prisma.taxRate.create.mockResolvedValue({ id: 't1' } as never);
    await service.create(ORG, { name: 'VAT', rate: '15' } as never);
    const data = (
      prisma.taxRate.create.mock.calls[0][0] as { data: { rate: { toString(): string } } }
    ).data;
    expect(data.rate.toString()).toBe('15');
  });
});
