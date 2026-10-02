import { BadRequestException } from '@nestjs/common';
import { AccountType, BankAccountType } from '@prisma/client';
import { BankAccountsService } from './bank-accounts.service';
import { JournalSourceType, JournalsService } from '../../accounting/services/journals.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma, MockPrismaClient } from '../../../test/mocks/prisma.mock';

const ORG = 'org-1';

describe('BankAccountsService.create opening balance', () => {
  let prisma: MockPrismaClient;
  let journals: { create: jest.Mock };
  let service: BankAccountsService;

  function arrange(linkedType: AccountType = AccountType.ASSET, equity: boolean = true): void {
    prisma.account.findFirst.mockImplementation((async (args: { where: { code?: string } }) => {
      if (args.where.code === '3900') return equity ? { id: 'acc-equity' } : null;
      return { id: 'acc-bank', type: linkedType };
    }) as never);
    prisma.bankAccount.create.mockResolvedValue({ id: 'ba-1' } as never);
    journals.create.mockResolvedValue({} as never);
  }

  const dto = {
    name: 'Main',
    type: BankAccountType.BANK,
    linkedAccountId: 'acc-bank',
  } as never;

  beforeEach(() => {
    prisma = createMockPrisma();
    journals = { create: jest.fn() };
    service = new BankAccountsService(
      prisma as unknown as PrismaService,
      journals as unknown as JournalsService,
    );
  });

  it('posts Dr bank / Cr Opening Balance Equity in the same transaction, dated on the opening date', async () => {
    arrange();

    await service.create(ORG, {
      ...(dto as object),
      openingBalance: '5000.50',
      openingDate: '2026-01-01',
    } as never);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [orgId, body, options] = journals.create.mock.calls[0];
    expect(orgId).toBe(ORG);
    expect(body.date).toBe('2026-01-01T00:00:00.000Z');
    expect(body.lines).toEqual([
      expect.objectContaining({ accountId: 'acc-bank', debit: '5000.5000', credit: '0' }),
      expect.objectContaining({ accountId: 'acc-equity', debit: '0', credit: '5000.5000' }),
    ]);
    expect(options.source).toEqual({
      type: JournalSourceType.OPENING_BALANCE,
      id: 'bank-account:ba-1',
    });
    expect(options.tx).toBeDefined();
    // The ledger lock is taken before anything is written.
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.account.findFirst.mock.calls[0][0]?.where).toMatchObject({
      id: 'acc-bank',
      organizationId: ORG,
    });
  });

  it('posts the reverse entry for an overdrawn (negative) opening balance', async () => {
    arrange();

    await service.create(ORG, { ...(dto as object), openingBalance: '-10.1' } as never);

    expect(journals.create.mock.calls[0][1].lines).toEqual([
      expect.objectContaining({ accountId: 'acc-bank', debit: '0', credit: '10.1000' }),
      expect.objectContaining({ accountId: 'acc-equity', debit: '10.1000', credit: '0' }),
    ]);
  });

  it('credits a credit-normal linked account (e.g. a credit card) for a positive balance', async () => {
    arrange(AccountType.LIABILITY);

    await service.create(ORG, { ...(dto as object), openingBalance: '25' } as never);

    expect(journals.create.mock.calls[0][1].lines[0]).toMatchObject({
      accountId: 'acc-bank',
      debit: '0',
      credit: '25.0000',
    });
  });

  it('posts nothing for a zero or missing opening balance', async () => {
    arrange();

    await service.create(ORG, dto);
    await service.create(ORG, { ...(dto as object), openingBalance: '0.00' } as never);

    expect(journals.create).not.toHaveBeenCalled();
    expect(prisma.bankAccount.create).toHaveBeenCalledTimes(2);
  });

  it('fails with 400 and a clear message when Opening Balance Equity (3900) is missing', async () => {
    arrange(AccountType.ASSET, false);

    const call = service.create(ORG, { ...(dto as object), openingBalance: '100' } as never);

    await expect(call).rejects.toThrow(BadRequestException);
    await expect(call).rejects.toThrow(/Opening Balance Equity account \(code 3900\)/);
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('rejects a linked account of another organization', async () => {
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      service.create(ORG, { ...(dto as object), openingBalance: '100' } as never),
    ).rejects.toThrow(/Linked ledger account/);
    expect(prisma.bankAccount.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid opening date', async () => {
    arrange();
    await expect(
      service.create(ORG, {
        ...(dto as object),
        openingBalance: '1',
        openingDate: 'nope',
      } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
