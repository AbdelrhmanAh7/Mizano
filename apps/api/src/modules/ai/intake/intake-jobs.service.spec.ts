import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJobStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { INTAKE_DRAFT_ENTITY, IntakeJobsService, stageFor } from './intake-jobs.service';
import { IntakeQueueService } from './intake-queue.service';
import {
  FakeAuditLogTable,
  FakeDocumentTable,
  FakeIntakeJobTable,
  MemoryIntakeStorage,
} from './intake-test-utils';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('IntakeJobsService', () => {
  let table: FakeIntakeJobTable;
  let auditLogs: FakeAuditLogTable;
  let bills: FakeDocumentTable;
  let invoices: FakeDocumentTable;
  let expenses: FakeDocumentTable;
  let storage: MemoryIntakeStorage;
  let queue: { enqueue: jest.Mock; cancel: jest.Mock };
  let config: { get: jest.Mock };
  let service: IntakeJobsService;

  beforeEach(() => {
    table = new FakeIntakeJobTable();
    auditLogs = new FakeAuditLogTable();
    bills = new FakeDocumentTable();
    invoices = new FakeDocumentTable();
    expenses = new FakeDocumentTable();
    storage = new MemoryIntakeStorage();
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn() };
    service = new IntakeJobsService(
      {
        intakeJob: table.delegate,
        auditLog: auditLogs.delegate,
        bill: bills.delegate,
        invoice: invoices.delegate,
        expense: expenses.delegate,
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

  describe('recoverApprovedJobs', () => {
    it('link found: links the draft when marker and draft exist for older APPROVED job', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);
      const job = await table.delegate.create({
        data: {
          organizationId: ORG_A,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          updatedAt: past,
        },
      });

      bills.rows.push({ id: 'bill-1', organizationId: ORG_A, deletedAt: null });
      await auditLogs.delegate.create({
        data: {
          organizationId: ORG_A,
          userId: 'u1',
          action: 'CREATE',
          entityType: INTAKE_DRAFT_ENTITY,
          entityId: job.id,
          newValues: { draftType: 'bill', draftId: 'bill-1' },
        },
      });

      const result = await service.recoverApprovedJobs();
      expect(result).toEqual({ linked: 1, reopened: 0 });

      const updated = table.rows.find((r) => r.id === job.id);
      expect(updated?.status).toBe(IntakeJobStatus.APPROVED);
      expect(updated?.draftDocumentType).toBe('bill');
      expect(updated?.draftDocumentId).toBe('bill-1');
    });

    it('no draft -> reopen: marks job back to EXTRACTED with redacted lastError when no draft exists', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);
      const job = await table.delegate.create({
        data: {
          organizationId: ORG_A,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          updatedAt: past,
        },
      });

      const result = await service.recoverApprovedJobs();
      expect(result).toEqual({ linked: 0, reopened: 1 });

      const updated = table.rows.find((r) => r.id === job.id);
      expect(updated?.status).toBe(IntakeJobStatus.EXTRACTED);
      expect(updated?.draftDocumentId).toBeNull();
      expect(updated?.lastError).toBe(
        'Approval interrupted before draft creation; ready to confirm again',
      );
    });

    it('ignores a marker written under another organization', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);
      const job = await table.delegate.create({
        data: { organizationId: ORG_A, status: IntakeJobStatus.APPROVED, updatedAt: past },
      });
      bills.rows.push({ id: 'bill-a', organizationId: ORG_A, deletedAt: null });
      await auditLogs.delegate.create({
        data: {
          organizationId: ORG_B,
          userId: 'u2',
          action: 'CREATE',
          entityType: INTAKE_DRAFT_ENTITY,
          entityId: job.id,
          newValues: { draftType: 'bill', draftId: 'bill-a' },
        },
      });

      expect(await service.recoverApprovedJobs()).toEqual({ linked: 0, reopened: 1 });
      expect(table.rows.find((r) => r.id === job.id)?.draftDocumentId).toBeNull();
    });

    it('does not relink a job that was linked after the scan', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);
      const job = await table.delegate.create({
        data: { organizationId: ORG_A, status: IntakeJobStatus.APPROVED, updatedAt: past },
      });
      bills.rows.push({ id: 'bill-new', organizationId: ORG_A, deletedAt: null });
      await auditLogs.delegate.create({
        data: {
          organizationId: ORG_A,
          userId: 'u1',
          action: 'CREATE',
          entityType: INTAKE_DRAFT_ENTITY,
          entityId: job.id,
          newValues: { draftType: 'bill', draftId: 'bill-new' },
        },
      });
      // The confirm request links its draft between the sweep's scan and its guarded update.
      bills.delegate.findFirst.mockImplementationOnce(async () => {
        const row = table.rows.find((r) => r.id === job.id);
        if (row) Object.assign(row, { draftDocumentType: 'bill', draftDocumentId: 'bill-live' });
        return { id: 'bill-new', organizationId: ORG_A, deletedAt: null };
      });

      expect(await service.recoverApprovedJobs()).toEqual({ linked: 0, reopened: 0 });
      expect(table.rows.find((r) => r.id === job.id)?.draftDocumentId).toBe('bill-live');
    });

    it('within grace period untouched: leaves recently approved jobs alone', async () => {
      const recent = new Date(Date.now() - 60 * 1000);
      const job = await table.delegate.create({
        data: {
          organizationId: ORG_A,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          updatedAt: recent,
        },
      });

      const result = await service.recoverApprovedJobs();
      expect(result).toEqual({ linked: 0, reopened: 0 });

      const updated = table.rows.find((r) => r.id === job.id);
      expect(updated?.status).toBe(IntakeJobStatus.APPROVED);
      expect(updated?.draftDocumentId).toBeNull();
      expect(updated?.lastError).toBeNull();
    });

    it('other tenant untouched: strictly org-scopes draft lookups and recovery', async () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);

      const jobA = await table.delegate.create({
        data: {
          organizationId: ORG_A,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          updatedAt: past,
        },
      });
      const jobB = await table.delegate.create({
        data: {
          organizationId: ORG_B,
          status: IntakeJobStatus.APPROVED,
          draftDocumentId: null,
          updatedAt: past,
        },
      });

      bills.rows.push({ id: 'bill-b', organizationId: ORG_B, deletedAt: null });

      // Marker for jobA attempts to point to bill-b (belonging to ORG_B)
      await auditLogs.delegate.create({
        data: {
          organizationId: ORG_A,
          userId: 'u1',
          action: 'CREATE',
          entityType: INTAKE_DRAFT_ENTITY,
          entityId: jobA.id,
          newValues: { draftType: 'bill', draftId: 'bill-b' },
        },
      });

      // Marker for jobB points to bill-b
      await auditLogs.delegate.create({
        data: {
          organizationId: ORG_B,
          userId: 'u2',
          action: 'CREATE',
          entityType: INTAKE_DRAFT_ENTITY,
          entityId: jobB.id,
          newValues: { draftType: 'bill', draftId: 'bill-b' },
        },
      });

      // Recover only ORG_A: ORG_B must not be touched
      const resultA = await service.recoverApprovedJobs({ organizationId: ORG_A });
      // Since bill-b does not belong to ORG_A, jobA cannot link it and is reopened
      expect(resultA).toEqual({ linked: 0, reopened: 1 });

      const updatedA = table.rows.find((r) => r.id === jobA.id);
      expect(updatedA?.status).toBe(IntakeJobStatus.EXTRACTED);

      // Job B in ORG_B was untouched during ORG_A recovery
      const untouchedB = table.rows.find((r) => r.id === jobB.id);
      expect(untouchedB?.status).toBe(IntakeJobStatus.APPROVED);
      expect(untouchedB?.draftDocumentId).toBeNull();

      // Now recover ORG_B: jobB links bill-b
      const resultB = await service.recoverApprovedJobs({ organizationId: ORG_B });
      expect(resultB).toEqual({ linked: 1, reopened: 0 });

      const updatedB = table.rows.find((r) => r.id === jobB.id);
      expect(updatedB?.status).toBe(IntakeJobStatus.APPROVED);
      expect(updatedB?.draftDocumentId).toBe('bill-b');
    });
  });
});
