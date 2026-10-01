import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { OrganizationsService } from '../../organizations/organizations.service';
import { JournalsService } from './journals.service';
import { OpeningBalancesService } from './opening-balances.service';

const ORG = 'org-1';
const STATUS = { isComplete: false };

const dto = (overrides: Record<string, unknown> = {}): any => ({
  openingDate: '2026-01-01',
  balances: [
    { accountId: 'cash', amount: '1000.10' },
    { accountId: 'capital', amount: '1000.10' },
  ],
  ...overrides,
});

describe('OpeningBalancesService', () => {
  let service: OpeningBalancesService;
  let prisma: any;
  let journals: { create: jest.Mock; reverse: jest.Mock };
  let organizations: { getOnboardingStatus: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    journals = {
      create: jest.fn().mockResolvedValue({ id: 'j-new' }),
      reverse: jest.fn().mockResolvedValue({ id: 'j-rev' }),
    };
    organizations = { getOnboardingStatus: jest.fn().mockResolvedValue(STATUS) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpeningBalancesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journals },
        { provide: OrganizationsService, useValue: organizations },
      ],
    }).compile();
    service = module.get(OpeningBalancesService);

    prisma.account.findMany.mockResolvedValue([
      { id: 'cash', type: 'ASSET' },
      { id: 'capital', type: 'EQUITY' },
    ]);
    prisma.journal.findFirst.mockResolvedValue(null);
    prisma.journal.count.mockResolvedValue(0);
  });

  it('posts ONE balanced journal on the opening date with the organization as source id', async () => {
    const result = await service.post(ORG, dto());

    expect(result).toBe(STATUS);
    expect(journals.create).toHaveBeenCalledTimes(1);
    const [orgId, journalDto, options] = journals.create.mock.calls[0];
    expect(orgId).toBe(ORG);
    expect(options).toEqual({ tx: prisma, source: { type: 'OPENING_BALANCE', id: ORG } });
    expect(journalDto.date).toBe(new Date('2026-01-01').toISOString());
    // Assets debit and equity credits by normal side; no equity line when balanced.
    expect(journalDto.lines).toEqual([
      expect.objectContaining({ accountId: 'cash', debit: '1000.1000', credit: '0' }),
      expect.objectContaining({ accountId: 'capital', debit: '0', credit: '1000.1000' }),
    ]);
    expect(prisma.organizationOnboarding.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG },
        update: { openingBalancesCompleted: true },
      }),
    );
  });

  it('puts a debit surplus (0.1 + 0.2 exact) on Opening Balance Equity as a credit', async () => {
    prisma.account.findMany.mockResolvedValue([
      { id: 'cash', type: 'ASSET' },
      { id: 'bank', type: 'ASSET' },
    ]);
    prisma.account.findFirst.mockResolvedValue({ id: 'obe' });

    await service.post(
      ORG,
      dto({
        balances: [
          { accountId: 'cash', amount: '0.1' },
          { accountId: 'bank', amount: '0.2' },
        ],
      }),
    );

    const lines = journals.create.mock.calls[0][1].lines;
    expect(lines).toHaveLength(3);
    expect(lines[2]).toEqual(
      expect.objectContaining({ accountId: 'obe', debit: '0', credit: '0.3000' }),
    );
    // The resolver looked for an equity account in this organization.
    expect(prisma.account.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ organizationId: ORG, type: 'EQUITY' }),
    );
  });

  it('puts a credit surplus on Opening Balance Equity as a debit', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'loan', type: 'LIABILITY' }]);
    prisma.account.findFirst.mockResolvedValue({ id: 'obe' });

    await service.post(ORG, dto({ balances: [{ accountId: 'loan', amount: '500' }] }));

    const lines = journals.create.mock.calls[0][1].lines;
    expect(lines[0]).toEqual(expect.objectContaining({ accountId: 'loan', credit: '500.0000' }));
    expect(lines[1]).toEqual(expect.objectContaining({ accountId: 'obe', debit: '500.0000' }));
  });

  it('an explicit isDebit overrides the normal side', async () => {
    prisma.account.findMany.mockResolvedValue([
      { id: 'cash', type: 'ASSET' },
      { id: 'overdraft', type: 'ASSET' },
    ]);
    await service.post(
      ORG,
      dto({
        balances: [
          { accountId: 'cash', amount: '70' },
          { accountId: 'overdraft', amount: '70', isDebit: false },
        ],
      }),
    );
    const lines = journals.create.mock.calls[0][1].lines;
    expect(lines).toEqual([
      expect.objectContaining({ accountId: 'cash', debit: '70.0000' }),
      expect.objectContaining({ accountId: 'overdraft', credit: '70.0000' }),
    ]);
  });

  it('errors clearly when the difference cannot go anywhere (no equity account) and posts nothing', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'cash', type: 'ASSET' }]);
    prisma.account.findFirst.mockResolvedValue(null);

    await expect(
      service.post(ORG, dto({ balances: [{ accountId: 'cash', amount: '10' }] })),
    ).rejects.toThrow('Opening Balance Equity');
    expect(journals.create).not.toHaveBeenCalled();
    expect(prisma.organizationOnboarding.upsert).not.toHaveBeenCalled();
  });

  it('validates an explicit equity account (must be an active equity account of the tenant)', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'cash', type: 'ASSET' }]);
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(
      service.post(
        ORG,
        dto({ balances: [{ accountId: 'cash', amount: '10' }], equityAccountId: 'foreign' }),
      ),
    ).rejects.toThrow('equityAccountId');
    expect(prisma.account.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ id: 'foreign', organizationId: ORG, type: 'EQUITY' }),
    );
  });

  it('rejects accounts from another organization', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'cash', type: 'ASSET' }]);
    await expect(service.post(ORG, dto())).rejects.toThrow('accounts not found');
    expect(prisma.account.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate accounts and invalid amounts', async () => {
    await expect(
      service.post(
        ORG,
        dto({
          balances: [
            { accountId: 'cash', amount: '1' },
            { accountId: 'cash', amount: '2' },
          ],
        }),
      ),
    ).rejects.toThrow('only appear once');
    await expect(
      service.post(ORG, dto({ balances: [{ accountId: 'cash', amount: '-5' }] })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.post(ORG, dto({ balances: [{ accountId: 'cash', amount: 'abc' }] })),
    ).rejects.toThrow('valid decimal');
  });

  it('refuses a second posting unless replaceExisting is explicit', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-old',
      date: new Date('2026-01-01'),
      sourceType: 'OPENING_BALANCE',
    });

    await expect(service.post(ORG, dto())).rejects.toThrow(ConflictException);
    expect(journals.reverse).not.toHaveBeenCalled();
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('replaceExisting reverses the current journal (linked) then posts the new revision', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-old',
      date: new Date('2026-01-01'),
      sourceType: 'OPENING_BALANCE',
    });
    prisma.journal.count.mockResolvedValue(1);

    await service.post(ORG, dto({ replaceExisting: true }));

    expect(journals.reverse).toHaveBeenCalledWith(
      ORG,
      'j-old',
      { date: new Date('2026-01-01').toISOString() },
      {
        tx: prisma,
        source: { type: 'OPENING_BALANCE', id: `${ORG}:reversal:j-old` },
      },
    );
    expect(journals.create.mock.calls[0][2]).toEqual({
      tx: prisma,
      source: { type: 'OPENING_BALANCE', id: `${ORG}:2` },
    });
    expect(journals.reverse.mock.invocationCallOrder[0]).toBeLessThan(
      journals.create.mock.invocationCallOrder[0],
    );
  });

  it('replaceExisting with no non-zero entries clears the balances: reverses, posts nothing', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-old',
      date: new Date('2026-01-01'),
      sourceType: 'OPENING_BALANCE',
    });

    await service.post(
      ORG,
      dto({ balances: [{ accountId: 'cash', amount: '0' }], replaceExisting: true }),
    );

    expect(journals.reverse).toHaveBeenCalledTimes(1);
    expect(journals.reverse.mock.calls[0][1]).toBe('j-old');
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('without replaceExisting an empty step neither reverses nor posts', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-old',
      date: new Date('2026-01-01'),
      sourceType: 'OPENING_BALANCE',
    });
    await service.post(ORG, dto({ balances: [] }));
    expect(journals.reverse).not.toHaveBeenCalled();
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('only considers the live opening journal (not reversals, not already reversed ones)', async () => {
    await service.post(ORG, dto());
    expect(prisma.journal.findFirst.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        organizationId: ORG,
        deletedAt: null,
        isPosted: true,
        reversalOfId: null,
        reversedBy: null,
        OR: [{ sourceType: 'OPENING_BALANCE' }, { sourceType: null, journalNumber: 'OB-001' }],
      }),
    );
  });

  it('a legacy source-less opening journal counts as posted: 409 without replaceExisting', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-legacy',
      date: new Date('2026-01-01'),
      sourceType: null,
    });
    await expect(service.post(ORG, dto())).rejects.toThrow(ConflictException);
    expect(journals.create).not.toHaveBeenCalled();
  });

  it('replaceExisting reverses a legacy journal (no source) and posts revision 1', async () => {
    prisma.journal.findFirst.mockResolvedValue({
      id: 'j-legacy',
      date: new Date('2026-01-01'),
      sourceType: null,
    });
    await service.post(ORG, dto({ replaceExisting: true }));
    expect(journals.reverse).toHaveBeenCalledWith(
      ORG,
      'j-legacy',
      { date: new Date('2026-01-01').toISOString() },
      { tx: prisma, source: undefined },
    );
    expect(journals.create.mock.calls[0][2].source).toEqual({
      type: 'OPENING_BALANCE',
      id: ORG,
    });
  });

  it('no balances (or all zero) only completes the step', async () => {
    await service.post(ORG, dto({ balances: [] }));
    await service.post(ORG, dto({ balances: [{ accountId: 'cash', amount: '0.00' }] }));
    expect(journals.create).not.toHaveBeenCalled();
    expect(prisma.organizationOnboarding.upsert).toHaveBeenCalledTimes(2);
  });

  it('serializes writers per organization with an advisory lock', async () => {
    await service.post(ORG, dto());
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });
});
