import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJobStatus, IntakeSource, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { IntakeJobsService, stageFor } from './intake-jobs.service';
import { IntakeQueueService } from './intake-queue.service';
import { billResult, FakeIntakeJobTable, MemoryIntakeStorage } from './intake-test-utils';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('IntakeJobsService', () => {
  let table: FakeIntakeJobTable;
  let storage: MemoryIntakeStorage;
  let queue: { enqueue: jest.Mock; cancel: jest.Mock };
  let config: { get: jest.Mock };
  let service: IntakeJobsService;
  let queryRaw: jest.Mock;
  let organizationLookup: jest.Mock;

  beforeEach(() => {
    table = new FakeIntakeJobTable();
    storage = new MemoryIntakeStorage();
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn() };
    queryRaw = jest.fn();
    organizationLookup = jest.fn().mockResolvedValue({ baseCurrency: 'EGP' });
    service = new IntakeJobsService(
      {
        intakeJob: table.delegate,
        organization: { findUnique: organizationLookup },
        $queryRaw: queryRaw,
      } as unknown as PrismaService,
      storage,
      queue as unknown as IntakeQueueService,
      config as unknown as ConfigService,
    );
  });

  const upload = (org: string, body = 'pdf-bytes') =>
    service.createFromUpload({
      organizationId: org,
      userId: 'u1',
      buffer: Buffer.from(body),
      mimeType: 'application/pdf',
      fileName: 'a.pdf',
    });

  it('stores the original, creates a QUEUED job and enqueues it', async () => {
    const { job, duplicate } = await upload(ORG_A);
    expect(duplicate).toBe(false);
    expect(job.status).toBe(IntakeJobStatus.QUEUED);
    expect(storage.objects.get(job.storageKey)?.toString()).toBe('pdf-bytes');
    expect(job.storageKey.startsWith(`${ORG_A}/`)).toBe(true);
    expect(queue.enqueue).toHaveBeenCalledWith(
      { jobId: job.id, organizationId: ORG_A },
      `${job.id}-a0`,
    );
  });

  it('deduplicates the same file within an organization (one upload, one enqueue)', async () => {
    const first = await upload(ORG_A);
    const second = await upload(ORG_A);
    expect(second.duplicate).toBe(true);
    expect(second.job.id).toBe(first.job.id);
    expect(storage.put).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not deduplicate across organizations', async () => {
    const a = await upload(ORG_A);
    const b = await upload(ORG_B);
    expect(b.duplicate).toBe(false);
    expect(b.job.id).not.toBe(a.job.id);
  });

  it('cleans up the stored blob and returns the winner when the unique index races', async () => {
    const winner = await upload(ORG_A, 'same');
    table.delegate.findFirst.mockResolvedValueOnce(null); // pre-check misses (race)
    const loser = await upload(ORG_A, 'same');
    expect(loser.duplicate).toBe(true);
    expect(loser.job.id).toBe(winner.job.id);
    expect(storage.objects.size).toBe(1);
  });

  it('rejects uploads with 429 when the organization queue is saturated', async () => {
    config.get.mockReturnValue('1');
    await upload(ORG_A, 'one');
    await expect(upload(ORG_A, 'two')).rejects.toBeInstanceOf(HttpException);
    expect(storage.objects.size).toBe(1);
  });

  it('org-scopes lookups: another tenant gets 404', async () => {
    const { job } = await upload(ORG_A);
    await expect(service.getForOrg(job.id, ORG_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getForOrg(job.id, '')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.readOriginal(job.id, ORG_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.retry(job.id, ORG_B)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getForOrg(job.id, ORG_A)).resolves.toMatchObject({ id: job.id });
  });

  it('lists only the caller organization and filters by status', async () => {
    const a = await upload(ORG_A, 'a');
    await upload(ORG_B, 'b');
    table.rows[0].status = IntakeJobStatus.NEEDS_REVIEW;
    const all = await service.list(ORG_A, {});
    expect(all.data.map((j) => j.id)).toEqual([a.job.id]);
    expect(all.data[0]).not.toHaveProperty('storageKey');
    expect(all.data[0]).not.toHaveProperty('result');
    expect((await service.list(ORG_A, { status: IntakeJobStatus.FAILED })).data).toHaveLength(0);
    expect((await service.list(ORG_A, { status: IntakeJobStatus.NEEDS_REVIEW })).meta.total).toBe(
      1,
    );
  });

  describe('inbox search', () => {
    it('pages and counts in SQL with the same tenant, date, status and source filters', async () => {
      const { job } = await upload(ORG_A);
      job.status = IntakeJobStatus.EXTRACTED;
      job.result = billResult() as unknown as Prisma.JsonValue;
      table.delegate.findMany.mockClear();
      table.delegate.count.mockClear();
      queryRaw.mockResolvedValueOnce([job]).mockResolvedValueOnce([{ total: 10001n }]);
      const search = " O'Reilly%_\\ ";
      const result = await service.list(ORG_A, {
        search,
        status: [IntakeJobStatus.EXTRACTED, IntakeJobStatus.NEEDS_REVIEW],
        source: IntakeSource.TELEGRAM,
        from: '2026-09-01',
        to: '2026-09-30',
        page: 3,
        limit: 2,
      });
      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(table.delegate.findMany).not.toHaveBeenCalled();
      expect(table.delegate.count).not.toHaveBeenCalled();
      const pageSql = queryRaw.mock.calls[0][0] as Prisma.Sql;
      const countSql = queryRaw.mock.calls[1][0] as Prisma.Sql;
      const pagePredicate = pageSql.sql.split(' WHERE ')[1].split('ORDER BY')[0].trim();
      expect(countSql.sql.split(' WHERE ')[1].trim()).toBe(pagePredicate);
      expect(pageSql.sql).toContain('SELECT * FROM "intake_jobs"');
      expect(pageSql.sql).toContain('ORDER BY "createdAt" DESC, "id" DESC');
      expect(pageSql.sql).toContain('LIMIT ? OFFSET ?');
      expect(countSql.sql).toContain('SELECT COUNT(*) AS "total"');
      expect(countSql.sql).not.toMatch(/LIMIT|OFFSET|SELECT "id"/);
      for (const sql of [pageSql, countSql]) {
        expect(sql.sql).toContain('"organizationId" = ? AND "deletedAt" IS NULL');
        expect(sql.sql).toContain('"status" IN (?::"IntakeJobStatus",?::"IntakeJobStatus")');
        expect(sql.sql).toContain('"source" = ?::"IntakeSource"');
        expect(sql.sql).toContain('"createdAt" >= ?');
        expect(sql.sql).toContain('"createdAt" <= ?');
        expect(sql.sql).toContain('"originalFileName" ILIKE ?');
        expect(sql.sql).toContain("\"result\"->'extractedFields'->>'vendorName' ILIKE ?");
        expect(sql.sql).toContain("\"result\"->'matchedVendor'->>'name' ILIKE ?");
        expect(sql.sql).toContain("\"result\"->'extractedFields'->>'documentNumber' ILIKE ?");
        expect(sql.sql).not.toContain("O'Reilly");
      }
      const pattern = "%O'Reilly\\%\\_\\\\%";
      const predicateValues = [
        ORG_A,
        IntakeJobStatus.EXTRACTED,
        IntakeJobStatus.NEEDS_REVIEW,
        IntakeSource.TELEGRAM,
        new Date('2026-09-01'),
        new Date('2026-09-30T23:59:59.999Z'),
        pattern,
        pattern,
        pattern,
        pattern,
      ];
      expect(countSql.values).toEqual(predicateValues);
      expect(pageSql.values).toEqual([...predicateValues, 2, 4]);
      expect(result.meta).toEqual({ page: 3, limit: 2, total: 10001, totalPages: 5001 });
      expect(result.data.map((row) => row.id)).toEqual([job.id]);
      expect(result.data[0]).not.toHaveProperty('storageKey');
      expect(result.data[0]).not.toHaveProperty('result');
      expect(result.data[0].summary).toMatchObject({
        vendorName: 'Acme',
        documentNumber: 'INV-9',
        total: '115.0000',
        currency: 'EGP',
        readyToApprove: true,
        blocker: null,
      });
      expect(organizationLookup).toHaveBeenCalledWith({
        where: { id: ORG_A },
        select: { baseCurrency: true },
      });
    });

    it('retains an uncapped count on an empty later page and ignores empty status filters', async () => {
      queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 101n }]);
      const result = await service.list(ORG_A, {
        search: 'invoice',
        status: [],
        page: 7,
        limit: 20,
      });
      expect(result).toEqual({ data: [], meta: { page: 7, limit: 20, total: 101, totalPages: 6 } });
      const pageSql = queryRaw.mock.calls[0][0] as Prisma.Sql;
      const countSql = queryRaw.mock.calls[1][0] as Prisma.Sql;
      expect(pageSql.values.slice(-2)).toEqual([20, 120]);
      expect(countSql.values).toEqual([ORG_A, '%invoice%', '%invoice%', '%invoice%', '%invoice%']);
      expect(countSql.sql).not.toMatch(/"status"|"source"|"createdAt"|LIMIT|OFFSET/);
    });

    it('keeps whitespace-only searches on the scoped Prisma path', async () => {
      await upload(ORG_A);
      await upload(ORG_B, 'foreign');
      const result = await service.list(ORG_A, { search: '  ' });
      expect(result.meta.total).toBe(1);
      expect(queryRaw).not.toHaveBeenCalled();
      expect(table.delegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: ORG_A, deletedAt: null },
          take: 20,
          skip: 0,
        }),
      );
    });
  });

  it('marks extracted summaries as exceptions when either currency is unknown', async () => {
    const { job } = await upload(ORG_A);
    const base = billResult();
    job.status = IntakeJobStatus.EXTRACTED;
    job.result = base as unknown as Prisma.JsonValue;
    expect(service.summarize(job, 'EGP')).toMatchObject({ readyToApprove: true, blocker: null });
    expect(service.summarize(job, null)).toMatchObject({
      readyToApprove: false,
      blocker: 'CURRENCY_MISMATCH',
    });
    job.result = {
      ...base,
      extractedFields: { ...base.extractedFields, currency: null },
    } as unknown as Prisma.JsonValue;
    expect(service.summarize(job, 'EGP')).toMatchObject({
      readyToApprove: false,
      blocker: 'CURRENCY_MISMATCH',
    });
  });

  describe('retry', () => {
    it('re-queues a dead letter with a fresh attempt budget, exactly once', async () => {
      const { job } = await upload(ORG_A);
      table.rows[0].status = IntakeJobStatus.DEAD_LETTER;
      table.rows[0].attempts = 3;
      queue.enqueue.mockClear();
      const retried = await service.retry(job.id, ORG_A);
      expect(retried.status).toBe(IntakeJobStatus.QUEUED);
      expect(retried.attempts).toBe(0);
      expect(queue.enqueue).toHaveBeenCalledTimes(1);
      // Pending backoff entry for the old attempt is cancelled; the retry uses a fresh id.
      expect(queue.cancel).toHaveBeenCalledWith(`${job.id}-a3`);
      expect(queue.enqueue.mock.calls[0][1]).toMatch(new RegExp(`^${job.id}-r[0-9]+$`));
      await expect(service.retry(job.id, ORG_A)).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses non-failed jobs', async () => {
      const { job } = await upload(ORG_A);
      await expect(service.retry(job.id, ORG_A)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('approval claim', () => {
    it('moves EXTRACTED to APPROVED once and refuses a replay', async () => {
      const { job } = await upload(ORG_A);
      table.rows[0].status = IntakeJobStatus.EXTRACTED;
      await expect(service.claimForApproval(job.id, ORG_A)).resolves.toBe(
        IntakeJobStatus.EXTRACTED,
      );
      await expect(service.claimForApproval(job.id, ORG_A)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await service.releaseApproval(job.id, ORG_A, IntakeJobStatus.EXTRACTED);
      expect(table.rows[0].status).toBe(IntakeJobStatus.EXTRACTED);
    });

    it('does not let another tenant claim', async () => {
      const { job } = await upload(ORG_A);
      table.rows[0].status = IntakeJobStatus.EXTRACTED;
      await expect(service.claimForApproval(job.id, ORG_B)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('maps durable status to the legacy progress stage', () => {
    const base = { progress: 0, attempts: 1, maxAttempts: 3 };
    expect(stageFor({ ...base, status: IntakeJobStatus.QUEUED })).toBe('received');
    expect(stageFor({ ...base, status: IntakeJobStatus.NEEDS_REVIEW })).toBe('complete');
    expect(stageFor({ ...base, status: IntakeJobStatus.DEAD_LETTER })).toBe('error');
    // FAILED is terminal for the UI (Retry offered) even when a backoff retry is pending.
    expect(stageFor({ ...base, status: IntakeJobStatus.FAILED })).toBe('error');
  });

  it('dedup ignores soft-deleted jobs: the same file can be uploaded again', async () => {
    const first = await upload(ORG_A);
    table.rows[0].deletedAt = new Date();
    const again = await upload(ORG_A);
    expect(again.duplicate).toBe(false);
    expect(again.job.id).not.toBe(first.job.id);
  });

  it('passes the requested language to the job', async () => {
    const { job } = await service.createFromUpload({
      organizationId: ORG_A,
      userId: 'u1',
      buffer: Buffer.from('lang'),
      mimeType: 'application/pdf',
      fileName: 'a.pdf',
      language: 'ara',
    });
    expect(job.language).toBe('ara');
  });

  describe('recoverJobs', () => {
    async function seedRows(n: number, status: IntakeJobStatus, extra = {}) {
      for (let i = 0; i < n; i += 1) {
        await table.delegate.create({
          data: {
            organizationId: ORG_A,
            sha256: `${status}-${i}-${Math.random()}`,
            status,
            ...extra,
          },
        });
      }
    }

    it('pages through every QUEUED, FAILED and lease-expired PROCESSING row', async () => {
      await seedRows(250, IntakeJobStatus.QUEUED);
      await seedRows(30, IntakeJobStatus.FAILED);
      await seedRows(5, IntakeJobStatus.PROCESSING, {
        leaseExpiresAt: new Date(Date.now() - 1000),
      });
      await seedRows(4, IntakeJobStatus.PROCESSING, {
        leaseExpiresAt: new Date(Date.now() + 60000),
      });
      await seedRows(3, IntakeJobStatus.DEAD_LETTER);
      await seedRows(3, IntakeJobStatus.EXTRACTED);
      expect(await service.recoverJobs()).toBe(285);
      expect(queue.enqueue).toHaveBeenCalledTimes(285);
    });

    it.each([
      [undefined, 1, 1000, 4000],
      ['2000', 3, 1500, 6500],
      ['2000', 2, 4000, 0],
      ['2000', 2, 5000, 0],
      ['0', 2, 1000, 9000],
      ['invalid', 2, 1000, 9000],
    ])(
      'preserves FAILED backoff (base=%s, attempts=%s, elapsed=%s)',
      async (base, attempts, elapsed, expectedDelay) => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-02T12:00:00Z'));
        try {
          config.get.mockImplementation((key: string) =>
            key === 'INTAKE_RETRY_BASE_MS' ? base : undefined,
          );
          await seedRows(1, IntakeJobStatus.FAILED, {
            attempts,
            updatedAt: new Date(Date.now() - elapsed),
          });
          expect(await service.recoverJobs()).toBe(1);
          const job = table.rows[0];
          expect(table.delegate.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ select: expect.objectContaining({ updatedAt: true }) }),
          );
          expect(queue.enqueue).toHaveBeenCalledWith(
            { jobId: job.id, organizationId: ORG_A },
            `${job.id}-a${attempts}`,
            expectedDelay,
          );
        } finally {
          jest.useRealTimers();
        }
      },
    );

    it('recovers QUEUED and lease-expired PROCESSING rows immediately', async () => {
      await seedRows(1, IntakeJobStatus.QUEUED, { attempts: 2 });
      await seedRows(1, IntakeJobStatus.PROCESSING, {
        attempts: 2,
        leaseExpiresAt: new Date(Date.now() - 1000),
      });
      expect(await service.recoverJobs()).toBe(2);
      for (const job of table.rows) {
        expect(queue.enqueue).toHaveBeenCalledWith(
          { jobId: job.id, organizationId: ORG_A },
          `${job.id}-${job.status === IntakeJobStatus.PROCESSING ? 's' : 'a'}2`,
          0,
        );
      }
    });

    it('skips soft-deleted rows', async () => {
      await seedRows(2, IntakeJobStatus.QUEUED, { deletedAt: new Date() });
      expect(await service.recoverJobs()).toBe(0);
    });
  });

  it('a second approval is refused with the existing draft id', async () => {
    const { job } = await upload(ORG_A);
    table.rows[0].status = IntakeJobStatus.APPROVED;
    table.rows[0].draftDocumentId = 'bill-9';
    await expect(service.claimForApproval(job.id, ORG_A)).rejects.toMatchObject({
      response: { draftDocumentId: 'bill-9' },
    });
  });
});
