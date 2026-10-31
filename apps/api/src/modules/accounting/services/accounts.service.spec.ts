import { AccountType } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Seeding an industry chart of accounts is the only way a newly registered organization gets
 * accounts. Manual QA found that credit notes then failed ("configure ... Sales Returns") because
 * no template linked the Sales Returns default, and two templates had no such account at all.
 */
describe('AccountsService.seedIndustryAccounts', () => {
  let prisma: MockPrismaClient;
  let service: AccountsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AccountsService(prisma as unknown as PrismaService);
    // upsert returns the account it was asked to create, with a deterministic id
    (prisma.account.upsert as jest.Mock).mockImplementation(
      (args: { create: { code: string; type: AccountType } }) => ({
        id: `acc-${args.create.code}`,
        code: args.create.code,
        type: args.create.type,
      }),
    );
    (prisma.$transaction as jest.Mock).mockImplementation((ops: unknown) =>
      Array.isArray(ops) ? Promise.all(ops) : (ops as (tx: unknown) => unknown)(prisma),
    );
    prisma.organization.update.mockResolvedValue({} as never);
  });

  it.each([
    ['services', 'acc-4400'],
    ['retail', 'acc-4200'],
    ['construction', 'acc-4400'],
  ] as const)('links a Sales Returns default for the %s template', async (industry, expected) => {
    prisma.organization.findUnique.mockResolvedValue({ baseCurrency: 'EGP' } as never);

    await service.seedIndustryAccounts('org-1', industry);

    const update = prisma.organization.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'org-1' });
    expect(update.data).toEqual(
      expect.objectContaining({
        defaultSalesReturnsAccountId: expected,
        defaultArAccountId: expect.any(String),
        defaultRevenueAccountId: 'acc-4000',
      }),
    );
  });

  it('never overwrites a Sales Returns account the organization already chose', async () => {
    prisma.organization.findUnique
      .mockResolvedValueOnce({ baseCurrency: 'EGP' } as never)
      .mockResolvedValueOnce({ defaultSalesReturnsAccountId: 'chosen' } as never);

    await service.seedIndustryAccounts('org-1', 'services');

    const update = prisma.organization.update.mock.calls[0][0];
    expect(update.data).not.toHaveProperty('defaultSalesReturnsAccountId');
  });
});
