import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { createMockPrisma } from '../../../test/mocks/prisma.mock';
import { JournalsService } from './journals.service';
import { RecurringProfilesService } from './recurring-profiles.service';

const ORG = 'org-1';
const OCCURRENCE = new Date('2026-03-01T00:00:00.000Z');

function journalProfile(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'prof-1',
    name: 'Monthly rent',
    type: 'JOURNAL',
    entityType: 'journal',
    frequency: 'MONTHLY',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: null,
    nextRunDate: OCCURRENCE,
    isActive: true,
    autoPost: true,
    templateData: {
      notes: 'Rent accrual',
      lines: [
        { accountId: 'acc-rent', debit: 1500.5, description: 'Rent' },
        { accountId: 'acc-accrued', credit: '1500.50', description: 'Accrued' },
      ],
    },
    organizationId: ORG,
    deletedAt: null,
    ...overrides,
  };
}

describe('RecurringProfilesService (journal profiles)', () => {
  let service: RecurringProfilesService;
  let prisma: any;
  let journals: { create: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrisma();
    journals = { create: jest.fn().mockResolvedValue({ id: 'j1' }) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecurringProfilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JournalsService, useValue: journals },
      ],
    }).compile();
    service = module.get(RecurringProfilesService);

    prisma.recurringProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.recurringProfile.findFirst.mockResolvedValue(journalProfile());
  });

  // The cron path: one scheduled occurrence of a profile (executeProfile is the manual path).
  const runScheduled = (profile: any = journalProfile()): Promise<any> =>
    (service as any).executeJournalProfile(profile);

  describe('scheduled run', () => {
    it('posts through JournalsService with a per-run source id, advancing nextRunDate in the same transaction', async () => {
      const result = await runScheduled();

      expect(result).toEqual({
        success: true,
        createdEntityType: 'JOURNAL',
        createdEntityId: 'j1',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Guarded advance: only succeeds while the profile is still at this occurrence.
      const guard = prisma.recurringProfile.updateMany.mock.calls[0][0];
      expect(guard.where).toEqual({
        id: 'prof-1',
        organizationId: ORG,
        deletedAt: null,
        nextRunDate: OCCURRENCE,
      });
      expect(guard.data.nextRunDate).toEqual(new Date('2026-04-01T00:00:00.000Z'));
      expect(guard.data.executionCount).toEqual({ increment: 1 });

      const [orgId, dto, options] = journals.create.mock.calls[0];
      expect(orgId).toBe(ORG);
      expect(options).toEqual({
        tx: prisma,
        source: { type: 'RECURRING_JOURNAL', id: 'prof-1:2026-03-01' },
      });
      expect(dto.date).toBe(OCCURRENCE.toISOString());
      expect(dto.reference).toBe('Recurring: Monthly rent');
      // Stored numbers become exact decimal strings (no float arithmetic).
      expect(dto.lines).toEqual([
        { accountId: 'acc-rent', debit: '1500.5000', credit: '0.0000', description: 'Rent' },
        { accountId: 'acc-accrued', debit: '0.0000', credit: '1500.5000', description: 'Accrued' },
      ]);
      expect(prisma.recurringExecution.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ status: 'success', createdEntityId: 'j1', organizationId: ORG }),
      );
      expect(prisma.journal.update).not.toHaveBeenCalled();
    });

    it('a duplicate/concurrent cron run (guard count 0) posts nothing and records no failure', async () => {
      prisma.recurringProfile.updateMany.mockResolvedValue({ count: 0 });

      const result = await runScheduled();

      expect(result.success).toBe(false);
      expect(result.error).toContain('already executed');
      expect(journals.create).not.toHaveBeenCalled();
      expect(prisma.recurringExecution.create).not.toHaveBeenCalled();
    });

    it('source uniqueness still stops a second post when the guard is bypassed', async () => {
      journals.create.mockRejectedValue(
        new ConflictException('This transaction has already been posted'),
      );

      const result = await runScheduled();

      expect(result.success).toBe(false);
      expect(prisma.recurringExecution.create).not.toHaveBeenCalled();
    });

    it('autoPost=false leaves an unposted draft for review inside the same transaction', async () => {
      await runScheduled(journalProfile({ autoPost: false }));

      expect(prisma.journal.update).toHaveBeenCalledWith({
        where: { id: 'j1' },
        data: { isPosted: false },
      });
    });

    it('records a failed execution when the ledger rejects the entry (e.g. locked period)', async () => {
      journals.create.mockRejectedValue(new BadRequestException('This period is locked.'));

      const result = await runScheduled();

      expect(result).toEqual(
        expect.objectContaining({ success: false, error: 'This period is locked.' }),
      );
      expect(prisma.recurringExecution.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ status: 'failed', error: 'This period is locked.' }),
      );
    });

    it('rejects a template with float-unsafe or invalid amounts without posting', async () => {
      const result = await runScheduled(
        journalProfile({
          templateData: {
            lines: [
              { accountId: 'a', debit: 'abc' },
              { accountId: 'b', credit: 1 },
            ],
          },
        }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('valid decimal');
      expect(journals.create).not.toHaveBeenCalled();
    });

    const KEY_1 = '11111111-1111-4111-8111-111111111111';
    const KEY_2 = '22222222-2222-4222-8222-222222222222';

    it('a manual run is dated now, keeps the schedule and uses the key as its source id', async () => {
      const before = Date.now();
      const first = await service.executeProfile(ORG, 'prof-1', KEY_1);
      const second = await service.executeProfile(ORG, 'prof-1', KEY_2);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      // The schedule is neither guarded nor advanced.
      expect(prisma.recurringProfile.updateMany).not.toHaveBeenCalled();
      const [, dto1, opts1] = journals.create.mock.calls[0];
      const [, , opts2] = journals.create.mock.calls[1];
      expect(opts1.source).toEqual({ type: 'RECURRING_JOURNAL', id: `prof-1:manual:${KEY_1}` });
      expect(opts2.source.id).toBe(`prof-1:manual:${KEY_2}`);
      expect(new Date(dto1.date).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(dto1.date).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('a retried manual request (same key) returns the existing journal and posts nothing', async () => {
      prisma.journal.findFirst.mockResolvedValue({ id: 'j-existing' });
      const res = await service.executeProfile(ORG, 'prof-1', KEY_1);
      expect(res).toEqual({
        success: true,
        createdEntityType: 'JOURNAL',
        createdEntityId: 'j-existing',
      });
      expect(prisma.journal.findFirst.mock.calls[0][0].where).toEqual({
        organizationId: ORG,
        sourceType: 'RECURRING_JOURNAL',
        sourceId: `prof-1:manual:${KEY_1}`,
      });
      expect(journals.create).not.toHaveBeenCalled();
    });

    it('a concurrent same-key request that loses the unique race returns the winner journal', async () => {
      prisma.journal.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'j-winner' });
      journals.create.mockRejectedValue(
        new ConflictException('This transaction has already been posted'),
      );
      const res = await service.executeProfile(ORG, 'prof-1', KEY_1);
      expect(res).toEqual(expect.objectContaining({ success: true, createdEntityId: 'j-winner' }));
    });

    it('is tenant scoped', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(null);
      await expect(service.executeProfile('other-org', 'prof-1', KEY_1)).rejects.toThrow(
        'not found',
      );
      expect(prisma.recurringProfile.findFirst.mock.calls[0][0].where.organizationId).toBe(
        'other-org',
      );
    });
  });

  describe('processRecurringProfiles (cron)', () => {
    it('catches up missed runs oldest-first, each with its own source id', async () => {
      const today = new Date();
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
      const second = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const third = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1));
      prisma.recurringProfile.findMany.mockResolvedValue([
        journalProfile({ nextRunDate: first, startDate }),
      ]);
      prisma.recurringProfile.findFirst
        .mockResolvedValueOnce(journalProfile({ nextRunDate: second, startDate }))
        .mockResolvedValueOnce(journalProfile({ nextRunDate: third, startDate }))
        .mockResolvedValue(
          journalProfile({
            nextRunDate: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)),
            startDate,
          }),
        );

      await service.processRecurringProfiles();

      const ids = journals.create.mock.calls.map((c) => c[2].source.id);
      expect(ids).toEqual([
        `prof-1:${first.toISOString().slice(0, 10)}`,
        `prof-1:${second.toISOString().slice(0, 10)}`,
        `prof-1:${third.toISOString().slice(0, 10)}`,
      ]);
    });

    it('stops catching up at the first failed run so nothing is skipped', async () => {
      const first = new Date(Date.UTC(2020, 0, 1));
      prisma.recurringProfile.findMany.mockResolvedValue([journalProfile({ nextRunDate: first })]);
      journals.create.mockRejectedValue(new BadRequestException('This period is locked.'));

      await service.processRecurringProfiles();

      expect(journals.create).toHaveBeenCalledTimes(1);
    });

    it('runs the occurrence on the final day of the end date (inclusive)', async () => {
      const due = new Date(Date.UTC(2020, 4, 1));
      prisma.recurringProfile.findMany.mockResolvedValue([
        journalProfile({ nextRunDate: due, endDate: new Date(Date.UTC(2020, 4, 1)) }),
      ]);
      prisma.recurringProfile.findFirst.mockResolvedValue(
        journalProfile({ nextRunDate: new Date(Date.UTC(2020, 5, 1)), endDate: due }),
      );

      await service.processRecurringProfiles();

      expect(journals.create).toHaveBeenCalledTimes(1);
      expect(journals.create.mock.calls[0][2].source.id).toBe('prof-1:2020-05-01');
    });

    it('selects due profiles with nextRunDate <= now and filters the end date per occurrence', async () => {
      prisma.recurringProfile.findMany.mockResolvedValue([]);
      await service.processRecurringProfiles();
      const where = prisma.recurringProfile.findMany.mock.calls[0][0].where;
      expect(where.nextRunDate.lte).toBeInstanceOf(Date);
      expect(where.OR).toBeUndefined();
    });

    it('does not run occurrences past the profile end date', async () => {
      const due = new Date(Date.UTC(2020, 5, 1));
      prisma.recurringProfile.findMany.mockResolvedValue([
        journalProfile({ nextRunDate: due, endDate: new Date(Date.UTC(2020, 4, 1)) }),
      ]);

      await service.processRecurringProfiles();

      expect(journals.create).not.toHaveBeenCalled();
    });
  });

  describe('next run date', () => {
    const next = (from: string, frequency: string, anchor?: string): string =>
      (service as any)
        .calculateNextRunDate(new Date(from), frequency, anchor ? new Date(anchor) : undefined)
        .toISOString()
        .slice(0, 10);

    it('advances every frequency, including QUARTERLY (which used to stand still)', () => {
      expect(next('2026-03-01', 'DAILY')).toBe('2026-03-02');
      expect(next('2026-03-01', 'WEEKLY')).toBe('2026-03-08');
      expect(next('2026-03-01', 'MONTHLY')).toBe('2026-04-01');
      expect(next('2026-03-01', 'QUARTERLY')).toBe('2026-06-01');
      expect(next('2026-03-01', 'YEARLY')).toBe('2027-03-01');
    });

    it('keeps the anchor day and clamps to month end instead of drifting', () => {
      expect(next('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
      // From the clamped Feb 28, the anchor (31st) is restored in March.
      expect(next('2026-02-28', 'MONTHLY', '2026-01-31')).toBe('2026-03-31');
      expect(next('2024-02-29', 'YEARLY')).toBe('2025-02-28');
      expect(next('2025-02-28', 'YEARLY', '2024-02-29')).toBe('2026-02-28');
    });
  });

  describe('journal template validation on update', () => {
    const balanced = {
      lines: [
        { accountId: 'a', debit: '10' },
        { accountId: 'b', credit: '10' },
      ],
    };

    it('validates the retained template when only other fields change on a journal profile', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(
        journalProfile({
          templateData: {
            lines: [
              { accountId: 'a', debit: '10' },
              { accountId: 'b', credit: '9' },
            ],
          },
        }),
      );
      await expect(service.update(ORG, 'prof-1', { name: 'Renamed' } as any)).rejects.toThrow(
        'debits must equal credits',
      );
      expect(prisma.recurringProfile.update).not.toHaveBeenCalled();
    });

    it('validates the new template when the type is unchanged', async () => {
      await expect(
        service.update(ORG, 'prof-1', {
          templateData: { lines: [{ accountId: 'a', debit: '10' }] },
        } as any),
      ).rejects.toThrow();
      expect(prisma.recurringProfile.update).not.toHaveBeenCalled();
    });

    it('validates the effective template when switching an invoice profile to journal', async () => {
      prisma.recurringProfile.findFirst.mockResolvedValue(
        journalProfile({
          type: 'INVOICE',
          entityType: 'invoice',
          templateData: { customerId: 'c' },
        }),
      );
      await expect(service.update(ORG, 'prof-1', { type: 'journal' } as any)).rejects.toThrow();
      expect(prisma.recurringProfile.update).not.toHaveBeenCalled();
    });

    it('accepts a valid template of tenant accounts', async () => {
      prisma.account.count.mockResolvedValue(2);
      prisma.recurringProfile.update.mockResolvedValue({ id: 'prof-1' });
      await service.update(ORG, 'prof-1', { templateData: balanced } as any);
      expect(prisma.recurringProfile.update).toHaveBeenCalled();
    });
  });

  describe('journal template validation on create', () => {
    const dto = (templateData: Record<string, unknown>): any => ({
      name: 'Rent',
      frequency: 'MONTHLY',
      startDate: '2026-01-01',
      entityType: 'journal',
      templateData,
    });

    it('rejects an unbalanced template', async () => {
      await expect(
        service.create(
          ORG,
          dto({
            lines: [
              { accountId: 'a', debit: '10' },
              { accountId: 'b', credit: '9.99' },
            ],
          }),
        ),
      ).rejects.toThrow('debits must equal credits');
      expect(prisma.recurringProfile.create).not.toHaveBeenCalled();
    });

    it('rejects accounts that do not belong to the organization', async () => {
      prisma.account.count.mockResolvedValue(1);
      await expect(
        service.create(
          ORG,
          dto({
            lines: [
              { accountId: 'a', debit: '10' },
              { accountId: 'foreign', credit: '10' },
            ],
          }),
        ),
      ).rejects.toThrow('accounts not found');
      expect(prisma.account.count.mock.calls[0][0].where.organizationId).toBe(ORG);
    });

    it('accepts a balanced template of tenant accounts', async () => {
      prisma.account.count.mockResolvedValue(2);
      prisma.recurringProfile.create.mockResolvedValue({ id: 'new' });
      await service.create(
        ORG,
        dto({
          lines: [
            { accountId: 'a', debit: '10.10' },
            { accountId: 'b', credit: '10.10' },
          ],
        }),
      );
      expect(prisma.recurringProfile.create).toHaveBeenCalled();
    });
  });
});
