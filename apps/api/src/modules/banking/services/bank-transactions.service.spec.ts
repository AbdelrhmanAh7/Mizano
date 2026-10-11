import { BankTransactionsService } from './bank-transactions.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-1';

describe('BankTransactionsService.findAll pagination', () => {
  let prisma: MockPrismaClient;
  let service: BankTransactionsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.bankTransaction.findMany.mockResolvedValue([]);
    prisma.bankTransaction.count.mockResolvedValue(0);
    service = new BankTransactionsService(prisma as unknown as PrismaService);
  });

  // The list route types its query as an intersection (no DTO class), so values stay strings.
  const queryOf = (raw: Record<string, string>) =>
    raw as unknown as Parameters<typeof service.findAll>[1];

  it('turns string page and limit into the numbers Prisma needs for skip and take', async () => {
    const result = await service.findAll(ORG, queryOf({ page: '3', limit: '100' }));

    const args = prisma.bankTransaction.findMany.mock.calls[0]![0]!;
    expect(args.take).toBe(100);
    expect(args.skip).toBe(200);
    expect(result.meta).toMatchObject({ page: 3, limit: 100 });
  });

  it('defaults to the first page of 50 and bounds the limit', async () => {
    await service.findAll(ORG, queryOf({}));
    await service.findAll(ORG, queryOf({ limit: '100000', page: '0' }));
    await service.findAll(ORG, queryOf({ limit: 'abc' }));

    const [first, second, third] = prisma.bankTransaction.findMany.mock.calls.map((c) => c[0]!);
    expect([first.take, first.skip]).toEqual([50, 0]);
    expect([second.take, second.skip]).toEqual([500, 0]);
    expect([third.take, third.skip]).toEqual([50, 0]);
  });

  it('always scopes by organization', async () => {
    await service.findAll(ORG, queryOf({ bankAccountId: 'ba-1' }));

    expect(prisma.bankTransaction.findMany.mock.calls[0]![0]!.where).toMatchObject({
      organizationId: ORG,
      bankAccountId: 'ba-1',
    });
  });
});
