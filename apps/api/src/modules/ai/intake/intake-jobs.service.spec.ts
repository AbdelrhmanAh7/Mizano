import { ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntakeJobStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { IntakeJobsService, stageFor } from './intake-jobs.service';
import { IntakeQueueService } from './intake-queue.service';
import { FakeIntakeJobTable, MemoryIntakeStorage } from './intake-test-utils';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('IntakeJobsService', () => {
  let table: FakeIntakeJobTable;
  let storage: MemoryIntakeStorage;
  let queue: { enqueue: jest.Mock; cancel: jest.Mock };
  let config: { get: jest.Mock };
  let service: IntakeJobsService;

  beforeEach(() => {
    table = new FakeIntakeJobTable();
    storage = new MemoryIntakeStorage();
    queue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      cancel: jest.fn().mockResolvedValue(undefined),
    };
    config = { get: jest.fn() };
    service = new IntakeJobsService(
      { intakeJob: table.delegate } as unknown as PrismaService,
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
