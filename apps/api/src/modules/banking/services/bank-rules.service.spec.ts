import { BadRequestException } from '@nestjs/common';
import { BankRulesService } from './bank-rules.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-1';

describe('BankRulesService bank account ownership', () => {
  let prisma: MockPrismaClient;
  let service: BankRulesService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.bankRule.create.mockResolvedValue({ id: 'rule-1' } as never);
    prisma.bankRule.findFirst.mockResolvedValue({ id: 'rule-1' } as never);
    prisma.bankRule.update.mockResolvedValue({ id: 'rule-1' } as never);
    service = new BankRulesService(prisma as unknown as PrismaService);
  });

  it('rejects (400) a bank account of another organization on create and writes nothing', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ORG, { name: 'Rule', bankAccountId: 'foreign-ba' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.bankAccount.findFirst.mock.calls[0]![0]!.where).toMatchObject({
      id: 'foreign-ba',
      organizationId: ORG,
      deletedAt: null,
    });
    expect(prisma.bankRule.create).not.toHaveBeenCalled();
  });

  it('rejects (400) a bank account of another organization on update and writes nothing', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue(null);

    await expect(service.update(ORG, 'rule-1', { bankAccountId: 'foreign-ba' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.bankRule.update).not.toHaveBeenCalled();
  });

  it('accepts an own bank account and a rule without a bank account (global rule)', async () => {
    prisma.bankAccount.findFirst.mockResolvedValue({ id: 'ba-1' } as never);

    await service.create(ORG, { name: 'Rule', bankAccountId: 'ba-1' });
    await service.create(ORG, { name: 'Global rule' });

    expect(prisma.bankRule.create).toHaveBeenCalledTimes(2);
    expect(prisma.bankAccount.findFirst).toHaveBeenCalledTimes(1);
  });
});
